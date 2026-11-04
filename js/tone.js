// Curseur de nuance : à partir de la couleur choisie (la « base »), glisser
// vers la gauche la fonce, vers la droite l'éclaircit, sans changer de teinte.
// Dès que la couleur est changée ailleurs (palette, roue, pipette…), elle
// devient la nouvelle base.

import { S, saveSettings } from './settings.js';
import { el, clamp, toneColor } from './util.js';
import { t } from './i18n.js';

export const TONE_STEPS = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8];

export function toneOf(target) {
  const v = S.tone?.[target];
  if (v && v.base && toneColor(v.base, v.t) === S[target]) return v;
  return { base: S[target], t: 0 };
}

export function applyTone(target, value) {
  const { base } = toneOf(target);
  S.tone = { ...(S.tone || {}), [target]: { base, t: value } };
  S[target] = toneColor(base, value);
  saveSettings();
}

export class ToneSlider {
  constructor(target, onChange) {
    this.target = target;
    this.onChange = onChange;
    this.thumb = el('div', { class: 'tone-thumb' });
    this.track = el('div', { class: 'tone-track', role: 'slider', 'aria-label': t('tone.aria') }, el('i', { class: 'tone-mid' }), this.thumb);
    this.el = el('div', { class: 'tone' }, this.track);
    this.bind();
    this.update();
  }

  setTarget(target) {
    this.target = target;
    this.update();
  }

  update() {
    const { base, t: v } = toneOf(this.target);
    const stops = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((k) => `${toneColor(base, k)} ${((k + 1) / 2) * 100}%`);
    this.track.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
    this.thumb.style.left = ((v + 1) / 2) * 100 + '%';
    this.thumb.style.setProperty('--c', S[this.target]);
    this.track.setAttribute('aria-valuenow', Math.round(v * 100));
  }

  bind() {
    const set = (e) => {
      const r = this.track.getBoundingClientRect();
      let v = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      if (Math.abs(v) < 0.05) v = 0; // petit cran sur la couleur d'origine
      applyTone(this.target, Math.round(v * 100) / 100);
      this.update();
      this.onChange();
    };
    this.track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.track.setPointerCapture(e.pointerId);
      this.track.classList.add('active');
      set(e);
      this.track.onpointermove = set;
    });
    const end = () => {
      this.track.onpointermove = null;
      this.track.classList.remove('active');
    };
    this.track.addEventListener('pointerup', end);
    this.track.addEventListener('pointercancel', end);
  }
}
