import { MIN_JAMB } from '../model/defaults.ts';
import { newId } from '../model/ids.ts';
import type {
  Frontage,
  Id,
  Lot,
  Mm,
  Opening,
  OpeningType,
  ProjectDoc,
  Side,
  SidewalkRamp,
  StreetTree,
  StreetTreeSpecies,
  Vec,
} from '../model/types.ts';
import { OPENING_GAP } from './openings.ts';
import type { WallRun } from './types.ts';
import { boundarySide, subtractInterval } from './walls.ts';

// Sidewalk layout (SP standard): service strip next to the curb, free strip, access strip next to the lot.
export const CURB: Mm = 150;
export const SERVICE_STRIP: Mm = 700;
export const FREE_STRIP: Mm = 1200;

export const RAMP_WIDTH = { min: 2500, max: 8000 } as const;
export const TREE_SIZE = { min: 2000, max: 8000 } as const;
/** Side flare of a ramp along the curb, on each side. */
export const RAMP_FLARE: Mm = 300;
export const DEFAULT_RAMP_WIDTH: Mm = 3600;
export const TREE_PITCH: Mm = 6000;
/** Minimum distance from a trunk to the lot corners. */
export const TREE_CORNER_GAP: Mm = 1000;
/** Minimum free distance between a trunk and the edge of a ramp or a gate. */
export const TREE_CLEARANCE: Mm = 600;
export const TREE_MIN_GAP: Mm = 1500;

/** Bigger crowns keep further from ramps and gates, so they never hide most of the curb cut. */
const treeClearance = (size: Mm): Mm => Math.max(TREE_CLEARANCE, Math.round(size * 0.25));
/** Trunk spacing: at least the sum of the two crown radii times 0,8. */
export const treeGap = (a: Mm, b: Mm): Mm => Math.max(TREE_MIN_GAP, Math.round((a + b) * 0.4));
export const RAMP_GAP: Mm = 300;
export const FRONTAGE_STEP: Mm = 100;

export const VEHICLE_GATES: readonly OpeningType[] = ['gate-sliding', 'gate-tilt'];
export const isVehicleGate = (type: OpeningType): boolean => VEHICLE_GATES.includes(type);
export const isGate = (type: OpeningType): boolean => type.startsWith('gate-');

export const SPECIES: readonly StreetTreeSpecies[] = [
  'ipe-amarelo',
  'ipe-roxo',
  'quaresmeira',
  'oiti',
  'reseda',
];
/** Planting order: flowering colors alternate with the dark green oiti. */
export const SPECIES_CYCLE: readonly StreetTreeSpecies[] = [
  'ipe-amarelo',
  'quaresmeira',
  'oiti',
  'reseda',
  'ipe-roxo',
];
export const SPECIES_SIZE: Record<StreetTreeSpecies, Mm> = {
  'ipe-amarelo': 4200,
  'ipe-roxo': 4400,
  quaresmeira: 3800,
  oiti: 4400,
  reseda: 3600,
};

export const isSpecies = (v: string): v is StreetTreeSpecies =>
  (SPECIES as readonly string[]).includes(v);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const snapTo = (v: number, step: number): number => Math.round(v / step) * step;

export const clampRampWidth = (w: Mm): Mm => clamp(Math.round(w), RAMP_WIDTH.min, RAMP_WIDTH.max);
export const clampTreeSize = (s: Mm): Mm => clamp(Math.round(s), TREE_SIZE.min, TREE_SIZE.max);

export function streetSides(lot: Pick<Lot, 'frontSide' | 'cornerSide'>): Side[] {
  return lot.cornerSide ? [lot.frontSide, lot.cornerSide] : [lot.frontSide];
}

export const sideLength = (lot: Pick<Lot, 'width' | 'depth'>, side: Side): Mm =>
  side === 'top' || side === 'bottom' ? lot.width : lot.depth;

/** Along coordinate of a world point for a lot side (x on top and bottom, y on the sides). */
export const alongOf = (side: Side, p: Vec): Mm =>
  side === 'top' || side === 'bottom' ? p.x : p.y;

