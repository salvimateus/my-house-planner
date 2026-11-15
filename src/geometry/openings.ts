import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import { MIN_JAMB } from '../model/defaults.ts';
import type { Axis, Id, Mm, Opening, OpeningType, Vec } from '../model/types.ts';
import type { OpeningDerived, Rect, WallRun } from './types.ts';

export interface OpeningSnap {
  axis: Axis;
  line: Mm;
  at: Mm;
  run: WallRun;
  dist: Mm;
  side: 1 | -1;
}

/** Minimum free distance between two openings on one line. */
export const OPENING_GAP: Mm = 50;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function compatibleRuns(type: OpeningType, runs: WallRun[]): WallRun[] {
  const hosts = OPENING_SPECS[type].hosts;
  return runs.filter((r) => hosts.includes(r.kind));
}

/**
 * Nearest compatible wall run within `radius` of the pointer, with the center snapped to `step`, kept
 * MIN_JAMB from the run ends and away from other openings on the same line.
 */
export function snapOpening(
  pointer: Vec,
  type: OpeningType,
  width: Mm,
  runs: WallRun[],
  others: Opening[],
  radius: Mm,
  step: Mm = 50,
  ignoreId?: Id,
): OpeningSnap | null {
  let best: OpeningSnap | null = null;
  for (const r of compatibleRuns(type, runs)) {
    if (r.end - r.start < width + 2 * MIN_JAMB) continue;
    const along = r.axis === 'h' ? pointer.x : pointer.y;
    const across = r.axis === 'h' ? pointer.y : pointer.x;
    const c = r.line + r.offset;
    const dAcross = Math.abs(across - c);
    const dAlong = along < r.start ? r.start - along : along > r.end ? along - r.end : 0;
    const dist = Math.hypot(dAcross, dAlong);
    if (dist > radius) continue;
    const lo = Math.ceil(r.start + width / 2 + MIN_JAMB);
    const hi = Math.floor(r.end - width / 2 - MIN_JAMB);
    const wanted = clamp(Math.round(along / step) * step, lo, hi);
    const sameLine = others.filter(
      (o) =>
        o.id !== ignoreId &&
        o.axis === r.axis &&
        o.line === r.line &&
        o.at + o.width / 2 > r.start &&
        o.at - o.width / 2 < r.end,
    );
    const at = nearestFreeSlot(wanted, width, lo, hi, sameLine, step);
    if (at === null) continue;
    if (!best || dist < best.dist) {
      best = { axis: r.axis, line: r.line, at, run: r, dist, side: across >= c ? 1 : -1 };
    }
  }
  return best;
}

/** Tests `wanted`, then steps outward in both directions until the opening keeps OPENING_GAP to the others. */
export function nearestFreeSlot(
  wanted: Mm,
  width: Mm,
  lo: Mm,
  hi: Mm,
  others: Opening[],
  step: Mm = 50,
): Mm | null {
  if (hi < lo) return null;
  const free = (at: Mm) =>
    others.every(
      (o) =>
        at + width / 2 + OPENING_GAP <= o.at - o.width / 2 ||
        at - width / 2 - OPENING_GAP >= o.at + o.width / 2,
    );
  if (free(wanted)) return wanted;
  const s = Math.max(1, step);
  const maxK = Math.ceil((hi - lo) / s) + 1;
  for (let k = 1; k <= maxK; k++) {
    const down = wanted - k * s;
    const up = wanted + k * s;
    if (up <= hi && free(up)) return up;
    if (down >= lo && free(down)) return down;
    if (up > hi && down < lo) break;
  }
  for (const edge of [Math.round(lo), Math.round(hi)]) {
    if (edge >= lo && edge <= hi && free(edge)) return edge;
  }
  return null;
}

/** Host run of an opening: same axis and line, compatible kind, covering the whole opening width. */
export function resolveHost(o: Opening, runs: WallRun[]): WallRun | null {
  const hosts = OPENING_SPECS[o.type].hosts;
  return (
    runs.find(
      (r) =>
        r.axis === o.axis &&
        r.line === o.line &&
        r.start <= o.at - o.width / 2 &&
        r.end >= o.at + o.width / 2 &&
        hosts.includes(r.kind),
    ) ?? null
  );
}

/** Cut rect of the opening in its host wall, 1 mm beyond each face for a clean cut. */
export function gapRect(o: Opening, run: WallRun): Rect {
  const c = run.line + run.offset;
  const h = run.thickness / 2 + 1;
  const a = o.at - o.width / 2;
  const b = o.at + o.width / 2;
  return o.axis === 'h'
    ? { x0: a, x1: b, y0: c - h, y1: c + h }
    : { x0: c - h, x1: c + h, y0: a, y1: b };
}

/** Center of the opening on the host wall axis (with the lot-line offset). */
export function openingCenter(o: Opening, run: WallRun | null): Vec {
  const c = o.line + (run?.offset ?? 0);
  return o.axis === 'h' ? { x: o.at, y: c } : { x: c, y: o.at };
}

export function deriveOpening(o: Opening, runs: WallRun[]): OpeningDerived {
  const run = resolveHost(o, runs);
  if (!run) return { run: null, gap: null, center: openingCenter(o, null), valid: false };
  return { run, gap: gapRect(o, run), center: openingCenter(o, run), valid: true };
}

/**
 * Boxes swept by the leaves of a swinging opening (one square per leaf, from the wall face to the swing side).
 * Empty for openings without swing or without a host.
 */
export function swingRects(
  o: Opening,
  run: WallRun | null,
): { hinge: Vec; radius: Mm; rect: Rect }[] {
  if (!run || !OPENING_SPECS[o.type].hasSwing) return [];
  const face = run.line + run.offset + (o.side * run.thickness) / 2;
  const a = o.at - o.width / 2;
  const b = o.at + o.width / 2;
  const leaves: { hingeAt: Mm; to: Mm }[] =
    o.type === 'door-double'
      ? [
          { hingeAt: a, to: o.at },
          { hingeAt: b, to: o.at },
        ]
      : o.hinge === 'start'
        ? [{ hingeAt: a, to: b }]
        : [{ hingeAt: b, to: a }];
  return leaves.map(({ hingeAt, to }) => {
    const radius = Math.abs(to - hingeAt);
    const lo = Math.min(hingeAt, to);
    const hi = Math.max(hingeAt, to);
    const f0 = Math.min(face, face + o.side * radius);
    const f1 = Math.max(face, face + o.side * radius);
    return o.axis === 'h'
      ? { hinge: { x: hingeAt, y: face }, radius, rect: { x0: lo, x1: hi, y0: f0, y1: f1 } }
      : { hinge: { x: face, y: hingeAt }, radius, rect: { x0: f0, x1: f1, y0: lo, y1: hi } };
  });
}
