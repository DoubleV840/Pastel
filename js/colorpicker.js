// Panneau couleur : roue (teinte + saturation/luminosité), palettes, harmonies,
// couleurs récentes et couleurs perso. Deux couleurs : principale et seconde
// (la seconde sert aux dégradés et aux motifs de remplissage).

import { S, saveSettings } from './settings.js';
import { ICONS } from './icons.js';
import { el, $, clamp, hexHsv, hsvHex, normHex, TAU } from './util.js';

export const PALETTES = [
  ['Douceur', ['#f7c5cc', '#f9d9b8', '#fbf0b3', '#cdeac0', '#b8e0e8', '#c9c6f0', '#e8c6ec', '#f4f1ea']],
  ['Printemps', ['#ff8fab', '#ffb3c6', '#ffe066', '#a7d676', '#5fb49c', '#6cc4dc', '#b79ced', '#fff1e6']],
  ['Arc-en-ciel', ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60']],
  ['Océan', ['#03396c', '#005b96', '#2a7fba', '#63aed6', '#9ed3e6', '#d3f0f5', '#1f6f6f', '#f2e8cf']],
  ['Coucher de soleil', ['#2b1d4e', '#6a2c70', '#b83b5e', '#f08a5d', '#ffb26b', '#f9ed69', '#ff7b54', '#ffd56b']],
  ['Forêt', ['#1b3a2f', '#2f5d3a', '#4f7d3a', '#8aa65a', '#c9cf8f', '#6b4e2e', '#a47148', '#e9dcc0']],
  ['Bonbons', ['#ff5d8f', '#ff97b7', '#ffcad4', '#9b5de5', '#00bbf9', '#00f5d4', '#fee440', '#f15bb5']],
  ['Terre', ['#5b3a29', '#8c5a3c', '#b97a56', '#d9a066', '#e6c79c', '#a3a380', '#6b705c', '#3f3a36']],
  ['Vintage', ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#8d6e63', '#d6ccc2', '#edede9']],
  ['Néon', ['#ff00a0', '#ff6b00', '#fff200', '#39ff14', '#00f0ff', '#6a00ff', '#ff2e63', '#08f7fe']],
  ['Nuit', ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#e0e1dd', '#5e548e', '#9f86c0', '#e0b1cb']],
  ['Carnations', ['#ffe0c7', '#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3317', '#3b2219']],
  ['Gris', ['#000000', '#2e2e2e', '#555555', '#7b7b7b', '#a3a3a3', '#c8c8c8', '#e6e6e6', '#ffffff']],
];

export class ColorPanel {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.target = 'color';
    this.tab = 'wheel';
    this.build();
  }

  get value() { return S[this.target]; }

  set(hex, { fromWheel = false } = {}) {
    S[this.target] = hex;
    saveSettings();
    if (!fromWheel) [this.h, this.s, this.v] = hexHsv(hex);
    this.refresh();
    this.onChange();
  }

  build() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.size = 248;
    this.root.innerHTML = '';
    this.c1 = el('button', { class: 'cp-sw', 'aria-label': 'Couleur principale', onclick: () => this.pick('color') });
    this.c2 = el('button', { class: 'cp-sw small', 'aria-label': 'Seconde couleur (dégradés, motifs)', onclick: () => this.pick('color2') });
    this.hex = el('input', { class: 'cp-hex', maxlength: 7, spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Code couleur' });
    this.hex.addEventListener('change', () => {
      const h = normHex(this.hex.value);
      if (h) this.set(h); else this.hex.value = this.value;
    });
    const swap = el('button', { class: 'icon-btn sm', 'aria-label': 'Inverser les deux couleurs', html: ICONS.swap, onclick: () => {
      [S.color, S.color2] = [S.color2, S.color];
      saveSettings();
      [this.h, this.s, this.v] = hexHsv(this.value);
      this.refresh();
      this.onChange();
    } });
    const head = el('div', { class: 'cp-head' }, el('div', { class: 'cp-pair' }, this.c1, this.c2), swap, this.hex);

    this.tabs = el('div', { class: 'seg' },
      el('button', { 'data-tab': 'wheel', onclick: () => this.showTab('wheel') }, 'Roue'),
      el('button', { 'data-tab': 'palettes', onclick: () => this.showTab('palettes') }, 'Palettes'));

    this.wheel = el('canvas', { class: 'cp-wheel', width: this.size * dpr, height: this.size * dpr, style: `width:${this.size}px;height:${this.size}px` });
    this.wheel.getContext('2d').scale(dpr, dpr);
    this.harm = el('div', { class: 'swatches' });
    this.wheelPane = el('div', { class: 'cp-pane' }, this.wheel, el('p', { class: 'cp-label' }, 'Harmonies'), this.harm);
    this.palPane = el('div', { class: 'cp-pane cp-pal' });
    this.recent = el('div', { class: 'swatches' });
    this.root.append(head, this.tabs, this.wheelPane, this.palPane, el('p', { class: 'cp-label' }, 'Récentes'), this.recent);
    this.bindWheel();
  }

  pick(target) {
    this.target = target;
    [this.h, this.s, this.v] = hexHsv(this.value);
    this.refresh();
  }

  open() {
    [this.h, this.s, this.v] = hexHsv(this.value);
    this.showTab(this.tab);
  }

  showTab(tab) {
    this.tab = tab;
    for (const b of this.tabs.children) b.classList.toggle('on', b.dataset.tab === tab);
    this.wheelPane.hidden = tab !== 'wheel';
    this.palPane.hidden = tab !== 'palettes';
    if (tab === 'palettes') this.renderPalettes();
    this.refresh();
  }

  swatch(hex, extra = {}) {
    return el('button', { class: 'sw', style: `--c:${hex}`, 'aria-label': hex, onclick: () => this.set(hex), ...extra });
  }

  renderPalettes() {
    const mine = el('div', { class: 'swatches' });
    for (const c of S.custom) {
      const b = this.swatch(c);
      let t;
      b.addEventListener('pointerdown', () => {
        t = setTimeout(() => {
          if (confirm('Retirer cette couleur de « Mes couleurs » ?')) {
            S.custom = S.custom.filter((x) => x !== c);
            saveSettings();
            this.renderPalettes();
          }
        }, 650);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(t));
      mine.append(b);
    }
    mine.append(el('button', { class: 'sw add', 'aria-label': 'Ajouter la couleur actuelle', html: ICONS.plus, onclick: () => {
      if (!S.custom.includes(this.value)) S.custom = [...S.custom, this.value].slice(-24);
      saveSettings();
      this.renderPalettes();
    } }));
    this.palPane.replaceChildren(
      el('p', { class: 'cp-label' }, 'Mes couleurs ', el('span', { class: 'hint' }, '(appui long pour retirer)')), mine,
      ...PALETTES.flatMap(([name, cols]) => [el('p', { class: 'cp-label' }, name), el('div', { class: 'swatches' }, cols.map((c) => this.swatch(c)))]),
    );
  }

  refresh() {
    this.c1.style.setProperty('--c', S.color);
    this.c2.style.setProperty('--c', S.color2);
    this.c1.classList.toggle('on', this.target === 'color');
    this.c2.classList.toggle('on', this.target === 'color2');
    if (document.activeElement !== this.hex) this.hex.value = this.value;
    this.recent.replaceChildren(...(S.recent.length ? S.recent.map((c) => this.swatch(c)) : [el('span', { class: 'hint' }, 'Les couleurs utilisées apparaîtront ici.')]));
    if (this.tab === 'wheel') {
      this.drawWheel();
      const h = this.h, s = this.s, v = this.v;
      const harm = [
        hsvHex(h + 180, s, v), hsvHex(h - 30, s, v), hsvHex(h + 30, s, v), hsvHex(h + 120, s, v), hsvHex(h - 120, s, v),
        hsvHex(h, s * 0.5, Math.min(1, v + 0.25)), hsvHex(h, Math.min(1, s + 0.15), v * 0.6),
      ];
      this.harm.replaceChildren(...harm.map((c) => this.swatch(c)));
    }
  }

  geom() {
    const R = this.size / 2, ring = 26, inner = R - ring - 6, side = inner * Math.SQRT2 * 0.94;
    return { R, cx: R, cy: R, ring, side, sx: R - side / 2, sy: R - side / 2 };
  }

  drawWheel() {
    const g = this.wheel.getContext('2d'), { R, cx, cy, ring, side, sx, sy } = this.geom();
    g.clearRect(0, 0, this.size, this.size);
    for (let a = 0; a < 360; a += 1) {
      g.beginPath();
      g.arc(cx, cy, R - ring / 2 - 1, ((a - 90.6) * Math.PI) / 180, ((a - 89.2) * Math.PI) / 180);
      g.lineWidth = ring;
      g.strokeStyle = hsvHex(a, 1, 1);
      g.stroke();
    }
    g.fillStyle = hsvHex(this.h, 1, 1);
    g.fillRect(sx, sy, side, side);
    let gr = g.createLinearGradient(sx, 0, sx + side, 0);
    gr.addColorStop(0, '#fff');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(sx, sy, side, side);
    gr = g.createLinearGradient(0, sy, 0, sy + side);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, '#000');
    g.fillStyle = gr;
    g.fillRect(sx, sy, side, side);
    const ha = ((this.h - 90) * Math.PI) / 180, hr = R - ring / 2 - 1;
    this.marker(g, cx + Math.cos(ha) * hr, cy + Math.sin(ha) * hr, hsvHex(this.h, 1, 1));
    this.marker(g, sx + this.s * side, sy + (1 - this.v) * side, this.value);
  }

  marker(g, x, y, fill) {
    g.beginPath();
    g.arc(x, y, 9, 0, TAU);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#fff';
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.arc(x, y, 10.5, 0, TAU);
    g.stroke();
  }

  bindWheel() {
    let zone = null;
    const handle = (e) => {
      const r = this.wheel.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const { R, cx, cy, side, sx, sy } = this.geom();
      if (!zone) zone = Math.hypot(x - cx, y - cy) > R - 34 ? 'ring' : 'square';
      if (zone === 'ring') this.h = ((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90 + 360) % 360;
      else {
        this.s = clamp((x - sx) / side, 0, 1);
        this.v = clamp(1 - (y - sy) / side, 0, 1);
      }
      this.set(hsvHex(this.h, this.s, this.v), { fromWheel: true });
    };
    this.wheel.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      zone = null;
      this.wheel.setPointerCapture(e.pointerId);
      handle(e);
      this.wheel.onpointermove = handle;
    });
    const stop = () => { this.wheel.onpointermove = null; };
    this.wheel.addEventListener('pointerup', stop);
    this.wheel.addEventListener('pointercancel', stop);
  }
}

export function colorButtonUpdate(btn) {
  $('.c1', btn).style.background = S.color;
  $('.c2', btn).style.background = S.color2;
}
