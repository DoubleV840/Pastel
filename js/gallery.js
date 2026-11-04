// Accueil : mes dessins, pages de coloriage générées, création (toile vierge,
// dessin importé, photo transformée en coloriage).

import { PAGE_KINDS, kindById, renderPage, toLineArt } from './pages.js';
import { imageToLineArt, photoToZones, photoToContours, fitSize } from './lineart.js';
import { store } from './store.js';
import { S, saveSettings } from './settings.js';
import { PAPERS, paperById } from './brushes.js';
import { ICONS } from './icons.js';
import { busy, sheet, menu, segmented, field, range, check, pickImage } from './ui.js';
import { $, $$, el, makeCanvas, freeCanvas, canvasToBlob, loadImage, toast, nextFrame, uid, debounce } from './util.js';

let openArt;
let tab = null;
let mine = [];
let urls = [];
const shown = {};

const main = () => $('#g-main');

const baseRec = (o) => ({
  id: uid(), created: Date.now(), updated: Date.now(), paper: 'white', lineColor: 'black',
  closeGaps: false, lines: null, paint: null, thumb: null, source: null, ...o,
});

async function thumbOf(lines, paper = 'white', w = lines?.width, h = lines?.height) {
  const s = 360 / Math.max(w, h), c = makeCanvas(w * s, h * s), x = c.getContext('2d');
  x.fillStyle = paperById(paper).color;
  x.fillRect(0, 0, c.width, c.height);
  if (lines) x.drawImage(lines, 0, 0, c.width, c.height);
  const b = await canvasToBlob(c, 'image/jpeg', 0.85);
  freeCanvas(c);
  return b;
}

/* ---------- Onglets ---------- */

function showTab(t) {
  tab = t;
  for (const b of $$('#g-tabs button')) b.classList.toggle('on', b.dataset.tab === t);
  main().scrollTop = 0;
  if (t === 'mine') renderMine();
  else if (t === 'pages') renderPages();
  else renderCreate();
}

export async function refreshGallery() {
  mine = await store.all().catch(() => []);
  if (tab === 'mine') renderMine();
  else if (tab === 'pages') markStarted();
}

/* ---------- Mes dessins ---------- */

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
function when(ts) {
  const d = new Date(ts), today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Aujourd’hui ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return dateFmt.format(d);
}

async function renderMine() {
  mine = await store.all().catch(() => []);
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  if (tab !== 'mine') return;
  if (!mine.length) {
    main().replaceChildren(el('div', { class: 'empty' },
      el('div', { class: 'empty-art', html: ICONS.palette }),
      el('h2', {}, 'Aucun dessin pour l’instant'),
      el('p', {}, 'Choisis une page de coloriage, importe un dessin ou pars d’une toile vierge.'),
      el('div', { class: 'row-btns' },
        el('button', { class: 'btn primary', onclick: () => showTab('pages') }, 'Voir les coloriages'),
        el('button', { class: 'btn', onclick: () => showTab('create') }, 'Créer'))));
    return;
  }
  const grid = el('div', { class: 'grid' });
  for (const rec of mine) {
    const url = rec.thumb ? URL.createObjectURL(rec.thumb) : '';
    if (url) urls.push(url);
    const card = el('div', { class: 'card' },
      el('button', { class: 'thumb', style: `aspect-ratio:${rec.w}/${rec.h}`, 'aria-label': 'Ouvrir ' + rec.name, onclick: () => openArt(rec) },
        url ? el('img', { src: url, alt: '' }) : null),
      el('div', { class: 'meta' },
        el('div', {}, el('b', {}, rec.name), el('span', {}, when(rec.updated))),
        el('button', { class: 'icon-btn sm', 'aria-label': 'Options', html: ICONS.more, onclick: () => cardMenu(rec) })));
    grid.append(card);
  }
  main().replaceChildren(grid);
}

function cardMenu(rec) {
  menu(rec.name, [
    { label: 'Ouvrir', icon: 'edit', onClick: () => openArt(rec) },
    { label: 'Renommer', icon: 'page', onClick: async () => {
      const n = prompt('Nom du dessin', rec.name);
      if (n && n.trim()) { rec.name = n.trim().slice(0, 60); await store.put(rec, false); renderMine(); }
    } },
    { label: 'Dupliquer', icon: 'copy', onClick: async () => {
      await store.duplicate(rec, rec.name + ' (copie)');
      renderMine();
    } },
    { label: 'Supprimer', icon: 'trash', danger: true, onClick: async () => {
      if (!confirm(`Supprimer « ${rec.name} » ? C’est définitif.`)) return;
      await store.del(rec.id);
      renderMine();
    } },
  ]);
}

/* ---------- Coloriages générés ---------- */

let observer, queue = [], pumping = false;

function pump() {
  if (pumping) return;
  pumping = true;
  const next = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    if (job.box.isConnected) {
      const c = renderPage(job.kind, job.num, Math.round(240 * Math.min(2, devicePixelRatio || 1)));
      c.className = 'page-canvas';
      job.box.replaceChildren(c);
    }
    setTimeout(next, 0);
  };
  next();
}