/** World point `out` mm outside the lot side (negative = inside the lot), at `at` along it. */
export function frontagePoint(lot: Pick<Lot, 'width' | 'depth'>, side: Side, at: Mm, out: Mm): Vec {
  switch (side) {
    case 'top':
      return { x: at, y: -out };
    case 'bottom':
      return { x: at, y: lot.depth + out };
    case 'left':
      return { x: -out, y: at };
    default:
      return { x: lot.width + out, y: at };
  }
}

/** Distance of a world point outside the lot side; negative inside. */
export function outOf(lot: Pick<Lot, 'width' | 'depth'>, side: Side, p: Vec): Mm {
  switch (side) {
    case 'top':
      return -p.y;
    case 'bottom':
      return p.y - lot.depth;
    case 'left':
      return -p.x;
    default:
      return p.x - lot.width;
  }
}

/** Sidewalk strip offsets from the lot line: access strip ends at `free0`, service strip starts at `service0`. */
export function sidewalkStrips(lot: Pick<Lot, 'sidewalkWidth'>): {
  service: Mm;
  free: Mm;
  access: Mm;
  service0: Mm;
  free0: Mm;
  curb0: Mm;
  total: Mm;
} {
  const s = lot.sidewalkWidth;
  const service = Math.min(SERVICE_STRIP, s);
  const free = Math.min(FREE_STRIP, s - service);
  const access = s - service - free;
  return { service, free, access, service0: s - service, free0: access, curb0: s - CURB, total: s };
}

/** Outward offset of the trunks: the middle of the service strip. */
export const treeOut = (lot: Pick<Lot, 'sidewalkWidth'>): Mm => {
  const { service0, total } = sidewalkStrips(lot);
  return Math.round((service0 + Math.max(service0, total - CURB)) / 2);
};

export const treePoint = (lot: Lot, t: StreetTree): Vec =>
  frontagePoint(lot, t.side, t.at, treeOut(lot));

export const clampRampAt = (
  lot: Pick<Lot, 'width' | 'depth'>,
  side: Side,
  at: Mm,
  width: Mm,
): Mm => {
  const len = sideLength(lot, side);
  if (len <= width) return Math.round(len / 2);
  return Math.round(clamp(at, width / 2, len - width / 2));
};

/** Curb radius at a street corner; it always clears the sidewalk width. */
export const curbRadius = (lot: Pick<Lot, 'sidewalkWidth'>): Mm =>
  Math.max(4000, lot.sidewalkWidth + 500);

type TreeLot = Pick<Lot, 'width' | 'depth' | 'frontSide' | 'cornerSide' | 'sidewalkWidth'>;

/**
 * Trunk range along a street side: TREE_CORNER_GAP from the lot corners, and further at the corner where
 * the front and the corner street meet, so no tree stands in the rounded sidewalk corner.
 */
export const treeRange = (lot: TreeLot, side: Side): [Mm, Mm] => {
  const len = sideLength(lot, side);
  let lo: Mm = TREE_CORNER_GAP;
  let hi: Mm = len - TREE_CORNER_GAP;
  const other =
    lot.cornerSide && side === lot.frontSide
      ? lot.cornerSide
      : side === lot.cornerSide
        ? lot.frontSide
        : null;
  if (other) {
    const gap = Math.max(TREE_CORNER_GAP, curbRadius(lot) - lot.sidewalkWidth + 1200);
    if (other === 'left' || other === 'top') lo = gap;
    else hi = len - gap;
  }
  if (hi < lo) return [Math.round((lo + hi) / 2), Math.round((lo + hi) / 2)];
  return [lo, hi];
};

export const clampTreeAt = (lot: TreeLot, side: Side, at: Mm): Mm => {
  const [lo, hi] = treeRange(lot, side);
  return Math.round(clamp(at, lo, hi));
};

/** Lot side of a gate on the lot wall, or null. */
export function gateSide(o: Opening, lot: Lot): Side | null {
  if (!isGate(o.type)) return null;
  return boundarySide(o, lot);
}

