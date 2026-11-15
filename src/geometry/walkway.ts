import type { Mm, Vec, Walkway } from '../model/types.ts';
import { distToSegment } from './shape.ts';
import type { Rect } from './types.ts';

/** Float point of the derived curve (the model keeps integer control points). */
export interface Pt {
  x: number;
  y: number;
}

export interface Cubic {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p3: Pt;
}

export interface CurveSample extends Pt {
  /** Arc length from the start, mm. */
  s: number;
}

export interface WalkwayCurve {
  cubics: Cubic[];
  /** Dense polyline along the curve; at least 2 samples for 2 distinct points. */
  samples: CurveSample[];
  length: number;
}

/** A point on the curve with its tangent angle in radians. */
export interface Station extends Pt {
  angle: number;
}

/** Stepping stones: length along the path and center-to-center pitch. */
export const STONE_LENGTH: Mm = 400;
export const STONE_PITCH: Mm = 600;

const ALPHA = 0.5;
const EPS = 1e-6;
/** Polyline step of the sampled curve. */
const SAMPLE_MM = 40;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Centripetal Catmull-Rom segment p1→p2 as a cubic Bézier (Yuksel et al.). Centripetal
 * parametrization has no cusps or self-loops inside a segment, so tight taps still give round turns.
 */
function crToBezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Cubic {
  const d1 = dist(p0, p1) ** ALPHA;
  const d2 = dist(p1, p2) ** ALPHA;
  const d3 = dist(p2, p3) ** ALPHA;
  if (d2 < EPS) return { p0: p1, c1: p1, c2: p2, p3: p2 };
  let c1: Pt = p1;
  if (d1 >= EPS) {
    const a = d1 * d1;
    const b = d2 * d2;
    const k = 2 * a + 3 * d1 * d2 + b;
    const m = 3 * d1 * (d1 + d2);
    c1 = { x: (a * p2.x - b * p0.x + k * p1.x) / m, y: (a * p2.y - b * p0.y + k * p1.y) / m };
  }
  let c2: Pt = p2;
  if (d3 >= EPS) {
    const a = d3 * d3;
    const b = d2 * d2;
    const k = 2 * a + 3 * d3 * d2 + b;
    const m = 3 * d3 * (d3 + d2);
    c2 = { x: (a * p1.x - b * p3.x + k * p2.x) / m, y: (a * p1.y - b * p3.y + k * p2.y) / m };
  }
  return { p0: p1, c1, c2, p3: p2 };
}

/** One cubic per pair of consecutive points. The ends use mirrored phantom points. */
export function walkwayCubics(points: readonly Pt[]): Cubic[] {
  const n = points.length;
  const out: Cubic[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = i > 0 ? points[i - 1]! : { x: 2 * p1.x - p2.x, y: 2 * p1.y - p2.y };
    const p3 = i + 2 < n ? points[i + 2]! : { x: 2 * p2.x - p1.x, y: 2 * p2.y - p1.y };
    out.push(crToBezier(p0, p1, p2, p3));
  }
  return out;
}

export function cubicAt(c: Cubic, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c.p0.x + b * c.c1.x + d * c.c2.x + e * c.p3.x,
    y: a * c.p0.y + b * c.c1.y + d * c.c2.y + e * c.p3.y,
  };
}

const r1 = (v: number): number => Math.round(v * 10) / 10;

/** SVG path of the centerline: one `C` per segment. */
export function walkwayPathD(points: readonly Pt[]): string {
  const cubics = walkwayCubics(points);
  if (cubics.length === 0) return '';
  const f = (p: Pt) => `${r1(p.x)} ${r1(p.y)}`;
  let d = `M${f(cubics[0]!.p0)}`;
  for (const c of cubics) d += `C${f(c.c1)} ${f(c.c2)} ${f(c.p3)}`;
  return d;
}

function buildCurve(points: readonly Pt[]): WalkwayCurve {
  const cubics = walkwayCubics(points);
  const samples: CurveSample[] = [];
  let s = 0;
  const push = (p: Pt) => {
    const last = samples[samples.length - 1];
    if (last) {
      const step = dist(last, p);
      if (step < EPS) return;
      s += step;
    }
    samples.push({ x: p.x, y: p.y, s });
  };
  for (const c of cubics) {
    const hull = dist(c.p0, c.c1) + dist(c.c1, c.c2) + dist(c.c2, c.p3);
    const steps = Math.max(6, Math.min(96, Math.ceil(hull / SAMPLE_MM)));
    if (samples.length === 0) push(c.p0);
    for (let k = 1; k <= steps; k++) push(cubicAt(c, k / steps));
  }
  if (samples.length === 0 && points[0]) push(points[0]);
  return { cubics, samples, length: s };
}