function markStarted() {
  const started = new Set(mine.filter((r) => r.source).map((r) => r.source.kind + ':' + r.source.num));
  for (const b of $$('.page-card')) b.classList.toggle('started', started.has(b.dataset.key));
}

function renderPages() {
  const kind = kindById(S.pageKind);
  observer?.disconnect();
  queue = [];
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      observer.unobserve(e.target);
      queue.push({ box: e.target, kind: e.target.dataset.kind, num: Number(e.target.dataset.num) });
    }
    pump();
  }, { root: main(), rootMargin: '400px' });
  const chips = el('div', { class: 'kind-chips' }, PAGE_KINDS.map((k) => el('button', {
    class: 'chip' + (k.id === kind.id ? ' on' : ''),
    onclick: () => { S.pageKind = k.id; saveSettings(); renderPages(); },
  }, k.name)));
  const grid = el('div', { class: 'grid pages' });
  const count = shown[kind.id] || 24;
  for (let num = 1; num <= count; num++) {
    const box = el('div', { class: 'page-box', style: `aspect-ratio:${kind.w}/${kind.h}`, 'data-kind': kind.id, 'data-num': num });
    grid.append(el('button', { class: 'page-card', 'data-key': kind.id + ':' + num, 'aria-label': `${kind.name} n°${num}`, onclick: () => pageTap(kind, num) },
      box, el('span', { class: 'page-num' }, 'n°' + num), el('span', { class: 'badge' }, 'En cours')));
    observer.observe(box);
  }
  const more = el('button', { class: 'btn more-btn', onclick: () => { shown[kind.id] = count + 24; const y = main().scrollTop; renderPages(); main().scrollTop = y; } }, 'Afficher plus de pages');
  main().replaceChildren(chips, grid, more);
  markStarted();
}

function pageTap(kind, num) {
  const existing = mine.filter((r) => r.source && r.source.kind === kind.id && r.source.num === num);
  if (!existing.length) return createFromPage(kind, num);
  menu(`${kind.name} n°${num}`, [
    { label: 'Continuer mon coloriage', icon: 'edit', onClick: () => openArt(existing[0]) },
    { label: 'Nouvelle copie à colorier', icon: 'plus', onClick: () => createFromPage(kind, num) },
  ]);
}

async function createFromPage(kind, num) {
  busy('Préparation de la page…');
  await nextFrame();
  try {
    const c = toLineArt(renderPage(kind.id, num, 2048));
    const rec = baseRec({ name: `${kind.name} n°${num}`, w: c.width, h: c.height, kind: 'page', source: { kind: kind.id, num } });
    rec.lines = await canvasToBlob(c);
    rec.thumb = await thumbOf(c);
    await store.put(rec);
    busy(null);
    await openArt(rec, { lines: c });
  } catch (err) {
    busy(null);
    toast('Erreur : ' + err.message, 4000);
  }
}

/* ---------- Créer ---------- */

function renderCreate() {
  const card = (icon, title, text, onClick) => el('button', { class: 'create-card', onclick: onClick },
    el('span', { class: 'create-icon', html: ICONS[icon] }), el('b', {}, title), el('span', {}, text));
  main().replaceChildren(el('div', { class: 'create-grid' },
    card('page', 'Toile vierge', 'Dessin libre sur une feuille blanche, crème, kraft…', blankSheet),
    card('image', 'Importer un dessin', 'Un coloriage trouvé sur le web, scanné ou photographié.', importDrawing),
    card('camera', 'Photo → coloriage', 'Transforme une de tes photos en dessin à colorier.', importPhoto),
    card('sparkle', 'Page surprise', 'Une page de coloriage tirée au hasard.', () => {
      const k = PAGE_KINDS[(Math.random() * PAGE_KINDS.length) | 0];
      createFromPage(k, 1 + ((Math.random() * 500) | 0));
    })));
}

function blankSheet() {
  let fmt = 'portrait', paper = 'white';
  const papers = el('div', { class: 'chips' });
  const drawPapers = () => papers.replaceChildren(...PAPERS.map((p) => el('button', {
    class: 'chip' + (p.id === paper ? ' on' : ''), onclick: () => { paper = p.id; drawPapers(); },
  }, el('i', { style: `background:${p.color}` }), p.name)));
  drawPapers();
  const body = el('div', { class: 'form' },
    field('Format', segmented([['portrait', 'Portrait'], ['landscape', 'Paysage'], ['square', 'Carré'], ['screen', 'Écran']], fmt, (v) => { fmt = v; })),
    field('Papier', papers));
  sheet({
    title: 'Toile vierge', body,
    actions: [{
      label: 'Créer', primary: true,
      onClick: async (close) => {
        close();
        const ratio = innerWidth / innerHeight;
        const [w, h] = {
          portrait: [1536, 2048], landscape: [2048, 1536], square: [2048, 2048],
          screen: ratio < 1 ? [Math.round(2048 * ratio), 2048] : [2048, Math.round(2048 / ratio)],
        }[fmt];
        const rec = baseRec({ name: 'Dessin libre', w, h, kind: 'blank', paper });
        rec.thumb = await thumbOf(null, paper, w, h);
        await store.put(rec);
        openArt(rec);
      },
    }],
  });
}

