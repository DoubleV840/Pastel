// Moteur de tracé. Chaque trait est d'abord accumulé dans `accum` (empreintes
// de pointe), puis grain du papier et masque « rester dans les traits » donnent
// `display`, enfin la couche couleur est recomposée depuis `backup` (état avant
// le trait) sur la seule zone touchée. L'aperçu vaut donc le rendu final.

import {
  TAU, clamp, makeCanvas, freeCanvas, clipRect, rectEmpty, rectAdd, rectInt,
  hexToRgb, shade, hsvHex,
} from './util.js';
import { stamp, tinted, stampVariants, grainTile } from './brushes.js';

const RAINBOW = Array.from({ length: 12 }, (_, i) => hsvHex(i * 30, 0.6, 1));

const mid = (a, b) => ({
  x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2,
  alt: (a.alt + b.alt) / 2, az: b.az, pen: b.pen,
});

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class Engine {
  constructor() {
    this.accum = makeCanvas(1, 1);
    this.display = makeCanvas(1, 1);
    this.temps = {};
    this.patterns = {};
    this.s = null;
  }

  // doc : { w, h, paint, backup } (canvas de la couche couleur et sa copie).
  attach(doc) {
    this.doc = doc;
    this.W = doc.w;
    this.H = doc.h;
    this.accum.width = this.display.width = doc.w;
    this.accum.height = this.display.height = doc.h;
    this.actx = this.accum.getContext('2d');
    this.dctx = this.display.getContext('2d');
    this.pctx = doc.paint.getContext('2d');
    this.patterns = {};
  }

  release() {
    freeCanvas(this.accum);
    freeCanvas(this.display);
    for (const t of Object.values(this.temps)) freeCanvas(t);
    this.temps = {};
  }

  tmp(name, w, h = w) {
    let c = this.temps[name];
    if (!c) c = this.temps[name] = makeCanvas(w, h);
    else if (c.width < w || c.height < h) {
      c.width = Math.max(c.width, Math.ceil(w));
      c.height = Math.max(c.height, Math.ceil(h));
    }
    return c;
  }

  pattern(tex, amount) {
    const key = tex + amount;
    return this.patterns[key] || (this.patterns[key] = this.dctx.createPattern(grainTile(tex, amount), 'repeat'));
  }

  get active() { return !!this.s; }

  /* ---------- Cycle d'un trait ---------- */

  // o : { size, opacity, color, smoothing } ; pt : { x, y, p, alt, az, pen }
  begin(tool, o, pt, mask) {
    const s = this.s = {
      tool, o, mask, size: o.size, opacity: o.opacity, color: o.color,
      frame: rectEmpty(), total: rectEmpty(), pts: [], sm: null, raw: null,
      next: 0, dir: 0, dirSet: false, travel: 0, curved: false,
      variants: stampVariants(tool.dab),
    };
    if (tool.dab === 'bristle') {
      const n = clamp(Math.round(s.size / 2.2), 8, 26);
      s.bristles = Array.from({ length: n }, (_, i) => ({
        off: ((i + Math.random() * 0.8) / n) * 2 - 1,
        w: 0.6 + Math.random() * 0.6,
        a: 0.45 + Math.random() * 0.55,
        c: (Math.random() * 4) | 0,
      }));
      s.bcols = [s.color, shade(s.color, -0.14), shade(s.color, 0.14), shade(s.color, -0.28)];
    }
    if (tool.dab === 'glitter' || tool.dab === 'gel' || tool.dab === 'stars') {
      const c = s.color;
      s.gcols = [shade(c, -0.45), shade(c, -0.25), c, c, shade(c, 0.2), shade(c, 0.45)];
    }
    if (tool.kind === 'smudge') {
      s.D = Math.ceil(s.size) + 2;
      s.buf = this.tmp('smudge', s.D);
      s.bctx = s.buf.getContext('2d');
      s.bctx.clearRect(0, 0, s.buf.width, s.buf.height);
      s.first = true;
    }
    if (tool.kind === 'smudge' || tool.kind === 'blur') s.stamp = stamp(tool.dab, 0);
    this.addPoint(pt);
  }

  addPoint(raw) {
    const s = this.s;
    if (!s) return;
    const k = 1 - s.o.smoothing * 0.85;
    let p;
    if (!s.sm) p = { ...raw };
    else {
      const q = s.sm;
      p = {
        x: q.x + (raw.x - q.x) * k, y: q.y + (raw.y - q.y) * k,
        p: q.p + (raw.p - q.p) * Math.min(1, k * 1.5),
        alt: raw.alt, az: raw.az, pen: raw.pen,
      };
    }
    s.sm = p;
    s.raw = raw;
    const pts = s.pts;
    pts.push(p);
    if (pts.length === 1) { this.dab(p); return; }
    if (pts.length === 2) return;
    const [a, b, c] = pts;
    this.curve(s.curved ? mid(a, b) : a, b, mid(b, c));
    s.curved = true;
    pts.shift();
  }

  // Trait continu tant que le stylet reste immobile (aérographe, bombe).
  hold() {
    const s = this.s;
    if (s && s.sm && s.tool.buildup) this.dab(s.sm);
  }

  curve(p0, c, p1) {
    const len = Math.hypot(c.x - p0.x, c.y - p0.y) + Math.hypot(p1.x - c.x, p1.y - c.y);
    const steps = clamp(Math.ceil(len / 4), 1, 64);
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const q = {
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
        p: p0.p + (p1.p - p0.p) * t,
        alt: p0.alt + (p1.alt - p0.alt) * t,
        az: p1.az, pen: p1.pen,
      };
      this.walk(prev, q);
      prev = q;
    }
  }

  walk(a, b) {
    const s = this.s;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 1e-3) return;
    const ang = Math.atan2(dy, dx);
    s.dir = s.dirSet ? angleLerp(s.dir, ang, 0.3) : ang;
    s.dirSet = true;
    let d = s.next;
    while (d <= len) {
      const t = d / len;
      const q = {
        x: a.x + dx * t, y: a.y + dy * t, p: a.p + (b.p - a.p) * t,
        alt: a.alt + (b.alt - a.alt) * t, az: b.az, pen: b.pen,
      };
      this.dab(q);
      d += this.spacing(q.p);
    }
    s.next = d - len;
    s.travel += len;
  }

  spacing(p) {
    const s = this.s, T = s.tool;
    return Math.max(0.5, s.size * (1 - T.pSize + T.pSize * p) * T.spacing);
  }

  /* ---------- Empreintes ---------- */

  dab(q) {
    const s = this.s, T = s.tool, R = Math.random, p = q.p;
    let size = s.size * (1 - T.pSize + T.pSize * p);
    let alpha = (T.flow ?? 1) * (1 - T.pFlow + T.pFlow * p);
    let ratio = T.ratio || 1, angle = 0, tilted = false;
    // Crayon incliné : la mine s'élargit et ombre plus légèrement.
    if (T.tilt && q.pen) {
      const tilt = 1 - q.alt / (Math.PI / 2);
      if (tilt > 0.35) {
        const k = (tilt - 0.35) / 0.65;
        size *= 1 + k * 2.2;
        alpha *= 1 - k * 0.5;
        ratio *= 1 - k * 0.55;
        angle = q.az;
        tilted = true;
      }
    }
    if (T.angle === 'azimuth') angle = q.pen ? q.az : -Math.PI / 4;
    else if (T.angle === 'fixed') angle = T.angleValue;
    else if (T.angle === 'direction') angle = s.dir + Math.PI / 2;
    else if (T.angle === 'random' && !tilted) angle = R() * TAU;
    if (T.jSize) size *= 1 + (R() * 2 - 1) * T.jSize;
    let x = q.x, y = q.y;
    if (T.jPos) {
      x += (R() * 2 - 1) * T.jPos * size;
      y += (R() * 2 - 1) * T.jPos * size;
    }
    const r = Math.max(0.35, size / 2);

    if (T.kind === 'smudge') this.smudgeDab(x, y, r, clamp(s.opacity * (1 - T.pFlow + T.pFlow * p), 0, 1));
    else if (T.kind === 'blur') this.blurDab(x, y, r, clamp(s.opacity * (1 - T.pFlow + T.pFlow * p), 0, 1));
    else {
      const ctx = this.actx;
      switch (T.dab) {
        case 'spray': this.spray(ctx, x, y, r, alpha); break;
        case 'splatter': this.splatter(ctx, x, y, r, alpha); break;
        case 'glitter': this.glitter(ctx, x, y, r, T.density, T.rainbow); break;
        case 'stars': this.stars(ctx, x, y, r); break;
        case 'gel':
          this.stampDab(ctx, 'soft50', 0, x, y, r, 0.22, 1, 0);
          this.glitter(ctx, x, y, r * 0.85, T.density, false);
          break;
        case 'bristle': this.bristle(ctx, x, y, r, alpha); break;
        default:
          this.stampDab(ctx, T.dab, (R() * s.variants) | 0, x, y, r, alpha, ratio, angle);
      }
      ctx.globalAlpha = 1;
    }
    const m = r * 1.35 + 2;
    rectAdd(s.frame, x - m, y - m, x + m, y + m);
  }

  stampDab(ctx, name, v, x, y, r, a, ratio, angle) {
    const img = tinted(name, v, this.s.color);
    ctx.globalAlpha = clamp(a, 0, 1);
    if (ratio === 1 && angle === 0) ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    else {
      const c = Math.cos(angle), sn = Math.sin(angle);
      ctx.setTransform(c, sn, -sn * ratio, c * ratio, x, y);
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  spray(ctx, x, y, r, a) {
    const R = Math.random, n = clamp(Math.round(r * r * 0.012 * (this.s.tool.density || 1)) + 2, 2, 260);
    ctx.fillStyle = this.s.color;
    for (let i = 0; i < n; i++) {
      const ang = R() * TAU, d = r * Math.min(1, Math.sqrt(-2 * Math.log(R() + 1e-9)) * 0.42);
      const ps = 0.8 + R() * 1.6;
      ctx.globalAlpha = a * (0.4 + 0.6 * R());
      ctx.fillRect(x + Math.cos(ang) * d - ps / 2, y + Math.sin(ang) * d - ps / 2, ps, ps);
    }
  }

  splatter(ctx, x, y, r, a) {
    const R = Math.random, n = 1 + ((R() * 3) | 0);
    ctx.fillStyle = this.s.color;
    ctx.globalAlpha = a;
    for (let i = 0; i < n; i++) {
      const ang = R() * TAU, d = r * Math.pow(R(), 0.7) * 1.1;
      const rad = Math.max(1, r * 0.22 * Math.pow(R(), 2.2));
      ctx.beginPath();
      ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, rad, 0, TAU);
      ctx.fill();
    }
  }

  glitter(ctx, x, y, r, density = 1, rainbow = false) {
    const R = Math.random, s = this.s;
    const n = clamp(Math.round(r * 0.9 * density), 2, 120);
    for (let i = 0; i < n; i++) {
      const ang = R() * TAU, d = r * Math.sqrt(R());
      const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      const ps = Math.min(r, 1.4 + R() * 2.8);
      const w = R();
      ctx.fillStyle = w < 0.12 ? '#ffffff' : rainbow ? RAINBOW[(R() * RAINBOW.length) | 0] : s.gcols[(R() * s.gcols.length) | 0];
      ctx.globalAlpha = 0.75 + 0.25 * R();
      const rot = R() * TAU, c = Math.cos(rot), sn = Math.sin(rot);
      ctx.setTransform(c, sn, -sn, c, px, py);
      ctx.fillRect(-ps / 2, -ps / 2, ps, ps);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  stars(ctx, x, y, r) {
    const R = Math.random, s = this.s;
    const n = 1 + (R() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const ang = R() * TAU, d = r * Math.sqrt(R());
      const px = x + Math.cos(ang) * d, py = y + Math.sin(ang) * d;
      const sz = r * (0.15 + 0.45 * R() * R()) + 1.5;
      const rot = (R() - 0.5) * 0.5;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = s.gcols[(R() * s.gcols.length) | 0];
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = rot + (i * Math.PI) / 4, rr = i % 2 ? sz * 0.22 : sz;
        const fx = px + Math.cos(a - Math.PI / 2) * rr, fy = py + Math.sin(a - Math.PI / 2) * rr;
        if (i) ctx.lineTo(fx, fy); else ctx.moveTo(fx, fy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, sz * 0.14, 0, TAU);
      ctx.fill();
    }
  }

  bristle(ctx, x, y, r, a) {
    const s = this.s;
    const perp = s.dir + Math.PI / 2, cx = Math.cos(perp), cy = Math.sin(perp);
    const load = Math.max(0.35, 1 - s.travel / (s.size * 70));
    for (const b of s.bristles) {
      const br = Math.max(0.6, r * 0.16 * b.w);
      ctx.globalAlpha = clamp(a * b.a * load * (0.85 + 0.3 * Math.random()), 0, 1);
      ctx.drawImage(tinted('hard', 0, s.bcols[b.c]), x + cx * b.off * r - br, y + cy * b.off * r - br, br * 2, br * 2);
    }
  }

  // Estompe : dépose la couleur ramassée (sans jamais « effacer » vers le
  // papier), puis en ramasse sous la pointe.
  smudgeDab(x, y, r, a) {
    const s = this.s, pc = this.pctx, paint = this.doc.paint;
    const sx = x - r, sy = y - r, sz = 2 * r, D = s.D;
    if (s.first) {
      s.bctx.drawImage(paint, sx, sy, sz, sz, 0, 0, D, D);
      s.first = false;
      return;
    }
    const t = this.tmp('dep', D), tc = t.getContext('2d');
    tc.globalCompositeOperation = 'copy';
    tc.drawImage(s.buf, 0, 0, D, D, 0, 0, D, D);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(s.stamp, 0, 0, D, D);
    pc.globalAlpha = a;
    pc.drawImage(t, 0, 0, D, D, sx, sy, sz, sz);
    pc.globalAlpha = 1;
    const k = s.tool.pickup, bc = s.bctx;
    bc.globalAlpha = k;
    bc.globalCompositeOperation = 'destination-out';
    bc.fillRect(0, 0, D, D);
    bc.globalCompositeOperation = 'lighter';
    bc.drawImage(paint, sx, sy, sz, sz, 0, 0, D, D);
    bc.globalCompositeOperation = 'source-over';
    bc.globalAlpha = 1;
  }

  blurDab(x, y, r, a) {
    const s = this.s, pc = this.pctx;
    const sz = Math.max(4, Math.ceil(r * 2)), sx = Math.round(x - r), sy = Math.round(y - r);
    const sm = Math.max(2, Math.round(sz / 6));
    const small = this.tmp('blurS', sm), sc = small.getContext('2d');
    sc.globalCompositeOperation = 'copy';
    sc.drawImage(this.doc.paint, sx, sy, sz, sz, 0, 0, sm, sm);
    const t = this.tmp('blurB', sz), tc = t.getContext('2d');
    tc.globalCompositeOperation = 'copy';
    tc.drawImage(small, 0, 0, sm, sm, 0, 0, sz, sz);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(s.stamp, 0, 0, sz, sz);
    pc.globalAlpha = a;
    pc.globalCompositeOperation = 'destination-out';
    pc.drawImage(s.stamp, sx, sy, sz, sz);
    pc.globalCompositeOperation = 'lighter';
    pc.drawImage(t, 0, 0, sz, sz, sx, sy, sz, sz);
    pc.globalCompositeOperation = 'source-over';
    pc.globalAlpha = 1;
  }

  /* ---------- Composition ---------- */

  needsDisplay() {
    const s = this.s, T = s.tool;
    return !!(T.grain || s.mask || T.edge || T.bleed);
  }

  buildDisplay([x, y, w, h]) {
    const s = this.s, T = s.tool, d = this.dctx;
    d.save();
    clipRect(d, x, y, w, h);
    d.clearRect(x, y, w, h);
    d.drawImage(this.accum, x, y, w, h, x, y, w, h);
    if (T.grain) {
      d.globalCompositeOperation = 'destination-in';
      d.fillStyle = this.pattern(T.grain[0], T.grain[1]);
      d.fillRect(x, y, w, h);
    }
    if (s.mask) this.applyMask(d, [x, y, w, h]);
    d.restore();
  }

  applyMask(ctx, [x, y, w, h]) {
    const m = this.s.mask;
    ctx.save();
    clipRect(ctx, x, y, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(m.canvas, m.x, m.y);
    ctx.restore();
  }

  composite([x, y, w, h], src) {
    const s = this.s, T = s.tool, p = this.pctx;
    p.save();
    clipRect(p, x, y, w, h);
    p.clearRect(x, y, w, h);
    p.drawImage(this.doc.backup, x, y, w, h, x, y, w, h);
    p.globalAlpha = s.opacity;
    p.globalCompositeOperation = T.erase ? 'destination-out' : T.blend || 'source-over';
    p.drawImage(src, x, y, w, h, x, y, w, h);
    p.restore();
  }

  // Estompe et flou travaillent directement sur la couleur : hors du masque,
  // on remet l'état d'avant le trait.
  keepInside([x, y, w, h]) {
    const m = this.s.mask, t = this.tmp('keep', w, h), tc = t.getContext('2d');
    tc.clearRect(0, 0, t.width, t.height);
    tc.drawImage(this.doc.paint, x, y, w, h, 0, 0, w, h);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(m.canvas, m.x - x, m.y - y);
    tc.globalCompositeOperation = 'source-over';
    const p = this.pctx;
    p.save();
    clipRect(p, x, y, w, h);
    p.clearRect(x, y, w, h);
    p.drawImage(this.doc.backup, x, y, w, h, x, y, w, h);
    p.globalCompositeOperation = 'destination-out';
    p.drawImage(m.canvas, m.x, m.y);
    p.globalCompositeOperation = 'source-over';
    p.drawImage(t, 0, 0, w, h, x, y, w, h);
    p.restore();
  }

  flush() {
    const s = this.s;
    if (!s) return;
    const R = rectInt(s.frame, this.W, this.H);
    s.frame = rectEmpty();
    if (!R) return;
    rectAdd(s.total, R[0], R[1], R[0] + R[2], R[1] + R[3]);
    if (s.tool.kind === 'paint') {
      if (this.needsDisplay()) {
        this.buildDisplay(R);
        this.composite(R, this.display);
      } else this.composite(R, this.accum);
    } else if (s.mask) this.keepInside(R);
  }

  // Aquarelle : bord plus foncé là où le pigment s'accumule, et diffusion.
  watercolor([x, y, w, h]) {
    const s = this.s, T = s.tool, d = this.dctx;
    const img = d.getImageData(x, y, w, h), a = img.data;
    const f = 8, sw = Math.max(1, Math.ceil(w / f)), sh = Math.max(1, Math.ceil(h / f));
    const sm = this.tmp('wc', sw, sh), sc = sm.getContext('2d');
    sc.clearRect(0, 0, sm.width, sm.height);
    sc.drawImage(this.display, x, y, w, h, 0, 0, sw, sh);
    const sa = sc.getImageData(0, 0, sw, sh).data;
    const [cr, cg, cb] = hexToRgb(s.color);
    const edgeK = (T.edge || 0) * 2.2, bleed = (T.bleed || 0) * 0.75;
    for (let j = 0; j < h; j++) {
      const fy = clamp((j + 0.5) / f - 0.5, 0, sh - 1), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4, A = a[k + 3] / 255;
        if (!A && !bleed) continue;
        const fx = clamp((i + 0.5) / f - 0.5, 0, sw - 1), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const s00 = sa[(y0 * sw + x0) * 4 + 3], s10 = sa[(y0 * sw + x1) * 4 + 3];
        const s01 = sa[(y1 * sw + x0) * 4 + 3], s11 = sa[(y1 * sw + x1) * 4 + 3];
        const B = ((s00 + (s10 - s00) * tx) * (1 - ty) + (s01 + (s11 - s01) * tx) * ty) / 255;
        let na = A;
        if (edgeK && A > 0) na = Math.min(1, A + Math.max(0, A - B) * edgeK);
        if (bleed) na = Math.max(na, B * bleed);
        if (na !== A) {
          if (!A) { a[k] = cr; a[k + 1] = cg; a[k + 2] = cb; }
          a[k + 3] = na * 255;
        }
      }
    }
    d.putImageData(img, x, y);
    if (s.mask) this.applyMask(d, [x, y, w, h]);
  }

  // Termine le trait ; renvoie la zone modifiée [x, y, w, h] pour l'historique.
  end() {
    const s = this.s;
    if (!s) return null;
    const pts = s.pts;
    if (pts.length >= 2) {
      const [a, b] = pts.slice(-2);
      this.walk(s.curved ? mid(a, b) : a, b);
    }
    if (s.raw && s.sm) this.walk(s.sm, s.raw);
    this.flush();
    const T = s.tool;
    if (T.kind === 'paint' && (T.edge || T.bleed)) {
      const m = T.bleed ? s.size * 0.6 : 2;
      const R = rectInt([s.total[0] - m, s.total[1] - m, s.total[2] + m, s.total[3] + m], this.W, this.H);
      if (R) {
        rectAdd(s.total, R[0], R[1], R[0] + R[2], R[1] + R[3]);
        this.buildDisplay(R);
        this.watercolor(R);
        this.composite(R, this.display);
      }
    }
    const R = rectInt(s.total, this.W, this.H);
    if (R) {
      this.actx.clearRect(...R);
      this.dctx.clearRect(...R);
    }
    this.s = null;
    return R;
  }

  cancel() {
    const s = this.s;
    if (!s) return;
    const all = [...s.total];
    rectAdd(all, s.frame[0], s.frame[1], s.frame[2], s.frame[3]);
    const R = rectInt(all, this.W, this.H);
    if (R) {
      const [x, y, w, h] = R, p = this.pctx;
      p.save();
      clipRect(p, x, y, w, h);
      p.clearRect(x, y, w, h);
      p.drawImage(this.doc.backup, x, y, w, h, x, y, w, h);
      p.restore();
      this.actx.clearRect(x, y, w, h);
      this.dctx.clearRect(x, y, w, h);
    }
    this.s = null;
  }
}