// Immer keeps unchanged point arrays by reference, so one build per array serves every consumer.
const cache = new WeakMap<readonly Pt[], WalkwayCurve>();

export function walkwayCurve(points: readonly Pt[]): WalkwayCurve {
  let c = cache.get(points);
  if (!c) {
    c = buildCurve(points);
    cache.set(points, c);
  }
  return c;
}

/** Length of the drawn centerline, rounded to whole mm. */
export const walkwayLength = (points: readonly Pt[]): Mm => Math.round(walkwayCurve(points).length);

/** Index of the last sample at or before `s`. */
function sampleIndex(samples: CurveSample[], s: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid]!.s <= s) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The curve point at arc length `s` (clamped to the curve). */
export function pointAtLength(curve: WalkwayCurve, s: number): Pt {
  const { samples } = curve;
  if (samples.length === 0) return { x: 0, y: 0 };
  const i = sampleIndex(samples, Math.max(0, Math.min(curve.length, s)));
  const a = samples[i]!;
  const b = samples[i + 1];
  if (!b) return { x: a.x, y: a.y };
  const span = b.s - a.s;
  return lerp(a, b, span > 0 ? (s - a.s) / span : 0);
}

/** Point and tangent at arc length `s`. The tangent comes from a short chord around the point. */
export function stationAt(curve: WalkwayCurve, s: number): Station {
  const p = pointAtLength(curve, s);
  const h = Math.min(SAMPLE_MM, curve.length / 2);
  const a = pointAtLength(curve, s - h);
  const b = pointAtLength(curve, s + h);
  return { x: p.x, y: p.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Stations every `pitch` mm, centered on the curve so both ends get the same margin. */
export function stationsAtPitch(curve: WalkwayCurve, pitch: Mm, keep: Mm = 0): Station[] {
  if (curve.samples.length < 2 || curve.length <= 0) return [];
  const usable = Math.max(0, curve.length - keep);
  const count = Math.floor(usable / pitch) + 1;
  const first = (curve.length - (count - 1) * pitch) / 2;
  const out: Station[] = [];
  for (let k = 0; k < count; k++) out.push(stationAt(curve, first + k * pitch));
  return out;
}

/** Centers and angles of the stepping stones of a path. */
export const stoneStations = (points: readonly Pt[]): Station[] =>
  stationsAtPitch(walkwayCurve(points), STONE_PITCH, STONE_LENGTH);

/** Left and right offset lines of the sampled curve at `half` mm, as one closed polygon. */
export function walkwayOutline(points: readonly Pt[], width: Mm): Pt[] {
  const { samples } = walkwayCurve(points);
  const n = samples.length;
  if (n < 2) return [];
  const half = width / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)]!;
    const b = samples[Math.min(n - 1, i + 1)]!;
    const len = dist(a, b) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const p = samples[i]!;
    left.push({ x: p.x + nx * half, y: p.y + ny * half });
    right.push({ x: p.x - nx * half, y: p.y - ny * half });
  }
  return [...left, ...right.reverse()];
}

/** Distance from `p` to the centerline. */
export function distanceToCurve(curve: WalkwayCurve, p: Vec): number {
  const { samples } = curve;
  if (samples.length === 1) return dist(samples[0]!, p);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < samples.length - 1; i++) {
    const d = distToSegment(p, samples[i]!, samples[i + 1]!);
    if (d < best) best = d;
  }
  return best;
}

/** Bounding box of the control points. */
export function pointsBounds(points: readonly Vec[]): Rect {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Curve point halfway (t = 0.5) along each segment: where a new point goes in. */
export const segmentMidpoints = (points: readonly Pt[]): Pt[] =>
  walkwayCubics(points).map((c) => cubicAt(c, 0.5));

export interface WalkwayHit {
  /** Index of the control point under `p`, or null on the body. */
  point: number | null;
}

/** Hit on the strip (half width plus `tolMm` around the centerline), or null. */
export function hitWalkway(w: Walkway, p: Vec, tolMm: Mm): WalkwayHit | null {
  const curve = walkwayCurve(w.points);
  const box = pointsBounds(curve.samples);
  const reach = w.width / 2 + tolMm;
  if (p.x < box.x0 - reach || p.x > box.x1 + reach || p.y < box.y0 - reach || p.y > box.y1 + reach)
    return null;
  if (distanceToCurve(curve, p) > reach) return null;
  let point: number | null = null;
  let bestD = tolMm;
  w.points.forEach((q, i) => {
    const d = dist(q, p);
    if (d <= bestD) {
      bestD = d;
      point = i;
    }
  });
  return { point };
}
