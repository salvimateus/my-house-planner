import { closeProject } from '../persistence/repository.ts';
import { uiStore } from '../store/uiStore.ts';

const GALLERY_HASH = '#galeria';

/**
 * The hash leaves the address at once: the screen lives in the store, and a later visit to
 * `#galeria` is a new hash change.
 */
async function check(): Promise<void> {
  if (window.location.hash !== GALLERY_HASH) return;
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  const ui = uiStore.getState();
  if (ui.screen === 'gallery') return;
  if (ui.screen === 'editor') {
    await closeProject('gallery');
    return;
  }
  ui.setScreen('gallery');
}

let started = false;

/** Opens the private gallery from `#galeria`, on load and on each hash change. */
export function startGalleryRoute(): void {
  if (started) return;
  started = true;
  const run = () => void check().catch(() => undefined);
  window.addEventListener('hashchange', run);
  run();
}
