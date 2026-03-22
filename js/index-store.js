// index-store.js — scontrini-index.json: lettura-modifica-scrittura su Drive

const INDEX_FILENAME = 'scontrini-index.json';

async function findIndexFile(rootFolderId) {
  const res = await gapi.client.drive.files.list({
    q: `name='${INDEX_FILENAME}' and '${rootFolderId}' in parents and trashed=false`,
    fields: 'files(id)',
  });
  return res.result.files?.[0]?.id ?? null;
}

async function readIndex(rootFolderId) {
  const fileId = await findIndexFile(rootFolderId);
  if (!fileId) return { entries: [], fileId: null };

  const accessToken = getGoogleToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Lettura indice fallita: ${res.status} ${await res.text()}`);
  const entries = await res.json();
  return { entries, fileId };
}

async function writeIndex(entries, existingFileId, rootFolderId) {
  const accessToken = getGoogleToken();
  const content = JSON.stringify(entries, null, 2);
  const blob = new Blob([content], { type: 'application/json' });

  if (existingFileId) {
    // Aggiorna il file esistente
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: blob,
    });
  } else {
    // Crea un nuovo file
    const metadata = { name: INDEX_FILENAME, parents: [rootFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  }
}

async function appendToIndex(entry, rootFolderId) {
  const { entries, fileId } = await readIndex(rootFolderId);
  entries.push(entry);
  await writeIndex(entries, fileId, rootFolderId);
}

// Aggiunge deleted_at all'entry (soft delete)
// Aggiorna i campi di un'entry esistente
async function updateEntry(id, changes, rootFolderId) {
  const { entries, fileId } = await readIndex(rootFolderId);
  const entry = entries.find(e => e.id === id);
  if (entry) {
    Object.assign(entry, changes);
    await writeIndex(entries, fileId, rootFolderId);
  }
}

async function softDeleteEntry(id, rootFolderId) {
  const { entries, fileId } = await readIndex(rootFolderId);
  const entry = entries.find(e => e.id === id);
  if (entry) {
    entry.deleted_at = new Date().toISOString().slice(0, 10);
    await writeIndex(entries, fileId, rootFolderId);
  }
}

// Rimuove deleted_at dall'entry (ripristino dal cestino)
async function restoreEntry(id, rootFolderId) {
  const { entries, fileId } = await readIndex(rootFolderId);
  const entry = entries.find(e => e.id === id);
  if (entry) {
    delete entry.deleted_at;
    await writeIndex(entries, fileId, rootFolderId);
  }
}

// Rimuove l'entry dall'indice (eliminazione definitiva)
async function permanentDeleteEntry(id, rootFolderId) {
  const { entries, fileId } = await readIndex(rootFolderId);
  const filtered = entries.filter(e => e.id !== id);
  await writeIndex(filtered, fileId, rootFolderId);
}

// Entries attive (non nel cestino)
function getActiveEntries(entries) {
  return entries.filter(e => !e.deleted_at);
}

// Entries nel cestino (eliminate da meno di 30 giorni)
function getTrashEntries(entries) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return entries.filter(e => e.deleted_at && e.deleted_at >= cutoffStr);
}

// Separa le entries da mantenere da quelle scadute (> 30 giorni nel cestino)
function purgeExpiredTrash(entries) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const toKeep = [];
  const expired = [];
  for (const e of entries) {
    if (e.deleted_at && e.deleted_at < cutoffStr) {
      expired.push(e);
    } else {
      toKeep.push(e);
    }
  }
  return { toKeep, expired };
}
