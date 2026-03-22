// app.js — Controller principale

const GOOGLE_CLIENT_ID = '832111135804-l9dr0rdhgtvob8dt8jcam8ecp5v1j5jc.apps.googleusercontent.com'; // Sostituire con il proprio Client ID OAuth2

// Stato della vista archivio (condiviso tra funzioni)
let _viewRootId = null;
let _viewAllEntries = [];
let _viewIsTrash = false;

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function setStatus(msg) {
  document.getElementById('saving-status').textContent = msg;
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ── Avvio ──────────────────────────────────────────────
window.addEventListener('load', async () => {
  // Click sul logo/titolo → torna all'archivio se loggato
  document.querySelector('.app-header').addEventListener('click', async () => {
    if (isGoogleSignedIn()) await startSearchView();
  });

  // Configurazione pulsante login (riutilizzato in più percorsi)
  function setupLoginButton() {
    document.getElementById('btn-google-login').onclick = async () => {
      await googleLogin();
      await saveUserEmail();
      await startSearchView();
    };
  }

  if (!hasGeminiKey()) {
    showView('view-setup');
    document.getElementById('btn-save-gemini-key').addEventListener('click', () => {
      const key = document.getElementById('input-gemini-key').value.trim();
      if (!key) return;
      saveGeminiKey(key);
      document.getElementById('setup-gemini').style.display = 'none';
      document.getElementById('setup-google').style.display = 'block';
    });
    await initGoogleAuth(GOOGLE_CLIENT_ID);
    setupLoginButton();
    return;
  }

  await initGoogleAuth(GOOGLE_CLIENT_ID);

  // Mostra spinner mentre tenta il login silenzioso
  showView('view-saving');
  setStatus('Connessione in corso…');

  try {
    await googleLoginSilent();
    await saveUserEmail();
    await startSearchView();
    return;
  } catch (_) {
    // Sessione scaduta o primo accesso — mostra il pulsante di login
  }

  showView('view-setup');
  document.getElementById('setup-gemini').style.display = 'none';
  document.getElementById('setup-google').style.display = 'block';
  setupLoginButton();
});

// ── Vista acquisizione ──────────────────────────────────────────
async function startCaptureView(clear = true) {
  if (clear) {
    clearSession();
    document.getElementById('photo-thumbnails').innerHTML = '';
    document.getElementById('btn-analyze').disabled = true;
  }
  showView('view-capture');

  // Ripristina le miniature se si torna indietro senza azzerare la sessione
  if (!clear) {
    const container = document.getElementById('photo-thumbnails');
    container.innerHTML = '';
    getPhotosRaw().forEach(({ id, base64 }) => renderThumbnail(base64, false, id));
    document.getElementById('btn-analyze').disabled = getPhotosRaw().length === 0;
  }

  const cameraAvailable = await startCamera();
  if (!cameraAvailable) {
    document.getElementById('btn-capture').style.display = 'none';
  }

  // Tap-to-focus sul preview
  const previewContainer = document.getElementById('camera-preview-container');
  previewContainer.addEventListener('click', async (e) => {
    const rect = previewContainer.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top)  / rect.height;
    await setFocusPoint(x, y);

    // Indicatore visivo del punto di messa a fuoco
    const indicator = document.createElement('div');
    indicator.className = 'focus-indicator';
    indicator.style.left = `${(x * 100).toFixed(1)}%`;
    indicator.style.top  = `${(y * 100).toFixed(1)}%`;
    previewContainer.appendChild(indicator);
    setTimeout(() => indicator.remove(), 800);
  });

  // Mostra il tasto flash solo se supportato dal dispositivo
  const torchBtn = document.getElementById('btn-torch');
  if (cameraAvailable && isTorchSupported()) {
    torchBtn.style.display = 'flex';
    torchBtn.onclick = async () => {
      await setTorch(!isTorchOn());
      torchBtn.classList.toggle('torch-on', isTorchOn());
    };
  }

  if (cameraAvailable) {
    document.getElementById('btn-capture').onclick = () => {
      const base64 = capturePhoto();
      const id = addPhoto(base64);
      renderThumbnail(base64, false, id);
      document.getElementById('btn-analyze').disabled = false;
    };
  }

  document.getElementById('btn-file-fallback').onclick = () => {
    document.getElementById('input-file-upload').click();
  };

  document.getElementById('input-file-upload').onchange = async (e) => {
    for (const file of e.target.files) {
      if (file.type === 'application/pdf') {
        // Salva il PDF originale per caricarlo direttamente su Drive
        setOriginalPdf(file);
        // Converte in base64 per l'analisi Gemini
        const base64 = await fileToBase64(file);
        const id = addPhoto(base64);
        renderThumbnail(null, true, id);
      } else {
        const base64 = await fileToBase64(file);
        const id = addPhoto(base64);
        renderThumbnail(base64, false, id);
      }
    }
    document.getElementById('btn-analyze').disabled = false;
  };

  document.getElementById('btn-analyze').onclick = () => startReviewView();
}

