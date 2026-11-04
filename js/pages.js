// Pages de coloriage générées : chaque (catégorie, numéro) donne toujours le
// même dessin. On dessine en noir sur blanc dans un repère de 1000 unités ;
// les formes remplies de blanc masquent celles de derrière (ordre du peintre).

import { rng, TAU, clamp, makeCanvas } from './util.js';
import { t } from './i18n.js';

export const PAGE_KINDS = [
  { id: 'mandala', w: 1000, h: 1000 },
  { id: 'flowers', w: 1000, h: 1333 },
  { id: 'butterflies', w: 1000, h: 1333 },
  { id: 'ocean', w: 1000, h: 1333 },
  { id: 'landscape', w: 1333, h: 1000 },
  { id: 'kaleido', w: 1000, h: 1000 },
  { id: 'glass', w: 1000, h: 1000 },
  { id: 'geo', w: 1000, h: 1000 },
  { id: 'motifs', w: 1000, h: 1000 },
  { id: 'abstract', w: 1000, h: 1333 },
];
for (const k of PAGE_KINDS) Object.defineProperty(k, 'name', { get: () => t('kind.' + k.id), enumerable: true });
export const kindById = (id) => PAGE_KINDS.find((k) => k.id === id) || PAGE_KINDS[0];

const LW = 2.6;

/* ---------- Outils de tracé ---------- */

const P = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];

function shape(g, build, fill = true) {
  g.beginPath();
  build();
  if (fill) g.fill();
  g.stroke();
}

function circle(g, x, y, r, fill = true) {
  shape(g, () => g.arc(x, y, Math.max(1e-3, r), 0, TAU), fill);
}

function ellipse(g, x, y, rx, ry, rot = 0, fill = true) {
  shape(g, () => g.ellipse(x, y, rx, ry, rot, 0, TAU), fill);
}

function line(g, x0, y0, x1, y1) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

// Courbe lisse (Catmull-Rom) passant par les points.
function spline(g, pts, closed) {
  const n = pts.length;
  const at = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  g.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    g.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
  if (closed) g.closePath();
}

function blobPts(R, cx, cy, r, n = 9, irr = 0.22) {
  const off = R() * TAU;
  return Array.from({ length: n }, (_, i) => P(cx, cy, r * (1 - irr + R() * irr * 2), off + (i / n) * TAU));
}

// Feuille en amande de A vers B, avec nervure.
function leaf(g, ax, ay, bx, by, w, vein = true) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, mx = (ax + bx) / 2, my = (ay + by) / 2;
  shape(g, () => {
    g.moveTo(ax, ay);
    g.quadraticCurveTo(mx + nx * w * 1.3, my + ny * w * 1.3, bx, by);
    g.quadraticCurveTo(mx - nx * w * 1.3, my - ny * w * 1.3, ax, ay);
    g.closePath();
  });
  if (vein) line(g, ax + dx * 0.08, ay + dy * 0.08, ax + dx * 0.82, ay + dy * 0.82);
}

function heartPath(g, x, y, s) {
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.45, y - s * 0.1, x - s * 0.72, y - s * 1.08, x, y - s * 0.42);
  g.bezierCurveTo(x + s * 0.72, y - s * 1.08, x + s * 1.45, y - s * 0.1, x, y + s * 0.9);
  g.closePath();
}

function starPts(cx, cy, r, n, inner, rot) {
  return Array.from({ length: n * 2 }, (_, i) => P(cx, cy, i % 2 ? r * inner : r, rot + (i * Math.PI) / n - Math.PI / 2));
}

function poly(g, pts) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

// Tige ou algue : contour d'un trait épais (trait noir puis trait blanc plus fin).
function tube(g, build, width) {
  g.save();
  g.lineWidth = width;
  g.beginPath();
  build();
  g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = width - LW * 2;
  g.beginPath();
  build();
  g.stroke();
  g.restore();
}

// Fleur simple à pétales ronds (décor de fond).
function blossom(g, R, cx, cy, r, n = 5) {
  const rot = R() * TAU;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    shape(g, () => {
      const [x0, y0] = P(cx, cy, r * 0.15, a);
      g.moveTo(x0, y0);
      g.bezierCurveTo(...P(cx, cy, r * 0.95, a - 0.62), ...P(cx, cy, r * 1.08, a - 0.2), ...P(cx, cy, r, a));
      g.bezierCurveTo(...P(cx, cy, r * 1.08, a + 0.2), ...P(cx, cy, r * 0.95, a + 0.62), x0, y0);
      g.closePath();
    });
  }
  circle(g, cx, cy, r * 0.26);
}

function corners(g, R, W, H) {
  const style = R.pick(['arcs', 'fan', 'dots']);
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
    for (const rr of [70, 135, 195]) circle(g, x, y, rr, false);
    const base = Math.atan2(H / 2 - y, W / 2 - x) - Math.PI / 4;
    if (style === 'fan') {
      for (let k = 1; k < 6; k++) {
        const ang = base + (k / 6) * (Math.PI / 2);
        line(g, ...P(x, y, 135, ang), ...P(x, y, 195, ang));
      }
    } else if (style === 'dots') {
      for (let k = 1; k < 5; k++) circle(g, ...P(x, y, 165, base + (k / 5) * (Math.PI / 2)), 14);
    }
    circle(g, x, y, 30);
  }
}

/* ---------- Mandalas ---------- */

function petal(g, cx, cy, r0, r1, a, hw, round) {
  const [bx1, by1] = P(cx, cy, r0, a - hw), [bx2, by2] = P(cx, cy, r0, a + hw), [tx, ty] = P(cx, cy, r1, a);
  const rm = r0 + (r1 - r0) * (round ? 0.75 : 0.5);
  shape(g, () => {
    g.moveTo(bx1, by1);
    if (round) {
      g.bezierCurveTo(...P(cx, cy, rm, a - hw * 1.15), ...P(cx, cy, r1, a - hw * 0.7), tx, ty);
      g.bezierCurveTo(...P(cx, cy, r1, a + hw * 0.7), ...P(cx, cy, rm, a + hw * 1.15), bx2, by2);
    } else {
      g.quadraticCurveTo(...P(cx, cy, rm, a - hw * 1.2), tx, ty);
      g.quadraticCurveTo(...P(cx, cy, rm, a + hw * 1.2), bx2, by2);
    }
    g.arc(cx, cy, r0, a + hw, a - hw, true);
    g.closePath();
  });
}

