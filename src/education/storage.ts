/**
 * Education progress in localStorage, mirrored in memory so blocked storage still keeps each hint
 * to once per session.
 */
const PREFIX = 'casinha:edu:';
const memory = new Map<string, string>();

function read(key: string): string | null {
  const mem = memory.get(key);
  if (mem !== undefined) return mem;
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage blocked: the memory copy is enough for this session.
  }
}

export const seen = (key: string): boolean => read(key) === '1';

export const markSeen = (key: string): void => write(key, '1');

export function readCount(key: string): number {
  const n = Number(read(key));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export const writeCount = (key: string, n: number): void => write(key, String(n));

/** "Tutorial" in the menu: every demo, coach mark and lesson becomes new again. */
export function resetEducation(): void {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // Storage blocked: only the memory copy existed.
  }
}