function renderThumbnail(base64, isPdf, photoId) {
  const container = document.getElementById('photo-thumbnails');
  const wrapper = document.createElement('div');
  wrapper.className = 'thumb-wrapper';

  if (isPdf) {
    const div = document.createElement('div');
    div.className = 'pdf-thumb';
    div.textContent = 'PDF';
    wrapper.appendChild(div);
  } else {
    const img = document.createElement('img');
    img.src = base64;
    wrapper.appendChild(img);
  }

  // Bottone × per rimuovere dalla sessione
  const removeBtn = document.createElement('button');
  removeBtn.className = 'thumb-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    if (photoId) removePhoto(photoId);
    wrapper.remove();
    const hasPhotos = document.getElementById('photo-thumbnails').children.length > 0 || getOriginalPdf();
    document.getElementById('btn-analyze').disabled = !hasPhotos;
  });
  wrapper.appendChild(removeBtn);
  container.appendChild(wrapper);
}

// ── Vista revisione ───────────────────────────────────────────
async function startReviewView() {
  showView('view-saving');
  setStatus('Analisi immagini in corso...');

  const photos = getPhotos();
  const analysisResults = await analyzeAllPhotos(photos);
  const merged = mergeMetadata(analysisResults);

  // Carica le categorie esistenti per i suggerimenti
  const rootId = await getRootFolderId();
  const existingCategories = await getAllCategories(rootId);
  const { resolved, isNew } = resolveCategory(merged.categoria, existingCategories);

  showView('view-review');

  document.getElementById('field-categoria').value = resolved;
  document.getElementById('field-descrizione').value = merged.descrizione;
  document.getElementById('field-tag').value = merged.tag.join(', ');
  document.getElementById('field-importo').value = merged.importo;
  document.getElementById('field-data').value = merged.data;

  // Mostra i suggerimenti di categoria
  const suggestionsEl = document.getElementById('categoria-suggestions');
  suggestionsEl.innerHTML = '';

  if (existingCategories.length > 0) {
    const hint = document.createElement('p');
    hint.className = 'hint-text';
    hint.textContent = isNew ? 'Categoria nuova suggerita. Scegli una esistente o conferma:' : 'Cambia categoria:';
    suggestionsEl.appendChild(hint);
  }

  for (const cat of existingCategories) {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.onclick = () => { document.getElementById('field-categoria').value = cat; };
    suggestionsEl.appendChild(btn);
  }

  document.getElementById('btn-save-session').onclick = () => saveSession(rootId, existingCategories);
  document.getElementById('btn-back-capture').onclick = () => startCaptureView(false);
}

// Riprova una funzione fino a maxAttempts volte con backoff esponenziale
async function withRetry(fn, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1))); // 500ms, 1s, 2s
      }
    }
  }
  throw lastErr;
}

