// metadata.js — Unione metadati per foto e risoluzione categoria

function mergeMetadata(analysisResults) {
  // Esclude le analisi fallite
  const valid = analysisResults.filter(r => r.metadata !== null);
  if (valid.length === 0) {
    return { categoria: 'Altro', descrizione: '', tag: [], importo: '', data: new Date().toISOString().slice(0, 10) };
  }

  // categoria: valore più frequente (senza distinzione maiuscole)
  const catCounts = {};
  for (const { metadata: m } of valid) {
    const key = (m.categoria || '').trim().toLowerCase();
    catCounts[key] = (catCounts[key] || 0) + 1;
  }
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];
  // Recupera le maiuscole originali dal primo match
  const categoriaRaw = valid.find(r => r.metadata.categoria.trim().toLowerCase() === topCat)?.metadata.categoria ?? topCat;
  const categoria = categoriaRaw.trim();

  // descrizione: descrizioni uniche unite
  const descs = [...new Set(valid.map(r => (r.metadata.descrizione || '').trim()).filter(Boolean))];
  const descrizione = descs.join(', ');

  // tag: unione, deduplicati, minuscolo
  const tagSet = new Set();
  for (const { metadata: m } of valid) {
    (m.tag || []).forEach(t => tagSet.add(t.trim().toLowerCase()));
  }
  const tag = [...tagSet];

  // importo: somma dei valori numerici
  let total = 0;
  for (const { metadata: m } of valid) {
    const val = parseFloat((m.importo || '').replace(',', '.'));
    if (!isNaN(val)) total += val;
  }
  const importo = total > 0 ? total.toFixed(2) : '';

  // data: data più antica valida, oggi come fallback
  const dates = valid
    .map(r => r.metadata.data)
    .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const data = dates[0] ?? new Date().toISOString().slice(0, 10);

  return { categoria, descrizione, tag, importo, data };
}

function resolveCategory(suggested, existingCategories) {
  // Restituisce { resolved: string, isNew: boolean }
  const lower = suggested.trim().toLowerCase();
  const match = existingCategories.find(c => c.trim().toLowerCase() === lower);
  if (match) return { resolved: match, isNew: false };
  return { resolved: suggested.trim(), isNew: true };
}

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove gli accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildFilename(metadata) {
  const slug = toSlug(metadata.descrizione || 'documento');
  const date = (metadata.data || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const time = new Date().toTimeString().slice(0, 5).replace(':', '');
  return `${slug}_${date}-${time}.pdf`;
}
