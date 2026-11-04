// Petits outils partagés : maths, couleurs, canvas, DOM.

import { t } from './i18n.js';

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Générateur pseudo-aléatoire déterministe (mulberry32) : une graine donne
// toujours la même page de coloriage.
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

/* ---------- Couleurs ---------- */

export function normHex(str) {
  let s = String(str || '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? '#' + s : null;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  const h = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export const hsvHex = (h, s, v) => rgbToHex(...hsvToRgb(h, s, v));
export const hexHsv = (hex) => rgbToHsv(...hexToRgb(hex));

// amt > 0 éclaircit vers le blanc, amt < 0 assombrit vers le noir.
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255, k = Math.abs(amt);
  return rgbToHex(lerp(r, t, k), lerp(g, t, k), lerp(b, t, k));
}

export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}

export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

// Nuance d'une couleur : t de -1 (plus foncé) à 1 (plus clair), même teinte.
// Calcul en OKLab (écarts réguliers à l'œil), saturation réduite si besoin
// pour rester dans les couleurs affichables.
const toLin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklab(r, g, b) {
  r = toLin(r); g = toLin(g); b = toLin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function linFromOklab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function toneColor(hex, t) {
  if (!t) return hex;
  const [L, A, B] = oklab(...hexToRgb(hex));
  const C = Math.hypot(A, B), h = Math.atan2(B, A);
  const L2 = t > 0 ? L + (Math.max(0.97, L) - L) * t : L + (Math.min(0.16, L * 0.5) - L) * -t;
  const C2 = C * (t > 0 ? 1 - 0.3 * t : 1 - 0.12 * -t);
  const rgb = (k) => linFromOklab(L2, C2 * k * Math.cos(h), C2 * k * Math.sin(h));
  const ok = (v) => v.every((c) => c >= -1e-4 && c <= 1.0001);
  let k = 1;
  if (!ok(rgb(1))) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (ok(rgb(mid))) lo = mid; else hi = mid;
    }
    k = lo;
  }
  return rgbToHex(...rgb(k).map((c) => toSrgb(clamp(c, 0, 1))));
}

/* ---------- Canvas ---------- */

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Safari garde la mémoire d'un canvas tant qu'il a une taille : on le réduit.
export function freeCanvas(c) {
  if (c) { c.width = 1; c.height = 1; }
}

export function clipRect(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
}

// Rectangles sales : [x0, y0, x1, y1] (bornes flottantes).
export const rectEmpty = () => [Infinity, Infinity, -Infinity, -Infinity];
export function rectAdd(r, x0, y0, x1, y1) {
  if (x0 < r[0]) r[0] = x0;
  if (y0 < r[1]) r[1] = y0;
  if (x1 > r[2]) r[2] = x1;
  if (y1 > r[3]) r[3] = y1;
  return r;
}
export function rectUnion(r, o) { return rectAdd(r, o[0], o[1], o[2], o[3]); }
// Vers un rectangle entier [x, y, w, h] borné au document, ou null.
export function rectInt(r, W, H) {
  const x0 = clamp(Math.floor(r[0]), 0, W), y0 = clamp(Math.floor(r[1]), 0, H);
  const x1 = clamp(Math.ceil(r[2]), 0, W), y1 = clamp(Math.ceil(r[3]), 0, H);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error(t('err.export')))), type, quality));
}

// <img> plutôt que createImageBitmap : Safari y applique l'orientation EXIF des photos.
export function loadImage(src) {
  return new Promise((res, rej) => {
    const url = src instanceof Blob ? URL.createObjectURL(src) : src;
    const img = new Image();
    img.onload = () => { if (src instanceof Blob) URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { if (src instanceof Blob) URL.revokeObjectURL(url); rej(new Error(t('err.unreadable'))); };
    img.src = url;
  });
}

// Bruit de valeur tuilable (se répète sans couture) : grain du papier, textures.
export function tileNoise(size, period, octaves, seed) {
  const out = new Float32Array(size * size);
  const R = rng(seed);
  let amp = 1, total = 0, p = period;
  for (let o = 0; o < octaves && p <= size; o++) {
    const lat = new Float32Array(p * p);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    const cell = size / p;
    for (let y = 0; y < size; y++) {
      const fy = y / cell, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
      const r0 = (y0 % p) * p, r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = x / cell, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
        const c0 = x0 % p, c1 = (x0 + 1) % p;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
    p *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ---------- DOM ---------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

let toastTimer;
export function toast(msg, ms = 2400) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
