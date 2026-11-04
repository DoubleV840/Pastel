// Éléments d'interface partagés : chargement, feuilles modales, contrôles.

import { $, el } from './util.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';
import { S } from './settings.js';

/* ---------- Animations ---------- */

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
export const animOn = () => S.anim !== false && !reduce.matches;

export function applyMotionPref() {
  document.documentElement.classList.toggle('no-anim', !animOn());
}
reduce.addEventListener?.('change', applyMotionPref);

// (Re)lance une animation CSS portée par une classe, retirée après `ms`.
// keep = true : ne relance pas une animation déjà en cours.
export function bounce(node, cls, keep = false, ms = 900) {
  if (!node || !animOn()) return;
  if (keep && node.classList.contains(cls)) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  node._anim ||= {};
  clearTimeout(node._anim[cls]);
  node._anim[cls] = setTimeout(() => node.classList.remove(cls), ms);
}

export function confetti(colors) {
  if (!animOn()) return;
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  const c = el('canvas', { class: 'confetti', width: W * dpr, height: H * dpr });
  document.body.append(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const parts = Array.from({ length: 150 }, (_, i) => ({
    x: W / 2 + (Math.random() - 0.5) * 160, y: H * 0.62,
    vx: (Math.random() - 0.5) * 15, vy: -9 - Math.random() * 13,
    r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 5, c: colors[i % colors.length], round: Math.random() < 0.3,
  }));
  const t0 = performance.now();
  const frame = (now) => {
    const k = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 1.3) / 0.6);
    for (const p of parts) {
      p.vy += 0.42;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.h * 0.6, 0, 6.28); g.fill(); }
      else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
      g.restore();
    }
    if (k < 1.9) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

export function busy(msg) {
  const b = $('#busy');
  if (msg) {
    $('p', b).textContent = msg;
    b.hidden = false;
  } else b.hidden = true;
}

// actions : [{ label, primary, danger, onClick(close) }] ; un clic sans onClick ferme.
export function sheet({ title, body, actions = [], wide = false, onClose }) {
  const modal = el('div', { class: 'modal' });
  const close = () => {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 180);
    onClose?.();
  };
  const buttons = actions.map((a) => el('button', {
    class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''),
    onclick: () => (a.onClick ? a.onClick(close) : close()),
  }, a.label));
  const box = el('div', { class: 'sheet' + (wide ? ' wide' : '') },
    el('div', { class: 'sheet-head' }, el('h2', {}, title),
      el('button', { class: 'icon-btn sm', 'aria-label': t('btn.close'), html: ICONS.close, onclick: close })),
    el('div', { class: 'sheet-body' }, body),
    buttons.length ? el('div', { class: 'sheet-actions' }, buttons) : null);
  modal.append(box);
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  document.body.append(modal);
  requestAnimationFrame(() => modal.classList.add('show'));
  return { close, buttons, box };
}

// Liste d'actions simple (menu).
export function menu(title, items) {
  const list = el('div', { class: 'menu-list' });
  const s = sheet({ title, body: list });
  for (const it of items) {
    list.append(el('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''),
      html: (it.icon ? ICONS[it.icon] : '') + `<span>${it.label}</span>`,
      onclick: () => { s.close(); it.onClick(); },
    }));
  }
  return s;
}

export function segmented(options, value, onChange) {
  const root = el('div', { class: 'seg' });
  const set = (v) => { for (const b of root.children) b.classList.toggle('on', b.dataset.v === String(v)); };
  for (const [v, label] of options) {
    root.append(el('button', { 'data-v': v, onclick: () => { set(v); onChange(v); } }, label));
  }
  set(value);
  return root;
}

export function field(label, ...children) {
  return el('div', { class: 'field' }, el('label', {}, label), ...children);
}

export function range({ min, max, step = 1, value, onInput }) {
  const out = el('output');
  const input = el('input', { type: 'range', min, max, step, value });
  const sync = () => { out.textContent = input.value; };
  input.addEventListener('input', () => { sync(); onInput(Number(input.value)); });
  sync();
  return el('div', { class: 'range' }, input, out);
}

export function check(label, value, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'check' }, input, el('span', {}, label));
}

// Sélecteur de fichier image (photothèque, appareil photo ou Fichiers sur iPad).
export function pickImage() {
  return new Promise((res) => {
    const input = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    input.addEventListener('change', () => { res(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}
