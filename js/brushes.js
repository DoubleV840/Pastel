// Catalogue des outils (42 outils en 11 familles) et des textures de pointe.
// Tailles en pixels du document (côté long de 2048 px).

import { makeCanvas, tileNoise, clamp } from './util.js';
import { t as tr } from './i18n.js';

const S = 128; // résolution des empreintes de pointe

/* ---------- Familles et outils ---------- */

export const GROUPS = [
  {
    id: 'pencil', icon: 'pencil',
    tools: [
      { id: 'pencil-color', kind: 'paint', dab: 'pencil', size: 10, min: 2, max: 48, opacity: 1, flow: 0.38, spacing: 0.12, pSize: 0.35, pFlow: 0.9, grain: ['paper', 0.7], tilt: true, angle: 'random' },
      { id: 'pencil-fine', kind: 'paint', dab: 'pencil', size: 4, min: 1, max: 16, opacity: 1, flow: 0.55, spacing: 0.15, pSize: 0.2, pFlow: 0.85, grain: ['paper', 0.45], tilt: true, angle: 'random' },
      { id: 'pencil-soft', kind: 'paint', dab: 'pencil', size: 18, min: 4, max: 64, opacity: 1, flow: 0.42, spacing: 0.1, pSize: 0.4, pFlow: 0.8, grain: ['rough', 0.6], tilt: true, angle: 'random' },
      { id: 'pencil-sketch', kind: 'paint', dab: 'pencil', size: 6, min: 1, max: 24, opacity: 0.85, flow: 0.22, spacing: 0.12, pSize: 0.25, pFlow: 1, grain: ['paper', 0.55], tilt: true, angle: 'random' },
    ],
  },
  {
    id: 'marker', icon: 'marker',
    tools: [
      { id: 'marker-fine', kind: 'paint', dab: 'hard', size: 8, min: 2, max: 32, opacity: 0.92, flow: 1, spacing: 0.06, pSize: 0.15, pFlow: 0, blend: 'multiply' },
      { id: 'marker-brush', kind: 'paint', dab: 'hard', size: 20, min: 3, max: 72, opacity: 0.88, flow: 1, spacing: 0.05, pSize: 0.85, pFlow: 0, blend: 'multiply' },
      { id: 'marker-chisel', kind: 'paint', dab: 'square', size: 28, min: 6, max: 96, opacity: 0.8, flow: 1, spacing: 0.04, pSize: 0.1, pFlow: 0, ratio: 0.28, angle: 'azimuth', blend: 'multiply' },
      { id: 'marker-highlight', kind: 'paint', dab: 'square', size: 44, min: 10, max: 140, opacity: 0.42, flow: 1, spacing: 0.04, pSize: 0, pFlow: 0, ratio: 0.32, angle: 'fixed', angleValue: Math.PI / 2, blend: 'multiply' },
    ],
  },
  {
    id: 'brush', icon: 'brush',
    tools: [
      { id: 'brush-round', kind: 'paint', dab: 'soft85', size: 26, min: 2, max: 180, opacity: 1, flow: 1, spacing: 0.06, pSize: 0.8, pFlow: 0.2 },
      { id: 'brush-flat', kind: 'paint', dab: 'flat', size: 40, min: 6, max: 180, opacity: 1, flow: 0.9, spacing: 0.04, pSize: 0.3, pFlow: 0.3, ratio: 0.3, angle: 'direction', grain: ['canvas', 0.22] },
      { id: 'brush-oil', kind: 'paint', dab: 'bristle', size: 36, min: 8, max: 160, opacity: 1, flow: 0.9, spacing: 0.04, pSize: 0.5, pFlow: 0.3, grain: ['canvas', 0.15] },
      { id: 'brush-gouache', kind: 'paint', dab: 'soft70', size: 30, min: 4, max: 160, opacity: 0.96, flow: 0.85, spacing: 0.06, pSize: 0.6, pFlow: 0.3, grain: ['rough', 0.18] },
    ],
  },
  {
    id: 'water', icon: 'water',
    tools: [
      { id: 'water-wash', kind: 'paint', dab: 'soft20', size: 70, min: 10, max: 260, opacity: 0.7, flow: 0.16, spacing: 0.08, pSize: 0.5, pFlow: 0.5, blend: 'multiply', grain: ['paper', 0.2], edge: 0.55 },
      { id: 'water-wet', kind: 'paint', dab: 'wet', size: 56, min: 10, max: 260, opacity: 0.78, flow: 0.24, spacing: 0.08, pSize: 0.5, pFlow: 0.4, jSize: 0.2, angle: 'random', blend: 'multiply', grain: ['rough', 0.25], edge: 0.9, bleed: 0.55 },
      { id: 'water-dry', kind: 'paint', dab: 'wet', size: 34, min: 6, max: 160, opacity: 0.85, flow: 0.4, spacing: 0.06, pSize: 0.6, pFlow: 0.5, angle: 'random', blend: 'multiply', grain: ['rough', 0.75], edge: 0.3 },
    ],
  },
  {
    id: 'pastel', icon: 'pastel',
    tools: [
      { id: 'pastel-chalk', kind: 'paint', dab: 'chalk', size: 32, min: 6, max: 128, opacity: 1, flow: 0.5, spacing: 0.08, pSize: 0.3, pFlow: 0.6, jPos: 0.06, angle: 'random', grain: ['rough', 0.75], tilt: true },
      { id: 'pastel-oil', kind: 'paint', dab: 'wax', size: 26, min: 6, max: 110, opacity: 1, flow: 0.85, spacing: 0.06, pSize: 0.25, pFlow: 0.3, angle: 'random', grain: ['rough', 0.5] },
      { id: 'pastel-crayon', kind: 'paint', dab: 'wax', size: 14, min: 4, max: 60, opacity: 1, flow: 0.9, spacing: 0.08, pSize: 0.2, pFlow: 0.35, angle: 'random', grain: ['paper', 0.8] },
      { id: 'pastel-charcoal', kind: 'paint', dab: 'charcoal', size: 20, min: 4, max: 96, opacity: 1, flow: 0.42, spacing: 0.08, pSize: 0.3, pFlow: 0.9, angle: 'random', grain: ['rough', 0.8], tilt: true },
    ],
  },
  {
    id: 'air', icon: 'air',
    tools: [
      { id: 'air-soft', kind: 'paint', dab: 'soft0', size: 90, min: 10, max: 420, opacity: 1, flow: 0.06, spacing: 0.06, pSize: 0.2, pFlow: 1, buildup: true },
      { id: 'air-fine', kind: 'paint', dab: 'soft20', size: 22, min: 3, max: 90, opacity: 1, flow: 0.12, spacing: 0.08, pSize: 0.3, pFlow: 1, buildup: true },
      { id: 'air-spray', kind: 'paint', dab: 'spray', size: 70, min: 12, max: 320, opacity: 1, flow: 0.85, spacing: 0.12, pSize: 0.2, pFlow: 1, density: 1, buildup: true },
      { id: 'air-splatter', kind: 'paint', dab: 'splatter', size: 90, min: 20, max: 360, opacity: 1, flow: 1, spacing: 0.5, pSize: 0.3, pFlow: 0 },
    ],
  },
  {
    id: 'glitter', icon: 'glitter',
    tools: [
      { id: 'glitter-fine', kind: 'paint', dab: 'glitter', size: 34, min: 8, max: 140, opacity: 1, flow: 1, spacing: 0.3, pSize: 0.4, pFlow: 0, density: 1 },
      { id: 'glitter-rainbow', kind: 'paint', dab: 'glitter', rainbow: true, size: 34, min: 8, max: 140, opacity: 1, flow: 1, spacing: 0.3, pSize: 0.4, pFlow: 0, density: 1 },
      { id: 'glitter-stars', kind: 'paint', dab: 'stars', size: 50, min: 10, max: 200, opacity: 1, flow: 1, spacing: 0.55, pSize: 0.4, pFlow: 0 },
      { id: 'glitter-gel', kind: 'paint', dab: 'gel', size: 28, min: 6, max: 120, opacity: 1, flow: 1, spacing: 0.08, pSize: 0.5, pFlow: 0, density: 0.6 },
    ],
  },
  {
    id: 'blend', icon: 'blend',
    tools: [
      { id: 'blend-smudge', kind: 'smudge', dab: 'soft50', size: 36, min: 4, max: 200, opacity: 0.75, spacing: 0.08, pSize: 0.3, pFlow: 0.6, pickup: 0.22 },
      { id: 'blend-finger', kind: 'smudge', dab: 'soft20', size: 28, min: 4, max: 160, opacity: 0.9, spacing: 0.06, pSize: 0.3, pFlow: 0.4, pickup: 0.08 },
      { id: 'blend-blur', kind: 'blur', dab: 'soft20', size: 60, min: 8, max: 260, opacity: 0.6, spacing: 0.15, pSize: 0.2, pFlow: 0.7 },
    ],
  },
  {
    id: 'eraser', icon: 'eraser',
    tools: [
      { id: 'erase-hard', kind: 'paint', erase: true, dab: 'hard', size: 24, min: 2, max: 240, opacity: 1, flow: 1, spacing: 0.06, pSize: 0.3, pFlow: 0 },
      { id: 'erase-soft', kind: 'paint', erase: true, dab: 'soft0', size: 70, min: 8, max: 320, opacity: 1, flow: 0.18, spacing: 0.06, pSize: 0.2, pFlow: 0.8 },
      { id: 'erase-kneaded', kind: 'paint', erase: true, dab: 'charcoal', size: 30, min: 6, max: 140, opacity: 1, flow: 0.35, spacing: 0.08, pSize: 0.3, pFlow: 0.8, angle: 'random', grain: ['paper', 0.5] },
    ],
  },
  {
    id: 'fill', icon: 'fill',
    tools: [
      { id: 'fill-solid', kind: 'fill', fill: 'solid', opacity: 1 },
      { id: 'fill-linear', kind: 'fill', fill: 'linear', opacity: 1, drag: true },
      { id: 'fill-radial', kind: 'fill', fill: 'radial', opacity: 1, drag: true },
      { id: 'fill-shade', kind: 'fill', fill: 'shade', opacity: 1 },
      { id: 'fill-texture', kind: 'fill', fill: 'texture', opacity: 1 },
      { id: 'fill-dots', kind: 'fill', fill: 'dots', opacity: 1 },
      { id: 'fill-stripes', kind: 'fill', fill: 'stripes', opacity: 1 },
      { id: 'fill-check', kind: 'fill', fill: 'check', opacity: 1 },
    ],
  },
  {
    id: 'picker', icon: 'picker',
    tools: [{ id: 'picker', kind: 'picker' }],
  },
];

