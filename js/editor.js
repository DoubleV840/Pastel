// Écran de dessin : vue (zoom, déplacement), saisie Apple Pencil / doigt /
// souris, outils, historique, enregistrement automatique et export.

import { S, saveSettings, addRecent } from './settings.js';
import { GROUPS, TOOLS, PAPERS, LINE_COLORS, paperById, lineColorById, paperTile } from './brushes.js';
import { Engine } from './engine.js';
import { computeRegions, labelAt, regionMask, floodMask, releaseRegions } from './regions.js';
import { renderFill, fillSwatch } from './fill.js';
import { ColorPanel, colorButtonUpdate } from './colorpicker.js';
import { store } from './store.js';
import { ICONS } from './icons.js';
import { busy, sheet, segmented, field, range, check, animOn, bounce, confetti, applyMotionPref } from './ui.js';
import {
  $, $$, el, clamp, makeCanvas, freeCanvas, clipRect, canvasToBlob, loadImage, toast, nextFrame,
  rgbToHex, hexToRgb, tileNoise,
} from './util.js';
import { t, LANGS, lang, setLang } from './i18n.js';
import { FloatPalette } from './floatpal.js';
import {
  unlockAudio, setVolume, startStroke, updateStroke, endStroke, playFill, playPick, playTick, playSwish, playSparkle,
} from './sound.js';

const vp = $('#viewport'), stage = $('#stage'), cvPaint = $('#cv-paint'), cvLines = $('#cv-lines');
const engine = new Engine(), pvEngine = new Engine();
const view = { s: 1, tx: 0, ty: 0, fit: 1 };
const UNDO_BYTES = 180e6, UNDO_STEPS = 60;

let doc = null, pctx = null, bctx = null;
let onClose = () => {};
let colorPanel, floatPal;

/* ---------- Outils et réglages ---------- */

const tool = () => TOOLS[S.tool] || TOOLS['pencil-color'];

function toolCfg(t = tool()) {
  const c = S.tools[t.id] || {};
  return { size: c.size ?? t.size, opacity: c.opacity ?? t.opacity ?? 1 };
}

function setToolCfg(patch) {
  const t = tool();
  S.tools[t.id] = { ...toolCfg(t), ...patch };
  saveSettings();
}

function selectTool(id) {
  const t = TOOLS[id];
  if (!t) return;
  if (t.kind === 'picker' && tool().kind !== 'picker') S.prevTool = S.tool;
  S.tool = id;
  if (t.kind !== 'picker') S.groupTool[t.group] = id;
  saveSettings();
  refreshDock();
  refreshSliders();
}

function pressureCurve(p) {
  if (S.pressure === 'soft') return Math.pow(p, 0.6);
  if (S.pressure === 'firm') return Math.pow(p, 1.6);
  return p;
}

/* ---------- Dock, fenêtres d'outils et de couleurs ---------- */

function buildDock() {
  const dock = $('#dock');
  dock.replaceChildren();
  for (const g of GROUPS) {
    dock.append(el('button', {
      class: 'tool-btn', 'data-group': g.id, 'aria-label': g.name,
      html: ICONS[g.icon] + `<span>${g.name}</span>`, onclick: () => groupTap(g),
    }));
  }
  dock.append(el('span', { class: 'dock-sep' }));
  dock.append(el('button', {
    class: 'color-btn', id: 'color-btn', 'aria-label': t('colors'),
    html: '<span class="c2"></span><span class="c1"></span>', onclick: () => togglePop('color'),
  }));
}

function refreshDock() {
  const t = tool();
  for (const b of $$('#dock .tool-btn')) b.classList.toggle('on', b.dataset.group === t.group);
  document.documentElement.style.setProperty('--tip', S.color);
  colorButtonUpdate($('#color-btn'));
}

function groupTap(g) {
  playTick();
  if (g.id === 'picker') {
    selectTool('picker');
    closePops();
  } else if (tool().group === g.id) togglePop('tool');
  else {
    selectTool(S.groupTool[g.id] || g.tools[0].id);
    closePops();
    bounce($(`#dock .tool-btn[data-group="${g.id}"]`), 'bounce');
    toast(tool().name, 1200);
  }
}

let pop = null;
function togglePop(which) {
  if (pop === which) closePops();
  else openPop(which);
}

function openPop(which) {
  closePops();
  pop = which;
  const p = $(which === 'tool' ? '#tool-pop' : '#color-pop');
  if (which === 'tool') renderToolPop();
  else colorPanel.open();
  p.hidden = false;
  bounce(p, 'opening');
  positionPop(p, which);
}

function closePops() {
  pop = null;
  $('#tool-pop').hidden = true;
  $('#color-pop').hidden = true;
}

function positionPop(p, which) {
  const anchor = which === 'tool' ? $(`#dock .tool-btn[data-group="${tool().group}"]`) : $('#color-btn');
  const r = anchor.getBoundingClientRect(), pw = p.offsetWidth;
  p.style.left = clamp(r.left + r.width / 2 - pw / 2, 10, innerWidth - pw - 10) + 'px';
  p.style.bottom = innerHeight - $('#dock').getBoundingClientRect().top + 10 + 'px';
}

function renderToolPop() {
  const cur = tool(), g = GROUPS.find((x) => x.id === cur.group);
  const list = el('div', { class: 'variants' + (g.id === 'fill' ? ' fills' : '') });
  for (const v of g.tools) {
    const b = el('button', {
      class: 'variant' + (v.id === cur.id ? ' on' : ''), style: `--i:${list.children.length}`,
      onclick: () => { selectTool(v.id); renderToolPop(); },
    });
    if (v.kind === 'fill') {
      const sw = fillSwatch(v.fill, S.color, S.color2, 96);
      sw.className = 'fill-sw';
      b.append(sw);
    } else {
      const c = makeCanvas(360, 88);
      c.className = 'pv';
      renderPreview(v, c);
      b.append(c);
    }
    b.append(el('span', {}, v.name));
    list.append(b);
  }
  const hint = g.id === 'fill'
    ? t('hint.fill')
    : g.id === 'blend' ? t('hint.blend') : null;
  $('#tool-pop').replaceChildren(el('div', { class: 'pop-head' }, el('b', {}, g.name)), list, ...(hint ? [el('p', { class: 'pop-hint' }, hint)] : []));
}

