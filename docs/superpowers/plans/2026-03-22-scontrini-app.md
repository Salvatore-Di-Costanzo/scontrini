# Scontrini App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure-frontend web app that photographs documents, extracts metadata with Gemini AI, generates a PDF, and saves it to Google Drive in an organized folder structure with a searchable index.

**Architecture:** Vanilla HTML + JavaScript, no bundler, no backend. Each module is a plain `.js` file loaded via `<script>` tags. Google Drive + Sheets accessed via `gapi.js` (client library); Google login via **Google Identity Services (GIS)** `accounts.google.com/gsi/client` (the old `gapi.auth2` is deprecated and broken for new projects). Gemini accessed via direct REST fetch using an API key stored in `localStorage`.

**Tech Stack:** HTML5, CSS3, Vanilla JS, jsPDF (CDN), gapi.js (CDN), Gemini REST API, Google Drive API v3, Google Sheets API v4.

**Spec:** `docs/superpowers/specs/2026-03-22-scontrini-app-design.md`

---

## File Structure

```
index.html              ← App shell: all views as hidden <section> elements
css/
  style.css             ← All styles
js/
  auth.js               ← Gemini key setup + Google OAuth2 init/login
  camera.js             ← getUserMedia capture + file upload fallback
  session.js            ← In-memory session state (photos array)
  gemini.js             ← Gemini REST API call + JSON parse
  metadata.js           ← Per-photo merge logic + category resolution
  pdf.js                ← jsPDF: build PDF from photo array
  drive.js              ← Drive: idempotent folder create + file upload + list categories
  sheets.js             ← Sheets: find-or-create workbook + append row
  index-store.js        ← scontrini-index.json: read-modify-write on Drive
  search.js             ← Filter/render search results from index
  app.js                ← Main controller: view routing, wiring all modules
tests/
  test.html             ← In-browser test runner for pure-logic modules
```

---

## Task 1: Project Scaffold + Google Cloud Setup

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/app.js`

### Google Cloud Console setup (do this manually before writing any code)

- [ ] **Step 1: Create Google Cloud project**

  Go to https://console.cloud.google.com → New Project → name it "Scontrini".

- [ ] **Step 2: Enable APIs**

  In the project, go to "APIs & Services > Library" and enable:
  - Google Drive API
  - Google Sheets API

- [ ] **Step 3: Create OAuth2 credentials**

  Go to "APIs & Services > Credentials" → Create Credentials → OAuth 2.0 Client ID.
  - Application type: **Web application**
  - Authorized JavaScript origins: `http://localhost:8080` (for local dev)
  - Copy the **Client ID** — you will need it in `auth.js`

