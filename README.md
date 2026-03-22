# Documenti

Archivia scontrini, ricevute, bollette e documenti con il tuo smartphone. Scatta una foto, l'intelligenza artificiale estrae i metadati automaticamente, genera un PDF e lo salva su Google Drive con un indice ricercabile.

---

## Funzionalità

- **Fotocamera integrata** — scatta direttamente dall'app con risoluzione piena, tap-to-focus e flash
- **Analisi AI** — Gemini estrae categoria, descrizione, tag, importo e data da ogni documento
- **Generazione PDF** — tutte le foto di una sessione in un unico PDF
- **Google Drive** — i PDF vengono salvati in `Documenti/{YYYY-MM}/{Categoria}/`
- **Indice ricercabile** — file JSON + foglio Google Sheets aggiornati automaticamente
- **Archivio con filtri** — cerca per testo, categoria, data, importo
- **Cestino** — i documenti eliminati restano recuperabili per 30 giorni
- **Modifica** — puoi aggiornare i metadati di qualsiasi documento già archiviato
- **Upload PDF** — carica PDF già esistenti oltre alle foto

---

## Requisiti

- Browser moderno con supporto `getUserMedia` (Chrome, Safari, Firefox)
- Account Google (per Drive e Sheets)
- Chiave API Gemini (gratuita su [aistudio.google.com](https://aistudio.google.com))

---

## Configurazione

### 1. Google Cloud Console

1. Crea un progetto su [console.cloud.google.com](https://console.cloud.google.com)
2. Abilita **Google Drive API** e **Google Sheets API**
3. Crea credenziali **OAuth 2.0** di tipo *Applicazione web*
4. Aggiungi l'URL dell'app alle **Origini JavaScript autorizzate** (es. `https://tuo-username.github.io`)
5. Copia il **Client ID**

### 2. Inserisci il Client ID

Apri `js/app.js` e sostituisci riga 3:

```js
const GOOGLE_CLIENT_ID = 'IL_TUO_CLIENT_ID.apps.googleusercontent.com';
```

### 3. Pubblica

L'app è composta da soli file statici — nessun server necessario.

**GitHub Pages:**
```bash
git add .
git commit -m "deploy"
git push
```
Poi attiva Pages da *Settings → Pages → Deploy from branch: main*.

**Locale:**
```bash
npx serve . -p 8080
# oppure
python -m http.server 8080
```

### 4. Primo avvio

Al primo accesso l'app chiede:
1. La tua **Gemini API key** (salvata in localStorage, mai trasmessa altrove)
2. L'accesso al tuo account **Google** (solo Drive + Sheets)

---

## Struttura Google Drive

```
Documenti/
  2026-03/
    Scontrini/
      caldaia-baxi_20260322-1430.pdf
    Bollette/
      bolletta-acqua_20260315-0900.pdf
  2026-02/
    Analisi/
      esami-sangue_20260210-1100.pdf
  scontrini-index.json
  Scontrini Index          ← foglio Google Sheets
```

---

## Stack tecnologico

| Tecnologia | Ruolo |
|---|---|
| HTML + CSS + Vanilla JS | Interfaccia e logica app |
| `getUserMedia` API | Accesso fotocamera |
| `jsPDF` | Generazione PDF |
| Google Identity Services (GIS) | Autenticazione OAuth2 |
| Google Drive API v3 | Archiviazione file e cartelle |
| Google Sheets API v4 | Indice ricercabile |
| Gemini API (`gemini-2.0-flash`) | Analisi AI dei documenti |

Nessun framework, nessun bundler, nessun backend.

---

## Privacy

- I documenti vengono salvati **esclusivamente sul tuo Google Drive**
- La chiave Gemini è salvata nel tuo browser (`localStorage`) e inviata solo all'API Gemini
- Il token Google è mantenuto **solo in memoria** durante la sessione
- Nessun dato transita attraverso server di terze parti
