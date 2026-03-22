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
    const p = document.createElement('p');
    p.textContent = 'Nessun risultato.';
    container.appendChild(p);
    return;
  }

  // Ordina per data decrescente
  const sorted = [...entries].sort((a, b) => b.data.localeCompare(a.data));

  for (const e of sorted) {
    const div = document.createElement('div');
    div.className = 'result-item';

    // Header: badge categoria + data
    const header = document.createElement('div');
    header.className = 'result-header';
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = e.categoria;
    const date = document.createElement('span');
    date.className = 'result-date';
    date.textContent = e.data;
    header.appendChild(badge);
    header.appendChild(date);
    div.appendChild(header);

    // Descrizione principale
    const desc = document.createElement('div');
    desc.className = 'result-descrizione';
    desc.textContent = e.descrizione;
    div.appendChild(desc);

    // Meta: tag + importo
    const meta = document.createElement('div');
    meta.className = 'result-meta';
    const tagText = e.tag.join(', ') + (e.importo ? ` · €${e.importo}` : '');
    meta.textContent = tagText;
    div.appendChild(meta);

    // Link Drive
    const link = document.createElement('a');
    // Valida l'URL per prevenire XSS javascript:
    link.href = e.drive_url && e.drive_url.startsWith('https://') ? e.drive_url : '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'result-link';
    link.textContent = 'Apri PDF →';
    div.appendChild(link);

    container.appendChild(div);
  }
}