- [ ] **Step 4: Get a Gemini API key**

  Go to https://aistudio.google.com → "Get API key" → Create API key in the Scontrini project.
  Copy the key — the app will ask for it on first launch (stored in `localStorage`).

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scontrini</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

  <!-- VIEW: setup (Gemini key + Google login) -->
  <section id="view-setup" class="view">
    <h1>Scontrini</h1>
    <div id="setup-gemini">
      <p>Inserisci la tua Gemini API key per continuare:</p>
      <input type="password" id="input-gemini-key" placeholder="Gemini API key">
      <button id="btn-save-gemini-key">Salva</button>
    </div>
    <div id="setup-google" style="display:none">
      <button id="btn-google-login">Accedi con Google</button>
    </div>
  </section>

  <!-- VIEW: capture -->
  <section id="view-capture" class="view" style="display:none">
    <h2>Sessione foto</h2>
    <div id="camera-preview-container">
      <video id="camera-video" autoplay playsinline></video>
      <canvas id="camera-canvas" style="display:none"></canvas>
    </div>
    <button id="btn-capture">Scatta foto</button>
    <input type="file" id="input-file-upload" accept="image/*" style="display:none">
    <button id="btn-file-fallback">Carica da file</button>
    <div id="photo-thumbnails"></div>
    <button id="btn-analyze" disabled>Analizza e continua</button>
  </section>

  <!-- VIEW: review metadata -->
  <section id="view-review" class="view" style="display:none">
    <h2>Conferma informazioni</h2>
    <label>Categoria
      <input type="text" id="field-categoria">
      <div id="categoria-suggestions"></div>
    </label>
    <label>Descrizione
      <input type="text" id="field-descrizione">
    </label>
    <label>Tag (separati da virgola)
      <input type="text" id="field-tag">
    </label>
    <label>Importo (€)
      <input type="text" id="field-importo">
    </label>
    <label>Data
      <input type="date" id="field-data">
    </label>
    <button id="btn-save-session">Salva sessione</button>
  </section>

  <!-- VIEW: saving progress -->
  <section id="view-saving" class="view" style="display:none">
    <h2>Salvataggio in corso...</h2>
    <p id="saving-status"></p>
  </section>

  <!-- VIEW: search -->
  <section id="view-search" class="view" style="display:none">
    <h2>Archivio</h2>
    <input type="text" id="search-text" placeholder="Cerca...">
    <select id="search-categoria"><option value="">Tutte le categorie</option></select>
    <input type="date" id="search-date-from">
    <input type="date" id="search-date-to">
    <input type="number" id="search-importo-min" placeholder="Importo min (€)" min="0" step="0.01">
    <input type="number" id="search-importo-max" placeholder="Importo max (€)" min="0" step="0.01">
    <div id="search-results"></div>
    <button id="btn-new-session">Nuova sessione</button>
  </section>

  <!-- Libraries -->
  <script src="https://apis.google.com/js/api.js"></script>
  <script src="https://accounts.google.com/gsi/client"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

  <!-- App modules (order matters) -->
  <script src="js/auth.js"></script>
  <script src="js/camera.js"></script>
  <script src="js/session.js"></script>
  <script src="js/gemini.js"></script>
  <script src="js/metadata.js"></script>
  <script src="js/pdf.js"></script>
  <script src="js/drive.js"></script>
  <script src="js/sheets.js"></script>
  <script src="js/index-store.js"></script>
  <script src="js/search.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create css/style.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 1rem; }
