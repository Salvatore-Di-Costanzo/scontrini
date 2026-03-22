// auth.js — Gestione chiave API Gemini + login Google via GIS + client gapi
//
// NOTA: gapi.auth2 è DEPRECATO e non funziona per nuovi progetti.
// Usare Google Identity Services (GIS) per il login, gapi.client per le chiamate API.

const GEMINI_KEY_STORAGE = 'scontrini_gemini_key';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

let _googleToken = null; // access token, solo in memoria
let _tokenClient = null; // client token GIS

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
      // Mantieni gapi.client sincronizzato
      gapi.client.setToken({ access_token: _googleToken });
      onTokenReceived(_googleToken);
    },
  });
}

// Richiede un nuovo token (mostra il popup di consenso Google se necessario)
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
  initTokenClient(clientId, () => {}); // callback segnaposto, sovrascritta in googleLogin()
}
