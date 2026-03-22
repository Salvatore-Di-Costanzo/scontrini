// session.js — Stato della sessione in memoria

let _photos = []; // array di stringhe base64
let _originalPdf = null; // File originale se l'utente carica un PDF

function addPhoto(base64) {
  _photos.push(base64);
}

function getPhotos() {
  return [..._photos];
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
