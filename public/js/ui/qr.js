/** QR code for the invite dialog, using the dependency-free encoder in /qr.js (window.EstimoQR). */

let cache = { url: null, svg: "" };

function qrSvg(url) {
  if (cache.url === url) return cache.svg;
  if (!window.EstimoQR) return "";
  try { cache = { url, svg: window.EstimoQR.toSvg(url) }; } catch { return ""; }
  return cache.svg;
}

export function drawQr(container, url) {
  if (!container) return;
  const svg = qrSvg(url);
  container.innerHTML = svg || `<p class="muted" style="line-height:1.5;width:232px;margin:0">QR code unavailable — share the link below.</p>`;
}

/** Save the QR code as a 1024 px PNG with the brand mark in the middle. */
export function downloadQrPng(url, fileName) {
  const svg = qrSvg(url);
  if (!svg) return;
  const size = 1024, img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, size, size);
    const mark = size * 0.14, inner = mark * 0.72;
    g.fillStyle = "#fff";    g.fillRect((size - mark) / 2, (size - mark) / 2, mark, mark);
    g.fillStyle = "#F5A524"; g.fillRect((size - inner) / 2, (size - inner) / 2, inner, inner);
    const a = document.createElement("a");
    a.download = fileName; a.href = canvas.toDataURL("image/png"); a.click();
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
