// app.js — Controller principale

const GOOGLE_CLIENT_ID = '1072745642634-bvjmub2voji06vb7ptrn1gip0bctbtvd.apps.googleusercontent.com'; // Sostituire con il proprio Client ID OAuth2

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
  if (!hasGeminiKey()) {
    showView('view-setup');
    document.getElementById('btn-save-gemini-key').addEventListener('click', () => {
      const key = document.getElementById('input-gemini-key').value.trim();
      if (!key) return;
      saveGeminiKey(key);
      document.getElementById('setup-gemini').style.display = 'none';
      document.getElementById('setup-google').style.display = 'block';
    });
    document.getElementById('btn-google-login').addEventListener('click', async () => {
      await initGoogleAuth(GOOGLE_CLIENT_ID);
      await googleLogin();
      await startCaptureView();
    });
    return;
  }

  await initGoogleAuth(GOOGLE_CLIENT_ID);
  if (!isGoogleSignedIn()) {
    showView('view-setup');
    document.getElementById('setup-gemini').style.display = 'none';
    document.getElementById('setup-google').style.display = 'block';
    document.getElementById('btn-google-login').addEventListener('click', async () => {
      await googleLogin();
      await startCaptureView();
    });
    return;
  }

  await ensureGoogleToken();
  await startCaptureView();
});

// ── Vista acquisizione ──────────────────────────────────────────
async function startCaptureView() {
  clearSession();
  document.getElementById('photo-thumbnails').innerHTML = '';
  document.getElementById('btn-analyze').disabled = true;
  showView('view-capture');

  const cameraAvailable = await startCamera();
  if (!cameraAvailable) {
    document.getElementById('btn-capture').style.display = 'none';
  }

  if (cameraAvailable) {
    document.getElementById('btn-capture').onclick = () => {
      const base64 = capturePhoto();
      addPhoto(base64);
      renderThumbnail(base64);
      document.getElementById('btn-analyze').disabled = false;
    };
  }

  document.getElementById('btn-file-fallback').onclick = () => {
    document.getElementById('input-file-upload').click();
  };

  document.getElementById('input-file-upload').onchange = async (e) => {
    for (const file of e.target.files) {
      const base64 = await fileToBase64(file);
      addPhoto(base64);
      renderThumbnail(base64);
    }
    document.getElementById('btn-analyze').disabled = false;
  };

  document.getElementById('btn-analyze').onclick = () => startReviewView();
}

function renderThumbnail(base64) {
  const img = document.createElement('img');
  img.src = base64;
  document.getElementById('photo-thumbnails').appendChild(img);
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

  if (isNew && existingCategories.length > 0) {
    const hint = document.createElement('p');
    hint.className = 'hint-text';
    hint.textContent = 'Categoria nuova suggerita. Scegli una esistente o conferma:';
    suggestionsEl.appendChild(hint);
  }

  for (const cat of existingCategories) {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.onclick = () => { document.getElementById('field-categoria').value = cat; };
    suggestionsEl.appendChild(btn);
  }

  document.getElementById('btn-save-session').onclick = () => saveSession(rootId, existingCategories);
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

  // Genera il PDF subito, così è disponibile come fallback locale anche in caso di errore Drive
  setStatus('Generazione PDF...');
  let pdfBuffer;
  try {
    pdfBuffer = await generatePdf(getPhotos());
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

  const rootId = await getRootFolderId();
  const { entries } = await readIndex(rootId);

  showView('view-search');
  renderSearchResults(entries);

  // Popola il menu a tendina delle categorie
  const select = document.getElementById('search-categoria');
  select.innerHTML = '<option value="">Tutte le categorie</option>';
  const cats = [...new Set(entries.map(e => e.categoria))].sort();
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    select.appendChild(opt);
  });

  const filterAndRender = () => {
    const text = document.getElementById('search-text').value.toLowerCase();
    const cat = document.getElementById('search-categoria').value;
    const from = document.getElementById('search-date-from').value;
    const to = document.getElementById('search-date-to').value;
    const importoMin = document.getElementById('search-importo-min').value;
    const importoMax = document.getElementById('search-importo-max').value;
    const filtered = filterEntries(entries, { text, cat, from, to, importoMin, importoMax });
    renderSearchResults(filtered);
  };

  document.getElementById('search-text').oninput = filterAndRender;
  document.getElementById('search-categoria').onchange = filterAndRender;
  document.getElementById('search-date-from').onchange = filterAndRender;
  document.getElementById('search-date-to').onchange = filterAndRender;
  document.getElementById('search-importo-min').oninput = filterAndRender;
  document.getElementById('search-importo-max').oninput = filterAndRender;
  document.getElementById('btn-new-session').onclick = () => startCaptureView();
}
