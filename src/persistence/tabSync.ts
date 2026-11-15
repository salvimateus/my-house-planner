type GalleryMessage = { type: 'gallery-changed' };
type Listener = () => void;

const CHANNEL = 'casinha';
const STORAGE_PING_KEY = 'casinha:gallery-ping';

const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;
let started = false;

const isGalleryMessage = (data: unknown): data is GalleryMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as { type?: unknown }).type === 'gallery-changed';

function fire(): void {
  for (const fn of [...listeners]) fn();
}

function start(): void {
  if (started) return;
  started = true;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e: MessageEvent<unknown>) => {
        if (isGalleryMessage(e.data)) fire();
      };
      return;
    }
  } catch {
    channel = null;
  }
  // Older browsers: other tabs get a `storage` event when the ping key changes.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_PING_KEY) fire();
  });
}

/** Tells this tab and the other tabs that "Minhas plantas" changed. */
export function notifyGalleryChanged(): void {
  start();
  fire();
  const message: GalleryMessage = { type: 'gallery-changed' };
  if (channel) {
    try {
      channel.postMessage(message);
    } catch {
      // Channel closed: the other tabs refresh when they come back to the start screen.
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_PING_KEY, String(Date.now()));
  } catch {
    // Storage blocked: nothing else to try.
  }
}

export function onGalleryChanged(fn: Listener): () => void {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
