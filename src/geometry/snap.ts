import { FINE_STEP, MIN_ROOM_SIDE } from '../model/defaults.ts';
import type { Area, Item, Lot, Mm, Vec } from '../model/types.ts';
import { rotatedAabb } from './shape.ts';
import type { Guide, Rect, SnapContext } from './types.ts';

export { snapOpening } from './openings.ts';
export { snapRulerEnd } from './raycast.ts';

export interface SnapResult<T> {
  value: T;
  guides: Guide[];
  /** True when a magnet (wall face or alignment) moved the value beyond the plain grid snap. */
  changed: boolean;
}

export interface ItemSnapContext extends SnapContext {
  otherItems: Item[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, step: Mm) => Math.round(v / step) * step;

/** Alignment candidates: every area vertex plus the lot edges. */
export function alignmentLines(areas: Area[], lot: Lot): { alignX: Mm[]; alignY: Mm[] } {
  const xs = new Set<Mm>([0, lot.width]);
  const ys = new Set<Mm>([0, lot.depth]);
  for (const a of areas) {
    for (const ring of a.shape) {
      for (const p of ring) {
        xs.add(p.x);
        ys.add(p.y);
      }
    }
  }
  return {
    alignX: [...xs].sort((a, b) => a - b),
    alignY: [...ys].sort((a, b) => a - b),
  };
}

/** Alignment within tolMm wins over the grid; the result stays inside the lot. */
export function snapCoord(
  v: Mm,
  axis: 'x' | 'y',
  ctx: SnapContext,
): { v: Mm; guide: Guide | null } {
  const list = axis === 'x' ? ctx.alignX : ctx.alignY;
  let best: Mm | null = null;
  for (const a of list) {
    if (Math.abs(a - v) <= ctx.tolMm && (best === null || Math.abs(a - v) < Math.abs(best - v))) {
      best = a;
    }
  }
  const max = axis === 'x' ? ctx.lot.width : ctx.lot.depth;
  if (best !== null) return { v: clamp(best, 0, max), guide: { axis, at: best } };
  return { v: clamp(roundTo(v, ctx.step), 0, max), guide: null };
}

export function snapRoomRect(
  start: Vec,
  current: Vec,
  ctx: SnapContext,
): { rect: Rect; valid: boolean; guides: Guide[] } {
  const ax = snapCoord(start.x, 'x', ctx);
  const ay = snapCoord(start.y, 'y', ctx);
  const bx = snapCoord(current.x, 'x', ctx);
  const by = snapCoord(current.y, 'y', ctx);
  const x0 = Math.min(ax.v, bx.v);
  const x1 = Math.max(ax.v, bx.v);
  const y0 = Math.min(ay.v, by.v);
  const y1 = Math.max(ay.v, by.v);
  const valid = x1 - x0 >= MIN_ROOM_SIDE && y1 - y0 >= MIN_ROOM_SIDE;
  const guides = [ax.guide, ay.guide, bx.guide, by.guide].filter((g): g is Guide => g !== null);
  return { rect: { x0, y0, x1, y1 }, valid, guides };
}

/** Rotation that turns the item back (local -y) toward the wall behind a face with this normal. */
function backRotation(faceAxis: 'h' | 'v', normal: 1 | -1): number {
  if (faceAxis === 'h') return normal === 1 ? 0 : 180;
  return normal === 1 ? 270 : 90;
}

/**
 * 1. Center on the 50 mm grid.
 * 2. Wall magnet (`wallSnap: 'back'`, rotation a multiple of 90°): the nearest face within 2 × tolMm takes the
 *    item back edge, and the item turns so its back faces the wall.
 * 3. Alignment of box edges and centers with other items within tolMm, with guides.
 */
export function snapItem(
  item: Item,
  def: { wallSnap: 'back' | 'none' },
  ctx: ItemSnapContext,
): SnapResult<Pick<Item, 'x' | 'y' | 'rotation'>> {
  let x = roundTo(item.x, FINE_STEP);
  let y = roundTo(item.y, FINE_STEP);
  let rotation = item.rotation;
  let lockX = false;
  let lockY = false;
  let changed = false;
  const guides: Guide[] = [];

  const rot = ((Math.round(item.rotation) % 360) + 360) % 360;
  if (def.wallSnap === 'back' && rot % 90 === 0) {
    let best: { dist: number; x: Mm; y: Mm; rotation: number; lock: 'x' | 'y' } | null = null;
    const reach = ctx.tolMm * 2;
    for (const f of ctx.faces) {
      const candRot = backRotation(f.axis, f.normal);
      const half = item.d / 2;
      const center = f.axis === 'v' ? item.x : item.y;
      const along = f.axis === 'v' ? item.y : item.x;
      if ((center - f.at) * f.normal <= 0) continue;
      if (along < f.from || along > f.to) continue;
      const target = f.at + f.normal * half;
      const dist = Math.abs(center - target);
      if (dist > reach) continue;
      const better =
        !best ||
        dist < best.dist ||
        (dist === best.dist && candRot === rot && best.rotation !== rot);
      if (!better) continue;
      best =
        f.axis === 'v'
          ? { dist, x: Math.round(target), y, rotation: candRot, lock: 'x' }
          : { dist, x, y: Math.round(target), rotation: candRot, lock: 'y' };
    }
    if (best) {
      x = best.x;
      y = best.y;
      rotation = best.rotation;
      if (best.lock === 'x') lockX = true;
      else lockY = true;
      changed = true;
    }
  }

  const own = rotatedAabb(x, y, item.w, item.d, rotation);
  const ownX = [own.x0, x, own.x1];
  const ownY = [own.y0, y, own.y1];
  let bestDx: { d: number; at: Mm } | null = null;
  let bestDy: { d: number; at: Mm } | null = null;
  for (const o of ctx.otherItems) {
    if (o.id === item.id) continue;
    const box = rotatedAabb(o.x, o.y, o.w, o.d, o.rotation);
    if (!lockX) {
      for (const t of [box.x0, o.x, box.x1]) {
        for (const s of ownX) {
          const d = t - s;
          if (Math.abs(d) <= ctx.tolMm && (!bestDx || Math.abs(d) < Math.abs(bestDx.d))) {
            bestDx = { d, at: t };
          }
        }
      }
    }
    if (!lockY) {
      for (const t of [box.y0, o.y, box.y1]) {
        for (const s of ownY) {
          const d = t - s;
          if (Math.abs(d) <= ctx.tolMm && (!bestDy || Math.abs(d) < Math.abs(bestDy.d))) {
            bestDy = { d, at: t };
          }
        }
      }
    }
  }
  if (bestDx) {
    x = Math.round(x + bestDx.d);
    guides.push({ axis: 'x', at: bestDx.at });
    changed = true;
  }
  if (bestDy) {
    y = Math.round(y + bestDy.d);
    guides.push({ axis: 'y', at: bestDy.at });
    changed = true;
  }
  return { value: { x, y, rotation }, guides, changed };
}