type Span = [Mm, Mm];

const overlaps = (a: Span, b: Span): boolean => a[0] < b[1] && b[0] < a[1];

const rampSpan = (r: Pick<SidewalkRamp, 'at' | 'width'>, pad = 0): Span => [
  r.at - r.width / 2 - pad,
  r.at + r.width / 2 + pad,
];

/** Gate spans on each lot side, any gate type. */
function gateSpans(lot: Lot, openings: readonly Opening[]): Map<Side, Span[]> {
  const out = new Map<Side, Span[]>();
  for (const o of openings) {
    const side = gateSide(o, lot);
    if (!side) continue;
    const list = out.get(side) ?? [];
    list.push([o.at - o.width / 2, o.at + o.width / 2]);
    out.set(side, list);
  }
  return out;
}

/** Spans a trunk of a crown of `size` cannot stand in on one side: ramps and gates, with the clearance. */
function blockedForTrees(lot: Lot, side: Side, size: Mm, openings: readonly Opening[]): Span[] {
  const pad = treeClearance(size);
  const spans: Span[] = [];
  for (const r of lot.frontage.ramps) {
    if (r.side === side) spans.push(rampSpan(r, pad));
  }
  for (const [a, b] of gateSpans(lot, openings).get(side) ?? []) spans.push([a - pad, b + pad]);
  return spans;
}

/** Nearest position to `wanted`, in FRONTAGE_STEP steps inside [lo, hi], for which `free` holds. */
function nearestFree(wanted: Mm, lo: Mm, hi: Mm, free: (at: Mm) => boolean): Mm | null {
  if (hi < lo) return null;
  const start = Math.round(clamp(wanted, lo, hi));
  if (free(start)) return start;
  const maxK = Math.ceil((hi - lo) / FRONTAGE_STEP) + 1;
  for (let k = 1; k <= maxK; k++) {
    const up = start + k * FRONTAGE_STEP;
    const down = start - k * FRONTAGE_STEP;
    if (up <= hi && free(up)) return up;
    if (down >= lo && free(down)) return down;
    if (up > hi && down < lo) break;
  }
  for (const edge of [lo, hi]) if (free(edge)) return edge;
  return null;
}

/** A free trunk position near `wanted` on a side for a crown of `size`, away from ramps, gates and the other trees. */
export function freeTreeSpot(
  lot: Lot,
  side: Side,
  wanted: Mm,
  size: Mm,
  openings: readonly Opening[],
  ignoreId: Id | null = null,
  others: readonly StreetTree[] = lot.frontage.trees,
): Mm | null {
  const [lo, hi] = treeRange(lot, side);
  const blocked = blockedForTrees(lot, side, size, openings);
  const trees = others.filter((t) => t.side === side && t.id !== ignoreId);
  return nearestFree(
    wanted,
    lo,
    hi,
    (at) =>
      blocked.every(([a, b]) => at <= a || at >= b) &&
      trees.every((t) => Math.abs(t.at - at) >= treeGap(size, t.size)),
  );
}

/** A free ramp center near `wanted` on a side, away from the other ramps. */
export function freeRampSpot(
  lot: Lot,
  side: Side,
  width: Mm,
  wanted: Mm,
  ignoreId: Id | null = null,
): Mm | null {
  const len = sideLength(lot, side);
  if (len < width) return null;
  const ramps = lot.frontage.ramps.filter((r) => r.side === side && r.id !== ignoreId);
  return nearestFree(wanted, Math.ceil(width / 2), Math.floor(len - width / 2), (at) =>
    ramps.every((r) => !overlaps(rampSpan({ at, width }), rampSpan(r, RAMP_GAP))),
  );
}

