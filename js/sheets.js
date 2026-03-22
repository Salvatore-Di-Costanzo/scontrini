// sheets.js — Google Sheets: trova o crea il foglio, aggiunge una riga

const SHEETS_TITLE = 'Scontrini Index';
const SHEETS_HEADERS = ['id', 'data', 'categoria', 'descrizione', 'tag', 'importo', 'drive_file_id', 'drive_url'];

async function findOrCreateSheet(rootFolderId) {
  // Cerca un foglio esistente nella cartella Documenti
  const res = await gapi.client.drive.files.list({
    q: `name='${SHEETS_TITLE}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id)',
  });

  if (res.result.files?.length > 0) return res.result.files[0].id;

  // Crea un nuovo foglio di calcolo
  const created = await gapi.client.drive.files.create({
    resource: {
      name: SHEETS_TITLE,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [rootFolderId],
    },
    fields: 'id',
  });
  const sheetId = created.result.id;

  // Scrive la riga di intestazione
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    resource: { values: [SHEETS_HEADERS] },
  });

  return sheetId;
}

async function appendToSheet(sheetId, entry) {
  const row = [
    entry.id,
    entry.data,
    entry.categoria,
    entry.descrizione,
    entry.tag.join(', '),
    entry.importo,
    entry.drive_file_id,
    entry.drive_url,
  ];
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [row] },
  });
}
