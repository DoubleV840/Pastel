// Transforme une image en dessin au trait (traits noirs sur fond transparent).
// - Dessin importé : les gris foncés deviennent des traits.
// - Photo « Zones » : couleurs regroupées (k-moyennes), petites zones fondues,
//   puis frontières vectorisées et lissées : des zones fermées, prêtes au
//   remplissage par toucher.
// - Photo « Contours » : différence de flous (XDoG), rendu façon croquis.

import { makeCanvas, clamp } from './util.js';

export function fitSize(w, h, long) {
  const s = long / Math.max(w, h);
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

const dims = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];

function pixels(img, w, h) {
  const c = makeCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff';
  x.fillRect(0, 0, w, h);
  x.drawImage(img, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
}

/* ---------- Dessin importé ---------- */

// level 0..1 : plus il est haut, plus les gris clairs deviennent des traits.
export function imageToLineArt(img, long, { level = 0.5 } = {}) {
  const [w, h] = fitSize(...dims(img), long);
  const src = pixels(img, w, h);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  const out = x.createImageData(w, h), d = out.data;
  const hi = 0.5 + level * 0.42, lo = hi - 0.32;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]) / 255;
    d[i + 3] = clamp((hi - lum) / (hi - lo), 0, 1) * 255;
  }
  x.putImageData(out, 0, 0);
  return c;
}

/* ---------- Flous ---------- */

function boxBlur(src, w, h, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = src[row] * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[row + Math.min(w - 1, i)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * k;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = tmp[x] * (r + 1);
    for (let i = 1; i <= r; i++) acc += tmp[Math.min(h - 1, i) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * k;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// Approximation d'un flou gaussien par trois flous en boîte.
function gauss(src, w, h, sigma) {
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let out = src;
  for (let i = 0; i < n; i++) out = boxBlur(out, w, h, ((i < m ? wl : wl + 2) - 1) / 2);
  return out;
}

/* ---------- Photo : contours ---------- */

export function photoToContours(img, long, { detail = 5, thickness = 2 } = {}) {
  const [w, h] = fitSize(...dims(img), long);
  const src = pixels(img, w, h);
  let gray = new Float32Array(w * h), lo = 1, hi = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = (0.299 * src[i * 4] + 0.587 * src[i * 4 + 1] + 0.114 * src[i * 4 + 2]) / 255;
    gray[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(0.05, hi - lo);
  for (let i = 0; i < gray.length; i++) gray[i] = (gray[i] - lo) / span;
  const scale = long / 1024;
  const sigma = (2.5 - detail * 0.19) * scale;
  const g1 = gauss(gray, w, h, sigma), g2 = gauss(gray, w, h, sigma * 1.6);
  let alpha = new Float32Array(w * h);
  const t0 = 0.003 + (10 - detail) * 0.0012, t1 = t0 + 0.02;
  for (let i = 0; i < alpha.length; i++) {
    const d = -(g1[i] - 0.985 * g2[i]);
    const t = clamp((d - t0) / (t1 - t0), 0, 1);
    alpha[i] = t * t * (3 - 2 * t);
  }
  gray = null;
  // Épaissir : léger flou puis seuil doux.
  const r = Math.round((thickness - 1) * 0.8 * scale);
  if (r > 0) {
    const b = boxBlur(alpha, w, h, r);
    for (let i = 0; i < alpha.length; i++) alpha[i] = clamp(b[i] * 2.6, 0, 1);
  }
  const c = makeCanvas(w, h), x = c.getContext('2d');
  const out = x.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) out.data[i * 4 + 3] = alpha[i] * 255;
  x.putImageData(out, 0, 0);
  return c;
}

/* ---------- Photo : zones ---------- */

function toLab(r, g, b) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

function kmeans(lab, n, K) {
  const stride = Math.max(1, Math.floor(n / 16000));
  const idx = [];
  for (let i = 0; i < n; i += stride) idx.push(i);
  const dist = (i, c) => {
    const a = lab[i * 3] - c[0], b = lab[i * 3 + 1] - c[1], d = lab[i * 3 + 2] - c[2];
    return a * a + b * b + d * d;
  };
  // Initialisation k-means++ déterministe (pas de hasard : même photo, même résultat).
  const centers = [[lab[idx[0] * 3], lab[idx[0] * 3 + 1], lab[idx[0] * 3 + 2]]];
  const best = new Float32Array(idx.length).fill(Infinity);
  while (centers.length < K) {
    let far = 0, fd = -1;
    const c = centers[centers.length - 1];
    for (let s = 0; s < idx.length; s++) {
      const d = dist(idx[s], c);
      if (d < best[s]) best[s] = d;
      if (best[s] > fd) { fd = best[s]; far = s; }
    }
    if (fd <= 1) break;
    centers.push([lab[idx[far] * 3], lab[idx[far] * 3 + 1], lab[idx[far] * 3 + 2]]);
  }
  const k = centers.length, assign = new Uint8Array(idx.length);
  for (let it = 0; it < 10; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let s = 0; s < idx.length; s++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = dist(idx[s], centers[c]);
        if (d < bd) { bd = d; bi = c; }
      }
      assign[s] = bi;
      const S = sum[bi], i = idx[s] * 3;
      S[0] += lab[i]; S[1] += lab[i + 1]; S[2] += lab[i + 2]; S[3]++;
    }
    for (let c = 0; c < k; c++) if (sum[c][3]) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let bi = 0, bd = Infinity;
    for (let c = 0; c < k; c++) {
      const d = dist(i, centers[c]);
      if (d < bd) { bd = d; bi = c; }
    }
    labels[i] = bi;
  }
  return labels;
}

function modeFilter(lab, w, h) {
  const out = lab.slice(), cnt = new Uint16Array(256);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let best = lab[y * w + x], bc = 0;
      const seen = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = lab[(y + dy) * w + x + dx];
          if (!cnt[v]) seen.push(v);
          if (++cnt[v] > bc) { bc = cnt[v]; best = v; }
        }
      }
      for (const v of seen) cnt[v] = 0;
      out[y * w + x] = best;
    }
  }
  return out;
}