function baseName(file, fallback) {
  const n = (file.name || '').replace(/\.[^.]+$/, '').trim();
  return n && !/^(image|img|photo)[-_ ]?\d*$/i.test(n) ? n.slice(0, 60) : fallback;
}

async function readImage() {
  const file = await pickImage();
  if (!file) return null;
  busy('Lecture de l’image…');
  try {
    return { file, img: await loadImage(file) };
  } catch {
    toast('Image illisible (formats acceptés : JPG, PNG, HEIC depuis Photos).', 4000);
    return null;
  } finally {
    busy(null);
  }
}

function previewCanvas() {
  return el('canvas', { class: 'import-preview' });
}

function showPreview(pv, lines) {
  pv.width = lines.width;
  pv.height = lines.height;
  const x = pv.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, pv.width, pv.height);
  x.drawImage(lines, 0, 0);
  freeCanvas(lines);
}

async function finishImport(make, o) {
  busy('Création du coloriage…');
  await nextFrame();
  try {
    const c = make(2048);
    const rec = baseRec({ ...o, w: c.width, h: c.height });
    rec.lines = await canvasToBlob(c);
    rec.thumb = await thumbOf(c);
    await store.put(rec);
    busy(null);
    await openArt(rec, { lines: c });
  } catch (err) {
    busy(null);
    toast('Erreur : ' + err.message, 4000);
  }
}

async function importDrawing() {
  const got = await readImage();
  if (!got) return;
  const { file, img } = got;
  let level = 0.5, closeGaps = true;
  const pv = previewCanvas();
  const draw = debounce(() => showPreview(pv, imageToLineArt(img, 720, { level })), 80);
  const body = el('div', { class: 'form' }, pv,
    field('Traits : clairs ← → appuyés', range({ min: 0, max: 100, value: 50, onInput: (v) => { level = v / 100; draw(); } })),
    check('Fermer les petites ouvertures des traits (remplissage plus sûr)', closeGaps, (v) => { closeGaps = v; }),
    el('p', { class: 'hint' }, 'Idéal : un dessin au trait noir sur fond blanc. Les couleurs de l’image sont ignorées.'));
  sheet({
    title: 'Importer un dessin', body, wide: true,
    actions: [{ label: 'Annuler' }, {
      label: 'Colorier ce dessin', primary: true,
      onClick: (close) => {
        close();
        finishImport((long) => imageToLineArt(img, long, { level }), { name: baseName(file, 'Dessin importé'), kind: 'import', closeGaps });
      },
    }],
  });
  showPreview(pv, imageToLineArt(img, 720, { level }));
}

async function importPhoto() {
  const got = await readImage();
  if (!got) return;
  const { file, img } = got;
  let style = 'zones', detail = 5, thickness = 2;
  const pv = previewCanvas(), note = el('p', { class: 'hint' });
  const make = (long) => (style === 'zones' ? photoToZones : photoToContours)(img, long, { detail, thickness });
  const draw = debounce(async () => {
    note.textContent = 'Calcul…';
    await nextFrame();
    showPreview(pv, make(640));
    note.textContent = style === 'zones'
      ? 'Zones : des formes fermées, prêtes pour le remplissage par toucher.'
      : 'Contours : un rendu façon croquis, à colorier au crayon ou au pinceau.';
  }, 150);
  const body = el('div', { class: 'form' }, pv, note,
    field('Style', segmented([['zones', 'Zones'], ['contours', 'Contours']], style, (v) => { style = v; draw(); })),
    field('Détails', range({ min: 1, max: 10, value: detail, onInput: (v) => { detail = v; draw(); } })),
    field('Épaisseur des traits', range({ min: 1, max: 5, value: thickness, onInput: (v) => { thickness = v; draw(); } })));
  const [w, h] = fitSize(img.naturalWidth, img.naturalHeight, 640);
  pv.width = w;
  pv.height = h;
  sheet({
    title: 'Photo → coloriage', body, wide: true,
    actions: [{ label: 'Annuler' }, {
      label: 'Colorier cette photo', primary: true,
      onClick: (close) => {
        close();
        finishImport(make, { name: baseName(file, 'Photo à colorier'), kind: 'photo', closeGaps: style === 'contours' });
      },
    }],
  });
  draw();
}

/* ---------- Démarrage ---------- */

export async function initGallery({ open }) {
  openArt = open;
  $('#g-logo').innerHTML = ICONS.palette;
  for (const b of $$('#g-tabs button')) b.onclick = () => showTab(b.dataset.tab);
  mine = await store.all().catch(() => []);
  showTab(mine.length ? 'mine' : 'pages');
}
