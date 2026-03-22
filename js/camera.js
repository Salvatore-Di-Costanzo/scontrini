// camera.js — Acquisizione foto via getUserMedia + fallback caricamento file

let _stream = null;
let _torchOn = false;

async function startCamera() {
  const video = document.getElementById('camera-video');
  try {
    _stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width:  { ideal: 3840 },
        height: { ideal: 2160 },
        focusMode: 'continuous',
      },
    });
    video.srcObject = _stream;
    return true;
  } catch (err) {
    console.warn('Fotocamera non disponibile:', err.message);
    return false;
  }
}

function stopCamera() {
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
  _torchOn = false;
}

// Messa a fuoco in un punto specifico (coordinate normalizzate 0-1)
async function setFocusPoint(x, y) {
  if (!_stream) return;
  const track = _stream.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  if (!caps.focusMode || !caps.focusMode.includes('manual')) return;
  try {
    await track.applyConstraints({
      advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }],
    });
  } catch (err) {
    console.warn('Tap-to-focus non supportato:', err.message);
  }
}

// Restituisce true se il dispositivo supporta il flash/torcia
function isTorchSupported() {
  if (!_stream) return false;
  const track = _stream.getVideoTracks()[0];
  if (!track) return false;
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  return !!caps.torch;
}

// Attiva o disattiva il flash
async function setTorch(enabled) {
  if (!_stream) return;
  const track = _stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [{ torch: enabled }] });
    _torchOn = enabled;
  } catch (err) {
    console.warn('Flash non disponibile:', err.message);
  }
}

function isTorchOn() {
  return _torchOn;
}

function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85); // JPEG in base64
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
