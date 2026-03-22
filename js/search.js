// search.js — Filtra e mostra i risultati di ricerca

function filterEntries(entries, { text, cat, from, to, importoMin, importoMax }) {
  return entries.filter(e => {
    if (cat && e.categoria !== cat) return false;
    if (from && e.data < from) return false;
    if (to && e.data > to) return false;
    if (importoMin !== '' && importoMin !== undefined) {
      const val = parseFloat(e.importo);
      if (isNaN(val) || val < parseFloat(importoMin)) return false;
    }
    if (importoMax !== '' && importoMax !== undefined) {
      const val = parseFloat(e.importo);
      // Voci senza importo ("") non superano il massimo — lasciarle passare
      if (!isNaN(val) && val > parseFloat(importoMax)) return false;
    }
    if (text) {
      const haystack = `${e.descrizione} ${e.tag.join(' ')} ${e.categoria}`.toLowerCase();
      if (!haystack.includes(text.toLowerCase())) return false;
    }
    return true;
  });
}

function renderSearchResults(entries) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';

  if (entries.length === 0) {
    container.innerHTML = '<p>Nessun risultato.</p>';
    return;
  }

  // Ordina per data decrescente
  const sorted = [...entries].sort((a, b) => b.data.localeCompare(a.data));

  for (const e of sorted) {
    const div = document.createElement('div');
    div.className = 'result-item';

    const header = document.createElement('strong');
    header.textContent = e.categoria;
    div.appendChild(header);
    div.appendChild(document.createTextNode(` — ${e.data}`));
    div.appendChild(document.createElement('br'));

    const desc = document.createElement('span');
    desc.textContent = e.descrizione;
    div.appendChild(desc);
    div.appendChild(document.createElement('br'));

    const meta = document.createElement('small');
    const tagText = e.tag.join(', ') + (e.importo ? ` · €${e.importo}` : '');
    meta.textContent = tagText;
    div.appendChild(meta);
    div.appendChild(document.createElement('br'));

    const link = document.createElement('a');
    // Valida l'URL per prevenire XSS javascript:
    link.href = e.drive_url && e.drive_url.startsWith('https://') ? e.drive_url : '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Apri PDF';
    div.appendChild(link);

    container.appendChild(div);
  }
}
