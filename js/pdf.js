// pdf.js — Genera un PDF da un array di foto base64 usando jsPDF

async function generatePdf(photos) {
  const { jsPDF } = window.jspdf;

  // Crea il documento con l'orientamento della prima foto; le pagine successive usano il proprio orientamento
  const firstImg = await loadImage(photos[0]);
  const firstOrientation = firstImg.width > firstImg.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({ orientation: firstOrientation, unit: 'mm', format: 'a4' });

  for (let i = 0; i < photos.length; i++) {
    const img = await loadImage(photos[i]);
    const orientation = img.width > img.height ? 'landscape' : 'portrait';

    if (i > 0) {
      doc.addPage('a4', orientation); // orientamento per singola foto
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