// Composantes connexes d'une même couleur.
function components(cls, w, h) {
  const comp = new Int32Array(w * h), areas = [0], stack = [];
  let id = 0;
  for (let i = 0; i < w * h; i++) {
    if (comp[i]) continue;
    id++;
    const c = cls[i];
    let area = 0;
    stack.push(i);
    comp[i] = id;
    while (stack.length) {
      const k = stack.pop();
      area++;
      const x = k % w;
      if (x > 0 && !comp[k - 1] && cls[k - 1] === c) { comp[k - 1] = id; stack.push(k - 1); }
      if (x < w - 1 && !comp[k + 1] && cls[k + 1] === c) { comp[k + 1] = id; stack.push(k + 1); }
      if (k >= w && !comp[k - w] && cls[k - w] === c) { comp[k - w] = id; stack.push(k - w); }
      if (k < w * (h - 1) && !comp[k + w] && cls[k + w] === c) { comp[k + w] = id; stack.push(k + w); }
    }
    areas.push(area);
  }
  return { comp, areas };
}

// Les petites zones prennent la couleur de leur voisine la plus présente.
function mergeSmall(cls, w, h, minArea) {
  for (let pass = 0; pass < 4; pass++) {
    const { comp, areas } = components(cls, w, h);
    const votes = new Map();
    let changed = false;
    for (let i = 0; i < w * h; i++) {
      const c = comp[i];
      if (areas[c] >= minArea) continue;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || comp[j] === c) continue;
        let v = votes.get(c);
        if (!v) votes.set(c, (v = new Map()));
        v.set(cls[j], (v.get(cls[j]) || 0) + 1);
      }
    }
    const target = new Map();
    for (const [c, v] of votes) {
      let best = -1, bc = 0;
      for (const [k, n] of v) if (n > bc) { bc = n; best = k; }
      target.set(c, best);
    }
    for (let i = 0; i < w * h; i++) {
      const t = target.get(comp[i]);
      if (t != null && t >= 0) { cls[i] = t; changed = true; }
    }
    if (!changed) break;
  }
  return components(cls, w, h).comp;
}