const RING_TYPES = ['petals', 'round', 'scallop', 'zigzag', 'band', 'dots', 'arches', 'drops', 'leaves', 'double'];

function ring(g, cx, cy, { r0, r1, n, type, off, k }) {
  const step = TAU / n, dr = r1 - r0;
  const ang = (i) => (i + off) * step - Math.PI / 2;
  switch (type) {
    case 'petals':
    case 'round': {
      const tip = r1 + (k > 0.5 ? dr * 0.3 : 0), hw = step * 0.5 * (0.85 + 0.25 * k);
      for (let i = 0; i < n; i++) petal(g, cx, cy, r0, tip, ang(i), hw, type === 'round');
      for (let i = 0; i < n; i++) petal(g, cx, cy, r0, r0 + (tip - r0) * 0.55, ang(i), hw * 0.45, type === 'round');
      break;
    }
    case 'double': {
      const hw = step * 0.5;
      for (let i = 0; i < n; i++) petal(g, cx, cy, r0, r1 + dr * 0.15, ang(i) + step / 2, hw * 0.9, k > 0.5);
      for (let i = 0; i < n; i++) petal(g, cx, cy, r0, r0 + dr * 0.75, ang(i), hw * 0.75, k <= 0.5);
      break;
    }
    case 'scallop': {
      const rb = r0 + dr * 0.3;
      shape(g, () => {
        for (let i = 0; i < n; i++) {
          const a0 = ang(i), a1 = ang(i + 1);
          if (!i) g.moveTo(...P(cx, cy, rb, a0));
          g.quadraticCurveTo(...P(cx, cy, r1 + dr * 0.25, (a0 + a1) / 2), ...P(cx, cy, rb, a1));
        }
        g.closePath();
      });
      circle(g, cx, cy, rb, false);
      const rr = Math.min(dr * 0.16, rb * step * 0.18);
      for (let i = 0; i < n; i++) circle(g, ...P(cx, cy, rb + (r1 - rb) * 0.42, ang(i) + step / 2), rr);
      break;
    }
    case 'zigzag': {
      const ri = r0 + dr * 0.3;
      shape(g, () => {
        for (let i = 0; i < n; i++) {
          const p1 = P(cx, cy, r1, ang(i)), p2 = P(cx, cy, ri, ang(i) + step / 2);
          if (!i) g.moveTo(...p1); else g.lineTo(...p1);
          g.lineTo(...p2);
        }
        g.closePath();
      });
      circle(g, cx, cy, ri, false);
      for (let i = 0; i < n; i++) circle(g, ...P(cx, cy, r0 + dr * 0.62, ang(i)), Math.min(dr * 0.1, ri * step * 0.12));
      break;
    }
    case 'band': {
      if (dr > 44) circle(g, cx, cy, r0 + dr / 2, false);
      for (let i = 0; i < n; i++) line(g, ...P(cx, cy, r0, ang(i)), ...P(cx, cy, r1, ang(i)));
      if (dr <= 44) {
        const rr = Math.min(dr * 0.22, (r0 + dr / 2) * step * 0.2);
        for (let i = 0; i < n; i++) circle(g, ...P(cx, cy, r0 + dr / 2, ang(i) + step / 2), rr);
      }
      break;
    }
    case 'dots': {
      const rm = r0 + dr / 2, rr = Math.min(dr * 0.36, rm * step * 0.36);
      for (let i = 0; i < n; i++) {
        circle(g, ...P(cx, cy, rm, ang(i)), rr);
        if (rr > 12) circle(g, ...P(cx, cy, rm, ang(i)), rr * 0.45);
        circle(g, ...P(cx, cy, rm, ang(i) + step / 2), rr * 0.4);
      }
      break;
    }
    case 'arches': {
      const rr = Math.min(r0 * Math.sin(step / 2), dr * 0.95);
      for (let i = 0; i < n; i++) {
        const am = ang(i) + step / 2, [ax, ay] = P(cx, cy, r0, am);
        shape(g, () => { g.arc(ax, ay, rr, am - Math.PI / 2, am + Math.PI / 2); g.closePath(); });
        if (rr > 18) shape(g, () => { g.arc(ax, ay, rr * 0.55, am - Math.PI / 2, am + Math.PI / 2); g.closePath(); });
      }
      break;
    }
    case 'drops': {
      const rc = r0 + dr * 0.38, rr = Math.min(dr * 0.3, rc * step * 0.36), d = r1 - rc;
      const th = Math.acos(clamp(rr / d, -1, 1));
      for (let i = 0; i < n; i++) {
        const a = ang(i), [ccx, ccy] = P(cx, cy, rc, a), [tx, ty] = P(cx, cy, r1, a);
        shape(g, () => {
          g.moveTo(tx, ty);
          g.arc(ccx, ccy, rr, a - th, a + th, true);
          g.closePath();
        });
        if (rr > 10) circle(g, ccx, ccy, rr * 0.42);
      }
      break;
    }
    case 'leaves': {
      const w = Math.min(dr * 0.28, r0 * step * 0.42);
      for (let i = 0; i < n; i++) leaf(g, ...P(cx, cy, r0, ang(i)), ...P(cx, cy, r1 + dr * 0.08, ang(i)), w);
      break;
    }
  }
}

function mandala(g, R, W, H) {
  const cx = W / 2, cy = H / 2, N = R.pick([8, 10, 12, 12, 16, 16, 20]);
  const rings = [];
  let r = R.range(30, 46);
  const center = r;
  while (r < 455) {
    const dr = Math.min(R.range(32, 64), 485 - r);
    const n = r < 120 ? Math.max(6, N / 2) : r > 300 && R.chance(0.45) ? N * 2 : N;
    rings.push({ r0: r, r1: r + dr, n, type: R.pick(RING_TYPES), off: R.chance(0.5) ? 0.5 : 0, k: R() });
    r += dr;
  }
  corners(g, R, W, H);
  for (let i = rings.length - 1; i >= 0; i--) {
    circle(g, cx, cy, rings[i].r1);
    ring(g, cx, cy, rings[i]);
  }
  circle(g, cx, cy, center);
  const n = Math.max(5, (N / 2) | 0);
  for (let i = 0; i < n; i++) petal(g, cx, cy, center * 0.3, center * 0.92, (i / n) * TAU, (Math.PI / n) * 0.8, true);
  circle(g, cx, cy, center * 0.3);
}

/* ---------- Kaléidoscopes ---------- */

