// drive.js — Google Drive: creazione cartelle idempotente, caricamento file, elenco categorie

const DRIVE_ROOT_FOLDER_NAME = 'Documenti';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function findFolder(name, parentId) {
  const query = `name='${name}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const res = await gapi.client.drive.files.list({ q: query, fields: 'files(id,name)' });
  return res.result.files?.[0] ?? null;
}

async function createFolder(name, parentId) {
  const res = await gapi.client.drive.files.create({
    resource: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id,name',
  });
  return res.result;
}

async function findOrCreateFolder(name, parentId) {
  const existing = await findFolder(name, parentId);
  return existing ?? await createFolder(name, parentId);
}

async function getRootFolderId() {
  // Trova o crea la cartella "Documenti" nella radice di Drive
  const res = await gapi.client.drive.files.list({
    q: `name='${DRIVE_ROOT_FOLDER_NAME}' and 'root' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.result.files?.length > 0) return res.result.files[0].id;
  const folder = await gapi.client.drive.files.create({
    resource: { name: DRIVE_ROOT_FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] },
    fields: 'id',
  });
  return folder.result.id;
}

async function ensureFolderPath(yearMonth, categoria) {
  // Restituisce l'ID della cartella Documenti/{annoMese}/{categoria}/
  const rootId = await getRootFolderId();
  const monthFolder = await findOrCreateFolder(yearMonth, rootId);
  const catFolder = await findOrCreateFolder(categoria, monthFolder.id);
  return { rootId, monthFolderId: monthFolder.id, catFolderId: catFolder.id };
}

async function uploadPdf(pdfArrayBuffer, filename, parentFolderId) {
  const accessToken = getGoogleToken();
  const metadata = { name: filename, mimeType: 'application/pdf', parents: [parentFolderId] };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([pdfArrayBuffer], { type: 'application/pdf' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Caricamento su Drive fallito: ${res.status} ${await res.text()}`);
  const uploaded = await res.json();
  if (!uploaded.id || !uploaded.webViewLink) {
    throw new Error(`Risposta Drive mancante di campi: ${JSON.stringify(uploaded)}`);
  }
  return uploaded; // { id, webViewLink }
}

async function getAllCategories(rootId) {
  // Raccoglie tutti i nomi univoci di cartelle categoria da tutte le cartelle mensili
  const monthsRes = await gapi.client.drive.files.list({
    q: `'${rootId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    fields: 'files(id,name)',
  });
  const monthFolders = monthsRes.result.files ?? [];

  const categorySet = new Set();
  for (const month of monthFolders) {
    const catsRes = await gapi.client.drive.files.list({
      q: `'${month.id}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
      fields: 'files(name)',
    });
    (catsRes.result.files ?? []).forEach(f => categorySet.add(f.name));
  }
  return [...categorySet].sort();
}
