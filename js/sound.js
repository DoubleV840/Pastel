// Sons de dessin synthétisés en direct (Web Audio), sans fichier audio.
// Chaque famille d'outils a sa texture : bruit doux filtré dont le volume suit
// la vitesse du trait et la pression, plus quelques ornements (gouttes pour
// l'aquarelle, clochettes pour les paillettes). Tout reste discret et filtré.

import { S } from './settings.js';

let ctx = null, master = null, noise = null;

const level = () => (S.sound === false ? 0 : (S.volume ?? 0.6));
export const soundOn = () => S.sound !== false;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  // « ambient » : se mélange à la musique et respecte le mode silencieux.
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* non pris en charge */ }
  ctx = new AC();
  const soften = ctx.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 8500;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.ratio.value = 4;
  master = ctx.createGain();
  master.gain.value = level();
  master.connect(soften);
  soften.connect(comp);
  comp.connect(ctx.destination);
  // Bruit rose (plus doux que le blanc), 2 s en boucle.
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  noise = buf;
  return ctx;
}

const ready = () => soundOn() && ctx && ctx.state === 'running';

// Safari n'autorise le son qu'après un geste : appelé à chaque toucher.
export function unlockAudio() {
  if (!soundOn()) return;
  const c = ensure();
  if (c && c.state !== 'running') c.resume().catch(() => {});
}

export function setVolume() {
  if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05);
  if (soundOn()) unlockAudio();
}

/* ---------- Petits sons ponctuels ---------- */

function env(g, peak, attack, decay, at = ctx.currentTime) {
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function tone(freq, peak, decay, { type = 'sine', at = ctx.currentTime, to = null, glide = 0.08 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + glide);
  env(g, peak, 0.005, decay, at);
  o.connect(g);
  g.connect(master);
  o.start(at);
  o.stop(at + decay + 0.05);
}

// Gamme pentatonique aiguë : toujours harmonieuse, quel que soit l'ordre.
const SCALE = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3, 2637];
let lastNote = -1;
function chime(at = ctx.currentTime, gain = 1) {
  let i;
  do i = (Math.random() * SCALE.length) | 0; while (i === lastNote);
  lastNote = i;
  const f = SCALE[i];
  tone(f, 0.05 * gain, 0.7, { at });
  tone(f * 2.01, 0.014 * gain, 0.32, { at });
  tone(f * 3.98, 0.005 * gain, 0.18, { at });
}

// Goutte d'eau : petit « ploc » qui monte.
function drop(gain = 0.045, at = ctx.currentTime) {
  const f = 420 + Math.random() * 260;
  tone(f, gain, 0.11, { at, to: f * 2.1, glide: 0.06 });
}

function noiseBurst({ type, from, to, q = 1, peak, dur, at = ctx.currentTime }) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + Math.min(0.04, dur * 0.2));
  g.gain.setValueAtTime(peak, at + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.12);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(at, Math.random() * 1.5);
  src.stop(at + dur + 0.2);
}

// Remplissage : de la peinture qu'on verse (résonance qui monte, comme un
// récipient qui se remplit), quelques bulles, puis une note douce.
export function playFill(ms = 400) {
  if (!ready()) return;
  const now = ctx.currentTime, d = Math.max(0.25, ms / 1000);
  noiseBurst({ type: 'lowpass', from: 320, to: 1300, q: 5, peak: 0.16, dur: d });
  for (let i = 0; i < 3; i++) drop(0.035, now + Math.random() * d * 0.8);
  tone(784, 0.025, 0.5, { at: now + d });
  tone(1175, 0.018, 0.6, { at: now + d + 0.06 });
}

export function playPick() {
  if (ready()) tone(1250, 0.05, 0.08, { to: 820, glide: 0.05 });
}

// Choix d'un outil : petit « toc » boisé.
export function playTick() {
  if (!ready()) return;
  tone(660, 0.035, 0.07, { type: 'triangle', to: 520, glide: 0.04 });
}

export function playSwish(dir) {
  if (!ready()) return;
  noiseBurst({ type: 'bandpass', from: dir < 0 ? 2600 : 700, to: dir < 0 ? 700 : 2600, q: 1.2, peak: 0.07, dur: 0.16 });
}

export function playSparkle() {
  if (!ready()) return;
  const now = ctx.currentTime;
  [0, 4, 2, 5, 7].forEach((n, i) => {
    lastNote = -1;
    const f = SCALE[n];
    tone(f, 0.05, 0.8, { at: now + i * 0.08 });
    tone(f * 2.01, 0.012, 0.35, { at: now + i * 0.08 });
  });
}

/* ---------- Son continu pendant un trait ---------- */