/** Default street trees: about one every TREE_PITCH along each street side, species alternated. */
export function defaultTrees(lot: TreeLot): StreetTree[] {
  const out: StreetTree[] = [];
  let k = 0;
  for (const side of streetSides(lot)) {
    const [lo, hi] = treeRange(lot, side);
    const span = hi - lo;
    if (span < 0) continue;
    // Centered cells of about TREE_PITCH: no trunk lands right at a lot corner.
    // About every 5 to 6 m, never closer than two crowns allow.
    const n = Math.max(1, Math.round(span / (TREE_PITCH - 1000)));
    const pitch = span / n;
    const first = lo + pitch / 2;
    for (let i = 0; i < n; i++) {
      const species = SPECIES_CYCLE[k % SPECIES_CYCLE.length]!;
      k += 1;
      out.push({
        id: newId(),
        side,
        at: snapTo(first + i * pitch, FRONTAGE_STEP),
        size: SPECIES_SIZE[species],
        species,
      });
    }
  }
  return out;
}

export function defaultFrontage(lot: TreeLot): Frontage {
  return { ramps: [], trees: defaultTrees(lot) };
}

/**
 * Keeps every tree clear of ramps, gates and the other trees. Trees already in a free spot stay; a tree
 * in the way then moves to the nearest free spot on its side (spacing `treeGap`), or goes away when no
 * spot is free. Returns the same lot when nothing changes.
 */
export function clearTreesFromRamps(lot: Lot, openings: readonly Opening[] = []): Lot {
  const trees = lot.frontage.trees;
  const stay: StreetTree[] = [];
  const blocked = new Set<Id>();
  for (const t of trees) {
    if (freeTreeSpot(lot, t.side, t.at, t.size, openings, t.id, stay) === t.at) stay.push(t);
    else blocked.add(t.id);
  }
  if (blocked.size === 0) return lot;
  // Moved trees go last, so they never push out a tree that did not have to move.
  const placed = new Map<Id, StreetTree>(stay.map((t) => [t.id, t]));
  const taken = [...stay];
  for (const t of trees) {
    if (!blocked.has(t.id)) continue;
    const at = freeTreeSpot(lot, t.side, t.at, t.size, openings, t.id, taken);
    if (at === null) continue;
    const moved = { ...t, at };
    placed.set(t.id, moved);
    taken.push(moved);
  }
  const kept = trees.flatMap((t) => placed.get(t.id) ?? []);
  return { ...lot, frontage: { ...lot.frontage, trees: kept } };
}

interface GateInfo {
  side: Side;
  at: Mm;
  width: Mm;
}

/** Vehicle gates on a street-side lot wall, by id. */
export function vehicleGates(doc: Pick<ProjectDoc, 'lot' | 'openings'>): Map<Id, GateInfo> {
  const sides = streetSides(doc.lot);
  const out = new Map<Id, GateInfo>();
  for (const o of doc.openings) {
    if (!isVehicleGate(o.type)) continue;
    const side = gateSide(o, doc.lot);
    if (side && sides.includes(side)) out.set(o.id, { side, at: o.at, width: o.width });
  }
  return out;
}

const rampForGate = (lot: Lot, g: GateInfo): Pick<SidewalkRamp, 'side' | 'at' | 'width'> => {
  const width = clampRampWidth(g.width + 2 * RAMP_FLARE);
  return { side: g.side, width, at: clampRampAt(lot, g.side, g.at, width) };
};

const sameRamp = (a: SidewalkRamp, b: SidewalkRamp): boolean =>
  a.side === b.side && a.at === b.at && a.width === b.width && a.gateId === b.gateId;

/**
 * Keeps the frontage consistent with the lot and its gates:
 * - items on sides that are no longer street sides go away; a side that just became a street side gets
 *   the default trees (only when `prev` is given);
 * - after a lot resize, positions are clamped to their side;
 * - each vehicle gate on a street-side lot wall keeps one linked ramp: a new gate creates one (or links
 *   an unlinked ramp under it), a linked ramp follows its gate, and a removed gate removes its ramp;
 * - trees step out of ramps and gates (`clearTreesFromRamps`, skipped with `moveTrees: false`).
 * Returns `{}` when nothing changes. `prev` is the doc before the change, null on load.
 */
