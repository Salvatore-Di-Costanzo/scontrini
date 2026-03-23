// auth.js — Gestione chiave API Gemini + login Google via GIS + client gapi
//
// NOTA: gapi.auth2 è DEPRECATO e non funziona per nuovi progetti.
// Usare Google Identity Services (GIS) per il login, gapi.client per le chiamate API.

const GEMINI_KEY_STORAGE = 'scontrini_gemini_key';
const USER_EMAIL_KEY = 'scontrini_user_email';
const GOOGLE_TOKEN_KEY = 'scontrini_google_token';
const GOOGLE_TOKEN_EXPIRY_KEY = 'scontrini_google_token_expiry';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

let _googleToken = null; // access token, solo in memoria
let _tokenClient = null; // client token GIS

// Restituisce il token cached se ancora valido (con 60s di margine), altrimenti null
function _loadCachedToken() {
  const token = localStorage.getItem(GOOGLE_TOKEN_KEY);
  const expiry = parseInt(localStorage.getItem(GOOGLE_TOKEN_EXPIRY_KEY) || '0', 10);
  if (token && Date.now() < expiry - 60_000) return token;
  return null;
}

function _cacheToken(tokenResponse) {
  const expiry = Date.now() + (tokenResponse.expires_in || 3600) * 1000;
  localStorage.setItem(GOOGLE_TOKEN_KEY, tokenResponse.access_token);
  localStorage.setItem(GOOGLE_TOKEN_EXPIRY_KEY, String(expiry));
}

function _clearCachedToken() {
  localStorage.removeItem(GOOGLE_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_TOKEN_EXPIRY_KEY);
}

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
  if (!_googleToken) {
    const cached = _loadCachedToken();
    if (cached) {
      _googleToken = cached;
      // Sincronizza gapi.client se già inizializzato
      if (typeof gapi !== 'undefined' && gapi.client) {
        gapi.client.setToken({ access_token: cached });
      }
    }
  }
  return _googleToken;
}

// Carica il client gapi (solo Drive + Sheets — senza auth2)
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

// Inizializza il client token GIS (non avvia il login)
function initTokenClient(clientId) {
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: () => {},        // sovrascritto per ogni chiamata
    error_callback: () => {},  // sovrascritto per ogni chiamata
  });
}

// Accesso silenzioso: prima controlla il token cached, poi tenta GIS
function googleLoginSilent() {
  // Se il token in cache è ancora valido, usalo subito senza nessun popup
  const cached = _loadCachedToken();
  if (cached) {
    _googleToken = cached;
    gapi.client.setToken({ access_token: cached });
    return Promise.resolve(cached);
  }

  const hint = localStorage.getItem(USER_EMAIL_KEY) || '';
  return new Promise((resolve, reject) => {
    // Timeout di sicurezza nel caso il browser non chiami mai il callback
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);

    _tokenClient.callback = (tokenResponse) => {
      clearTimeout(timer);
      if (tokenResponse.error) {
        reject(new Error(tokenResponse.error));
        return;
      }
      _googleToken = tokenResponse.access_token;
      gapi.client.setToken({ access_token: _googleToken });
      _cacheToken(tokenResponse);
      resolve(_googleToken);
    };

    // error_callback è chiamato per errori non-OAuth (popup bloccato, popup chiuso)
    _tokenClient.error_callback = (err) => {
      clearTimeout(timer);
      reject(new Error(err?.type || 'popup_error'));
    };

    _tokenClient.requestAccessToken({ prompt: '', login_hint: hint });
  });
}

function getSavedEmail() {
  return localStorage.getItem(USER_EMAIL_KEY) || '';
}

// Accesso esplicito (popup Google — richiede gesto utente)
function googleLogin() {
  const hint = getSavedEmail();
  // Se c'è già un account salvato usa prompt '' (popup veloce, nessuna selezione account)
  // altrimenti mostra il selettore account
  const prompt = hint ? '' : 'select_account';
  return new Promise((resolve, reject) => {
    _tokenClient.callback = (tokenResponse) => {
      if (tokenResponse.error) {
        reject(new Error(tokenResponse.error));
        return;
      }
      _googleToken = tokenResponse.access_token;
      gapi.client.setToken({ access_token: _googleToken });
      _cacheToken(tokenResponse);
      resolve(_googleToken);
    };
    _tokenClient.error_callback = (err) => {
      reject(new Error(err?.type || 'popup_error'));
    };
    _tokenClient.requestAccessToken({ prompt, login_hint: hint });
  });
}

// Salva l'email dell'utente per il silent login futuro
async function saveUserEmail() {
  if (!_googleToken) return;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${_googleToken}` },
    });
    const info = await res.json();
    if (info.email) localStorage.setItem(USER_EMAIL_KEY, info.email);
  } catch (e) {
    // Non critico
  }
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
  initTokenClient(clientId);
}