let pvBackup = null;
function renderPreview(t, c) {
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  if (!pvBackup || pvBackup.width !== W || pvBackup.height !== H) pvBackup = makeCanvas(W, H);
  const b = pvBackup.getContext('2d');
  b.clearRect(0, 0, W, H);
  if (t.kind === 'smudge' || t.kind === 'blur' || t.erase) {
    [S.color, '#f4b942', '#4a90d9'].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(W * (0.1 + i * 0.28), H * 0.1, W * 0.22, H * 0.8);
    });
    b.drawImage(c, 0, 0);
  }
  pvEngine.attach({ w: W, h: H, paint: c, backup: pvBackup });
  const size = clamp(t.size * 0.9, 3, H * 0.42);
  const pt = (k) => ({
    x: W * 0.07 + k * W * 0.86, y: H / 2 + Math.sin(k * Math.PI * 2) * H * 0.2,
    p: 0.25 + 0.75 * Math.sin(k * Math.PI), alt: Math.PI / 2, az: 0, pen: true,
  });
  pvEngine.begin(t, { size, opacity: t.opacity ?? 1, color: S.color, smoothing: 0 }, pt(0), null);
  for (let i = 1; i <= 48; i++) {
    pvEngine.addPoint(pt(i / 48));
    if (i % 8 === 0) pvEngine.flush();
  }
  pvEngine.end();
}

function onColorChange() {
  refreshDock();
  floatPal.render();
  bounce($('#color-btn'), 'pulse', true);
  if (pop === 'tool') renderToolPop();
}

/* ---------- Curseurs verticaux (taille, opacité) ---------- */

function vslider(root, { onInput, format, onStart, onEnd }) {
  const track = $('.track', root), fill = $('.fill', root), thumb = $('.thumb', root), bubble = $('.bubble', root);
  let value = 0.5;
  const set = (v) => {
    value = clamp(v, 0, 1);
    fill.style.height = value * 100 + '%';
    thumb.style.bottom = `calc(${value * 100}% - 13px)`;
  };
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    root.classList.add('active');
    onStart?.();
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      set(1 - (ev.clientY - r.top) / r.height);
      onInput(value);
      bubble.textContent = format();
    };
    move(e);
    track.onpointermove = move;
    track.onpointerup = track.onpointercancel = () => {
      track.onpointermove = null;
      root.classList.remove('active');
      onEnd?.();
    };
  });
  return { set };
}

const sizeFromV = (t, v) => t.min * Math.pow(t.max / t.min, v);
const vFromSize = (t, s) => Math.log(s / t.min) / Math.log(t.max / t.min);
let sizeSlider, opSlider;

function initSliders() {
  sizeSlider = vslider($('#sl-size'), {
    onInput: (v) => { setToolCfg({ size: Math.round(sizeFromV(tool(), v) * 10) / 10 }); showSizePreview(true); },
    format: () => `${Math.round(toolCfg().size)} px`,
    onEnd: () => showSizePreview(false),
  });
  opSlider = vslider($('#sl-opacity'), {
    onInput: (v) => { setToolCfg({ opacity: Math.round(Math.max(0.02, v) * 100) / 100 }); showSizePreview(true); },
    format: () => `${Math.round(toolCfg().opacity * 100)} %`,
    onEnd: () => showSizePreview(false),
  });
}

function refreshSliders() {
  const t = tool(), c = toolCfg(t);
  $('#sl-size').classList.toggle('off', !t.size);
  $('#sl-opacity').classList.toggle('off', t.kind === 'picker');
  if (t.size) sizeSlider.set(vFromSize(t, c.size));
  opSlider.set(c.opacity);
  $('#ed-sliders').classList.toggle('right', S.left);
}

function showSizePreview(on) {
  const p = $('#size-preview'), t = tool();
  if (!on || !t.size) { p.hidden = true; return; }
  const d = Math.max(2, toolCfg().size * view.s);
  p.style.width = p.style.height = d + 'px';
  p.style.background = t.erase ? 'transparent' : S.color;
  p.style.opacity = toolCfg().opacity;
  p.hidden = false;
}

/* ---------- Vue ---------- */