// ── Salvataggio sessione ──────────────────────────────────────────
async function saveSession(rootId, existingCategories) {
  showView('view-saving');

  const categoria = document.getElementById('field-categoria').value.trim();
  const descrizione = document.getElementById('field-descrizione').value.trim();
  const tagRaw = document.getElementById('field-tag').value.trim();
  const importo = document.getElementById('field-importo').value.trim();
  const data = document.getElementById('field-data').value;
  const tag = tagRaw ? tagRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const metadata = { categoria, descrizione, tag, importo, data };
  const filename = buildFilename(metadata);
  const yearMonth = data.slice(0, 7); // "2026-03"

  // Genera il PDF (o usa quello originale caricato dall'utente)
  setStatus('Generazione PDF...');
  let pdfBuffer;
  try {
    const originalPdf = getOriginalPdf();
    if (originalPdf) {
      pdfBuffer = await originalPdf.arrayBuffer();
    } else {
      pdfBuffer = await generatePdf(getPhotos());
    }
  } catch (err) {
    setStatus(`Errore generazione PDF: ${err.message}`);
    return;
  }

  try {
    setStatus('Caricamento su Google Drive...');
    const { catFolderId } = await ensureFolderPath(yearMonth, categoria);
    const uploaded = await withRetry(() => uploadPdf(pdfBuffer, filename, catFolderId));

    setStatus('Aggiornamento indice...');
    const entry = {
      id: generateId(),
      data,
      categoria,
      descrizione,
      tag,
      importo,
      drive_file_id: uploaded.id,
      drive_url: uploaded.webViewLink,
    };

    await appendToIndex(entry, rootId);

    try {
      const sheetId = await findOrCreateSheet(rootId);
      await appendToSheet(sheetId, entry);
    } catch (e) {
      console.warn('Sheets update failed (non-critical):', e);
    }

    stopCamera();
    clearSession();
    setStatus('Salvato! Apertura archivio...');
    setTimeout(() => startSearchView(), 1000);

  } catch (err) {
    console.error('Save failed after retries:', err);
    if (err.message?.includes('401') || err.message?.includes('token')) {
      setStatus('Sessione scaduta. Rieffettua il login.');
      setTimeout(() => location.reload(), 2000);
    } else {
      setStatus(`Errore Drive dopo 3 tentativi. Download locale in corso...`);
      // pdfBuffer già generato sopra — sicuro da usare qui
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }
  }
}

// ── Vista ricerca ───────────────────────────────────────────
async function startSearchView() {
  showView('view-saving');
  setStatus('Caricamento archivio...');

  _viewRootId = await getRootFolderId();
  const { entries, fileId } = await readIndex(_viewRootId);

  // Elimina silenziosamente le entries scadute dal cestino (> 30 giorni)
  const { toKeep, expired } = purgeExpiredTrash(entries);
  if (expired.length > 0) {
    for (const e of expired) await trashDriveFile(e.drive_file_id);
    await writeIndex(toKeep, fileId, _viewRootId);
    _viewAllEntries = toKeep;
  } else {
    _viewAllEntries = entries;
  }

  _viewIsTrash = false;
  showView('view-search');

  // Popola il menu categorie
  const select = document.getElementById('search-categoria');
  select.innerHTML = '<option value="">Tutte le categorie</option>';
  const cats = [...new Set(getActiveEntries(_viewAllEntries).map(e => e.categoria))].sort();
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    select.appendChild(opt);
  });

  const filterAndRender = () => {
    if (_viewIsTrash) {
      renderSearchResults(getTrashEntries(_viewAllEntries), {
        isTrash: true,
        onRestore: handleRestore,
        onPermanentDelete: handlePermanentDelete,
      });
      return;
    }
    const text = document.getElementById('search-text').value.toLowerCase();
    const cat = document.getElementById('search-categoria').value;
    const from = document.getElementById('search-date-from').value;
    const to = document.getElementById('search-date-to').value;
    const importoMin = document.getElementById('search-importo-min').value;
    const importoMax = document.getElementById('search-importo-max').value;
    const active = getActiveEntries(_viewAllEntries);
    const filtered = filterEntries(active, { text, cat, from, to, importoMin, importoMax });
    renderSearchResults(filtered, { isTrash: false, onTrash: handleTrash, onEdit: handleEditEntry });
  };

  // Tab archivio / cestino
  document.getElementById('tab-archive').onclick = () => {
    _viewIsTrash = false;
    document.getElementById('tab-archive').classList.add('tab-active');
    document.getElementById('tab-trash').classList.remove('tab-active');
    document.getElementById('search-filters').style.display = '';
    filterAndRender();
  };
  document.getElementById('tab-trash').onclick = () => {
    _viewIsTrash = true;
    document.getElementById('tab-trash').classList.add('tab-active');
    document.getElementById('tab-archive').classList.remove('tab-active');
    document.getElementById('search-filters').style.display = 'none';
    filterAndRender();
  };

  document.getElementById('search-text').oninput = filterAndRender;
  document.getElementById('search-categoria').onchange = filterAndRender;
  document.getElementById('search-date-from').onchange = filterAndRender;
  document.getElementById('search-date-to').onchange = filterAndRender;
  document.getElementById('search-importo-min').oninput = filterAndRender;
  document.getElementById('search-importo-max').oninput = filterAndRender;
  document.getElementById('btn-new-session').onclick = () => startCaptureView();

  filterAndRender();
}

