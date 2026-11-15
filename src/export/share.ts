/** Saves a file through a temporary link. */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canShareFile(file: File): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export const canShareLink = (): boolean => typeof navigator.share === 'function';

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

/**
 * Opens the system share sheet with the file. Call it straight from a tap: the share sheet needs
 * a fresh user gesture. Falls back to a download when the browser cannot share files.
 */
export async function shareOrDownload(file: File, title: string): Promise<ShareOutcome> {
  if (!canShareFile(file)) {
    downloadFile(file);
    return 'downloaded';
  }
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    if (isAbort(err)) return 'cancelled';
    // NotAllowedError (gesture expired, policy) and other failures: save it instead.
    downloadFile(file);
    return 'downloaded';
  }
}

/** Shares a link through the system share sheet; null when the browser has none. */
export async function shareLink(
  url: string,
  title: string,
  text: string,
): Promise<ShareOutcome | null> {
  if (!canShareLink()) return null;
  try {
    await navigator.share({ url, title, text });
    return 'shared';
  } catch (err) {
    if (isAbort(err)) return 'cancelled';
    return null;
  }
}