// filter / f / q : couleur du bruit ; gain : volume ; ref : vitesse (px/s) du
// volume plein ; grain : irrégularité ; am : frottement (Hz) ; constant :
// souffle même immobile ; drops / chimes : ornements par seconde ou par trajet.
const FAMILY = {
  pencil: { filter: 'bandpass', f: 3400, q: 0.8, gain: 0.5, ref: 700, grain: 0.45 },
  marker: { filter: 'bandpass', f: 1900, q: 1.5, gain: 0.34, ref: 800, grain: 0.08 },
  brush: { filter: 'lowpass', f: 1150, q: 0.8, gain: 0.5, ref: 1000, grain: 0.15 },
  water: { filter: 'lowpass', f: 720, q: 0.9, gain: 0.48, ref: 1000, grain: 0.1, drops: 0.7 },
  pastel: { filter: 'bandpass', f: 1650, q: 0.7, gain: 0.52, ref: 700, grain: 0.8 },
  air: { filter: 'highpass', f: 4200, q: 0.4, gain: 0.14, constant: true },
  glitter: { filter: 'highpass', f: 6000, q: 0.5, gain: 0.07, ref: 900, chimes: 1 },
  blend: { filter: 'lowpass', f: 460, q: 0.8, gain: 0.58, ref: 900, grain: 0.1 },
  eraser: { filter: 'bandpass', f: 980, q: 1.3, gain: 0.48, ref: 700, am: 24 },
};
const TOOL = {
  'pencil-fine': { f: 4600, gain: 0.4 },
  'pencil-soft': { f: 2500 },
  'pencil-sketch': { gain: 0.38 },
  'marker-highlight': { f: 1400, gain: 0.3 },
  'brush-oil': { f: 850, grain: 0.3 },
  'water-dry': { f: 1300, grain: 0.4, drops: 0.25 },
  'pastel-crayon': { f: 2300, grain: 0.6 },
  'pastel-charcoal': { f: 1250 },
  'air-spray': { f: 3300, gain: 0.2 },
  'air-splatter': { filter: 'lowpass', f: 1100, gain: 0.07, constant: false, ref: 900, drops: 3 },
  'glitter-stars': { chimes: 0.55 },
  'glitter-gel': { filter: 'lowpass', f: 1300, gain: 0.3, chimes: 0.6 },
  'blend-blur': { f: 360 },
  'erase-soft': { filter: 'lowpass', f: 850, am: 0 },
};

export function startStroke(tool) {
  if (!ready() || !FAMILY[tool.group]) return null;
  const p = { ...FAMILY[tool.group], ...TOOL[tool.id] }, now = ctx.currentTime;
  const src = ctx.createBufferSource(), filt = ctx.createBiquadFilter(), amp = ctx.createGain();
  src.buffer = noise;
  src.loop = true;
  filt.type = p.filter;
  filt.frequency.value = p.f;
  filt.Q.value = p.q;
  amp.gain.value = 0;
  src.connect(filt);
  filt.connect(amp);
  let out = amp, lfo = null;
  if (p.am) {
    // Gomme : frottement saccadé (modulation d'amplitude).
    out = ctx.createGain();
    out.gain.value = 0.6;
    lfo = ctx.createOscillator();
    lfo.frequency.value = p.am;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth);
    depth.connect(out.gain);
    amp.connect(out);
    lfo.start(now);
  }
  out.connect(master);
  src.start(now, Math.random() * 1.5);
  return { p, src, filt, amp, lfo, dist: 0, nextChime: 30 + Math.random() * 60 };
}

// speed : px d'écran par seconde ; pressure : 0..1 ; dt : secondes.
export function updateStroke(v, speed, pressure, dt) {
  if (!v || !ctx) return;
  const p = v.p, now = ctx.currentTime;
  const s = p.constant ? 1 : Math.min(1, Math.pow(speed / p.ref, 0.7));
  let g = p.gain * 0.45 * s * (0.35 + 0.65 * pressure);
  if (p.grain) g *= 1 - p.grain * Math.random() * 0.6;
  v.amp.gain.setTargetAtTime(g, now, p.constant ? 0.06 : 0.035);
  v.filt.frequency.setTargetAtTime(p.f * (0.85 + 0.3 * s) * (0.95 + Math.random() * 0.1), now, 0.05);
  v.dist += speed * dt;
  if (p.chimes) {
    while (v.dist > v.nextChime) {
      chime(now, 0.8 + pressure * 0.4);
      v.nextChime += (110 + Math.random() * 140) / p.chimes;
    }
  }
  if (p.drops && speed > 40 && Math.random() < p.drops * dt) drop();
}

export function endStroke(v) {
  if (!v || !ctx) return;
  const now = ctx.currentTime;
  v.amp.gain.cancelScheduledValues(now);
  v.amp.gain.setTargetAtTime(0, now, 0.05);
  v.src.stop(now + 0.4);
  v.lfo?.stop(now + 0.4);
}
