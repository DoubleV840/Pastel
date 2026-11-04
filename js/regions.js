// Zones fermées d'un dessin au trait : base du remplissage par toucher et du
// mode « rester dans les traits ». Chaque pixel hors trait reçoit le numéro de
// sa zone ; les masques débordent de quelques pixels sous le trait pour ne
// laisser aucun liseré blanc.

import { makeCanvas, freeCanvas } from './util.js';

function dilate(src, w, h) {
  const out = src.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i]) continue;
      if ((x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w])) out[i] = 1;
    }
  }
  return out;
}

// Remplissage par segments horizontaux de toutes les zones où wall[i] == 0.
function label(wall, w, h, labels) {
  const boxes = [0, 0, 0, 0], areas = [0], stack = [];
  let id = 0;
  for (let i = 0; i < w * h; i++) {
    if (wall[i] || labels[i]) continue;
    id++;
    let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
    stack.push(i % w, (i / w) | 0);
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      let k = y * w + x;
      if (wall[k] || labels[k]) continue;
      let lx = x;
      while (lx > 0 && !wall[k - 1] && !labels[k - 1]) { lx--; k--; }
      let up = false, down = false, xx = lx;
      while (xx < w && !wall[k] && !labels[k]) {
        labels[k] = id;
        if (y > 0) {
          const u = k - w, free = !wall[u] && !labels[u];
          if (free && !up) { stack.push(xx, y - 1); up = true; } else if (!free) up = false;
        }
        if (y < h - 1) {
          const d = k + w, free = !wall[d] && !labels[d];
          if (free && !down) { stack.push(xx, y + 1); down = true; } else if (!free) down = false;
        }
        xx++;
        k++;
      }
      area += xx - lx;
      if (lx < x0) x0 = lx;
      if (xx - 1 > x1) x1 = xx - 1;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    boxes.push(x0, y0, x1, y1);
    areas.push(area);
  }
  return { count: id, boxes: Int32Array.from(boxes), areas };
}

// rgba : données RGBA du calque des traits (seule l'opacité compte).
export function computeRegions(rgba, w, h, { threshold = 110, closeGaps = false } = {}) {
  let wall = new Uint8Array(w * h);
  for (let i = 0, k = 3; i < wall.length; i++, k += 4) wall[i] = rgba[k] > threshold ? 1 : 0;
  if (closeGaps) wall = dilate(wall, w, h);
  const labels = new Int32Array(w * h);
  const { count, boxes, areas } = label(wall, w, h, labels);
  return { w, h, wall, labels, count, boxes, areas, masks: new Map() };
}

// Zone sous un point ; sur un trait, la zone la plus proche.
export function labelAt(reg, x, y, search = 12) {
  x = Math.round(x);
  y = Math.round(y);
  const { w, h, labels } = reg;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  if (labels[y * w + x]) return labels[y * w + x];
  for (let r = 1; r <= search; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const l = labels[yy * w + xx];
        if (l) return l;
      }
    }
  }
  return 0;
}

function maskFromData(x, y, w, h, data) {
  const canvas = makeCanvas(w, h), ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let i = 0; i < data.length; i++) if (data[i]) d[i * 4 + 3] = 255;
  ctx.putImageData(img, 0, 0);
  return { x, y, w, h, data, canvas };
}

// Masque d'une zone, élargi de `grow` pixels sous les traits seulement.
export function regionMask(reg, id, grow = 3) {
  const key = id + ':' + grow;
  const hit = reg.masks.get(key);
  if (hit) {
    reg.masks.delete(key);
    reg.masks.set(key, hit);
    return hit;
  }
  const { w: W, h: H, labels, wall, boxes } = reg;
  const x0 = Math.max(0, boxes[id * 4] - grow), y0 = Math.max(0, boxes[id * 4 + 1] - grow);
  const x1 = Math.min(W - 1, boxes[id * 4 + 2] + grow), y1 = Math.min(H - 1, boxes[id * 4 + 3] + grow);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = (y0 + y) * W + x0;
    for (let x = 0; x < w; x++) if (labels[row + x] === id) m[y * w + x] = 1;
  }
  for (let g = 0; g < grow; g++) {
    const add = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (m[i] || !wall[(y0 + y) * W + x0 + x]) continue;
        if ((x > 0 && m[i - 1] === 1) || (x < w - 1 && m[i + 1] === 1) || (y > 0 && m[i - w] === 1) || (y < h - 1 && m[i + w] === 1)) add.push(i);
      }
    }
    for (const i of add) m[i] = 1;
  }
  const res = maskFromData(x0, y0, w, h, m);
  reg.masks.set(key, res);
  if (reg.masks.size > 4) {
    const [oldKey, old] = reg.masks.entries().next().value;
    freeCanvas(old.canvas);
    reg.masks.delete(oldKey);
  }
  return res;
}

export function releaseRegions(reg) {
  if (!reg) return;
  for (const m of reg.masks.values()) freeCanvas(m.canvas);
  reg.masks.clear();
}

// Toile vierge : remplissage classique par couleur voisine.
export function floodMask(rgba, W, H, sx, sy, tol = 36) {
  sx = Math.round(sx);
  sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  const pm = (k) => {
    const a = rgba[k + 3] / 255;
    return [rgba[k] * a, rgba[k + 1] * a, rgba[k + 2] * a, rgba[k + 3]];
  };
  const t = pm((sy * W + sx) * 4);
  const wall = new Uint8Array(W * H);
  for (let i = 0, k = 0; i < wall.length; i++, k += 4) {
    const a = rgba[k + 3] / 255;
    if (Math.abs(rgba[k] * a - t[0]) > tol || Math.abs(rgba[k + 1] * a - t[1]) > tol ||
        Math.abs(rgba[k + 2] * a - t[2]) > tol || Math.abs(rgba[k + 3] - t[3]) > tol) wall[i] = 1;
  }
  // Remplissage depuis le point de départ uniquement.
  const labels = new Uint8Array(W * H);
  const stack = [sx, sy];
  let x0 = sx, y0 = sy, x1 = sx, y1 = sy;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    let k = y * W + x;
    if (wall[k] || labels[k]) continue;
    let lx = x;
    while (lx > 0 && !wall[k - 1] && !labels[k - 1]) { lx--; k--; }
    let up = false, down = false, xx = lx;
    while (xx < W && !wall[k] && !labels[k]) {
      labels[k] = 1;
      if (y > 0) {
        const u = k - W, free = !wall[u] && !labels[u];
        if (free && !up) { stack.push(xx, y - 1); up = true; } else if (!free) up = false;
      }
      if (y < H - 1) {
        const d = k + W, free = !wall[d] && !labels[d];
        if (free && !down) { stack.push(xx, y + 1); down = true; } else if (!free) down = false;
      }
      xx++;
      k++;
    }
    if (lx < x0) x0 = lx;
    if (xx - 1 > x1) x1 = xx - 1;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  const g = 1;
  x0 = Math.max(0, x0 - g); y0 = Math.max(0, y0 - g);
  x1 = Math.min(W - 1, x1 + g); y1 = Math.min(H - 1, y1 + g);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x0 + x, Y = y0 + y, i = Y * W + X;
      if (labels[i] || (X > 0 && labels[i - 1]) || (X < W - 1 && labels[i + 1]) || (Y > 0 && labels[i - W]) || (Y < H - 1 && labels[i + W])) m[y * w + x] = 1;
    }
  }
  return maskFromData(x0, y0, w, h, m);
}