h1, h2 { margin-bottom: 1rem; }
.view { padding: 1rem 0; }
button { display: block; width: 100%; padding: 0.75rem; margin: 0.5rem 0;
         background: #1a73e8; color: white; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; }
button:disabled { background: #ccc; cursor: not-allowed; }
input[type="text"], input[type="password"], input[type="date"], select {
  display: block; width: 100%; padding: 0.5rem; margin: 0.25rem 0 0.75rem;
  border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; }
label { display: block; font-weight: 600; margin-top: 0.5rem; }
#camera-video { width: 100%; border-radius: 8px; background: #000; }
#photo-thumbnails { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
#photo-thumbnails img { width: 80px; height: 80px; object-fit: cover; border-radius: 4px; }
#categoria-suggestions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
#categoria-suggestions button { width: auto; padding: 0.25rem 0.75rem; font-size: 0.85rem; background: #e8f0fe; color: #1a73e8; }
#search-results { margin-top: 1rem; }
.result-item { padding: 0.75rem; border: 1px solid #eee; border-radius: 6px; margin-bottom: 0.5rem; }
.result-item a { color: #1a73e8; text-decoration: none; }
#saving-status { color: #555; margin-top: 0.5rem; }
```

- [ ] **Step 7: Create js/app.js (skeleton only)**

```javascript
// app.js — Main controller (wired up in later tasks)
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID_HERE'; // Replace with your OAuth2 client ID

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

window.addEventListener('load', () => {
  // Startup sequence implemented in Task 2
});
```

- [ ] **Step 8: Verify scaffold in browser**

  Start a local server: `npx serve . -p 8080` (or `python -m http.server 8080`)
  Open `http://localhost:8080` — you should see the "Scontrini" heading and the Gemini key input.

---

## Task 2: auth.js — Gemini Key + Google OAuth2

**Files:**
- Create: `js/auth.js`
- Modify: `js/app.js`

- [ ] **Step 1: Create js/auth.js**

```javascript
// auth.js — Gemini API key management + Google login via GIS + gapi client
//
// NOTE: gapi.auth2 is DEPRECATED and broken for new projects.
// Use Google Identity Services (GIS) for login, gapi.client for API calls.

const GEMINI_KEY_STORAGE = 'scontrini_gemini_key';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

let _googleToken = null; // access token, in memory only
let _tokenClient = null; // GIS token client

function getGeminiKey() {
  return localStorage.getItem(GEMINI_KEY_STORAGE);
}

function saveGeminiKey(key) {
  localStorage.setItem(GEMINI_KEY_STORAGE, key.trim());
}

function hasGeminiKey() {
  const key = getGeminiKey();
  return key && key.length > 0;
}

function getGoogleToken() {
  return _googleToken;
}

// Load gapi client (Drive + Sheets discovery docs only — no auth2)
function initGapiClient() {
  return new Promise((resolve, reject) => {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
            'https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest',
          ],
        });
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Initialize GIS token client (does NOT trigger login yet)
function initTokenClient(clientId, onTokenReceived) {
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error('GIS token error:', tokenResponse.error);
        return;
      }
      _googleToken = tokenResponse.access_token;
      // Keep gapi.client in sync
      gapi.client.setToken({ access_token: _googleToken });
      onTokenReceived(_googleToken);
    },
  });
}

// Request a new token (shows Google consent popup if needed)
function googleLogin() {
  return new Promise((resolve, reject) => {
    _tokenClient.callback = (tokenResponse) => {
      if (tokenResponse.error) {
        reject(new Error(tokenResponse.error));
        return;
      }
      _googleToken = tokenResponse.access_token;
      gapi.client.setToken({ access_token: _googleToken });
      resolve(_googleToken);
    };
    _tokenClient.requestAccessToken({ prompt: '' });
  });
}

function isGoogleSignedIn() {
  return _googleToken !== null;
}

async function ensureGoogleToken() {
  if (!isGoogleSignedIn()) return googleLogin();
  return _googleToken;
}

async function initGoogleAuth(clientId) {
  await initGapiClient();
  initTokenClient(clientId, () => {}); // placeholder callback, overridden in googleLogin()
}
```

- [ ] **Step 2: Wire startup sequence in app.js**

Replace the `window.addEventListener('load', ...)` block in `app.js`:

```javascript
window.addEventListener('load', async () => {
  // Step 1: Gemini key
  if (!hasGeminiKey()) {
    showView('view-setup');
    document.getElementById('setup-gemini').style.display = 'block';
    document.getElementById('btn-save-gemini-key').addEventListener('click', () => {
      const key = document.getElementById('input-gemini-key').value.trim();
      if (!key) return;
      saveGeminiKey(key);
      document.getElementById('setup-gemini').style.display = 'none';
      document.getElementById('setup-google').style.display = 'block';
    });
    return; // Wait for key save; page reloads via btn-google-login
  }

  // Step 2: Google login
  await initGoogleAuth(GOOGLE_CLIENT_ID);
  if (!isGoogleSignedIn()) {
    showView('view-setup');
    document.getElementById('setup-gemini').style.display = 'none';
    document.getElementById('setup-google').style.display = 'block';
    document.getElementById('btn-google-login').addEventListener('click', async () => {
      await googleLogin();
      startCaptureView();
    });
    return;
  }

  await ensureGoogleToken();
  startCaptureView();
});

function startCaptureView() {
  showView('view-capture');
  // Camera init wired in Task 3
}
```

- [ ] **Step 3: Test manually in browser**

  Load `http://localhost:8080`.
  - First load: Gemini key input appears. Enter a fake key → "Accedi con Google" button appears.
  - Click "Accedi con Google" → Google OAuth2 popup should appear (requires valid Client ID).
  - After login → capture view shown.

---

## Task 3: camera.js — Photo Capture

**Files:**
- Create: `js/camera.js`
- Modify: `js/app.js`

- [ ] **Step 1: Create js/camera.js**

```javascript
// camera.js — getUserMedia capture + file upload fallback

let _stream = null;

async function startCamera() {
  const video = document.getElementById('camera-video');
  try {
    _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = _stream;
    return true;
  } catch (err) {
    console.warn('Camera not available:', err.message);
    return false;
  }
}

function stopCamera() {
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}

function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85); // base64 JPEG
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

- [ ] **Step 2: Wire camera into app.js — add initCaptureView function**

Add to `app.js`:

```javascript
async function startCaptureView() {
  showView('view-capture');
  const cameraAvailable = await startCamera();

  if (!cameraAvailable) {
    document.getElementById('btn-capture').style.display = 'none';
    document.getElementById('btn-file-fallback').style.display = 'block';
  }

  document.getElementById('btn-capture').addEventListener('click', () => {
    const base64 = capturePhoto();
    addPhoto(base64);
    renderThumbnail(base64);
    document.getElementById('btn-analyze').disabled = false;
  });

  document.getElementById('btn-file-fallback').addEventListener('click', () => {
    document.getElementById('input-file-upload').click();
  });

  document.getElementById('input-file-upload').addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      const base64 = await fileToBase64(file);
      addPhoto(base64);
      renderThumbnail(base64);
    }
    document.getElementById('btn-analyze').disabled = false;
  });
}

function renderThumbnail(base64) {
  const img = document.createElement('img');
  img.src = base64;
  document.getElementById('photo-thumbnails').appendChild(img);
}
```

- [ ] **Step 3: Test manually**

  Load the app → after login, capture view shown → camera preview visible on mobile/desktop with webcam.
  Tap "Scatta foto" → thumbnail appears below. "Analizza e continua" becomes clickable.
  On a device without camera → "Carica da file" button visible instead.

---

## Task 4: session.js — Session State

**Files:**
- Create: `js/session.js`
- Create: `tests/test.html`

- [ ] **Step 1: Create js/session.js**

```javascript
// session.js — In-memory session state

let _photos = []; // array of base64 strings

function addPhoto(base64) {
  _photos.push(base64);
}

function getPhotos() {
  return [..._photos];
}

function clearSession() {
  _photos = [];
}

function photoCount() {
  return _photos.length;
}
```

- [ ] **Step 2: Create tests/test.html**

```html
<!DOCTYPE html>
<html>
<head><title>Tests</title></head>
<body>
<pre id="output"></pre>
<script src="../js/session.js"></script>
<script>
const results = [];

function assert(desc, condition) {
  results.push((condition ? '✅' : '❌') + ' ' + desc);
}

// session.js tests
clearSession();
assert('starts empty', photoCount() === 0);
addPhoto('data:image/jpeg;base64,AAA');
assert('count is 1 after addPhoto', photoCount() === 1);
addPhoto('data:image/jpeg;base64,BBB');
assert('count is 2 after second addPhoto', photoCount() === 2);
assert('getPhotos returns copy', getPhotos() !== getPhotos());
assert('getPhotos has correct values', getPhotos()[0] === 'data:image/jpeg;base64,AAA');
clearSession();
assert('count is 0 after clearSession', photoCount() === 0);

document.getElementById('output').textContent = results.join('\n');
</script>
</body>
</html>
```

- [ ] **Step 3: Run tests**

  Open `http://localhost:8080/tests/test.html` — all 6 assertions should show ✅.

- [ ] **Step 4: Commit**

```bash
git init
git add index.html css/ js/ tests/ docs/
git commit -m "feat: project scaffold, auth, camera, session"
```

---

## Task 5: gemini.js — AI Analysis

**Files:**
- Create: `js/gemini.js`

- [ ] **Step 1: Create js/gemini.js**

```javascript
// gemini.js — Gemini REST API: analyze one photo, return structured metadata

const GEMINI_MODEL = 'gemini-3-flash-preview'; // Verify current free model at aistudio.google.com
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Categories here are FOLDER NAMES — they must match the Drive subfolder structure.
// The spec uses illustrative names; these are the actual Italian folder-name categories.
const GEMINI_PROMPT = `Analizza questa immagine di un documento.
Restituisci SOLO un oggetto JSON valido con questi campi:
- categoria: scegli il valore più adatto tra: "Scontrini", "Ricette", "Analisi", "Bollette", "Auto", "Assicurazioni", "Altro"
- descrizione: stringa breve e descrittiva (es. "Caldaia Baxi ECO5", "Bolletta acqua Q1 2026", "Ricetta medica Dr. Rossi")
- tag: array di stringhe lowercase (es. ["garanzia", "caldaia", "riscaldamento"])
- importo: stringa con importo in euro se visibile, altrimenti ""
- data: stringa in formato YYYY-MM-DD se visibile, altrimenti ""

Nessun testo aggiuntivo, solo JSON.`;

async function analyzePhoto(base64DataUrl) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('Gemini API key not set');

  // Strip the "data:image/jpeg;base64," prefix
  const base64Data = base64DataUrl.split(',')[1];
  const mimeType = base64DataUrl.split(';')[0].split(':')[1]; // e.g. "image/jpeg"

  const body = {
    contents: [{
      parts: [
        { text: GEMINI_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }]
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const json = await response.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  try {
    // Strip possible markdown code fences
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${text}`);
  }
}