function kaleido(g, R, W, H) {
  const cx = W / 2, cy = H / 2, K = R.pick([6, 8, 10, 12]), wedge = TAU / K;
  corners(g, R, W, H);
  circle(g, cx, cy, 485);
  const shapes = [];
  const n = R.int(4, 7);
  for (let i = 0; i < n; i++) {
    const type = R.pick(['circle', 'circle', 'curve', 'petal', 'petal', 'ellipse']);
    const rr = R.range(90, 420), a = R.range(0.05, wedge / 2);
    if (type === 'circle') shapes.push({ type, p: P(0, 0, rr, a), r: R.range(22, Math.max(24, Math.min(110, 470 - rr))) });
    else if (type === 'ellipse') shapes.push({ type, p: P(0, 0, rr, a), rx: R.range(20, 80), ry: R.range(10, 40), rot: R() * TAU });
    else if (type === 'petal') shapes.push({ type, a, r0: R.range(50, 200), r1: R.range(240, 470), w: R.range(25, 70) });
    else shapes.push({ type, p0: P(0, 0, R.range(90, 470), R.range(-wedge / 2, wedge)), c: P(0, 0, R.range(90, 470), R.range(0, wedge / 2)), p1: P(0, 0, R.range(90, 470), R.range(0, wedge)) });
  }
  const draw = () => {
    for (const s of shapes) {
      if (s.type === 'circle') circle(g, s.p[0], s.p[1], s.r, false);
      else if (s.type === 'ellipse') ellipse(g, s.p[0], s.p[1], s.rx, s.ry, s.rot, false);
      else if (s.type === 'petal') {
        const [ax, ay] = P(0, 0, s.r0, s.a), [bx, by] = P(0, 0, s.r1, s.a);
        g.beginPath();
        const nx = -Math.sin(s.a), ny = Math.cos(s.a), mx = (ax + bx) / 2, my = (ay + by) / 2;
        g.moveTo(ax, ay);
        g.quadraticCurveTo(mx + nx * s.w, my + ny * s.w, bx, by);
        g.quadraticCurveTo(mx - nx * s.w, my - ny * s.w, ax, ay);
        g.stroke();
      } else {
        g.beginPath();
        g.moveTo(...s.p0);
        g.quadraticCurveTo(...s.c, ...s.p1);
        g.stroke();
      }
    }
  };
  g.save();
  g.beginPath();
  g.arc(cx, cy, 485, 0, TAU);
  g.clip();
  for (let k = 0; k < K; k++) {
    g.save();
    g.translate(cx, cy);
    g.rotate(k * wedge);
    draw();
    g.scale(1, -1);
    draw();
    g.restore();
  }
  g.restore();
  circle(g, cx, cy, R.range(22, 40));
}

/* ---------- Fleurs ---------- */

function flowerHead(g, R, x, y, r, type) {
  if (type === 'daisy') {
    const n = R.int(12, 18), rc = r * 0.3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      leaf(g, ...P(x, y, rc * 0.7, a), ...P(x, y, r, a), Math.min(r * 0.2, r * Math.sin(Math.PI / n) * 0.75), false);
    }
    circle(g, x, y, rc);
    circle(g, x, y, rc * 0.55, false);
    if (rc > 34) for (let i = 0; i < 8; i++) circle(g, ...P(x, y, rc * 0.78, (i / 8) * TAU), rc * 0.1);
  } else if (type === 'rose') {
    for (let L = 0; L < 5; L++) {
      const rad = r * (1 - L * 0.18), m = 5 + (L % 2), rot = R() * TAU;
      shape(g, () => {
        for (let i = 0; i < m; i++) {
          const a0 = rot + (i / m) * TAU, a1 = rot + ((i + 1) / m) * TAU;
          if (!i) g.moveTo(...P(x, y, rad * 0.8, a0));
          g.quadraticCurveTo(...P(x, y, rad * 1.12, (a0 + a1) / 2), ...P(x, y, rad * 0.8, a1));
        }
        g.closePath();
      });
    }
    g.beginPath();
    for (let t = 0; t < 1; t += 0.02) {
      const [px, py] = P(x, y, r * 0.18 * t, t * TAU * 1.6);
      if (!t) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  } else if (type === 'sunflower') {
    const n = R.int(14, 20), rc = r * 0.42;
    for (let i = 0; i < n; i++) petal(g, x, y, rc * 0.9, r, (i / n) * TAU + Math.PI / n, (Math.PI / n) * 0.9, false);
    for (let i = 0; i < n; i++) petal(g, x, y, rc * 0.9, r * 0.85, (i / n) * TAU, (Math.PI / n) * 0.8, false);
    circle(g, x, y, rc);
    circle(g, x, y, rc * 0.68, false);
    circle(g, x, y, rc * 0.36, false);
    for (let i = 0; i < 12; i++) line(g, ...P(x, y, rc * 0.36, (i / 12) * TAU), ...P(x, y, rc, (i / 12) * TAU));
  } else if (type === 'tulip') {
    const w = r * 0.72, h = r * 1.05, top = y - h * 0.62, base = y + h * 0.42;
    shape(g, () => {
      g.moveTo(x - w * 0.5, top + h * 0.3);
      g.quadraticCurveTo(x, top - h * 0.35, x + w * 0.5, top + h * 0.3);
      g.lineTo(x + w * 0.4, base - h * 0.2);
      g.lineTo(x - w * 0.4, base - h * 0.2);
      g.closePath();
    });
    for (const s of [-1, 1]) {
      shape(g, () => {
        g.moveTo(x, base);
        g.bezierCurveTo(x + s * w * 1.25, base - h * 0.15, x + s * w * 0.95, top + h * 0.05, x + s * w * 0.62, top - h * 0.02);
        g.quadraticCurveTo(x + s * w * 0.35, top + h * 0.45, x, base);
        g.closePath();
      });
    }
    shape(g, () => {
      g.moveTo(x, base);
      g.bezierCurveTo(x - w * 0.55, base - h * 0.35, x - w * 0.3, top + h * 0.1, x, top - h * 0.12);
      g.bezierCurveTo(x + w * 0.3, top + h * 0.1, x + w * 0.55, base - h * 0.35, x, base);
      g.closePath();
    });
  } else {
    blossom(g, R, x, y, r, 5);
    circle(g, x, y, r * 0.12, false);
  }
}

