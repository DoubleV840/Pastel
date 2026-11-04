// Éléments d'interface partagés : chargement, feuilles modales, contrôles.

import { $, el } from './util.js';
import { ICONS } from './icons.js';

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
      el('button', { class: 'icon-btn sm', 'aria-label': 'Fermer', html: ICONS.close, onclick: close })),
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
