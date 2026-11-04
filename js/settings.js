// Réglages et préférences de l'appareil (localStorage).

const KEY = 'pastel.v1';

const DEFAULTS = {
  finger: 'auto',        // auto | draw | nav
  pressure: 'normal',    // soft | normal | firm
  smoothing: 0.3,
  left: false,           // curseurs à droite (gaucher)
  stayInside: true,
  anim: true,
  sound: true,
  volume: 0.6,
  floatPal: { id: null, open: false, x: null, y: null, wide: false },
  penSeen: false,
  tool: 'pencil-color',
  prevTool: 'pencil-color',
  groupTool: {},
  tools: {},             // id → { size, opacity }
  color: '#e4572e',
  color2: '#ffffff',
  recent: [],
  custom: [],
  pageKind: 'mandala',
};

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const S = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch { /* navigation privée : réglages non conservés */ }
}

export function addRecent(color) {
  S.recent = [color, ...S.recent.filter((c) => c !== color)].slice(0, 14);
  saveSettings();
}