function applyView() {
  stage.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`;
}

function fit() {
  if (!doc) return;
  const top = 76, bottom = 104, side = innerWidth > 700 ? 84 : 16;
  const s = Math.min((innerWidth - side * 2) / doc.w, (innerHeight - top - bottom) / doc.h);
  view.s = view.fit = s;
  view.tx = (innerWidth - doc.w * s) / 2;
  view.ty = top + (innerHeight - top - bottom - doc.h * s) / 2;
  applyView();
}

const minScale = () => (doc ? Math.min(innerWidth / doc.w, innerHeight / doc.h) * 0.4 : 0.1);
const toDoc = (cx, cy) => [(cx - view.tx) / view.s, (cy - view.ty) / view.s];

let badgeTimer;
function zoomBadge() {
  const b = $('#zoom-badge');
  b.textContent = Math.round((view.s / view.fit) * 100) + ' %';
  b.hidden = false;
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => { b.hidden = true; }, 900);
}

/* ---------- Saisie ---------- */

const touches = new Map();
let mode = null;            // draw | fill | pick | gesture
let drawId = null, drawType = null, drawStart = 0, drawTravel = 0, lastClient = null;
let gesture = null, longPress = null, lastMove = 0, lastHold = 0, raf = 0;
let fillState = null;
let voice = null, sndT = 0, sndDist = 0, sndP = 0.5;

const fingerDraws = () => S.finger === 'draw' || (S.finger === 'auto' && !S.penSeen);

function ptFrom(e, x, y) {
  const pen = e.pointerType === 'pen';
  let p = 0.75, alt = Math.PI / 2, az = 0;
  if (pen) {
    p = pressureCurve(clamp(e.pressure || 0.5, 0.04, 1));
    if (typeof e.altitudeAngle === 'number' && e.altitudeAngle > 0) {
      alt = e.altitudeAngle;
      az = e.azimuthAngle || 0;
    } else if (e.tiltX || e.tiltY) {
      const tx = Math.tan((e.tiltX * Math.PI) / 180), ty = Math.tan((e.tiltY * Math.PI) / 180);
      az = Math.atan2(ty, tx);
      alt = Math.atan(1 / Math.hypot(tx, ty));
    }
  }
  return { x, y, p, alt, az, pen };
}

function onDown(e) {
  if (!doc) return;
  e.preventDefault();
  if (pop) { closePops(); return; }
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'draw' && drawType === 'pen') return;
    if (mode === 'pick' && drawType === 'touch' && touches.size > 1) return;
    if (touches.size >= 2) {
      if (mode && drawType === 'touch') {
        if (performance.now() - drawStart < 350 || drawTravel < 40) cancelAction();
        else return;
      }
      if (mode === 'gesture') rebaseGesture();
      else if (!mode) startGesture();
      return;
    }
    if (mode) return;
    if (fingerDraws()) startAction(e);
    else startGesture(e);
    return;
  }
  if (e.pointerType === 'pen' && !S.penSeen) {
    S.penSeen = true;
    saveSettings();
    if (S.finger === 'auto') toast(t('toast.pen'), 3500);
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (mode === 'gesture') endGesture(false);
  if (mode) return;
  startAction(e);
}

function startAction(e) {
  finishFillAnim();
  unlockAudio();
  const t = tool(), [x, y] = toDoc(e.clientX, e.clientY);
  try { vp.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  drawId = e.pointerId;
  drawType = e.pointerType;
  drawStart = performance.now();
  drawTravel = 0;
  lastClient = { x: e.clientX, y: e.clientY };
  if (t.kind === 'picker') {
    mode = 'pick';
    playPick();
    pickAt(x, y);
    return;
  }
  if (t.kind === 'fill') {
    fillBegin(x, y);
    return;
  }
  mode = 'draw';
  const c = toolCfg(t);
  const mask = S.stayInside && doc.regions ? maskAt(x, y) : null;
  const pt = ptFrom(e, x, y);
  engine.begin(t, { size: c.size, opacity: c.opacity, color: S.color, smoothing: S.smoothing }, pt, mask);
  lastMove = sndT = performance.now();
  sndDist = 0;
  sndP = pt.p;
  voice = startStroke(t);
  startLoop();
}

function onMove(e) {
  if (!doc) return;
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    const t = touches.get(e.pointerId);
    t.x = e.clientX;
    t.y = e.clientY;
    if (mode === 'gesture') { updateGesture(); return; }
  }
  if (e.pointerId !== drawId) {
    if (e.pointerType !== 'touch') hoverCursor(e);
    return;
  }
  if (e.pointerType !== 'touch') hoverCursor(e);
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  let x = 0, y = 0;
  for (const ev of evs.length ? evs : [e]) {
    [x, y] = toDoc(ev.clientX, ev.clientY);
    const moved = Math.hypot(ev.clientX - lastClient.x, ev.clientY - lastClient.y);
    drawTravel += moved;
    sndDist += moved;
    lastClient = { x: ev.clientX, y: ev.clientY };
    if (mode === 'draw') {
      const pt = ptFrom(ev, x, y);
      sndP = pt.p;
      engine.addPoint(pt);
    }
  }
  lastMove = performance.now();
  if (mode === 'fill' && fillState?.tool.drag) {
    if (drawTravel > 12) fillState.dragging = true;
    if (fillState.dragging) {
      fillState.end = { x, y };
      fillState.dirty = true;
    }
  } else if (mode === 'pick') pickAt(x, y);
}

function onUp(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (mode === 'gesture') {
      if (touches.size === 0) endGesture(true);
      else rebaseGesture();
      return;
    }
  }
  if (e.pointerId === drawId) finishAction();
}

function finishAction() {
  if (mode === 'draw') {
    stopLoop();
    endStroke(voice);
    voice = null;
    commit(engine.end());
    addRecent(S.color);
    floatPal.render();
  } else if (mode === 'fill') fillEnd();
  else if (mode === 'pick') pickEnd();
  mode = null;
  drawId = null;
}

function cancelAction() {
  endStroke(voice);
  voice = null;
  if (mode === 'draw') engine.cancel();
  else if (mode === 'fill' && fillState) {
    const { m } = fillState;
    restoreRect([m.x, m.y, m.w, m.h]);
    fillState = null;
  } else if (mode === 'pick') pickEnd(true);
  stopLoop();
  mode = null;
  drawId = null;
}

function startLoop() {
  if (raf) return;
  const loop = (t) => {
    raf = requestAnimationFrame(loop);
    if (fillAnim) stepFillAnim(t);
    if (mode === 'draw') {
      if (tool().buildup && t - lastMove > 60 && t - lastHold > 40) {
        engine.hold();
        lastHold = t;
      }
      engine.flush();
      if (voice) {
        const dt = Math.max(0.001, (t - sndT) / 1000);
        updateStroke(voice, sndDist / dt, sndP, dt);
        sndDist = 0;
        sndT = t;
      }
    } else if (mode === 'fill' && fillState?.dirty) renderFillPreview();
  };
  raf = requestAnimationFrame(loop);
}

function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

/* Gestes : pincer pour zoomer, glisser pour déplacer, toucher à 2 ou 3 doigts. */

function touchCenter() {
  const pts = [...touches.values()].slice(0, 2);
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length, y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  return { x, y, d, n: pts.length };
}

function startGesture(e) {
  mode = 'gesture';
  const c = touchCenter();
  gesture = { s0: view.s, tx0: view.tx, ty0: view.ty, c0: c, max: touches.size, t0: performance.now(), moved: 0 };
  clearTimeout(longPress);
  // Appui long d'un doigt (hors paume) : pipette.
  if (e && touches.size === 1 && !(e.width > 60)) {
    const id = e.pointerId;
    longPress = setTimeout(() => {
      if (mode !== 'gesture' || touches.size !== 1 || gesture.moved > 10 || !touches.has(id)) return;
      const p = touches.get(id), [x, y] = toDoc(p.x, p.y);
      view.s = gesture.s0; view.tx = gesture.tx0; view.ty = gesture.ty0;
      applyView();
      mode = 'pick';
      drawId = id;
      drawType = 'touch';
      lastClient = { x: p.x, y: p.y };
      playPick();
      pickAt(x, y);
    }, 480);
  }
}

function rebaseGesture() {
  if (!gesture) return startGesture();
  gesture.s0 = view.s;
  gesture.tx0 = view.tx;
  gesture.ty0 = view.ty;
  gesture.c0 = touchCenter();
  gesture.max = Math.max(gesture.max, touches.size);
}

function updateGesture() {
  const c = touchCenter(), g = gesture;
  if (c.n !== g.c0.n) { rebaseGesture(); return; }
  const ns = clamp(c.n > 1 && g.c0.d > 0 ? g.s0 * (c.d / g.c0.d) : g.s0, minScale(), 12);
  const qx = (g.c0.x - g.tx0) / g.s0, qy = (g.c0.y - g.ty0) / g.s0;
  view.s = ns;
  view.tx = c.x - qx * ns;
  view.ty = c.y - qy * ns;
  g.moved = Math.max(g.moved, Math.hypot(c.x - g.c0.x, c.y - g.c0.y) + Math.abs(c.d - g.c0.d));
  applyView();
  if (c.n > 1) zoomBadge();
}

function endGesture(allowTap) {
  clearTimeout(longPress);
  const g = gesture;
  if (allowTap && g && performance.now() - g.t0 < 320 && g.moved < 14) {
    if (g.max === 2) undo();
    else if (g.max >= 3) redo();
  }
  gesture = null;
  mode = null;
}

function onWheel(e) {
  if (!doc) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const ns = clamp(view.s * Math.exp(-e.deltaY * 0.01), minScale(), 12);
    const [qx, qy] = toDoc(e.clientX, e.clientY);
    view.s = ns;
    view.tx = e.clientX - qx * ns;
    view.ty = e.clientY - qy * ns;
    zoomBadge();
  } else {
    view.tx -= e.deltaX;
    view.ty -= e.deltaY;
  }
  applyView();
}

function hoverCursor(e) {
  const c = $('#cursor'), t = tool();
  if (!t.size || e.type === 'pointerleave' || (mode === 'draw' && e.pointerType === 'pen')) { c.hidden = true; return; }
  const d = Math.max(4, toolCfg().size * view.s);
  c.style.width = c.style.height = d + 'px';
  c.style.transform = `translate(${e.clientX - d / 2}px, ${e.clientY - d / 2}px)`;
  c.hidden = false;
}

/* ---------- Remplissage et pipette ---------- */

function maskAt(x, y) {
  const id = labelAt(doc.regions, x, y);
  return id ? regionMask(doc.regions, id, 3) : null;
}

function fillBegin(x, y) {
  let m = null;
  if (doc.regions) {
    const id = labelAt(doc.regions, x, y, 4);
    if (id) m = regionMask(doc.regions, id, 3);
  } else if (x >= 0 && y >= 0 && x < doc.w && y < doc.h) {
    m = floodMask(pctx.getImageData(0, 0, doc.w, doc.h).data, doc.w, doc.h, x, y);
  }
  if (!m) return;
  mode = 'fill';
  fillState = { m, start: { x, y }, end: null, tool: tool(), alpha: toolCfg().opacity, dirty: false, dragging: false };
  startLoop();
}

const fillCanvas = (fs) => renderFill(fs.tool.fill, fs.m, S.color, S.color2, { start: fs.start, end: fs.end, unit: Math.max(doc.w, doc.h) / 2048 });

function drawFillRegion(m, src, alpha) {
  pctx.save();
  clipRect(pctx, m.x, m.y, m.w, m.h);
  pctx.clearRect(m.x, m.y, m.w, m.h);
  pctx.drawImage(doc.backup, m.x, m.y, m.w, m.h, m.x, m.y, m.w, m.h);
  pctx.globalAlpha = alpha;
  pctx.drawImage(src, m.x, m.y);
  pctx.restore();
}

// Dégradé tiré au doigt : aperçu direct à chaque image.
function renderFillPreview() {
  const c = fillCanvas(fillState);
  drawFillRegion(fillState.m, c, fillState.alpha);
  freeCanvas(c);
  fillState.dirty = false;
}

function fillEnd() {
  stopLoop();
  const fs = fillState, { m } = fs;
  if (fs.dragging) {
    if (fs.dirty) renderFillPreview();
    commit([m.x, m.y, m.w, m.h]);
    playFill(250);
  } else {
    const c = fillCanvas(fs);
    ripple(lastClient, S.color);
    if (animOn()) startFillAnim(m, c, fs.start, fs.alpha);
    else {
      drawFillRegion(m, c, fs.alpha);
      freeCanvas(c);
      commit([m.x, m.y, m.w, m.h]);
    }
    playFill(fillAnim ? fillAnim.dur : 250);
  }
  addRecent(S.color);
  floatPal.render();
  fillState = null;
}

/* Remplissage progressif : la couleur coule depuis le point touché en suivant
   la forme de la zone (distance mesurée à l'intérieur de la zone, calculée en
   basse résolution), avec un front légèrement ondulé. */

let fillAnim = null, wobble = null;

function geodesic(mask, w, h, seed) {
  const dist = new Float32Array(w * h).fill(Infinity);
  const hi = [], hd = [];
  const push = (i, d) => {
    let k = hi.length;
    hi.push(i);
    hd.push(d);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hd[p] <= d) break;
      hi[k] = hi[p];
      hd[k] = hd[p];
      k = p;
    }
    hi[k] = i;
    hd[k] = d;
  };
  const pop = () => {
    const top = hi[0], li = hi.pop(), ld = hd.pop(), n = hi.length;
    if (n) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= n) break;
        if (c + 1 < n && hd[c + 1] < hd[c]) c++;
        if (hd[c] >= ld) break;
        hi[k] = hi[c];
        hd[k] = hd[c];
        k = c;
      }
      hi[k] = li;
      hd[k] = ld;
    }
    return top;
  };
  dist[seed] = 0;
  push(seed, 0);
  while (hi.length) {
    const i = pop(), d = dist[i], x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!mask[j]) continue;
        const nd = d + (dx && dy ? Math.SQRT2 : 1);
        if (nd < dist[j]) { dist[j] = nd; push(j, nd); }
      }
    }
  }
  return dist;
}

function startFillAnim(m, c, start, alpha) {
  const f = Math.max(1, Math.ceil(Math.max(m.w, m.h) / 300));
  const lw = Math.ceil(m.w / f), lh = Math.ceil(m.h / f), low = new Uint8Array(lw * lh);
  for (let y = 0; y < m.h; y++) {
    const row = ((y / f) | 0) * lw;
    for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) low[row + ((x / f) | 0)] = 1;
  }
  const sx = clamp(Math.floor((start.x - m.x) / f), 0, lw - 1), sy = clamp(Math.floor((start.y - m.y) / f), 0, lh - 1);
  let seed = sy * lw + sx;
  if (!low[seed]) {
    let best = Infinity;
    for (let i = 0; i < low.length; i++) {
      if (!low[i]) continue;
      const d = (i % lw - sx) ** 2 + (((i / lw) | 0) - sy) ** 2;
      if (d < best) { best = d; seed = i; }
    }
  }
  const dist = geodesic(low, lw, lh, seed);
  let max = 1;
  for (let i = 0; i < dist.length; i++) if (low[i] && dist[i] !== Infinity && dist[i] > max) max = dist[i];
  wobble ||= tileNoise(64, 8, 2, 7);
  const amp = max * 0.12;
  for (let i = 0; i < dist.length; i++) {
    if (!low[i]) continue;
    if (dist[i] === Infinity) dist[i] = max;
    dist[i] = Math.max(0, dist[i] + (wobble[(((i / lw) | 0) & 63) * 64 + ((i % lw) & 63)] - 0.5) * amp);
  }
  max += amp / 2;
  fillAnim = {
    m, c, alpha, dist, max, lw, lh, f,
    reveal: makeCanvas(lw, lh), tmp: makeCanvas(m.w, m.h), img: new ImageData(lw, lh),
    soft: Math.max(1.5, max * 0.08), t0: performance.now(), dur: clamp(180 + max * f * 0.3, 260, 850),
  };
  startLoop();
}

function stepFillAnim(now) {
  const a = fillAnim, k = (now - a.t0) / a.dur;
  if (k >= 1) { finishFillAnim(); return; }
  const e = 1 - Math.pow(1 - Math.max(0, k), 3), T = e * (a.max + a.soft), lo = T - a.soft;
  const px = a.img.data, dist = a.dist;
  for (let i = 0, j = 3; i < dist.length; i++, j += 4) {
    const d = dist[i];
    px[j] = d <= lo ? 255 : d >= T ? 0 : ((T - d) / a.soft) * 255;
  }
  a.reveal.getContext('2d').putImageData(a.img, 0, 0);
  const tc = a.tmp.getContext('2d');
  tc.globalCompositeOperation = 'copy';
  tc.drawImage(a.c, 0, 0);
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(a.reveal, 0, 0, a.lw * a.f, a.lh * a.f);
  drawFillRegion(a.m, a.tmp, a.alpha);
}

function finishFillAnim() {
  const a = fillAnim;
  if (!a) return;
  fillAnim = null;
  drawFillRegion(a.m, a.c, a.alpha);
  commit([a.m.x, a.m.y, a.m.w, a.m.h]);
  for (const c of [a.c, a.tmp, a.reveal]) freeCanvas(c);
  if (!mode) stopLoop();
}

// Onde de couleur au point touché.
function ripple(pt, color) {
  if (!pt || !animOn()) return;
  const r = el('div', { class: 'ripple', style: `left:${pt.x}px;top:${pt.y}px;--c:${color}` });
  r.addEventListener('animationend', () => r.remove());
  document.body.append(r);
}

function pickAt(x, y) {
  x = clamp(Math.round(x), 0, doc.w - 1);
  y = clamp(Math.round(y), 0, doc.h - 1);
  const d = pctx.getImageData(x, y, 1, 1).data, a = d[3] / 255;
  const paper = hexToRgb(paperById(doc.rec.paper).color);
  const col = rgbToHex(...[0, 1, 2].map((i) => d[i] * a + paper[i] * (1 - a)));
  S.color = col;
  saveSettings();
  refreshDock();
  bounce($('#color-btn'), 'pulse', true);
  const b = $('#pick-bubble');
  b.style.background = col;
  b.style.transform = `translate(${lastClient ? lastClient.x : innerWidth / 2}px, ${(lastClient ? lastClient.y : innerHeight / 2) - 90}px)`;
  b.hidden = false;
}

function pickEnd(cancelled) {
  $('#pick-bubble').hidden = true;
  if (!cancelled) addRecent(S.color);
  floatPal.render();
  if (tool().kind === 'picker') selectTool(TOOLS[S.prevTool] && S.prevTool !== 'picker' ? S.prevTool : 'pencil-color');
}

/* ---------- Historique ---------- */

const history = {
  undo: [], redo: [], bytes: 0,
  clear() { this.undo = []; this.redo = []; this.bytes = 0; refreshUndo(); },
  push(rec) {
    for (const r of this.redo) this.bytes -= r.data.data.length;
    this.redo = [];
    this.undo.push(rec);
    this.bytes += rec.data.data.length;
    while ((this.bytes > UNDO_BYTES || this.undo.length > UNDO_STEPS) && this.undo.length > 1) {
      this.bytes -= this.undo.shift().data.data.length;
    }
    refreshUndo();
  },
};

function refreshUndo() {
  $('#ed-undo').disabled = !history.undo.length;
  $('#ed-redo').disabled = !history.redo.length;
}

function syncBackup([x, y, w, h]) {
  bctx.clearRect(x, y, w, h);
  bctx.drawImage(doc.paint, x, y, w, h, x, y, w, h);
}

function restoreRect([x, y, w, h]) {
  pctx.save();
  clipRect(pctx, x, y, w, h);
  pctx.clearRect(x, y, w, h);
  pctx.drawImage(doc.backup, x, y, w, h, x, y, w, h);
  pctx.restore();
}

function commit(R) {
  if (!R) return;
  const [x, y] = R;
  history.push({ x, y, data: bctx.getImageData(...R) });
  syncBackup(R);
  markDirty();
}

// Calque temporaire de l'état précédent (papier compris) qui s'efface en fondu.
function fadeOverlay(img, x, y) {
  const c = makeCanvas(img.width, img.height);
  c.getContext('2d').putImageData(img, 0, 0);
  c.className = 'fade-layer';
  Object.assign(c.style, {
    left: x + 'px', top: y + 'px', backgroundColor: stage.style.backgroundColor,
    backgroundImage: stage.style.backgroundImage, backgroundPosition: `${-x}px ${-y}px`,
  });
  stage.insertBefore(c, cvLines);
  requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('out')));
  setTimeout(() => { c.remove(); freeCanvas(c); }, 450);
}

function step(from, to) {
  if (mode && mode !== 'gesture') return;
  finishFillAnim();
  const r = from.pop();
  if (!r) return;
  const { x, y, data } = r, R = [x, y, data.width, data.height];
  const cur = pctx.getImageData(...R);
  to.push({ x, y, data: cur });
  if (animOn()) fadeOverlay(cur, x, y);
  bounce($(from === history.undo ? '#ed-undo' : '#ed-redo'), 'nudge');
  playSwish(from === history.undo ? -1 : 1);
  pctx.putImageData(data, x, y);
  syncBackup(R);
  refreshUndo();
  markDirty();
}
const undo = () => step(history.undo, history.redo);
const redo = () => step(history.redo, history.undo);

function clearPaint() {
  if (!confirm(t('confirm.clear'))) return;
  finishFillAnim();
  const R = [0, 0, doc.w, doc.h];
  history.push({ x: 0, y: 0, data: bctx.getImageData(...R) });
  pctx.clearRect(...R);
  syncBackup(R);
  markDirty();
}

/* ---------- Enregistrement ---------- */

let saveTimer = null, changed = false, saving = Promise.resolve();

function markDirty() {
  changed = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save({ notify: true }), 2500);
}

function composite(scale, { lines = true, paper = true } = {}) {
  const w = Math.round(doc.w * scale), h = Math.round(doc.h * scale);
  const c = makeCanvas(w, h), x = c.getContext('2d');
  if (paper) {
    const p = paperById(doc.rec.paper);
    x.fillStyle = p.color;
    x.fillRect(0, 0, w, h);
    if (p.tex) {
      const pat = x.createPattern(paperTile(p.tex, p.strength), 'repeat');
      if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(scale));
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = pat;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'source-over';
    }
  }
  x.imageSmoothingQuality = 'high';
  x.drawImage(doc.paint, 0, 0, w, h);
  if (lines && doc.hasLines) x.drawImage(cvLines, 0, 0, w, h);
  return c;
}

export function save({ notify = false } = {}) {
  finishFillAnim();
  saving = saving.then(async () => {
    if (!doc || !changed) return;
    if (mode && mode !== 'gesture') { markDirty(); return; }
    changed = false;
    const rec = doc.rec;
    try {
      const thumb = composite(360 / Math.max(doc.w, doc.h));
      rec.thumb = await canvasToBlob(thumb, 'image/jpeg', 0.85);
      freeCanvas(thumb);
      rec.paint = await canvasToBlob(doc.paint);
      rec.updated = Date.now();
      await store.put(rec);
      if (notify && doc && animOn()) bounce($('#ed-saved'), 'show', false, 1700);
    } catch (err) {
      changed = true;
      toast(t('err.save', { msg: err.message }), 4000);
    }
  });
  return saving;
}

/* ---------- Traits ---------- */

function tintLines() {
  const x = cvLines.getContext('2d');
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = lineColorById(doc.rec.lineColor).color;
  x.fillRect(0, 0, doc.w, doc.h);
  x.globalCompositeOperation = 'source-over';
}

const tileUrls = {};
function applyPaper() {
  const p = paperById(doc.rec.paper);
  stage.style.backgroundColor = p.color;
  stage.style.backgroundImage = p.tex ? `url(${(tileUrls[p.id] ||= paperTile(p.tex, p.strength).toDataURL())})` : 'none';
}

function refreshToggles() {
  $('#ed-inside').hidden = !doc.hasLines;
  $('#ed-lines').hidden = !doc.hasLines;
  $('#ed-inside').classList.toggle('on', S.stayInside);
  $('#ed-lines').classList.toggle('on', !cvLines.hidden);
  $('#ed-title').textContent = doc.rec.name;
}

/* ---------- Feuilles : réglages et export ---------- */

function openSettings() {
  const r = doc.rec;
  const chips = (items, cur, onPick, swatch) => {
    const root = el('div', { class: 'chips' });
    const draw = (v) => {
      root.replaceChildren(...items.map((it) => el('button', {
        class: 'chip' + (it.id === v ? ' on' : ''),
        onclick: () => { onPick(it.id); draw(it.id); },
      }, swatch ? el('i', { style: `background:${it.color}` }) : null, it.name)));
    };
    draw(cur);
    return root;
  };
  const body = el('div', { class: 'form' },
    field(t('lang.title'),
      segmented(LANGS.map(([id, label]) => [id, label.replace(/ \(.*\)$/, '')]), lang, (v) => { setLang(v); s.close(); openSettings(); })),
    field(t('set.finger'),
      segmented(['auto', 'draw', 'nav'].map((v) => [v, t('set.finger.' + v)]), S.finger, (v) => { S.finger = v; saveSettings(); }),
      el('p', { class: 'hint' }, t('set.finger.hint'))),
    field(t('set.pressure'),
      segmented(['soft', 'normal', 'firm'].map((v) => [v, t('pressure.' + v)]), S.pressure, (v) => { S.pressure = v; saveSettings(); })),
    field(t('set.smoothing'),
      range({ min: 0, max: 90, step: 5, value: Math.round(S.smoothing * 100), onInput: (v) => { S.smoothing = v / 100; saveSettings(); } })),
    field(t('set.sound'),
      check(t('set.sound.on'), S.sound !== false, (v) => { S.sound = v; saveSettings(); setVolume(); refreshSoundBtn(); }),
      range({ min: 0, max: 100, step: 5, value: Math.round((S.volume ?? 0.6) * 100), onInput: (v) => { S.volume = v / 100; saveSettings(); setVolume(); } }),
      el('p', { class: 'hint' }, t('set.sound.hint'))),
    field(t('set.anim'),
      check(t('set.anim.on'), S.anim !== false, (v) => { S.anim = v; saveSettings(); applyMotionPref(); })),
    field(t('set.sliders'),
      check(t('set.left'), S.left, (v) => { S.left = v; saveSettings(); refreshSliders(); })),
    field(t('field.paper'), chips(PAPERS, r.paper, (id) => { r.paper = id; applyPaper(); markDirty(); changed = true; }, true)),
    doc.hasLines ? field(t('set.linecolor'), chips(LINE_COLORS, r.lineColor, (id) => { r.lineColor = id; tintLines(); markDirty(); }, true)) : null,
    field(t('set.drawing'), el('div', { class: 'row-btns' },
      el('button', { class: 'btn', onclick: rename }, t('menu.rename')),
      el('button', { class: 'btn danger', onclick: clearPaint }, t('set.clear')))),
    el('p', { class: 'hint' }, t('set.gestures')),
  );
  const s = sheet({ title: t('set.title'), body, actions: [{ label: t('btn.done'), primary: true }] });
}

function rename() {
  const n = prompt(t('prompt.name'), doc.rec.name);
  if (n && n.trim()) {
    doc.rec.name = n.trim().slice(0, 60);
    refreshToggles();
    changed = true;
    save();
  }
}

function fileName() {
  return (doc.rec.name || 'Pastel').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Pastel';
}

function openExport() {
  finishFillAnim();
  let withLines = true, withPaper = true, blob = null, gen = 0, url = null;
  const preview = el('img', { class: 'export-preview', alt: '' });
  const status = el('p', { class: 'hint' }, t('exp.preparing'));
  const dl = el('a', { class: 'btn', download: fileName() + '.png', onclick: () => celebrate() }, t('exp.download'));
  const regen = async () => {
    const my = ++gen;
    s.buttons[0].disabled = true;
    status.textContent = t('exp.preparing');
    await nextFrame();
    const c = composite(1, { lines: withLines, paper: withPaper });
    const b = await canvasToBlob(c);
    freeCanvas(c);
    if (my !== gen) return;
    blob = b;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(b);
    preview.src = dl.href = url;
    status.textContent = t('exp.size', { w: doc.w, h: doc.h, mb: (b.size / 1e6).toFixed(1) });
    s.buttons[0].disabled = false;
  };
  const body = el('div', { class: 'form' },
    preview, status,
    doc.hasLines ? check(t('exp.lines'), true, (v) => { withLines = v; regen(); }) : null,
    check(t('exp.paper'), true, (v) => { withPaper = v; regen(); }),
    dl);
  const s = sheet({
    title: t('exp.title'), body,
    onClose: () => { gen++; if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); },
    actions: [{
      label: t('exp.share'), primary: true,
      onClick: () => {
        if (!blob) return;
        const file = new File([blob], fileName() + '.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: doc.rec.name }).then(celebrate, () => {});
        else dl.click();
      },
    }],
  });
  regen();
}

const celebrate = () => {
  confetti([S.color, S.color2, '#ff8fab', '#ffd166', '#06d6a0', '#4cc9f0', '#b388eb']);
  playSparkle();
};

/* ---------- Ouverture et fermeture ---------- */

export async function openArt(rec, { lines } = {}) {
  busy(t('busy.open'));
  await nextFrame();
  try {
    if (rec.lines === undefined || rec.paint === undefined) Object.assign(rec, await store.load(rec.id));
    const { w, h } = rec;
    cvPaint.width = cvLines.width = w;
    cvPaint.height = cvLines.height = h;
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    const backup = makeCanvas(w, h);
    doc = { rec, w, h, paint: cvPaint, backup, regions: null, hasLines: !!rec.lines };
    pctx = cvPaint.getContext('2d');
    bctx = backup.getContext('2d');
    if (rec.paint) pctx.drawImage(await loadImage(rec.paint), 0, 0, w, h);
    bctx.drawImage(cvPaint, 0, 0);
    const lctx = cvLines.getContext('2d', { willReadFrequently: true });
    cvLines.hidden = !doc.hasLines;
    if (doc.hasLines) {
      lctx.drawImage(lines || (await loadImage(rec.lines)), 0, 0, w, h);
      busy(t('busy.regions'));
      await nextFrame();
      doc.regions = computeRegions(lctx.getImageData(0, 0, w, h).data, w, h, { closeGaps: !!rec.closeGaps });
      tintLines();
    }
    engine.attach(doc);
    history.clear();
    changed = false;
    applyPaper();
    refreshToggles();
    refreshDock();
    refreshSliders();
    $('#gallery').hidden = true;
    $('#editor').hidden = false;
    bounce($('#editor'), 'enter');
    fit();
    floatPal.restore();
    refreshSoundBtn();
  } catch (err) {
    toast(t('err.open', { msg: err.message }), 4000);
    doc = null;
  } finally {
    busy(null);
  }
}

async function close() {
  if (mode) cancelAction();
  finishFillAnim();
  closePops();
  clearTimeout(saveTimer);
  busy(t('busy.saving'));
  await save();
  busy(null);
  releaseRegions(doc.regions);
  engine.release();
  freeCanvas(doc.backup);
  cvPaint.width = cvPaint.height = cvLines.width = cvLines.height = 1;
  doc = null;
  history.clear();
  $('#editor').hidden = true;
  $('#gallery').hidden = false;
  bounce($('#gallery'), 'enter');
  onClose();
}

export function initEditor({ onClosed }) {
  onClose = onClosed;
  buildDock();
  initSliders();
  colorPanel = new ColorPanel($('#color-pop'), onColorChange, (id) => { closePops(); floatPal.show(id); });
  floatPal = new FloatPalette($('#float-pal'), onColorChange);
  $('#ed-back').innerHTML = ICONS.back;
  $('#ed-undo').innerHTML = ICONS.undo;
  $('#ed-redo').innerHTML = ICONS.redo;
  $('#ed-share').innerHTML = ICONS.share;
  $('#ed-settings').innerHTML = ICONS.settings;
  $('#ed-sound').onclick = () => {
    S.sound = S.sound === false;
    saveSettings();
    setVolume();
    refreshSoundBtn();
    toast(t(S.sound ? 'toast.sound.on' : 'toast.sound.off'), 1400);
  };
  $('#ed-inside').insertAdjacentHTML('afterbegin', ICONS.inside);
  $('#ed-lines').insertAdjacentHTML('afterbegin', ICONS.eye);
  $('#ed-back').onclick = close;
  $('#ed-undo').onclick = undo;
  $('#ed-redo').onclick = redo;
  $('#ed-share').onclick = openExport;
  $('#ed-settings').onclick = openSettings;
  $('#ed-title').onclick = rename;
  $('#ed-inside').onclick = () => {
    S.stayInside = !S.stayInside;
    saveSettings();
    refreshToggles();
    bounce($('#ed-inside'), 'wiggle');
    toast(t(S.stayInside ? 'toast.inside.on' : 'toast.inside.off'), 1600);
  };
  $('#ed-lines').onclick = () => {
    cvLines.hidden = !cvLines.hidden;
    refreshToggles();
  };
  $('#zoom-badge').onclick = fit;
  addEventListener('langchange', () => {
    closePops();
    buildDock();
    refreshDock();
    colorPanel.build();
    floatPal.build();
    floatPal.render();
  });

  vp.addEventListener('pointerdown', onDown);
  vp.addEventListener('pointermove', onMove);
  vp.addEventListener('pointerup', onUp);
  vp.addEventListener('pointercancel', onUp);
  vp.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') $('#cursor').hidden = true; });
  vp.addEventListener('wheel', onWheel, { passive: false });
  vp.addEventListener('dblclick', (e) => e.preventDefault());
  addEventListener('resize', () => { if (doc) { fit(); closePops(); } });
  addEventListener('keydown', (e) => {
    if (!doc || e.target.closest('input, textarea') || document.querySelector('.modal')) return;
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === '0') fit();
    else if (k === '[' || k === ']') {
      const t = tool();
      if (t.size) {
        setToolCfg({ size: clamp(toolCfg().size * (k === ']' ? 1.15 : 1 / 1.15), t.min, t.max) });
        refreshSliders();
      }
    } else {
      const map = { b: 'brush', p: 'pencil', m: 'marker', e: 'eraser', g: 'fill', i: 'picker', s: 'blend' };
      const g = GROUPS.find((x) => x.id === map[k]);
      if (g) groupTap(g);
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && doc) save(); });
  addEventListener('pagehide', () => { if (doc) save(); });
}

function refreshSoundBtn() {
  const b = $('#ed-sound');
  b.innerHTML = S.sound === false ? ICONS.mute : ICONS.sound;
  b.classList.toggle('muted', S.sound === false);
}

export const editorOpen = () => !!doc;
