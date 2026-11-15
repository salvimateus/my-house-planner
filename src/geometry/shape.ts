import type { Axis, Mm, Ring, Shape, Vec } from '../model/types.ts';
import type { Rect, Region } from './types.ts';

/** Shoelace formula. Outer rings are positive, holes negative. */
export function signedArea(ring: Ring): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

export function edges(ring: Ring): [Vec, Vec][] {
  const n = ring.length;
  const out: [Vec, Vec][] = [];
  for (let i = 0; i < n; i++) out.push([ring[i]!, ring[(i + 1) % n]!]);
  return out;
}

/**
 * Side of the shape interior for the directed edge p→q, as the sign of the axis normal
 * (+y for a horizontal edge, +x for a vertical edge). Interior is on the algebraic left.
 */
export function interiorSide(p: Vec, q: Vec): 1 | -1 {
  if (p.y === q.y) return q.x > p.x ? 1 : -1;
  return q.y > p.y ? -1 : 1;
}

export function edgeAxis(p: Vec, q: Vec): Axis {
  return p.y === q.y ? 'h' : 'v';
}

export function isRectilinear(ring: Ring): boolean {
  if (ring.length < 4) return false;
  return edges(ring).every(([p, q]) => (p.x === q.x) !== (p.y === q.y));
}

/** Drops repeated points (including a closing copy of the first point) and collinear points. */
export function simplifyRing(ring: Ring): Ring {
  const pts = ring.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length >= 3; i++) {
      const n = pts.length;
      const prev = pts[(i - 1 + n) % n]!;
      const p = pts[i]!;
      const q = pts[(i + 1) % n]!;
      const dup = p.x === q.x && p.y === q.y;
      const collinear = (prev.x === p.x && p.x === q.x) || (prev.y === p.y && p.y === q.y);
      if (dup || collinear) {
        pts.splice(i, 1);
        changed = true;
        i--;
      }
    }
  }
  return pts.length >= 3 ? pts : [];
}

/**
 * Rounds, simplifies and orients a shape: the ring with the largest area becomes the positive outer ring,
 * every other ring becomes a negative hole. Degenerate rings are dropped.
 */
export function normalizeShape(shape: Shape): Shape {
  const rings = shape
    .map(simplifyRing)
    .filter((r) => r.length >= 4 && signedArea(r) !== 0)
    .map((r) => ({ r, a: signedArea(r) }));
  if (!rings.length) return [];
  let outerIdx = 0;
  rings.forEach((x, i) => {
    if (Math.abs(x.a) > Math.abs(rings[outerIdx]!.a)) outerIdx = i;
  });
  const orient = (x: { r: Ring; a: number }, positive: boolean): Ring =>
    x.a > 0 === positive ? x.r : [...x.r].reverse();
  const out: Shape = [orient(rings[outerIdx]!, true)];
  rings.forEach((x, i) => {
    if (i !== outerIdx) out.push(orient(x, false));
  });
  return out;
}

/** Even-odd test over all rings of the shape. */
export function pointInShape(p: Vec, shape: Shape): boolean {
  let inside = false;
  for (const ring of shape) if (pointInRing(p, ring)) inside = !inside;
  return inside;
}

export function pointInRing(p: Vec, ring: Ring): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    if (a.x !== b.x) continue;
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    if (p.y >= y0 && p.y < y1 && p.x < a.x) inside = !inside;
  }
  return inside;
}

export function pointInRegion(p: Vec, region: Region): boolean {
  return region.some((shape) => pointInShape(p, shape));
}

const isRegion = (x: Shape | Region): x is Region => Array.isArray(x[0]?.[0]);

/** Bounding box of a shape or a region; a zero rect for empty input. */
export function bboxOf(x: Shape | Region): Rect {
  const shapes: Shape[] = isRegion(x) ? x : [x as Shape];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const shape of shapes) {
    const outer = shape[0];
    if (!outer) continue;
    for (const p of outer) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  }
  if (x0 === Infinity) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

/** Positive outer ring, clockwise on screen (y down). */
export function rectShape(r: Rect): Shape {
  return [
    [
      { x: r.x0, y: r.y0 },
      { x: r.x1, y: r.y0 },
      { x: r.x1, y: r.y1 },
      { x: r.x0, y: r.y1 },
    ],
  ];
}

export const rectWidth = (r: Rect): Mm => r.x1 - r.x0;
export const rectHeight = (r: Rect): Mm => r.y1 - r.y0;
export const rectArea = (r: Rect): number => (r.x1 - r.x0) * (r.y1 - r.y0);

/** True when the two rects share a positive area. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** True when the rects overlap or share a boundary. */
export function rectsTouch(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const r = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return r.x0 < r.x1 && r.y0 < r.y1 ? r : null;
}

export function pointInRect(p: Vec, r: Rect, tol: Mm = 0): boolean {
  return p.x >= r.x0 - tol && p.x <= r.x1 + tol && p.y >= r.y0 - tol && p.y <= r.y1 + tol;
}

export function translateShape(shape: Shape, dx: Mm, dy: Mm): Shape {
  return shape.map((ring) => ring.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

/** SVG path data for a region, to draw with fill-rule="evenodd". */
export function regionPath(region: Region | Shape): string {
  const shapes: Shape[] = isRegion(region) ? region : [region as Shape];
  let d = '';
  for (const shape of shapes) {
    for (const ring of shape) {
      if (!ring.length) continue;
      const first = ring[0]!;
      d += `M${first.x} ${first.y}`;
      for (let i = 1; i < ring.length; i++) {
        const prev = ring[i - 1]!;
        const p = ring[i]!;
        if (p.y === prev.y) d += `H${p.x}`;
        else if (p.x === prev.x) d += `V${p.y}`;
        else d += `L${p.x} ${p.y}`;
      }
      d += 'Z';
    }
  }
  return d;
}

/** Axis-aligned box of a w × d rectangle centered at (cx, cy), rotated clockwise, rounded outward. */
export function rotatedAabb(cx: Mm, cy: Mm, w: Mm, d: Mm, deg: number): Rect {
  const r = ((Math.round(deg) % 360) + 360) % 360;
  let hx: number;
  let hy: number;
  if (r % 180 === 0) {
    hx = w / 2;
    hy = d / 2;
  } else if (r % 90 === 0) {
    hx = d / 2;
    hy = w / 2;
  } else {
    const rad = (r * Math.PI) / 180;
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    hx = (c * w + s * d) / 2;
    hy = (s * w + c * d) / 2;
  }
  const eps = 1e-6;
  return {
    x0: Math.floor(cx - hx + eps),
    y0: Math.floor(cy - hy + eps),
    x1: Math.ceil(cx + hx - eps),
    y1: Math.ceil(cy + hy - eps),
  };
}

/** Point in a w × d rectangle centered at (cx, cy) and rotated clockwise by deg, with a tolerance. */
export function pointInRotatedRect(
  p: Vec,
  cx: Mm,
  cy: Mm,
  w: Mm,
  d: Mm,
  deg: number,
  tol: Mm = 0,
): boolean {
  const rad = (-deg * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  return Math.abs(lx) <= w / 2 + tol && Math.abs(ly) <= d / 2 + tol;
}

/** Distance from a point to the segment a-b. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