async function analyzeAllPhotos(photos) {
  const results = [];
  for (const photo of photos) {
    try {
      const metadata = await analyzePhoto(photo);
      results.push({ photo, metadata, error: null });
    } catch (err) {
      results.push({ photo, metadata: null, error: err.message });
    }
  }
  return results;
}
```

- [ ] **Step 2: Test manually with a real photo**

  In browser console after loading the app with a valid Gemini key:
  ```javascript
  analyzePhoto(getPhotos()[0]).then(console.log).catch(console.error)
  ```
  Expected: a JSON object with `categoria`, `descrizione`, `tag`, `importo`, `data`.

  If you get a 404 model error: update `GEMINI_MODEL` in `gemini.js` to the correct current model ID from https://aistudio.google.com.

---

## Task 6: metadata.js — Merge + Category Resolution

**Files:**
- Create: `js/metadata.js`
- Modify: `tests/test.html`

- [ ] **Step 1: Create js/metadata.js**

```javascript
// metadata.js — Merge per-photo metadata + category resolution

function mergeMetadata(analysisResults) {
  // Filter out failed analyses
  const valid = analysisResults.filter(r => r.metadata !== null);
  if (valid.length === 0) {
    return { categoria: '', descrizione: '', tag: [], importo: '', data: '' };
  }

  // categoria: most frequent value (case-insensitive)
  const catCounts = {};
  for (const { metadata: m } of valid) {
    const key = (m.categoria || '').trim().toLowerCase();
    catCounts[key] = (catCounts[key] || 0) + 1;
  }
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];
  // Recover original casing from first match
  const categoriaRaw = valid.find(r => r.metadata.categoria.trim().toLowerCase() === topCat)?.metadata.categoria ?? topCat;
  const categoria = categoriaRaw.trim();

  // descrizione: unique descriptions joined
  const descs = [...new Set(valid.map(r => (r.metadata.descrizione || '').trim()).filter(Boolean))];
  const descrizione = descs.join(', ');

  // tag: union, deduplicated, lowercase
  const tagSet = new Set();
  for (const { metadata: m } of valid) {
    (m.tag || []).forEach(t => tagSet.add(t.trim().toLowerCase()));
  }
  const tag = [...tagSet];

  // importo: sum of parseable values
  let total = 0;
  for (const { metadata: m } of valid) {
    const val = parseFloat((m.importo || '').replace(',', '.'));
    if (!isNaN(val)) total += val;
  }
  const importo = total > 0 ? total.toFixed(2) : '';

  // data: earliest valid date, fallback to today
  const dates = valid
    .map(r => r.metadata.data)
    .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const data = dates[0] ?? new Date().toISOString().slice(0, 10);

  return { categoria, descrizione, tag, importo, data };
}

