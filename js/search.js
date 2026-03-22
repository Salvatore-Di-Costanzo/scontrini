// search.js — Filtra e mostra i risultati di ricerca

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

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

// isTrash: true = vista cestino, false = vista archivio
// callbacks: { onTrash, onRestore, onPermanentDelete }
function renderSearchResults(entries, { isTrash = false, onTrash, onRestore, onPermanentDelete } = {}) {
  const container = document.getElementById('search-results');
  container.innerHTML = '';

  if (entries.length === 0) {
    const p = document.createElement('p');
    p.textContent = isTrash ? 'Il cestino è vuoto.' : 'Nessun documento trovato.';
    container.appendChild(p);
    return;
  }

  // Ordina per data decrescente
  const sorted = [...entries].sort((a, b) => b.data.localeCompare(a.data));

  // Raggruppa per mese-anno (YYYY-MM)
  const groups = new Map();
  for (const e of sorted) {
    const key = e.data ? e.data.slice(0, 7) : 'sconosciuto';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  for (const [key, groupEntries] of groups) {
    // Intestazione mese/anno
    const heading = document.createElement('div');
    heading.className = 'month-heading';
    if (key !== 'sconosciuto') {
      const [year, month] = key.split('-');
      heading.textContent = `${MESI[parseInt(month, 10) - 1]} ${year}`;
    } else {
      heading.textContent = 'Data sconosciuta';
    }
    container.appendChild(heading);

    for (const e of groupEntries) {
      const div = document.createElement('div');
      div.className = 'result-item';

      // Header: badge + data + azioni
      const header = document.createElement('div');
      header.className = 'result-header';

      const badge = document.createElement('span');
      badge.className = 'result-badge';
      badge.textContent = e.categoria;

      const date = document.createElement('span');
      date.className = 'result-date';
      date.textContent = e.data;

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      if (isTrash) {
        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'result-action-btn';
        restoreBtn.title = 'Ripristina';
        restoreBtn.textContent = '↩';
        restoreBtn.addEventListener('click', () => onRestore && onRestore(e.id));

        const delBtn = document.createElement('button');
        delBtn.className = 'result-action-btn result-action-delete';
        delBtn.title = 'Elimina definitivamente';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', () => onPermanentDelete && onPermanentDelete(e.id, e.drive_file_id));

        actions.appendChild(restoreBtn);
        actions.appendChild(delBtn);
      } else {
        const editBtn = document.createElement('button');
        editBtn.className = 'result-action-btn';
        editBtn.title = 'Modifica';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', () => onEdit && onEdit(e, div));

        const trashBtn = document.createElement('button');
        trashBtn.className = 'result-action-btn';
        trashBtn.title = 'Sposta nel cestino';
        trashBtn.textContent = '🗑';
        trashBtn.addEventListener('click', () => onTrash && onTrash(e.id, e.drive_file_id));

        actions.appendChild(editBtn);
        actions.appendChild(trashBtn);
      }

      header.appendChild(badge);
      header.appendChild(date);
      header.appendChild(actions);
      div.appendChild(header);

      // Descrizione
      const desc = document.createElement('div');
      desc.className = 'result-descrizione';
      desc.textContent = e.descrizione;
      div.appendChild(desc);

      // Meta: tag + importo
      const meta = document.createElement('div');
      meta.className = 'result-meta';
      meta.textContent = e.tag.join(', ') + (e.importo ? ` · €${e.importo}` : '');
      div.appendChild(meta);

      if (isTrash) {
        // Mostra quanti giorni restano nel cestino
        const delDate = new Date(e.deleted_at);
        delDate.setDate(delDate.getDate() + 30);
        const remaining = Math.max(1, Math.ceil((delDate - Date.now()) / 86400000));
        const expiry = document.createElement('div');
        expiry.className = 'result-expiry';
        expiry.textContent = `Eliminato — rimane per ${remaining} giorno/i`;
        div.appendChild(expiry);
      } else {
        const link = document.createElement('a');
        // Valida l'URL per prevenire XSS javascript:
        link.href = e.drive_url && e.drive_url.startsWith('https://') ? e.drive_url : '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'result-link';
        link.textContent = 'Apri PDF →';
        div.appendChild(link);
      }

      container.appendChild(div);
    }
  }
}
