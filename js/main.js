import { initEditor, openArt } from './editor.js';
import { initGallery, refreshGallery } from './gallery.js';
import { askPersist } from './store.js';
import { applyStatic } from './i18n.js';
import { applyMotionPref } from './ui.js';
import { unlockAudio } from './sound.js';

applyStatic();
applyMotionPref();

// Safari : pas de zoom de page au pincement, seulement celui de la toile.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

initEditor({ onClosed: refreshGallery });
initGallery({ open: openArt });
askPersist();

// Safari n'active le son qu'après un geste de l'utilisateur.
for (const ev of ['pointerdown', 'pointerup', 'touchend']) document.addEventListener(ev, unlockAudio, { capture: true, passive: true });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
