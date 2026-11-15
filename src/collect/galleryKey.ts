const KEY = 'casinha:gallery-key';

/**
 * In dev the key lives in memory only: every Vite project on the default port shares the
 * `localhost:5173` origin, so any of them could read it from `localStorage`.
 */
let devKey: string | null = null;

if (import.meta.env.DEV) {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

/** The stored gallery key. A device with a key is the owner's: it never uploads plans. */
export function getGalleryKey(): string | null {
  if (import.meta.env.DEV) return devKey;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setGalleryKey(key: string): void {
  if (import.meta.env.DEV) {
    devKey = key;
    return;
  }
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // Storage blocked: the key lasts for this screen only.
  }
}

export function clearGalleryKey(): void {
  if (import.meta.env.DEV) {
    devKey = null;
    return;
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

export const hasGalleryKey = (): boolean => Boolean(getGalleryKey());