// Frontières entre zones → polylignes sur la grille des coins de pixels.
function boundaries(comp, w, h) {
  const W1 = w + 1;
  const hE = new Uint8Array(w * (h + 1)), vE = new Uint8Array(W1 * h);
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (comp[(y - 1) * w + x] !== comp[y * w + x]) hE[y * w + x] = 1;
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if (comp[y * w + x - 1] !== comp[y * w + x]) vE[y * W1 + x] = 1;
  const edges = (x, y) => {
    const out = [];
    if (x > 0 && hE[y * w + x - 1] === 1) out.push([x - 1, y, 'h', y * w + x - 1]);
    if (x < w && hE[y * w + x] === 1) out.push([x + 1, y, 'h', y * w + x]);
    if (y > 0 && vE[(y - 1) * W1 + x] === 1) out.push([x, y - 1, 'v', (y - 1) * W1 + x]);
    if (y < h && vE[y * W1 + x] === 1) out.push([x, y + 1, 'v', y * W1 + x]);
    return out;
  };
  const degree = (x, y) =>
    (x > 0 && hE[y * w + x - 1] ? 1 : 0) + (x < w && hE[y * w + x] ? 1 : 0) +
    (y > 0 && vE[(y - 1) * W1 + x] ? 1 : 0) + (y < h && vE[y * W1 + x] ? 1 : 0);
  const mark = (e) => { (e[2] === 'h' ? hE : vE)[e[3]] = 2; };
  const chains = [];
  const trace = (sx, sy, first) => {
    const pts = [[sx, sy]];
    let e = first;
    for (;;) {
      mark(e);
      const [x, y] = e;
      pts.push([x, y]);
      if (degree(x, y) !== 2 || (x === sx && y === sy)) break;
      const next = edges(x, y)[0];
      if (!next) break;
      e = next;
    }
    return pts;
  };
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const d = degree(x, y);
      if (!d || d === 2) continue;
      for (let e = edges(x, y)[0]; e; e = edges(x, y)[0]) chains.push({ pts: trace(x, y, e), closed: false });
    }
  }
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (let e = edges(x, y)[0]; e; e = edges(x, y)[0]) chains.push({ pts: trace(x, y, e), closed: true });
    }
  }
  return chains;
}

function smoothChain({ pts, closed }, iterations) {
  let p = pts;
  if (closed && p.length > 1) p = p.slice(0, -1);
  const n = p.length;
  if (n < 3) return pts;
  for (let it = 0; it < iterations; it++) {
    const q = p.map((v) => v.slice());
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
      q[i][0] = (a[0] + 2 * b[0] + c[0]) / 4;
      q[i][1] = (a[1] + 2 * b[1] + c[1]) / 4;
    }
    p = q;
  }
  return closed ? [...p, p[0]] : p;
}

export function photoToZones(img, long, { detail = 5, thickness = 2 } = {}) {
  const [iw, ih] = dims(img);
  const [w, h] = fitSize(iw, ih, Math.round(220 + detail * 45));
  const src = pixels(img, w, h), n = w * h;
  let lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [L, A, B] = toLab(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]);
    lab[i * 3] = L; lab[i * 3 + 1] = A; lab[i * 3 + 2] = B;
  }
  // Léger flou par canal pour lisser le bruit de la photo.
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(n);
    for (let i = 0; i < n; i++) ch[i] = lab[i * 3 + c];
    const b = gauss(ch, w, h, 1.2);
    for (let i = 0; i < n; i++) lab[i * 3 + c] = b[i];
  }
  let cls = kmeans(lab, n, 3 + Math.round(detail * 1.1));
  lab = null;
  cls = modeFilter(modeFilter(cls, w, h), w, h);
  const minArea = Math.max(12, Math.round(n * (0.0016 - detail * 0.00013)));
  const comp = mergeSmall(cls, w, h, minArea);
  const chains = boundaries(comp, w, h).map((c) => smoothChain(c, 4));
  const [W, H] = fitSize(iw, ih, long);
  const out = makeCanvas(W, H), x = out.getContext('2d');
  const s = W / w;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.strokeStyle = '#000';
  x.lineWidth = (1.4 + thickness * 1.1) * (long / 2048);
  x.beginPath();
  for (const pts of chains) {
    x.moveTo(pts[0][0] * s, pts[0][1] * s);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0] * s, pts[i][1] * s);
  }
  x.stroke();
  return out;
}