export function syncGateRamps(
  doc: ProjectDoc,
  prev: ProjectDoc | null = null,
  moveTrees = true,
): Partial<ProjectDoc> {
  const lot = doc.lot;
  const sides = streetSides(lot);
  let changed = false;

  const resized = prev !== null && (prev.lot.width !== lot.width || prev.lot.depth !== lot.depth);
  let trees = lot.frontage.trees.filter((t) => sides.includes(t.side));
  let ramps = lot.frontage.ramps.filter((r) => sides.includes(r.side));
  if (trees.length !== lot.frontage.trees.length || ramps.length !== lot.frontage.ramps.length) {
    changed = true;
  }

  if (prev) {
    const before = streetSides(prev.lot);
    const added = sides.filter((s) => !before.includes(s) && !trees.some((t) => t.side === s));
    if (added.length) {
      const fresh = defaultTrees(lot).filter((t) => added.includes(t.side));
      if (fresh.length) {
        trees = [...trees, ...fresh];
        changed = true;
      }
    }
  }
  if (resized) {
    trees = trees.map((t) => {
      const at = clampTreeAt(lot, t.side, t.at);
      return at === t.at ? t : { ...t, at };
    });
    ramps = ramps.map((r) => {
      const at = clampRampAt(lot, r.side, r.at, r.width);
      return at === r.at ? r : { ...r, at };
    });
  }

  const gates = vehicleGates(doc);
  const prevGates = prev ? vehicleGates(prev) : null;

  const next: SidewalkRamp[] = [];
  for (const r of ramps) {
    if (r.gateId === null) {
      next.push(r);
      continue;
    }
    const g = gates.get(r.gateId);
    if (!g) {
      changed = true;
      continue;
    }
    const follow: SidewalkRamp = { ...r, ...rampForGate(lot, g) };
    if (sameRamp(follow, r)) next.push(r);
    else {
      next.push(follow);
      changed = true;
    }
  }

  for (const [id, g] of gates) {
    if (next.some((r) => r.gateId === id)) continue;
    const isNew = prevGates ? !prevGates.has(id) : true;
    if (!isNew) continue;
    const want = rampForGate(lot, g);
    const span = rampSpan(want);
    const under = next.findIndex(
      (r) => r.gateId === null && r.side === g.side && overlaps(rampSpan(r), span),
    );
    if (under >= 0) {
      next[under] = { ...next[under]!, ...want, gateId: id };
      changed = true;
      continue;
    }
    // On load, a gate that already has some ramp under it keeps the file as it is.
    if (!prevGates && next.some((r) => r.side === g.side && overlaps(rampSpan(r), span))) continue;
    next.push({ id: newId(), ...want, gateId: id });
    changed = true;
  }

  let out: Lot = changed ? { ...lot, frontage: { ramps: next, trees } } : lot;
  if (moveTrees) out = clearTreesFromRamps(out, doc.openings);
  return out === lot ? {} : { lot: out };
}

// ---------------------------------------------------------------------------
// Sliding gates on the front lot wall

/** Axis and line of the lot wall on a side. */
function sideLine(lot: Pick<Lot, 'width' | 'depth'>, side: Side): { axis: 'h' | 'v'; line: Mm } {
  if (side === 'top') return { axis: 'h', line: 0 };
  if (side === 'bottom') return { axis: 'h', line: lot.depth };
  if (side === 'left') return { axis: 'v', line: 0 };
  return { axis: 'v', line: lot.width };
}

/** Free intervals of the lot wall on a side: muro runs minus the other openings, with jambs and gaps. */
export function freeWall(
  doc: Pick<ProjectDoc, 'lot' | 'openings'>,
  runs: readonly WallRun[],
  side: Side,
  ignoreId: Id | null = null,
): [Mm, Mm][] {
  const { axis, line } = sideLine(doc.lot, side);
  let free: [Mm, Mm][] = runs
    .filter((r) => r.kind === 'boundary' && r.axis === axis && r.line === line)
    .map((r) => [r.start + MIN_JAMB, r.end - MIN_JAMB]);
  for (const o of doc.openings) {
    if (o.id === ignoreId || o.axis !== axis || o.line !== line) continue;
    free = subtractInterval(
      free,
      o.at - o.width / 2 - OPENING_GAP,
      o.at + o.width / 2 + OPENING_GAP,
    );
  }
  return free.filter(([a, b]) => b > a);
}