function flowers(g, R, W, H) {
  const ground = H - R.range(130, 190);
  shape(g, () => {
    g.moveTo(-10, ground);
    for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, ground + Math.sin(x * 0.012 + 1) * 18);
    g.lineTo(W + 10, H + 10);
    g.lineTo(-10, H + 10);
    g.closePath();
  });
  const list = [], count = R.int(5, 7);
  for (let t = 0; t < 400 && list.length < count; t++) {
    const r = R.range(110, 210), x = R.range(r * 0.5, W - r * 0.5), y = R.range(r * 0.8, H * 0.7);
    if (list.every((o) => Math.hypot(o.x - x, o.y - y) > (o.r + r) * 0.72)) list.push({ x, y, r });
  }
  list.sort((a, b) => a.y - b.y);
  const types = ['daisy', 'rose', 'sunflower', 'tulip', 'blossom'];
  for (const f of list) {
    const ex = f.x + R.range(-90, 90), ey = H + 20;
    const c1 = [f.x + R.range(-60, 60), f.y + (ey - f.y) * 0.4], c2 = [ex + R.range(-50, 50), f.y + (ey - f.y) * 0.75];
    const at = (t) => {
      const u = 1 - t;
      return [
        u * u * u * f.x + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ex,
        u * u * u * f.y + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ey,
      ];
    };
    for (const t of [R.range(0.35, 0.5), R.range(0.6, 0.75)]) {
      const [lx, ly] = at(t), s = R.sign(), len = R.range(80, 140), a = -Math.PI / 2 + s * R.range(0.6, 1.1);
      leaf(g, lx, ly, lx + Math.cos(a) * len, ly + Math.sin(a) * len, R.range(24, 36));
    }
    tube(g, () => { g.moveTo(f.x, f.y); g.bezierCurveTo(...c1, ...c2, ex, ey); }, 16);
    flowerHead(g, R, f.x, f.y, f.r, R.pick(types));
  }
  for (let i = 0; i < R.int(3, 6); i++) {
    const x = R.range(30, W - 30), y = ground + R.range(40, 110);
    blossom(g, R, x, y, R.range(18, 30));
  }
}

/* ---------- Papillons ---------- */

function bez(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
    u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
  ];
}

// Aile : suite de segments cubiques [p0, c1, c2, p1] en coordonnées normalisées.
function tracePath(g, segs, f) {
  g.moveTo(...f(segs[0][0]));
  for (const [, c1, c2, p1] of segs) g.bezierCurveTo(...f(c1), ...f(c2), ...f(p1));
  g.closePath();
}

function wing(g, R, segs, anchor, outerSegs, eye) {
  const id = (p) => p;
  const scaled = (k) => (p) => [anchor[0] + (p[0] - anchor[0]) * k, anchor[1] + (p[1] - anchor[1]) * k];
  shape(g, () => tracePath(g, segs, id));
  g.save();
  g.beginPath();
  tracePath(g, segs, id);
  g.clip();
  shape(g, () => tracePath(g, segs, scaled(0.66)));
  // Taches entre le bord et l'intérieur.
  const spots = R.int(4, 7), rad = R.range(0.035, 0.055);
  for (let i = 0; i < spots; i++) {
    const seg = outerSegs[i % outerSegs.length], t = ((i / outerSegs.length) | 0) / Math.ceil(spots / outerSegs.length) + 0.5 / Math.ceil(spots / outerSegs.length);
    circle(g, ...scaled(0.83)(bez(...seg, t)), rad);
  }
  // Nervures de l'intérieur.
  for (let i = 0; i < 3; i++) {
    const seg = outerSegs[i % outerSegs.length];
    const p = scaled(0.66)(bez(...seg, 0.25 + (i % 2) * 0.5));
    g.beginPath();
    g.moveTo(...anchor);
    g.quadraticCurveTo((anchor[0] + p[0]) / 2 + 0.04, (anchor[1] + p[1]) / 2, p[0], p[1]);
    g.stroke();
  }
  if (eye) {
    circle(g, eye[0], eye[1], eye[2]);
    circle(g, eye[0], eye[1], eye[2] * 0.5);
  }
  g.restore();
}

function butterfly(g, R, cx, cy, span, rot) {
  const tipX = R.range(0.85, 1.0), tipY = R.range(-0.95, -0.72), topX = R.range(0.3, 0.5), topY = R.range(-0.95, -0.78);
  const outX = R.range(0.72, 0.92), outY = R.range(-0.22, -0.05);
  const x1 = R.range(0.6, 0.82), y1 = R.range(0.15, 0.32), x2 = R.range(0.38, 0.6), y2 = R.range(0.62, 0.85);
  const upper = [
    [[0.04, -0.06], [topX * 0.5, topY * 0.9], [topX, topY * 1.05], [tipX, tipY]],
    [[tipX, tipY], [tipX + 0.08, tipY + 0.3], [outX + 0.06, outY - 0.15], [outX, outY]],
    [[outX, outY], [outX * 0.6, outY + 0.12], [0.2, 0.06], [0.04, 0.02]],
  ];
  const lower = [
    [[0.04, 0.0], [x1 * 0.6, y1 - 0.18], [x1 + 0.1, y1 - 0.06], [x1, y1]],
    [[x1, y1], [x1 + 0.05, y1 + 0.3], [x2 + 0.16, y2], [x2, y2]],
    [[x2, y2], [x2 - 0.2, y2 + 0.04], [0.1, 0.32], [0.04, 0.06]],
  ];
  const eye = R.chance(0.6) ? [x1 * 0.55, (y1 + y2) * 0.42, 0.07] : null;
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.scale(span, span);
  g.lineWidth = LW / span;
  // Même graine pour les deux côtés : les ailes restent symétriques.
  const ws = (R() * 1e9) | 0;
  for (const side of [1, -1]) {
    g.save();
    g.scale(side, 1);
    wing(g, rng(ws), lower, [0.06, 0.08], lower.slice(0, 2), eye);
    wing(g, rng(ws + 1), upper, [0.08, -0.12], upper.slice(0, 2), null);
    g.restore();
  }
  ellipse(g, 0, 0.24, 0.045, 0.28);
  g.save();
  g.beginPath();
  g.ellipse(0, 0.24, 0.045, 0.28, 0, 0, TAU);
  g.clip();
  for (let y = 0.06; y < 0.5; y += 0.075) line(g, -0.06, y, 0.06, y + 0.012);
  g.restore();
  ellipse(g, 0, -0.03, 0.058, 0.11);
  circle(g, 0, -0.17, 0.05);
  for (const s of [1, -1]) {
    g.beginPath();
    g.moveTo(s * 0.02, -0.21);
    g.quadraticCurveTo(s * 0.05, -0.42, s * 0.18, -0.55);
    g.stroke();
    circle(g, s * 0.18, -0.55, 0.025);
  }
  g.restore();
}