async function handleTrash(id, driveFileId) {
  const entry = _viewAllEntries.find(e => e.id === id);
  if (entry) entry.deleted_at = new Date().toISOString().slice(0, 10);
  await softDeleteEntry(id, _viewRootId);
  await trashDriveFile(driveFileId);
  document.getElementById('tab-archive').click();
}

async function handleRestore(id) {
  const entry = _viewAllEntries.find(e => e.id === id);
  if (entry) delete entry.deleted_at;
  await restoreEntry(id, _viewRootId);
  document.getElementById('tab-trash').click();
}

// Modifica inline di un documento dall'archivio
function handleEditEntry(entry, cardEl) {
  const original = cardEl.innerHTML;
  cardEl.classList.add('result-item-editing');
  cardEl.innerHTML = '';

  function field(labelText, value, type) {
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    const inp = document.createElement('input');
    inp.type = type || 'text';
    inp.value = value || '';
    inp.className = 'edit-field';
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return { wrap, inp };
  }

  const { wrap: wCat,  inp: iCat  } = field('Categoria', entry.categoria);
  const { wrap: wDesc, inp: iDesc } = field('Descrizione', entry.descrizione);
  const { wrap: wTag,  inp: iTag  } = field('Tag (virgola)', (entry.tag || []).join(', '));
  const { wrap: wImp,  inp: iImp  } = field('Importo (€)', entry.importo);
  const { wrap: wDate, inp: iDate } = field('Data', entry.data, 'date');

  const btnRow = document.createElement('div');
  btnRow.className = 'edit-btn-row';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Salva';
  saveBtn.className = 'edit-save';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Annulla';
  cancelBtn.className = 'btn-secondary edit-cancel';

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  [wCat, wDesc, wTag, wImp, wDate, btnRow].forEach(el => cardEl.appendChild(el));

  cancelBtn.onclick = () => {
    cardEl.classList.remove('result-item-editing');
    cardEl.innerHTML = original;
  };

  saveBtn.onclick = async () => {
    const changes = {
      categoria: iCat.value.trim() || entry.categoria,
      descrizione: iDesc.value.trim(),
      tag: iTag.value.split(',').map(t => t.trim()).filter(Boolean),
      importo: iImp.value.trim(),
      data: iDate.value || entry.data,
    };
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvataggio…';
    Object.assign(entry, changes);
    await updateEntry(entry.id, changes, _viewRootId);
    cardEl.classList.remove('result-item-editing');
    // Ri-renderizza il tab corrente
    document.getElementById(_viewIsTrash ? 'tab-trash' : 'tab-archive').click();
  };
}

async function handlePermanentDelete(id, driveFileId) {
  if (!confirm('Eliminare definitivamente questo documento? L\'operazione è irreversibile.')) return;
  _viewAllEntries = _viewAllEntries.filter(e => e.id !== id);
  await permanentDeleteEntry(id, _viewRootId);
  if (driveFileId) {
    try {
      await gapi.client.drive.files.delete({ fileId: driveFileId });
    } catch (e) {
      console.warn('Eliminazione definitiva da Drive fallita:', e);
    }
  }
  document.getElementById('tab-trash').click();
}
