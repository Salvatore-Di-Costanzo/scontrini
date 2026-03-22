// session.js — Stato della sessione in memoria

let _photos = []; // array di stringhe base64

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
