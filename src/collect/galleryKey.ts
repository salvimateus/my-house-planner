const KEY = 'casinha:gallery-key';

/** The stored gallery key. A device with a key is the owner's: it never uploads plans. */
export function getGalleryKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setGalleryKey(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // Storage blocked: the key lasts for this screen only.
  }
}

export function clearGalleryKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

export const hasGalleryKey = (): boolean => Boolean(getGalleryKey());