function butterflies(g, R, W, H) {
  for (let i = 0; i < R.int(8, 12); i++) {
    const x = R.range(40, W - 40), y = R.range(40, H - 40);
    if (R.chance(0.5)) blossom(g, R, x, y, R.range(26, 48), R.pick([5, 6]));
    else {
      const a = R() * TAU, len = R.range(60, 110);
      leaf(g, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, R.range(18, 28));
    }
  }
  butterfly(g, R, W / 2, H * 0.48, R.range(400, 450), R.range(-0.12, 0.12));
  const spots = [[150, 160], [W - 150, 170], [150, H - 170], [W - 150, H - 160]];
  for (const [x, y] of spots) if (R.chance(0.75)) butterfly(g, R, x, y, R.range(95, 125), R.range(-0.7, 0.7));
}

/* ---------- Océan ---------- */

function fish(g, R, x, y, len, dir) {
  const h = len * R.range(0.4, 0.62);
  g.save();
  g.translate(x, y);
  g.scale(dir, 1);
  const tx = -len * 0.45;
  shape(g, () => {
    g.moveTo(tx + len * 0.06, 0);
    g.lineTo(tx - len * 0.3, -h * 0.55);
    g.quadraticCurveTo(tx - len * 0.18, 0, tx - len * 0.3, h * 0.55);
    g.closePath();
  });
  line(g, tx - len * 0.02, -h * 0.05, tx - len * 0.22, -h * 0.3);
  line(g, tx - len * 0.02, h * 0.05, tx - len * 0.22, h * 0.3);
  shape(g, () => {
    g.moveTo(-len * 0.18, -h * 0.4);
    g.quadraticCurveTo(-len * 0.02, -h * 0.98, len * 0.16, -h * 0.44);
    g.closePath();
  });
  shape(g, () => {
    g.moveTo(-len * 0.12, h * 0.4);
    g.quadraticCurveTo(-len * 0.02, h * 0.8, len * 0.08, h * 0.42);
    g.closePath();
  });
  const body = () => {
    g.moveTo(len * 0.5, 0);
    g.bezierCurveTo(len * 0.42, -h * 0.62, -len * 0.3, -h * 0.62, -len * 0.45, 0);
    g.bezierCurveTo(-len * 0.3, h * 0.62, len * 0.42, h * 0.62, len * 0.5, 0);
    g.closePath();
  };
  shape(g, body);
  g.save();
  g.beginPath();
  body();
  g.clip();
  const pat = R.pick(['stripes', 'scales', 'spots', 'stripes']);
  if (pat === 'stripes') {
    for (const k of [-0.18, 0.02, R.chance(0.5) ? -0.34 : null]) {
      if (k == null) continue;
      g.beginPath();
      g.moveTo(len * k, -h);
      g.quadraticCurveTo(len * (k + 0.08), 0, len * k, h);
      g.stroke();
    }
  } else if (pat === 'scales') {
    const s = h * 0.24;
    for (let cx = -len * 0.32; cx < len * 0.12; cx += s) {
      for (let cy = -h * 0.6; cy < h * 0.6; cy += s * 0.9) {
        g.beginPath();
        g.arc(cx + ((Math.round(cy / (s * 0.9)) & 1) * s) / 2, cy, s * 0.5, -Math.PI / 2, Math.PI / 2);
        g.stroke();
      }
    }
  } else {
    for (let i = 0; i < R.int(3, 6); i++) circle(g, R.range(-len * 0.3, len * 0.15), R.range(-h * 0.3, h * 0.3), R.range(h * 0.06, h * 0.12));
  }
  g.restore();
  g.beginPath();
  g.moveTo(len * 0.24, -h * 0.36);
  g.quadraticCurveTo(len * 0.16, 0, len * 0.24, h * 0.36);
  g.stroke();
  circle(g, len * 0.34, -h * 0.08, h * 0.12);
  circle(g, len * 0.355, -h * 0.08, h * 0.055);
  leaf(g, len * 0.08, h * 0.06, -len * 0.08, h * 0.22, h * 0.07, false);
  g.restore();
}

