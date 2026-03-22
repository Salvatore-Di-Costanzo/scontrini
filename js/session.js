// session.js — Stato della sessione in memoria

let _photos = []; // [{id, base64}]
let _originalPdf = null; // File originale se l'utente carica un PDF

function addPhoto(base64) {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  _photos.push({ id, base64 });
  return id;
}

function removePhoto(id) {
  _photos = _photos.filter(p => p.id !== id);
}

function getPhotos() {
  return _photos.map(p => p.base64);
}

function setOriginalPdf(file) {
  _originalPdf = file;
}

function getOriginalPdf() {
  return _originalPdf;
}

function clearSession() {
  _photos = [];
  _originalPdf = null;
}

function photoCount() {
  return _photos.length;
}
