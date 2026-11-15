const KEY = 'casinha:gallery-seen';

/** `device/project` mapped to the `updatedAt` the owner last looked at. */
export type SeenMap = Record<string, string>;

export const planId = (p: { device: string; project: string }): string =>
  `${p.device}/${p.project}`;

/** Blocked or broken storage reads as "nothing seen". */
export function readSeen(): SeenMap {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: SeenMap = {};
    for (const [id, at] of Object.entries(raw)) if (typeof at === 'string') out[id] = at;
    return out;
  } catch {
    return {};
  }
}

export function writeSeen(map: SeenMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage blocked: the seen state lasts for this screen only.
  }
}

export type SeenState = 'new' | 'updated' | 'seen';

/** A plan edited after the owner looked at it is unread again. */
export function seenStateOf(
  map: SeenMap,
  p: { device: string; project: string; updatedAt: string },
): SeenState {
  const at = map[planId(p)];
  if (at === undefined) return 'new';
  return p.updatedAt > at ? 'updated' : 'seen';
}