function ocean(g, R, W, H) {
  for (const [y, amp] of [[90, 14], [150, 10]]) {
    g.beginPath();
    for (let x = -10; x <= W + 10; x += 10) {
      const yy = y + Math.sin(x * 0.03 + y) * amp;
      if (x < 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  const sandY = H - R.range(150, 200);
  for (let i = 0; i < R.int(4, 7); i++) {
    const x0 = R.range(30, W - 30), top = sandY - R.range(220, 480), sway = R.range(20, 45), ph = R() * TAU;
    tube(g, () => {
      g.moveTo(x0, H + 10);
      for (let y = H; y >= top; y -= 12) g.lineTo(x0 + Math.sin(y * 0.02 + ph) * sway, y);
    }, R.range(20, 30));
  }
  shape(g, () => {
    g.moveTo(-10, sandY);
    for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, sandY + Math.sin(x * 0.01 + 2) * 16);
    g.lineTo(W + 10, H + 10);
    g.lineTo(-10, H + 10);
    g.closePath();
  });
  for (let i = 0; i < R.int(2, 4); i++) {
    const x = R.range(60, W - 60), r = R.range(45, 85);
    shape(g, () => spline(g, blobPts(R, x, sandY + 25, r, 8, 0.2), true));
  }
  for (let i = 0; i < R.int(1, 3); i++) {
    const x = R.range(80, W - 80), y = sandY + R.range(60, 130), r = R.range(32, 50);
    shape(g, () => spline(g, starPts(x, y, r, 5, 0.45, R.range(-0.3, 0.3)), true));
    shape(g, () => spline(g, starPts(x, y, r * 0.45, 5, 0.5, 0), true), false);
  }
  for (let i = 0; i < R.int(1, 2); i++) {
    const x = R.range(80, W - 80), y = sandY + R.range(70, 130), r = R.range(36, 52);
    shape(g, () => { g.moveTo(x, y + r * 0.35); g.arc(x, y + r * 0.35, r, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); });
    for (let k = 1; k < 6; k++) {
      const a = Math.PI * (1.05 + (k / 6) * 0.9);
      line(g, x, y + r * 0.35, ...P(x, y + r * 0.35, r, a));
    }
  }
  const fishes = [];
  const nFish = R.int(3, 5);
  for (let t = 0; t < 400 && fishes.length < nFish; t++) {
    const len = R.range(180, 320), x = R.range(len * 0.55, W - len * 0.55), y = R.range(250, sandY - 110);
    if (fishes.every((f) => Math.abs(f.x - x) > (f.len + len) * 0.55 || Math.abs(f.y - y) > (f.len + len) * 0.33)) fishes.push({ x, y, len });
  }
  for (const f of fishes) fish(g, R, f.x, f.y, f.len, R.sign());
  for (let i = 0; i < R.int(8, 14); i++) {
    const x = R.range(20, W - 20), y = R.range(180, sandY - 40), r = R.range(7, 18);
    if (fishes.some((f) => Math.abs(f.x - x) < f.len * 0.7 && Math.abs(f.y - y) < f.len * 0.4)) continue;
    circle(g, x, y, r);
  }
}

/* ---------- Paysages ---------- */

function cloud(g, R, cx, cy, w) {
  const n = R.int(4, 6), cs = [];
  for (let i = 0; i < n; i++) {
    const r = (w / n) * R.range(0.75, 1.05) * (1.15 - Math.abs(i - (n - 1) / 2) / n);
    cs.push([cx - w / 2 + (i + 0.5) * (w / n), cy - r * 0.3 + R.range(-6, 6), r]);
  }
  g.save();
  g.lineWidth = LW * 2;
  for (const [x, y, r] of cs) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  g.beginPath();
  g.ellipse(cx, cy + w * 0.05, w * 0.5, w * 0.12, 0, 0, TAU);
  g.stroke();
  g.beginPath();
  for (const [x, y, r] of cs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  g.moveTo(cx + w * 0.5, cy + w * 0.05);
  g.ellipse(cx, cy + w * 0.05, w * 0.5, w * 0.12, 0, 0, TAU);
  g.fill();
  g.restore();
}

function tree(g, R, x, y, s) {
  if (R.chance(0.5)) {
    shape(g, () => g.rect(x - s * 0.08, y - s * 0.25, s * 0.16, s * 0.3));
    for (let i = 0; i < 3; i++) {
      const by = y - s * 0.2 - i * s * 0.32, w = s * (0.5 - i * 0.1);
      shape(g, () => poly(g, [[x - w, by], [x + w, by], [x, by - s * 0.55]]));
    }
  } else {
    shape(g, () => g.rect(x - s * 0.08, y - s * 0.45, s * 0.16, s * 0.5));
    shape(g, () => spline(g, blobPts(R, x, y - s * 0.75, s * 0.42, 8, 0.15), true));
  }
}

function house(g, R, x, y, s) {
  shape(g, () => g.rect(x + s * 0.2, y - s * 1.05, s * 0.14, s * 0.35));
  shape(g, () => g.rect(x - s * 0.5, y - s * 0.7, s, s * 0.72));
  shape(g, () => poly(g, [[x - s * 0.62, y - s * 0.68], [x + s * 0.62, y - s * 0.68], [x + s * 0.4, y - s * 1.1], [x - s * 0.4, y - s * 1.1]]));
  shape(g, () => g.rect(x - s * 0.36, y - s * 0.4, s * 0.22, s * 0.42));
  shape(g, () => g.rect(x + s * 0.08, y - s * 0.52, s * 0.28, s * 0.24));
  line(g, x + s * 0.22, y - s * 0.52, x + s * 0.22, y - s * 0.28);
  line(g, x + s * 0.08, y - s * 0.4, x + s * 0.36, y - s * 0.4);
}

function landscape(g, R, W, H) {
  const sx = R.range(W * 0.15, W * 0.85), sy = R.range(110, 200), sr = R.range(55, 80);
  const rays = R.int(10, 16);
  for (let i = 0; i < rays; i++) petal(g, sx, sy, sr * 1.15, sr * 1.8, (i / rays) * TAU, (Math.PI / rays) * 0.55, R.chance(0.5));
  circle(g, sx, sy, sr);
  if (R.chance(0.5)) circle(g, sx, sy, sr * 0.6, false);
  for (let i = 0; i < R.int(2, 4); i++) cloud(g, R, R.range(120, W - 120), R.range(90, 300), R.range(150, 260));
  const peaks = [];
  for (let x = -60; x < W + 120; x += R.range(150, 260)) peaks.push([x, R.range(300, 470)], [x + R.range(60, 110), R.range(500, 580)]);
  const mountain = () => {
    g.moveTo(-60, H + 10);
    for (const p of peaks) g.lineTo(p[0], p[1]);
    g.lineTo(W + 60, H + 10);
    g.closePath();
  };
  shape(g, mountain);
  g.save();
  g.beginPath();
  mountain();
  g.clip();
  for (let i = 0; i < peaks.length; i += 2) {
    const [px, py] = peaks[i];
    if (py > 420) continue;
    g.beginPath();
    g.moveTo(px - 70, py + 65);
    for (let k = 1; k <= 4; k++) g.lineTo(px - 70 + k * 35, py + (k % 2 ? 40 : 70));
    g.stroke();
  }
  g.restore();
  const hills = [600, 700, 830].map((base) => {
    const a1 = R.range(18, 40), f1 = R.range(0.003, 0.007), p1 = R() * TAU, a2 = R.range(6, 16), f2 = R.range(0.01, 0.02), p2 = R() * TAU;
    return (x) => base + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a2;
  });
  hills.forEach((hy, idx) => {
    shape(g, () => {
      g.moveTo(-10, H + 10);
      for (let x = -10; x <= W + 10; x += 10) g.lineTo(x, hy(x));
      g.lineTo(W + 10, H + 10);
      g.closePath();
    });
    if (idx === 0) {
      for (let i = 0; i < R.int(4, 8); i++) {
        const x = R.range(30, W - 30);
        tree(g, R, x, hy(x) + 8, R.range(80, 130));
      }
    } else if (idx === 1 && R.chance(0.7)) {
      const x = R.range(200, W - 200);
      house(g, R, x, hy(x) + 30, R.range(150, 210));
    } else if (idx === 2) {
      for (let i = 0; i < R.int(5, 9); i++) {
        const x = R.range(40, W - 40), y = R.range(hy(x) + 40, H - 30);
        blossom(g, R, x, y, R.range(22, 36));
      }
    }
  });
  for (let i = 0; i < R.int(2, 4); i++) {
    const x = R.range(100, W - 100), y = R.range(80, 260), s = R.range(14, 24);
    g.beginPath();
    g.moveTo(x - s, y);
    g.quadraticCurveTo(x - s / 2, y - s * 0.6, x, y);
    g.quadraticCurveTo(x + s / 2, y - s * 0.6, x + s, y);
    g.stroke();
  }
}

/* ---------- Vitraux ---------- */

function clipHalf(poly, nx, ny, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const A = poly[i], B = poly[(i + 1) % poly.length];
    const da = nx * A[0] + ny * A[1] - c, db = nx * B[0] + ny * B[1] - c;
    if (da <= 0) out.push(A);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
  }
  return out;
}

function voronoi(R, W, H, n, m) {
  let sites = Array.from({ length: n }, () => [R.range(m, W - m), R.range(m, H - m)]);
  for (let it = 0; it < 2; it++) {
    const acc = sites.map(() => [0, 0, 0]);
    for (let y = m; y < H - m; y += 12) {
      for (let x = m; x < W - m; x += 12) {
        let best = 0, bd = Infinity;
        for (let i = 0; i < sites.length; i++) {
          const d = (sites[i][0] - x) ** 2 + (sites[i][1] - y) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        acc[best][0] += x; acc[best][1] += y; acc[best][2]++;
      }
    }
    sites = sites.map((s, i) => (acc[i][2] ? [acc[i][0] / acc[i][2], acc[i][1] / acc[i][2]] : s));
  }
  return sites.map((si, i) => {
    let cell = [[m, m], [W - m, m], [W - m, H - m], [m, H - m]];
    for (let j = 0; j < sites.length && cell.length; j++) {
      if (i === j) continue;
      const sj = sites[j];
      cell = clipHalf(cell, sj[0] - si[0], sj[1] - si[1], (sj[0] ** 2 + sj[1] ** 2 - si[0] ** 2 - si[1] ** 2) / 2);
    }
    return cell;
  }).filter((c) => c.length > 2);
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

function glass(g, R, W, H) {
  const m = 16;
  const cells = voronoi(R, W, H, R.int(40, 70), m);
  g.save();
  g.lineWidth = LW * 1.9;
  for (const c of cells) shape(g, () => poly(g, c), false);
  g.restore();
  for (const c of cells) {
    if (polyArea(c) < 6000 || !R.chance(0.5)) continue;
    const cx = c.reduce((s, p) => s + p[0], 0) / c.length, cy = c.reduce((s, p) => s + p[1], 0) / c.length;
    if (R.chance(0.5)) shape(g, () => poly(g, c.map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5])));
    else {
      const rr = Math.min(...c.map(([x, y]) => Math.hypot(x - cx, y - cy))) * 0.45;
      if (rr > 10) circle(g, cx, cy, rr);
    }
  }
  if (R.chance(0.55)) {
    const cx = W / 2, cy = H / 2, r = R.range(190, 250), n = R.pick([8, 10, 12]);
    g.save();
    g.lineWidth = LW * 1.9;
    circle(g, cx, cy, r);
    g.restore();
    for (let i = 0; i < n; i++) petal(g, cx, cy, r * 0.3, r * 0.95, (i / n) * TAU, (Math.PI / n) * 0.85, true);
    for (let i = 0; i < n; i++) petal(g, cx, cy, r * 0.3, r * 0.6, (i / n) * TAU, (Math.PI / n) * 0.4, true);
    circle(g, cx, cy, r * 0.3);
    circle(g, cx, cy, r * 0.14);
  }
  g.save();
  g.lineWidth = LW * 1.9;
  g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.restore();
}

/* ---------- Géométrie ---------- */

function truchet(g, R, W, H) {
  const n = R.int(5, 8), s = W / n, radii = R.chance(0.65) ? [0.3, 0.5, 0.7] : [0.5];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * s, y = j * s;
      const pairs = R.chance(0.5) ? [[x, y, 0], [x + s, y + s, Math.PI]] : [[x + s, y, Math.PI / 2], [x, y + s, -Math.PI / 2]];
      for (const [cx, cy, a0] of pairs) {
        for (const k of radii) {
          g.beginPath();
          g.arc(cx, cy, s * k, a0, a0 + Math.PI / 2);
          g.stroke();
        }
      }
    }
  }
  if (R.chance(0.6)) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) circle(g, i * s, j * s, s * 0.12);
}