function resolveCategory(suggested, existingCategories) {
  // Returns { resolved: string, isNew: boolean }
  const lower = suggested.trim().toLowerCase();
  const match = existingCategories.find(c => c.trim().toLowerCase() === lower);
  if (match) return { resolved: match, isNew: false };
  return { resolved: suggested.trim(), isNew: true };
}

function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildFilename(metadata) {
  const slug = toSlug(metadata.descrizione || 'documento');
  const date = (metadata.data || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const time = new Date().toTimeString().slice(0, 5).replace(':', '');
  return `${slug}_${date}-${time}.pdf`;
}
```

- [ ] **Step 2: Add tests to tests/test.html**

Add before the closing `</script>` tag:

```javascript
// metadata.js tests (add after session.js script tag: <script src="../js/metadata.js"></script>)
const fakeResults = [
  { metadata: { categoria: 'Scontrini', descrizione: 'Caldaia Baxi', tag: ['garanzia', 'caldaia'], importo: '1200.00', data: '2026-03-22' }, error: null },
  { metadata: { categoria: 'Scontrini', descrizione: 'Installazione', tag: ['caldaia', 'idraulico'], importo: '200.00', data: '2026-03-21' }, error: null },
  { metadata: null, error: 'Gemini failed' },
];
const merged = mergeMetadata(fakeResults);
assert('merge: categoria is most frequent', merged.categoria === 'Scontrini');
assert('merge: descrizione joins unique values', merged.descrizione === 'Caldaia Baxi, Installazione');
assert('merge: tag union deduplicated', merged.tag.length === 3 && merged.tag.includes('caldaia'));
assert('merge: importo summed', merged.importo === '1400.00');
assert('merge: data is earliest', merged.data === '2026-03-21');

const { resolved, isNew } = resolveCategory('scontrini', ['Scontrini', 'Ricette']);
assert('resolveCategory: matches existing case-insensitive', resolved === 'Scontrini' && !isNew);
const { resolved: r2, isNew: n2 } = resolveCategory('Garanzie', ['Scontrini', 'Ricette']);
assert('resolveCategory: new category flagged', r2 === 'Garanzie' && n2 === true);

assert('toSlug: basic', toSlug('Caldaia Baxi ECO5') === 'caldaia-baxi-eco5');
assert('toSlug: accents', toSlug('Ricevuta caffè') === 'ricevuta-caffe');
```

Also add `<script src="../js/metadata.js"></script>` to `tests/test.html` after `session.js`.

- [ ] **Step 3: Run tests**

  Reload `http://localhost:8080/tests/test.html` — all assertions ✅.

---

## Task 7: pdf.js — PDF Generation

**Files:**
- Create: `js/pdf.js`

- [ ] **Step 1: Create js/pdf.js**

```javascript
// pdf.js — Generate PDF from array of base64 photos using jsPDF

async function generatePdf(photos) {
  const { jsPDF } = window.jspdf;

  // Create doc using first photo's orientation; subsequent pages added with their own orientation
  const firstImg = await loadImage(photos[0]);
  const firstOrientation = firstImg.width > firstImg.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation: firstOrientation, unit: 'mm', format: 'a4' });

  for (let i = 0; i < photos.length; i++) {
    const img = await loadImage(photos[i]);
    const orientation = img.width > img.height ? 'landscape' : 'portrait';

    if (i > 0) {
      doc.addPage('a4', orientation); // per-photo orientation
    }

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / img.width, pageH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    const format = photos[i].includes('image/png') ? 'PNG' : 'JPEG';
    doc.addImage(photos[i], format, x, y, w, h);
  }

  return doc.output('arraybuffer');
}

function loadImage(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64;
  });
}
```

- [ ] **Step 2: Test manually in browser console**

  After capturing at least one photo:
  ```javascript
  generatePdf(getPhotos()).then(buf => {
    const blob = new Blob([buf], { type: 'application/pdf' });
    window.open(URL.createObjectURL(blob));
  });
  ```
  Expected: PDF opens in new tab showing the captured photo.

---

## Task 8: drive.js — Folder Management + Upload

**Files:**
- Create: `js/drive.js`

- [ ] **Step 1: Create js/drive.js**

```javascript
// drive.js — Google Drive: idempotent folder creation, file upload, category listing

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
  // Find or create "Documenti" in Drive root
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
  // Returns the ID of Documenti/{yearMonth}/{categoria}/
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

  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  return await res.json(); // { id, webViewLink }
}

async function getAllCategories(rootId) {
  // Collect all unique category folder names across all month folders
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
```

- [ ] **Step 2: Test manually in browser console**

  After Google login:
  ```javascript
  getRootFolderId().then(id => console.log('Root folder ID:', id));
  ```
  Expected: a Google Drive folder ID string. Verify "Documenti" folder appears in your Google Drive.

---

## Task 9: sheets.js — Sheets Index

**Files:**
- Create: `js/sheets.js`

- [ ] **Step 1: Create js/sheets.js**

```javascript
// sheets.js — Google Sheets: find-or-create workbook, append row

const SHEETS_TITLE = 'Scontrini Index';
const SHEETS_HEADERS = ['id', 'data', 'categoria', 'descrizione', 'tag', 'importo', 'drive_file_id', 'drive_url'];

async function findOrCreateSheet(rootFolderId) {
  // Look for existing sheet in Documenti folder
  const res = await gapi.client.drive.files.list({
    q: `name='${SHEETS_TITLE}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: 'files(id)',
  });

  if (res.result.files?.length > 0) return res.result.files[0].id;

  // Create new spreadsheet
  const created = await gapi.client.drive.files.create({
    resource: {
      name: SHEETS_TITLE,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [rootFolderId],
    },
    fields: 'id',
  });
  const sheetId = created.result.id;

  // Write header row
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
```

- [ ] **Step 2: Test manually in browser console**

  ```javascript
  getRootFolderId().then(id => findOrCreateSheet(id)).then(id => console.log('Sheet ID:', id));
  ```
  Expected: a spreadsheet ID. Verify "Scontrini Index" appears in your Google Drive "Documenti" folder.

---

## Task 10: index-store.js — JSON Index Read-Modify-Write

**Files:**
- Create: `js/index-store.js`
- Modify: `tests/test.html`

- [ ] **Step 1: Create js/index-store.js**

```javascript
// index-store.js — scontrini-index.json: read-modify-write on Drive

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
  const entries = await res.json();
  return { entries, fileId };
}

