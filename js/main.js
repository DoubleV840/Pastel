import { initEditor, openArt } from './editor.js';
import { initGallery, refreshGallery } from './gallery.js';
import { askPersist } from './store.js';

// Safari : pas de zoom de page au pincement, seulement celui de la toile.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

initEditor({ onClosed: refreshGallery });
initGallery({ open: openArt });
askPersist();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