function hexes(g, R, W, H) {
  const r = R.range(70, 110), hw = Math.sqrt(3) * r;
  const deco = R.pick(['star', 'inner', 'spokes', 'circle', 'mix']);
  for (let row = -1; row * r * 1.5 < H + r; row++) {
    for (let col = -1; col * hw < W + hw; col++) {
      const cx = col * hw + (row & 1 ? hw / 2 : 0), cy = row * r * 1.5;
      const v = Array.from({ length: 6 }, (_, k) => P(cx, cy, r, (k / 6) * TAU + Math.PI / 6));
      shape(g, () => poly(g, v), false);
      const d = deco === 'mix' ? R.pick(['star', 'inner', 'spokes', 'circle']) : deco;
      if (d === 'star') {
        shape(g, () => poly(g, [v[0], v[2], v[4]]), false);
        shape(g, () => poly(g, [v[1], v[3], v[5]]), false);
      } else if (d === 'inner') {
        const iv = v.map(([x, y]) => [cx + (x - cx) * 0.5, cy + (y - cy) * 0.5]);
        shape(g, () => poly(g, iv), false);
        for (let k = 0; k < 6; k++) line(g, ...iv[k], ...v[k]);
      } else if (d === 'spokes') {
        circle(g, cx, cy, r * 0.42, false);
        for (let k = 0; k < 6; k++) line(g, ...P(cx, cy, r * 0.42, (k / 6) * TAU + Math.PI / 6), ...v[k]);
      } else {
        circle(g, cx, cy, r * 0.62, false);
        circle(g, cx, cy, r * 0.25, false);
      }
    }
  }
}

