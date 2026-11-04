// Service worker : rend l'appli installable et utilisable hors ligne.
// Réseau d'abord pour toujours servir la dernière version publiée.
const CACHE = 'pastel-v1';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/editor.js',
  'js/gallery.js',
  'js/engine.js',
  'js/brushes.js',
  'js/regions.js',
  'js/fill.js',
  'js/pages.js',
  'js/lineart.js',
  'js/colorpicker.js',
  'js/settings.js',
  'js/store.js',
  'js/icons.js',
  'js/ui.js',
  'js/util.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