async function writeIndex(entries, existingFileId, rootFolderId) {
  const accessToken = getGoogleToken();
  const content = JSON.stringify(entries, null, 2);
  const blob = new Blob([content], { type: 'application/json' });

  if (existingFileId) {
    // Update existing file
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: blob,
    });
  } else {
    // Create new file
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
```

- [ ] **Step 2: Add pure-logic tests to tests/test.html**

`metadata.js` is already loaded from Task 6. Just add these assertions (no new script tag needed):

```javascript
assert('buildFilename: contains slug and date', buildFilename({ descrizione: 'Caldaia Baxi', data: '2026-03-22' }).startsWith('caldaia-baxi_20260322'));
assert('buildFilename: ends with .pdf', buildFilename({ descrizione: 'test', data: '2026-03-22' }).endsWith('.pdf'));
```

- [ ] **Step 3: Run tests — all ✅**

---

## Task 11: app.js — Full Controller + Review View + Save Flow

**Files:**
- Modify: `js/app.js`

Replace `app.js` content with the complete controller:

- [ ] **Step 1: Write complete app.js**

```javascript
// app.js — Main controller

const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID_HERE'; // Replace with your OAuth2 client ID

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

// ── Startup ──────────────────────────────────────────────
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

// ── Capture View ──────────────────────────────────────────
async function startCaptureView() {
  clearSession();
  document.getElementById('photo-thumbnails').innerHTML = '';
  document.getElementById('btn-analyze').disabled = true;
  showView('view-capture');

  const cameraAvailable = await startCamera();
  if (!cameraAvailable) {
    document.getElementById('btn-capture').style.display = 'none';
  }

  document.getElementById('btn-capture').onclick = () => {
    const base64 = capturePhoto();
    addPhoto(base64);
    renderThumbnail(base64);
    document.getElementById('btn-analyze').disabled = false;
  };

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

// ── Review View ───────────────────────────────────────────
async function startReviewView() {
  showView('view-saving');
  setStatus('Analisi immagini in corso...');

  const photos = getPhotos();
  const analysisResults = await analyzeAllPhotos(photos);
  const merged = mergeMetadata(analysisResults);

  // Load existing categories for suggestion
  const rootId = await getRootFolderId();
  const existingCategories = await getAllCategories(rootId);
  const { resolved, isNew } = resolveCategory(merged.categoria, existingCategories);

  showView('view-review');

  document.getElementById('field-categoria').value = resolved;
  document.getElementById('field-descrizione').value = merged.descrizione;
  document.getElementById('field-tag').value = merged.tag.join(', ');
  document.getElementById('field-importo').value = merged.importo;
  document.getElementById('field-data').value = merged.data;

  // Show category suggestions
  const suggestionsEl = document.getElementById('categoria-suggestions');
  suggestionsEl.innerHTML = '';

  if (isNew && existingCategories.length > 0) {
    const hint = document.createElement('p');
    hint.style.fontSize = '0.85rem';
    hint.style.color = '#555';
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

// Retry a fn up to maxAttempts times with exponential backoff
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

// ── Save Session ──────────────────────────────────────────
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

  // Generate PDF early so we can use it for local fallback even after Drive failure
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
      // pdfBuffer already generated above — safe to use here
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    }
  }
}

// ── Search View ───────────────────────────────────────────
async function startSearchView() {
  showView('view-saving');
  setStatus('Caricamento archivio...');

  const rootId = await getRootFolderId();
  const { entries } = await readIndex(rootId);

  showView('view-search');
  renderSearchResults(entries);

  // Populate category dropdown
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
```

- [ ] **Step 2: Test full happy path manually**

  1. Load app → enter Gemini key → login with Google
  2. Take 2 photos of any document
  3. Tap "Analizza e continua" → loading, then review form with auto-filled fields
  4. Confirm → saving view progresses through statuses → search view appears
  5. Verify in Google Drive: `Documenti/2026-03/{Categoria}/` folder with PDF
  6. Verify `scontrini-index.json` updated and "Scontrini Index" sheet has a new row

---

## Task 12: search.js — Search + Filter Logic

**Files:**
- Create: `js/search.js`
- Modify: `tests/test.html`

- [ ] **Step 1: Create js/search.js**

```javascript
// search.js — Filter and render search results

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
      // Entries with no importo ("") are not over the max — let them through
      if (!isNaN(val) && val > parseFloat(importoMax)) return false;
    }
    if (text) {
      const haystack = `${e.descrizione} ${e.tag.join(' ')} ${e.categoria}`.toLowerCase();
      if (!haystack.includes(text)) return false;
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

  // Sort by date descending
  const sorted = [...entries].sort((a, b) => b.data.localeCompare(a.data));

  for (const e of sorted) {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
      <strong>${e.categoria}</strong> — ${e.data}<br>
      ${e.descrizione}<br>
      <small>${e.tag.join(', ')}${e.importo ? ' · €' + e.importo : ''}</small><br>
      <a href="${e.drive_url}" target="_blank">Apri PDF</a>
    `;
    container.appendChild(div);
  }
}
```

- [ ] **Step 2: Add filter tests to tests/test.html**

Add `<script src="../js/search.js"></script>` and:

```javascript
const testEntries = [
  { id: '1', data: '2026-03-22', categoria: 'Scontrini', descrizione: 'Caldaia Baxi', tag: ['garanzia'], importo: '1200', drive_file_id: 'a', drive_url: '#' },
  { id: '2', data: '2026-02-10', categoria: 'Ricette', descrizione: 'Ricetta medica', tag: ['dottore'], importo: '', drive_file_id: 'b', drive_url: '#' },
  { id: '3', data: '2026-01-05', categoria: 'Analisi', descrizione: 'Esami sangue', tag: ['sangue', 'laboratorio'], importo: '45', drive_file_id: 'c', drive_url: '#' },
];
const noFilter = { text: '', cat: '', from: '', to: '', importoMin: '', importoMax: '' };
assert('filter by categoria', filterEntries(testEntries, { ...noFilter, cat: 'Ricette' }).length === 1);
assert('filter by text in descrizione', filterEntries(testEntries, { ...noFilter, text: 'caldaia' }).length === 1);
assert('filter by text in tag', filterEntries(testEntries, { ...noFilter, text: 'sangue' }).length === 1);
assert('filter by date from', filterEntries(testEntries, { ...noFilter, from: '2026-02-01' }).length === 2);
assert('filter by date range', filterEntries(testEntries, { ...noFilter, from: '2026-01-01', to: '2026-01-31' }).length === 1);
assert('filter by importo min', filterEntries(testEntries, { ...noFilter, importoMin: '100' }).length === 1); // only 1200
assert('filter by importo max', filterEntries(testEntries, { ...noFilter, importoMax: '50' }).length === 2);  // 45 passes + empty importo passes
assert('filter by importo range', filterEntries(testEntries, { ...noFilter, importoMin: '40', importoMax: '50' }).length === 1);
assert('no filter returns all', filterEntries(testEntries, noFilter).length === 3);
```

- [ ] **Step 3: Run tests — all ✅**

- [ ] **Step 4: Final end-to-end test**

  1. Take photos of different document types in separate sessions
  2. Confirm each saves to correct `Documenti/{YYYY-MM}/{Categoria}/` folder
  3. Search view: test each filter type (text, category, date)
  4. Click "Apri PDF" → correct PDF opens in Google Drive
  5. Test on mobile browser — camera, capture, full flow

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat: complete Scontrini app — camera, AI analysis, PDF, Drive, Sheets, search"
```

---

## Deploy (optional)

To deploy on GitHub Pages:
```bash
git remote add origin https://github.com/YOUR_USERNAME/scontrini.git
git push -u origin main
```
Then in GitHub repo settings → Pages → Source: `main` branch.
Update the OAuth2 authorized origins in Google Cloud Console to include your GitHub Pages URL.