function triangles(g, R, W, H) {
  const a = R.range(120, 180), h = (a * Math.sqrt(3)) / 2;
  const sub = (t, depth) => {
    if (depth > 0 && R.chance(0.45)) {
      const m = [0, 1, 2].map((k) => [(t[k][0] + t[(k + 1) % 3][0]) / 2, (t[k][1] + t[(k + 1) % 3][1]) / 2]);
      sub([t[0], m[0], m[2]], depth - 1);
      sub([m[0], t[1], m[1]], depth - 1);
      sub([m[2], m[1], t[2]], depth - 1);
      sub(m, depth - 1);
    } else {
      shape(g, () => poly(g, t), false);
      if (depth > 0 && R.chance(0.35)) {
        const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
        circle(g, cx, cy, Math.hypot(t[0][0] - t[1][0], t[0][1] - t[1][1]) * 0.17, false);
      }
    }
  };
  for (let row = -1; row * h < H + h; row++) {
    for (let col = -2; col * a < W + a; col++) {
      const x = col * a + (row & 1 ? a / 2 : 0), y = row * h;
      sub([[x, y + h], [x + a, y + h], [x + a / 2, y]], 2);
      sub([[x + a / 2, y], [x + a * 1.5, y], [x + a, y + h]], 2);
    }
  }
}

function opart(g, R, W, H) {
  const n = R.int(3, 5), s = W / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = i * s + s / 2, cy = j * s + s / 2;
      shape(g, () => g.rect(i * s, j * s, s, s), false);
      const k = R.int(3, 4);
      if ((i + j) % 2) for (let q = 1; q <= k; q++) circle(g, cx, cy, (s / 2) * (q / (k + 0.4)), false);
      else {
        for (let q = 1; q <= k; q++) {
          const r = (s / 2) * (q / (k + 0.2));
          shape(g, () => poly(g, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]]), false);
        }
      }
    }
  }
}

function geo(g, R, W, H) {
  R.pick([truchet, hexes, triangles, opart])(g, R, W, H);
  g.strokeRect(1, 1, W - 2, H - 2);
}

/* ---------- Motifs ---------- */

function motifs(g, R, W, H) {
  const theme = R.pick(['hearts', 'stars', 'flowers', 'mixed', 'bubbles']);
  const items = Array.from({ length: R.int(26, 36) }, () => R.range(80, 250)).sort((a, b) => b - a);
  for (const size of items) {
    const x = R.range(-20, W + 20), y = R.range(-20, H + 20), rot = R.range(-0.5, 0.5);
    const kind = theme === 'mixed' ? R.pick(['hearts', 'stars', 'flowers', 'bubbles']) : theme;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    if (kind === 'hearts') {
      shape(g, () => heartPath(g, 0, 0, size * 0.5));
      if (size > 110) shape(g, () => heartPath(g, 0, -size * 0.02, size * 0.27));
    } else if (kind === 'stars') {
      shape(g, () => poly(g, starPts(0, 0, size * 0.55, 5, 0.48, 0)));
      if (size > 110) shape(g, () => poly(g, starPts(0, 0, size * 0.26, 5, 0.48, 0)));
    } else if (kind === 'flowers') {
      blossom(g, R, 0, 0, size * 0.5, R.pick([5, 6]));
    } else {
      circle(g, 0, 0, size * 0.5);
      if (size > 100) circle(g, 0, 0, size * 0.3);
      if (size > 170) circle(g, 0, 0, size * 0.12);
    }
    g.restore();
  }
}

/* ---------- Abstrait ---------- */

function abstract(g, R, W, H) {
  const style = R.pick(['bands', 'circles', 'ribbons']);
  if (style === 'bands') {
    const n = R.int(7, 11), gap = H / (n + 1);
    const f1 = R.range(0.004, 0.009), f2 = R.range(0.012, 0.02), p1 = R() * TAU, p2 = R() * TAU;
    const F = (x) => Math.sin(x * f1 + p1) * 0.75 + Math.sin(x * f2 + p2) * 0.25;
    const curves = Array.from({ length: n }, (_, k) => {
      const amp = gap * R.range(0.8, 1.6);
      return (x) => gap * (k + 1) + F(x) * amp;
    });
    for (const c of curves) {
      g.beginPath();
      for (let x = -10; x <= W + 10; x += 8) (x < 0 ? g.moveTo : g.lineTo).call(g, x, c(x));
      g.stroke();
    }
    const bounds = [() => 0, ...curves, () => H];
    for (let k = 0; k < bounds.length - 1; k++) {
      for (let x = R.range(30, 140); x < W - 20; x += R.range(70, 190)) {
        const y0 = bounds[k](x), y1 = bounds[k + 1](x);
        if (Math.abs(y1 - y0) > 20) line(g, x, y0, x + R.range(-20, 20), y1);
      }
    }
  } else if (style === 'circles') {
    for (let i = 0; i < R.int(12, 18); i++) circle(g, R.range(0, W), R.range(0, H), R.range(70, 280), false);
  } else {
    for (let i = 0; i < R.int(3, 5); i++) {
      g.beginPath();
      spline(g, blobPts(R, R.range(150, W - 150), R.range(150, H - 150), R.range(110, 240), 7, 0.3), true);
      g.stroke();
    }
    for (let i = 0; i < R.int(4, 6); i++) {
      const pts = [];
      const vertical = R.chance(0.5);
      for (let t = -0.1; t <= 1.1; t += 0.2) pts.push(vertical ? [R.range(0, W), t * H] : [t * W, R.range(0, H)]);
      g.beginPath();
      spline(g, pts, false);
      g.stroke();
    }
  }
  g.strokeRect(1, 1, W - 2, H - 2);
}

const GEN = { mandala, kaleido, flowers, butterflies, ocean, landscape, glass, geo, motifs, abstract };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Page en noir et blanc (opaque), côté long = longSide pixels.
export function renderPage(kindId, num, longSide) {
  const kind = kindById(kindId), s = longSide / Math.max(kind.w, kind.h);
  const W = Math.round(kind.w * s), H = Math.round(kind.h * s);
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.scale(s, s);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.strokeStyle = '#000';
  g.fillStyle = '#fff';
  g.lineWidth = LW;
  GEN[kind.id](g, rng((hash(kind.id) ^ Math.imul(num, 2654435761)) >>> 0), kind.w, kind.h);
  return c;
}

// Noir sur blanc → traits noirs sur fond transparent.
export function toLineArt(canvas) {
  const x = canvas.getContext('2d'), img = x.getImageData(0, 0, canvas.width, canvas.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = 0;
    d[i + 3] = a;
  }
  x.putImageData(img, 0, 0);
  return canvas;
}
