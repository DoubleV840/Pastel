// Dessins enregistrés dans IndexedDB (sur l'appareil, rien n'est envoyé).
// « meta » : fiche légère pour la galerie
//   { id, name, created, updated, w, h, kind, source, paper, lineColor, closeGaps, thumb }
// « data » : images lourdes, lues seulement à l'ouverture { id, lines, paint }
// Les images sont stockées en ArrayBuffer : Safari refuse les Blob en navigation privée.

const DB = 'pastel';
const HEAVY = ['lines', 'paint'];
let dbp;

function open() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('meta', { keyPath: 'id' });
      r.result.createObjectStore('data', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(stores, mode);
    const req = fn(t);
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transaction annulée'));
  });
}

const pack = async (b) => (b instanceof Blob ? { type: b.type, buf: await b.arrayBuffer() } : b ?? null);
const unpack = (v) => (v && v.buf ? new Blob([v.buf], { type: v.type }) : v ?? null);

export const store = {
  async all() {
    const list = (await run('meta', 'readonly', (t) => t.objectStore('meta').getAll())) || [];
    for (const m of list) m.thumb = unpack(m.thumb);
    return list.sort((a, b) => b.updated - a.updated);
  },

  // Images du dessin : { lines, paint } (Blob ou null).
  async load(id) {
    const d = await run('data', 'readonly', (t) => t.objectStore('data').get(id));
    return { lines: unpack(d?.lines), paint: unpack(d?.paint) };
  },

  // rec complet (avec lines et paint) ; withData = false n'écrit que la fiche.
  async put(rec, withData = true) {
    const meta = { ...rec, thumb: await pack(rec.thumb) };
    for (const k of HEAVY) delete meta[k];
    const data = withData ? { id: rec.id, lines: await pack(rec.lines), paint: await pack(rec.paint) } : null;
    await run(['meta', 'data'], 'readwrite', (t) => {
      t.objectStore('meta').put(meta);
      if (data) t.objectStore('data').put(data);
    });
  },

  async duplicate(rec, name) {
    const data = await this.load(rec.id);
    const copy = { ...rec, ...data, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name, created: Date.now(), updated: Date.now() };
    await this.put(copy);
    return copy;
  },

  del: (id) => run(['meta', 'data'], 'readwrite', (t) => {
    t.objectStore('meta').delete(id);
    t.objectStore('data').delete(id);
  }),
};

// Évite que Safari efface les données d'un site peu visité.
export function askPersist() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
