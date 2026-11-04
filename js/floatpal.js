// Petite fenêtre de palette détachée : on la déplace où l'on veut en la
// tirant par sa barre ou son cadre ; position, palette et disposition sont mémorisées.

import { S, saveSettings } from './settings.js';
import { PALETTES } from './colorpicker.js';
import { ICONS } from './icons.js';
import { t } from './i18n.js';
import { menu, bounce } from './ui.js';
import { el, clamp } from './util.js';
import { ToneSlider, toneOf } from './tone.js';

const fp = () => (S.floatPal ||= { id: null, open: false, x: null, y: null, wide: false });

export class FloatPalette {
  constructor(root, onPick) {
    this.root = root;
    this.onPick = onPick;
    this.build();
    addEventListener('resize', () => { if (!root.hidden) this.place(); });
  }

  colors() {
    const id = fp().id;
    if (id === 'custom') return S.custom;
    if (id === 'recent') return S.recent;
    return (PALETTES.find((p) => p[0] === id) || PALETTES[0])[1];
  }

  title() {
    const id = fp().id;
    return id === 'custom' ? t('cp.mine') : id === 'recent' ? t('cp.recent') : t('pal.' + (PALETTES.find((p) => p[0] === id) || PALETTES[0])[0]);
  }

  build() {
    this.name = el('button', { class: 'fp-name', 'aria-label': t('fp.choose'), onclick: () => this.choose() });
    this.head = el('div', { class: 'fp-head' },
      el('span', { class: 'fp-grip', 'aria-label': t('fp.move'), html: ICONS.grip }),
      this.name,
      el('button', { class: 'icon-btn sm', 'aria-label': t('fp.layout'), html: ICONS.layout, onclick: () => {
        fp().wide = !fp().wide;
        saveSettings();
        this.render();
        this.place();
      } }),
      el('button', { class: 'icon-btn sm', 'aria-label': t('btn.close'), html: ICONS.close, onclick: () => this.hide() }));
    this.grid = el('div', { class: 'fp-swatches' });
    this.tone = new ToneSlider('color', () => this.onPick());
    this.root.replaceChildren(this.head, this.grid, this.tone.el);
    this.bindDrag();
  }

  show(id) {
    if (id) fp().id = id;
    if (!fp().id) fp().id = PALETTES[0][0];
    fp().open = true;
    saveSettings();
    this.root.hidden = false;
    this.render();
    this.place();
    bounce(this.root, 'fp-in', false, 500);
  }

  hide() {
    fp().open = false;
    saveSettings();
    this.root.hidden = true;
  }

  restore() {
    if (fp().open) this.show();
    else this.root.hidden = true;
  }

  render() {
    if (this.root.hidden) return;
    this.name.innerHTML = '';
    this.name.append(el('span', {}, this.title()), el('i', { html: ICONS.chevron }));
    const cols = this.colors(), base = toneOf('color').base;
    this.tone.update();
    this.grid.style.setProperty('--cols', fp().wide ? Math.min(8, Math.max(1, cols.length)) : Math.min(4, Math.max(1, cols.length)));
    this.grid.replaceChildren(...(cols.length
      ? cols.map((c) => el('button', {
        class: 'sw' + (c === base ? ' on' : ''), style: `--c:${c}`, 'aria-label': c,
        onclick: () => {
          S.color = c;
          saveSettings();
          this.onPick();
        },
      }))
      : [el('span', { class: 'hint' }, t('fp.empty'))]));
  }

  choose() {
    const items = [['custom', t('cp.mine')], ['recent', t('cp.recent')], ...PALETTES.map(([id]) => [id, t('pal.' + id)])];
    menu(t('fp.choose'), items.map(([id, label]) => ({
      label: label + (id === fp().id ? '  ✓' : ''), icon: 'palette',
      onClick: () => { fp().id = id; saveSettings(); this.render(); this.place(); },
    })));
  }

  // Garde la fenêtre entièrement visible.
  place() {
    const r = this.root.getBoundingClientRect();
    const x = fp().x ?? innerWidth - r.width - 90, y = fp().y ?? 84;
    this.root.style.left = clamp(x, 6, Math.max(6, innerWidth - r.width - 6)) + 'px';
    this.root.style.top = clamp(y, 6, Math.max(6, innerHeight - r.height - 6)) + 'px';
  }

  bindDrag() {
    let start = null;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, .tone')) return;
      e.preventDefault();
      const r = this.root.getBoundingClientRect();
      start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
      this.root.setPointerCapture(e.pointerId);
      this.root.classList.add('dragging');
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!start) return;
      fp().x = start.x + e.clientX - start.px;
      fp().y = start.y + e.clientY - start.py;
      this.place();
    });
    const end = () => {
      if (!start) return;
      start = null;
      this.root.classList.remove('dragging');
      const r = this.root.getBoundingClientRect();
      fp().x = r.left;
      fp().y = r.top;
      saveSettings();
    };
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
  }
}