/** Wall a sliding gate covers, closed and parked: `start` parks toward the lower coordinate. */
export const slidingSpan = (at: Mm, width: Mm, hinge: 'start' | 'end'): [Mm, Mm] =>
  hinge === 'start' ? [at - width * 1.5, at + width / 2] : [at - width / 2, at + width * 1.5];

const inside = (span: [Mm, Mm], free: [Mm, Mm][]): boolean =>
  free.some(([a, b]) => span[0] >= a && span[1] <= b);

/**
 * Spots on a side where a sliding gate of `width` fits closed and parked inside the lot, best first
 * (nearest to `wanted`). Each spot has the slide direction that parks on free wall.
 */
export function slidingGateSpots(
  doc: Pick<ProjectDoc, 'lot' | 'openings'>,
  runs: readonly WallRun[],
  side: Side,
  width: Mm,
  wanted: Mm,
): { at: Mm; hinge: 'start' | 'end' }[] {
  const out: { at: Mm; hinge: 'start' | 'end' }[] = [];
  for (const [a, b] of freeWall(doc, runs, side)) {
    if (b - a < 2 * width) continue;
    const lo = Math.ceil(a + width * 1.5);
    const hi = Math.floor(b - width * 1.5);
    // Closest spot to `wanted` for each slide direction.
    out.push({ at: Math.max(lo, Math.min(b - width / 2, Math.round(wanted))), hinge: 'start' });
    out.push({ at: Math.min(hi, Math.max(a + width / 2, Math.round(wanted))), hinge: 'end' });
  }
  return out
    .filter((c) => inside(slidingSpan(c.at, width, c.hinge), freeWall(doc, runs, side)))
    .sort((x, y) => Math.abs(x.at - wanted) - Math.abs(y.at - wanted));
}

/** The slide direction that parks a placed sliding gate on free wall, or null when neither fits. */
export function parkingHinge(
  doc: Pick<ProjectDoc, 'lot' | 'openings'>,
  runs: readonly WallRun[],
  o: Opening,
): 'start' | 'end' | null {
  const side = gateSide(o, doc.lot);
  if (!side) return null;
  const free = freeWall(doc, runs, side, o.id);
  const order: ('start' | 'end')[] = o.hinge === 'start' ? ['start', 'end'] : ['end', 'start'];
  return order.find((h) => inside(slidingSpan(o.at, o.width, h), free)) ?? null;
}

// ---------------------------------------------------------------------------
// Hit test

export type FrontageHit = { kind: 'street-tree'; id: Id } | { kind: 'sidewalk-ramp'; id: Id };

const insideLot = (lot: Lot, p: Vec): boolean =>
  p.x > 0 && p.y > 0 && p.x < lot.width && p.y < lot.depth;

/** Trees first (last drawn on top), then ramps. Tree canopies do not catch points inside the lot. */
export function frontageHit(lot: Lot, p: Vec, tolMm: Mm): FrontageHit | null {
  const trees = lot.frontage.trees;
  for (let i = trees.length - 1; i >= 0; i--) {
    const t = trees[i]!;
    const c = treePoint(lot, t);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    const reach = Math.max(t.size * 0.42, tolMm);
    if (d <= reach && (!insideLot(lot, p) || d <= tolMm)) return { kind: 'street-tree', id: t.id };
  }
  const s = lot.sidewalkWidth;
  for (let i = lot.frontage.ramps.length - 1; i >= 0; i--) {
    const r = lot.frontage.ramps[i]!;
    const along = alongOf(r.side, p);
    const out = outOf(lot, r.side, p);
    const half = r.width / 2 + tolMm / 2;
    if (Math.abs(along - r.at) <= half && out >= -tolMm / 4 && out <= s + tolMm / 2) {
      return { kind: 'sidewalk-ramp', id: r.id };
    }
  }
  return null;
}
