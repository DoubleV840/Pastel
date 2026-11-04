// Styles de remplissage : uni, dégradés, ombré, texture et motifs.
// Tout est dessiné en coordonnées du document pour que les motifs de deux
// zones voisines restent alignés.

import { makeCanvas, shade, hexToRgb, clamp } from './util.js';
import { paperTile } from './brushes.js';

let textureTile;
const tiles = new Map();

function patternTile(kind, c1, c2, cell) {
  const key = kind + c1 + c2 + cell;
  if (tiles.has(key)) return tiles.get(key);
  if (tiles.size > 24) tiles.clear();
  const T = kind === 'stripes' ? cell : cell * 2;
  const c = makeCanvas(T, T), x = c.getContext('2d');
  x.fillStyle = c2;
  x.fillRect(0, 0, T, T);
  x.fillStyle = c1;
  x.strokeStyle = c1;
  if (kind === 'dots') {
    for (const [cx, cy] of [[cell / 2, cell / 2], [cell * 1.5, cell * 1.5]]) {
      x.beginPath();
      x.arc(cx, cy, cell * 0.28, 0, Math.PI * 2);
      x.fill();
    }
  } else if (kind === 'check') {
    x.fillRect(0, 0, cell, cell);
    x.fillRect(cell, cell, cell, cell);
  } else {
    x.lineWidth = T / (2 * Math.SQRT2);
    for (const k of [0, T, 2 * T]) {
      x.beginPath();
      x.moveTo(k + 1, -1);
      x.lineTo(-1, k + 1);
      x.stroke();
    }
  }
  tiles.set(key, c);
  return c;
}

// Ombré : couleur plus foncée au bord de la zone, plus claire au centre.
function shadeImage(m, c1) {
  const { w, h, data } = m;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < dist.length; i++) dist[i] = data[i] ? 1e9 : 0;
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dist[i]) continue;
      let d = dist[i];
      d = Math.min(d, x > 0 ? dist[i - 1] + 1 : 1, y > 0 ? dist[i - w] + 1 : 1);
      d = Math.min(d, x > 0 && y > 0 ? dist[i - w - 1] + D : D, x < w - 1 && y > 0 ? dist[i - w + 1] + D : D);
      dist[i] = d;
    }
  }
  let max = 1;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dist[i]) continue;
      let d = dist[i];
      d = Math.min(d, x < w - 1 ? dist[i + 1] + 1 : 1, y < h - 1 ? dist[i + w] + 1 : 1);
      d = Math.min(d, x < w - 1 && y < h - 1 ? dist[i + w + 1] + D : D, x > 0 && y < h - 1 ? dist[i + w - 1] + D : D);
      dist[i] = d;
      if (d > max) max = d;
    }
  }
  const edge = hexToRgb(shade(c1, -0.38)), base = hexToRgb(c1), light = hexToRgb(shade(c1, 0.3));
  const fall = Math.max(4, max * 0.9);
  const img = new ImageData(w, h), px = img.data;
  for (let i = 0; i < dist.length; i++) {
    const t = clamp(dist[i] / fall, 0, 1), e = 1 - (1 - t) * (1 - t);
    const [a, b, u] = e < 0.5 ? [edge, base, e * 2] : [base, light, (e - 0.5) * 2];
    const k = i * 4;
    px[k] = a[0] + (b[0] - a[0]) * u;
    px[k + 1] = a[1] + (b[1] - a[1]) * u;
    px[k + 2] = a[2] + (b[2] - a[2]) * u;
    px[k + 3] = 255;
  }
  return img;
}

// m : masque { x, y, w, h, data, canvas } ; renvoie un canvas de la taille du masque.
export function renderFill(style, m, c1, c2, { start, end, unit = 1 } = {}) {
  const c = makeCanvas(m.w, m.h), x = c.getContext('2d');
  if (style === 'shade') x.putImageData(shadeImage(m, c1), 0, 0);
  else {
    x.translate(-m.x, -m.y);
    const bx = m.x, by = m.y, bw = m.w, bh = m.h;
    const dragged = start && end && Math.hypot(end.x - start.x, end.y - start.y) > 14 * unit;
    let fs = c1;
    if (style === 'linear') {
      const a = dragged ? start : { x: bx, y: by }, b = dragged ? end : { x: bx, y: by + bh };
      fs = x.createLinearGradient(a.x, a.y, b.x, b.y);
      fs.addColorStop(0, c1);
      fs.addColorStop(1, c2);
    } else if (style === 'radial') {
      const o = start || { x: bx + bw / 2, y: by + bh / 2 };
      const far = Math.max(...[[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].map(([px, py]) => Math.hypot(px - o.x, py - o.y)));
      fs = x.createRadialGradient(o.x, o.y, 0, o.x, o.y, dragged ? Math.hypot(end.x - o.x, end.y - o.y) : far);
      fs.addColorStop(0, c1);
      fs.addColorStop(1, c2);
    } else if (style === 'dots' || style === 'stripes' || style === 'check') {
      fs = x.createPattern(patternTile(style, c1, c2, Math.round(28 * unit)), 'repeat');
    }
    x.fillStyle = fs;
    x.fillRect(bx, by, bw, bh);
    if (style === 'texture') {
      textureTile ||= paperTile('rough', 0.4);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = x.createPattern(textureTile, 'repeat');
      x.fillRect(bx, by, bw, bh);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(m.canvas, 0, 0);
  return c;
}

// Pastille d'aperçu pour le choix du style.
export function fillSwatch(style, c1, c2, size = 44) {
  const m = { x: 0, y: 0, w: size, h: size, data: new Uint8Array(size * size), canvas: makeCanvas(size, size) };
  const mc = m.canvas.getContext('2d');
  mc.beginPath();
  mc.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  mc.fill();
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) m.data[y * size + x] = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) < r ? 1 : 0;
  }
  return renderFill(style, m, c1, c2, { unit: size / 140 });
}