// Noms affichés : lus dans la langue courante (voir i18n.js).
const named = (o, prefix) => Object.defineProperty(o, 'name', { get: () => tr(prefix + o.id), enumerable: true });

export const TOOLS = {};
for (const g of GROUPS) {
  named(g, 'group.');
  for (const t of g.tools) {
    t.group = g.id;
    TOOLS[t.id] = named(t, 'tool.');
  }
}

/* ---------- Empreintes de pointe ---------- */

function buildStamp(fn) {
  const c = makeCanvas(S, S), x = c.getContext('2d');
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const dx = ((i + 0.5) / S) * 2 - 1, dy = ((j + 0.5) / S) * 2 - 1;
      const k = (j * S + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = clamp(fn(dx, dy, Math.hypot(dx, dy), j * S + i), 0, 1) * 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

const edge = (r, w = 0.03) => clamp((1 - r) / w, 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const soft = (h) => (x, y, r) => (r >= 1 ? 0 : r <= h ? 1 : smooth(1 - (r - h) / (1 - h)));

const STAMP_DEFS = {
  hard: [() => edge],
  square: [() => (x, y) => edge(Math.pow(x ** 4 + y ** 4, 0.25))],
  soft0: [() => soft(0)],
  soft20: [() => soft(0.2)],
  soft50: [() => soft(0.5)],
  soft70: [() => soft(0.7)],
  soft85: [() => soft(0.85)],
  pencil: [1, 2, 3].map((s) => () => {
    const n = tileNoise(S, 40, 2, s * 7);
    return (x, y, r, i) => edge(r, 0.3) * Math.pow(clamp((n[i] - 0.22) * 2, 0, 1), 0.8);
  }),
  chalk: [1, 2, 3].map((s) => () => {
    const lo = tileNoise(S, 6, 2, s * 13), hi = tileNoise(S, 48, 2, s * 17);
    return (x, y, r, i) => edge(r / (0.62 + 0.38 * lo[i]), 0.12) * (0.25 + 0.75 * hi[i]);
  }),
  wax: [1, 2, 3].map((s) => () => {
    const lo = tileNoise(S, 8, 2, s * 19), hi = tileNoise(S, 40, 1, s * 23);
    return (x, y, r, i) => edge(r / (0.84 + 0.16 * lo[i]), 0.06) * (0.8 + 0.2 * hi[i]);
  }),
  charcoal: [1, 2, 3].map((s) => () => {
    const hi = tileNoise(S, 36, 2, s * 29), f = soft(0.3);
    return (x, y, r, i) => f(x, y, r) * Math.pow(hi[i], 1.4) * 1.6;
  }),
  wet: [1, 2, 3].map((s) => () => {
    const lo = tileNoise(S, 5, 3, s * 31), f = soft(0.35);
    return (x, y, r, i) => f(x, y, r) * (0.5 + 0.5 * lo[i]);
  }),
  flat: [() => {
    const lines = new Float32Array(S);
    for (let i = 0; i < S; i++) lines[i] = 0.5 + 0.5 * Math.sin(i * 0.9 + Math.sin(i * 0.31) * 3);
    return (x, y, r, i) => edge(r, 0.08) * (0.55 + 0.45 * lines[i % S]);
  }],
};

const stampCache = {};
export function stamp(name, variant = 0) {
  const defs = STAMP_DEFS[name] || STAMP_DEFS.hard;
  const v = variant % defs.length;
  const key = name + v;
  return stampCache[key] || (stampCache[key] = buildStamp(defs[v]()));
}
export const stampVariants = (name) => (STAMP_DEFS[name] || STAMP_DEFS.hard).length;

// Empreinte teintée d'une couleur, gardée en cache.
const tintCache = new Map();
export function tinted(name, variant, color) {
  const key = `${name}${variant}${color}`;
  let c = tintCache.get(key);
  if (!c) {
    if (tintCache.size > 96) tintCache.clear();
    c = makeCanvas(S, S);
    const x = c.getContext('2d');
    x.drawImage(stamp(name, variant), 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, S, S);
    tintCache.set(key, c);
  }
  return c;
}

/* ---------- Grain du papier ---------- */

const T = 256;
const grainValues = {};
export function grainField(tex) {
  if (grainValues[tex]) return grainValues[tex];
  let g;
  if (tex === 'rough') {
    const a = tileNoise(T, 24, 3, 23), b = tileNoise(T, 96, 2, 41);
    g = a.map((v, i) => smooth(clamp((v * 0.7 + b[i] * 0.3 - 0.28) * 2.2, 0, 1)));
  } else if (tex === 'canvas') {
    const n = tileNoise(T, 64, 2, 53);
    g = new Float32Array(T * T);
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const w = Math.sin((x / T) * Math.PI * 64) * Math.sin((y / T) * Math.PI * 64);
        g[y * T + x] = clamp(0.55 + 0.35 * w + (n[y * T + x] - 0.5) * 0.5, 0, 1);
      }
    }
  } else {
    const a = tileNoise(T, 64, 3, 11), b = tileNoise(T, 128, 1, 13);
    g = a.map((v, i) => smooth(clamp((v * 0.6 + b[i] * 0.4 - 0.25) * 2, 0, 1)));
  }
  return (grainValues[tex] = g);
}

// Tuile alpha : là où le grain est creux, le pigment n'accroche pas.
const grainCache = {};
export function grainTile(tex, amount) {
  const key = tex + amount;
  if (grainCache[key]) return grainCache[key];
  const g = grainField(tex);
  const c = makeCanvas(T, T), x = c.getContext('2d');
  const img = x.createImageData(T, T), d = img.data;
  for (let i = 0; i < g.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0;
    d[i * 4 + 3] = (1 - amount * (1 - g[i])) * 255;
  }
  x.putImageData(img, 0, 0);
  return (grainCache[key] = c);
}

// Tuile opaque en niveaux de gris pour les papiers et le remplissage « Texture ».
export function paperTile(tex, strength) {
  const g = grainField(tex);
  const c = makeCanvas(T, T), x = c.getContext('2d');
  const img = x.createImageData(T, T), d = img.data;
  for (let i = 0; i < g.length; i++) {
    const v = 255 * (1 - strength * (1 - g[i]));
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* ---------- Papiers ---------- */

export const PAPERS = [
  { id: 'white', color: '#ffffff' },
  { id: 'cream', color: '#fbf5e9' },
  { id: 'grain', color: '#ffffff', tex: 'paper', strength: 0.1 },
  { id: 'water', color: '#fcf8f0', tex: 'rough', strength: 0.12 },
  { id: 'kraft', color: '#dcc6a2', tex: 'rough', strength: 0.14 },
  { id: 'grey', color: '#e7e6e3', tex: 'paper', strength: 0.08 },
];
PAPERS.forEach((p) => named(p, 'paper.'));
export const paperById = (id) => PAPERS.find((p) => p.id === id) || PAPERS[0];

export const LINE_COLORS = [
  { id: 'black', color: '#1d1b1a' },
  { id: 'sepia', color: '#5a3d2b' },
  { id: 'grey', color: '#8a8580' },
  { id: 'navy', color: '#1f2d4d' },
];
LINE_COLORS.forEach((p) => named(p, 'line.'));
export const lineColorById = (id) => LINE_COLORS.find((p) => p.id === id) || LINE_COLORS[0];
