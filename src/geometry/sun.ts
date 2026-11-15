import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import type { Id, Item, Mm, OpeningType, ProjectDoc, RoomPresetId, Vec } from '../model/types.ts';
import { toRings, unionDifferenceMask, unionMask } from './rectilinear.ts';
import { pointInRegion, regionPath } from './shape.ts';
import type { CatalogLookup, CellMask, Rect, Region, Scene, WallSegment } from './types.ts';

export interface SunSite {
  readonly city: string;
  readonly lat: number;
  readonly lon: number;
  readonly utcOffsetHours: number;
}

/** The only site for now; a city choice can replace it later. */
export const SUN_SITE: SunSite = {
  city: 'São Paulo',
  lat: -23.55,
  lon: -46.63,
  utcOffsetHours: -3,
};

export interface SunDate {
  /** 1..12 */
  month: number;
  day: number;
}

export interface SunPosition {
  /** Degrees above the horizon, no refraction. */
  elevation: number;
  /** Degrees clockwise from true north. */
  azimuth: number;
}

export interface SunTimes {
  /** Local minutes after midnight. */
  sunrise: number;
  sunset: number;
  noon: number;
}

/** Caster heights in mm. */
export const SUN_HEIGHTS = {
  roof: 3000,
  muro: 2000,
  neighbor: 3500,
  tree: 4500,
  shrub: 1200,
  car: 1500,
  counter: 1000,
  item: 800,
} as const;

const RAD = Math.PI / 180;
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export const dayOfYear = ({ month, day }: SunDate): number => (MONTH_START[month - 1] ?? 0) + day;

/** NOAA fractional-year approximation: declination (rad) and equation of time (min). */
function solarTerms(date: SunDate, minutes: number): { decl: number; eqTime: number } {
  const g = ((2 * Math.PI) / 365) * (dayOfYear(date) - 1 + (minutes / 60 - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return { decl, eqTime };
}

export const solarDeclination = (date: SunDate): number => solarTerms(date, 720).decl / RAD;

export function sunPosition(date: SunDate, minutes: number, site: SunSite = SUN_SITE): SunPosition {
  const { decl, eqTime } = solarTerms(date, minutes);
  const trueSolar = minutes + eqTime + 4 * site.lon - 60 * site.utcOffsetHours;
  const ha = (trueSolar / 4 - 180) * RAD;
  const lat = site.lat * RAD;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elevation = 90 - Math.acos(Math.min(1, Math.max(-1, cosZ))) / RAD;
  const az =
    Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / RAD +
    180;
  return { elevation, azimuth: ((az % 360) + 360) % 360 };
}

/** Sunrise and sunset with the standard 0.833° horizon correction. */
export function sunTimes(date: SunDate, site: SunSite = SUN_SITE): SunTimes {
  const { decl, eqTime } = solarTerms(date, 720);
  const lat = site.lat * RAD;
  const cosH =
    Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const h = Math.acos(Math.min(1, Math.max(-1, cosH))) / RAD;
  const tz = 60 * site.utcOffsetHours;
  const noon = 720 - 4 * site.lon - eqTime + tz;
  return { sunrise: noon - 4 * h, sunset: noon + 4 * h, noon };
}

/** Unit vector toward the sun in plan coordinates (x right, y down). `northDeg`: true north, clockwise from screen up. */
export function sunDirection(azimuth: number, northDeg: number): Vec {
  const b = (azimuth + northDeg) * RAD;
  return { x: Math.sin(b), y: -Math.cos(b) };
}

const CARDINALS = [
  'norte',
  'nordeste',
  'leste',
  'sudeste',
  'sul',
  'sudoeste',
  'oeste',
  'noroeste',
] as const;
export const cardinalOf = (azimuth: number): string =>
  CARDINALS[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8]!;

/** "07:45" */
export function formatClock(minutes: number): string {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "7h", "7h30" */
export function formatHour(minutes: number): string {
  const m = Math.round(minutes);
  const mm = m % 60;
  return `${Math.floor(m / 60)}h${mm ? String(mm).padStart(2, '0') : ''}`;
}

// Scene casters

/** Convex footprint lifted between `base` and `top`; base 0 stands on the ground. */
export interface Prism {
  pts: Vec[];
  base: Mm;
  top: Mm;
}

/** Glass opening on an external wall, seen from its room. */
export interface SunWindow {
  roomId: Id;
  a: Vec;
  b: Vec;
  /** Unit axis vector into the room. */
  inward: Vec;
  sill: Mm;
  head: Mm;
  /** Sample points on the outer wall face, about every 100 mm along the width. */
  samples: Vec[];
  /** Obstacles on the outer side of the window, in reach of a low sun. */
  obstacles: Obstacle[];
}

/**
 * Box that keeps the sun off a window. A solid box shades the wall below `h - d · tan(elevation)`;
 * a roof (covered area) stops rays that climb to `h` while still under it.
 */
export interface Obstacle extends Rect {
  h: Mm;
  roof: boolean;
}

export interface SunRoom {
  id: Id;
  name: string;
  preset: RoomPresetId;
  /** Net floor path, evenodd. */
  path: string;
  rects: Rect[];
  hasGlass: boolean;
}

export interface SunModel {
  prisms: Prism[];
  /** Roofed footprint path, evenodd: outside shadows never draw over it. */
  roofPath: string;
  windows: SunWindow[];
  rooms: SunRoom[];
  bounds: Rect;
}

/** Things around the lot that cast shadows, from the context drawing. */
export interface SunContext {
  houses: Rect[];
  trees: { at: Vec; size: Mm }[];
  bounds: Rect;
}

const GLASS: ReadonlySet<OpeningType> = new Set(
  (Object.keys(OPENING_SPECS) as OpeningType[]).filter(
    (t) => OPENING_SPECS[t].group === 'window' || t === 'door-balcony',
  ),
);

const DISC_SEGMENTS = 14;

function rectPts(r: Rect): Vec[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

function discPts(c: Vec, r: Mm): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < DISC_SEGMENTS; i++) {
    const a = (i / DISC_SEGMENTS) * 2 * Math.PI;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

/** Corners of a w × d box centered at (x, y), rotated clockwise on screen. */
function boxPts(x: Mm, y: Mm, w: Mm, d: Mm, deg: number): Vec[] {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([px, py]) => ({ x: x + px! * c - py! * s, y: y + px! * s + py! * c }));
}

/** Filled cells merged into row runs, then stacked runs with equal spans. */
export function maskRects({ xs, ys, cells }: CellMask): Rect[] {
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols <= 0 || rows <= 0) return [];
  const out: Rect[] = [];
  let open = new Map<string, Rect>();
  for (let r = 0; r < rows; r++) {
    const next = new Map<string, Rect>();
    let c = 0;
    while (c < cols) {
      if (!cells[r * cols + c]) {
        c++;
        continue;
      }
      const c0 = c;
      while (c < cols && cells[r * cols + c]) c++;
      const key = `${c0}:${c}`;
      const prev = open.get(key);
      if (prev && prev.y1 === ys[r]) {
        prev.y1 = ys[r + 1]!;
        next.set(key, prev);
        open.delete(key);
      } else {
        const rect = { x0: xs[c0]!, x1: xs[c]!, y0: ys[r]!, y1: ys[r + 1]! };
        out.push(rect);
        next.set(key, rect);
      }
    }
    open = next;
  }
  return out;
}

function itemPrisms(it: Item): Prism[] {
  const size = (it.w + it.d) / 2;
  if (it.type === 'tree') {
    const top = Math.min(7500, Math.max(3000, SUN_HEIGHTS.tree * (size / 3000)));
    return canopy({ x: it.x, y: it.y }, size, top);
  }
  if (it.type === 'shrub') {
    return [{ pts: discPts({ x: it.x, y: it.y }, size / 2), base: 0, top: SUN_HEIGHTS.shrub }];
  }
  const top = it.type.startsWith('car-')
    ? SUN_HEIGHTS.car
    : it.type === 'bbq' || it.type === 'gourmet-counter'
      ? SUN_HEIGHTS.counter
      : SUN_HEIGHTS.item;
  return [{ pts: boxPts(it.x, it.y, it.w, it.d, it.rotation), base: 0, top }];
}

/** Crown from 45% of the height to the top, and a thin trunk below it. */
function canopy(at: Vec, diameter: Mm, top: Mm): Prism[] {
  const base = Math.round(top * 0.45);
  return [
    { pts: discPts(at, diameter / 2), base, top },
    { pts: discPts(at, 140), base: 0, top: base },
  ];
}

/** Segment of `axis` on `line` that holds `at`. */
function segmentAt(walls: WallSegment[], axis: 'h' | 'v', line: Mm, at: Mm): WallSegment | null {
  return (
    walls.find(
      (w) =>
        w.kind === 'external' && w.axis === axis && w.line === line && w.start <= at && w.end >= at,
    ) ?? null
  );
}

const cache = new WeakMap<Scene, { doc: ProjectDoc; ctx: SunContext; model: SunModel }>();

/** Static sun inputs of a scene: casters, roof, glass openings and room floors. Cached per scene. */
export function deriveSunModel(
  doc: ProjectDoc,
  scene: Scene,
  lookup: Pick<CatalogLookup, 'itemLayer'>,
  ctx: SunContext,
): SunModel {
  const hit = cache.get(scene);
  if (hit && hit.doc === doc && hit.ctx === ctx) return hit.model;

  const roofed = doc.areas.filter((a) => a.kind !== 'outdoor' && a.shape.length);
  const roofMask = unionMask([...roofed.map((a): Region => [a.shape]), ...scene.wallRects]);
  const roof = toRings(roofMask);
  const prisms: Prism[] = maskRects(roofMask).map((r) => ({
    pts: rectPts(r),
    base: 0,
    top: SUN_HEIGHTS.roof,
  }));
  if (scene.boundaryGeom.length) {
    for (const r of maskRects(unionMask([scene.boundaryGeom]))) {
      prisms.push({ pts: rectPts(r), base: 0, top: SUN_HEIGHTS.muro });
    }
  }
  for (const it of doc.items) {
    if (lookup.itemLayer(it.type) === 'floor') continue;
    if (pointInRegion({ x: it.x, y: it.y }, roof)) continue;
    prisms.push(...itemPrisms(it));
  }
  for (const h of ctx.houses) prisms.push({ pts: rectPts(h), base: 0, top: SUN_HEIGHTS.neighbor });
  for (const t of ctx.trees) {
    const top = Math.min(7000, Math.max(3500, SUN_HEIGHTS.tree * (t.size / 4200)));
    prisms.push(...canopy(t.at, t.size, top));
  }

  const roomShapes = doc.areas.filter((a) => a.kind === 'room').map((a): Region => [a.shape]);
  const solidMask = unionMask([...roomShapes, ...scene.wallRects]);
  const obstacles: Obstacle[] = maskRects(solidMask).map((r) => ({
    ...r,
    h: SUN_HEIGHTS.roof,
    roof: false,
  }));
  const covered = doc.areas.filter((a) => a.kind === 'covered').map((a): Region => [a.shape]);
  if (covered.length) {
    const coverMask = unionDifferenceMask(covered, [toRings(solidMask)]);
    for (const r of maskRects(coverMask)) obstacles.push({ ...r, h: SUN_HEIGHTS.roof, roof: true });
  }
  if (scene.boundaryGeom.length) {
    for (const r of maskRects(unionMask([scene.boundaryGeom]))) {
      obstacles.push({ ...r, h: SUN_HEIGHTS.muro, roof: false });
    }
  }
  for (const h of ctx.houses) obstacles.push({ ...h, h: SUN_HEIGHTS.neighbor, roof: false });

  const areaById = new Map(doc.areas.map((a) => [a.id, a]));
  const windows: SunWindow[] = [];
  for (const o of doc.openings) {
    if (!GLASS.has(o.type)) continue;
    const d = scene.openings.get(o.id);
    if (!d?.valid || !d.run || d.run.kind !== 'external') continue;
    const seg = segmentAt(scene.walls, o.axis, o.line, o.at);
    if (!seg) continue;
    const plus = seg.plus ? areaById.get(seg.plus) : undefined;
    const minus = seg.minus ? areaById.get(seg.minus) : undefined;
    const roomSide: 1 | -1 | 0 = plus?.kind === 'room' ? 1 : minus?.kind === 'room' ? -1 : 0;
    if (!roomSide) continue;
    const room = roomSide === 1 ? plus! : minus!;
    const c = seg.line + seg.offset;
    const lo = o.at - o.width / 2;
    const hi = o.at + o.width / 2;
    const inward = o.axis === 'h' ? { x: 0, y: roomSide } : { x: roomSide, y: 0 };
    const face = c - roomSide * (seg.thickness / 2 + 1);
    const count = Math.max(1, Math.round(o.width / WINDOW_SAMPLE));
    const samples: Vec[] = [];
    for (let k = 0; k < count; k++) {
      const along = lo + ((k + 0.5) * o.width) / count;
      samples.push(o.axis === 'h' ? { x: along, y: face } : { x: face, y: along });
    }
    // Only boxes beyond the outer face and within reach of a sun at the lowest patch elevation.
    const reach = SUN_HEIGHTS.neighbor / Math.tan(MIN_PATCH_ELEV * RAD);
    const mid = samples[Math.floor(samples.length / 2)]!;
    const near = obstacles.filter((ob) => {
      const outMax =
        o.axis === 'h'
          ? roomSide === 1
            ? face - ob.y0
            : ob.y1 - face
          : roomSide === 1
            ? face - ob.x0
            : ob.x1 - face;
      if (outMax <= 0) return false;
      const dx = Math.max(ob.x0 - mid.x, 0, mid.x - ob.x1);
      const dy = Math.max(ob.y0 - mid.y, 0, mid.y - ob.y1);
      return Math.hypot(dx, dy) <= reach;
    });
    windows.push({
      roomId: room.id,
      a: o.axis === 'h' ? { x: lo, y: c } : { x: c, y: lo },
      b: o.axis === 'h' ? { x: hi, y: c } : { x: c, y: hi },
      inward,
      sill: o.sill,
      head: o.sill + o.height,
      samples,
      obstacles: near,
    });
  }

  const glassRooms = new Set(windows.map((w) => w.roomId));
  const rooms: SunRoom[] = [];
  for (const a of doc.areas) {
    if (a.kind !== 'room') continue;
    const net = scene.areas.get(a.id)?.net ?? [];
    rooms.push({
      id: a.id,
      name: a.name,
      preset: a.preset,
      path: regionPath(net),
      rects: net.length ? maskRects(unionMask([net])) : [],
      hasGlass: glassRooms.has(a.id),
    });
  }

  const pad = 20_000;
  const model: SunModel = {
    prisms,
    roofPath: regionPath(roof),
    windows,
    rooms,
    bounds: {
      x0: Math.min(ctx.bounds.x0, 0) - pad,
      y0: Math.min(ctx.bounds.y0, 0) - pad,
      x1: Math.max(ctx.bounds.x1, doc.lot.width) + pad,
      y1: Math.max(ctx.bounds.y1, doc.lot.depth) + pad,
    },
  };
  cache.set(scene, { doc, ctx, model });
  return model;
}

// Per frame

const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Monotone chain; one winding for every hull, so a nonzero fill paints their union once. */
export function convexHull(points: Vec[]): Vec[] {
  if (points.length < 3) return points.slice();
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Vec[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: Vec[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0)
      upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polyD(pts: Vec[]): string {
  if (pts.length < 3) return '';
  let d = `M${Math.round(pts[0]!.x)} ${Math.round(pts[0]!.y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${Math.round(pts[i]!.x)} ${Math.round(pts[i]!.y)}`;
  return `${d}Z`;
}

/** Lowest sun used for shadows, so a shadow stretches at most about 14 times its caster height. */
const MIN_SHADOW_ELEV = 4;
const MIN_PATCH_ELEV = 2;

function shadowHull(pr: Prism, away: Vec, cot: number): Vec[] {
  const lo = pr.base * cot;
  const hi = pr.top * cot;
  const pts: Vec[] = [];
  for (const p of pr.pts) {
    pts.push({ x: p.x + away.x * lo, y: p.y + away.y * lo });
    pts.push({ x: p.x + away.x * hi, y: p.y + away.y * hi });
  }
  return convexHull(pts);
}

/** Window width per light sample. */
const WINDOW_SAMPLE: Mm = 100;

type Span = [number, number];

function cutSpan(spans: Span[], a: number, b: number): Span[] {
  if (b <= a) return spans;
  const out: Span[] = [];
  for (const [s0, s1] of spans) {
    if (b <= s0 || a >= s1) out.push([s0, s1]);
    else {
      if (a > s0) out.push([s0, a]);
      if (b < s1) out.push([b, s1]);
    }
  }
  return out;
}

/** Lit heights of the window at one sample: rays toward the sun tested against each obstacle box. */
function litSpans(w: SunWindow, p: Vec, dir: Vec, tan: number): Span[] {
  let spans: Span[] = [[w.sill, w.head]];
  for (const ob of w.obstacles) {
    let t0 = 0;
    let t1 = Infinity;
    if (Math.abs(dir.x) < 1e-9) {
      if (p.x <= ob.x0 || p.x >= ob.x1) continue;
    } else {
      const a = (ob.x0 - p.x) / dir.x;
      const b = (ob.x1 - p.x) / dir.x;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (Math.abs(dir.y) < 1e-9) {
      if (p.y <= ob.y0 || p.y >= ob.y1) continue;
    } else {
      const a = (ob.y0 - p.y) / dir.y;
      const b = (ob.y1 - p.y) / dir.y;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t1 <= t0) continue;
    if (ob.roof) spans = cutSpan(spans, ob.h - t1 * tan, ob.h - t0 * tan);
    else spans = cutSpan(spans, -Infinity, ob.h - t0 * tan);
    if (!spans.length) break;
  }
  return spans;
}

interface WindowLight {
  /** Floor quads, one per run of samples with the same lit heights. */
  polys: Vec[][];
  /** Lit glass seen from the sun, mm². */
  aperture: number;
}

/** Light through a window: the lit part of each sample, projected onto the floor. Null when the sun is behind the wall. */
function windowLight(w: SunWindow, away: Vec, elevation: number): WindowLight | null {
  const facing = away.x * w.inward.x + away.y * w.inward.y;
  if (facing <= 0.02 || !w.samples.length) return null;
  const tan = Math.tan(Math.max(MIN_PATCH_ELEV, elevation) * RAD);
  const cosElev = Math.cos(elevation * RAD);
  const dir = { x: -away.x, y: -away.y };
  const n = w.samples.length;
  const step = { x: (w.b.x - w.a.x) / n, y: (w.b.y - w.a.y) / n };
  const segWidth = Math.hypot(step.x, step.y);
  const polys: Vec[][] = [];
  let aperture = 0;
  let runStart = 0;
  let runSpans: Span[] = [];
  const same = (a: Span[], b: Span[]) =>
    a.length === b.length &&
    a.every((x, i) => Math.abs(x[0] - b[i]![0]) < 5 && Math.abs(x[1] - b[i]![1]) < 5);
  const flush = (k0: number, k1: number, spans: Span[]) => {
    const a = { x: w.a.x + step.x * k0, y: w.a.y + step.y * k0 };
    const b = { x: w.a.x + step.x * k1, y: w.a.y + step.y * k1 };
    for (const [z0, z1] of spans) {
      const s0 = z0 / tan;
      const s1 = z1 / tan;
      polys.push(
        convexHull([
          { x: a.x + away.x * s0, y: a.y + away.y * s0 },
          { x: b.x + away.x * s0, y: b.y + away.y * s0 },
          { x: b.x + away.x * s1, y: b.y + away.y * s1 },
          { x: a.x + away.x * s1, y: a.y + away.y * s1 },
        ]),
      );
    }
  };
  for (let k = 0; k < n; k++) {
    const spans = litSpans(w, w.samples[k]!, dir, tan);
    for (const [z0, z1] of spans) aperture += (z1 - z0) * segWidth * facing * cosElev;
    if (k === 0) runSpans = spans;
    else if (!same(spans, runSpans)) {
      flush(runStart, k, runSpans);
      runStart = k;
      runSpans = spans;
    }
  }
  flush(runStart, n, runSpans);
  return { polys, aperture };
}

export interface SunFrame {
  position: SunPosition;
  /** False before sunrise and after sunset. */
  day: boolean;
  shadowD: string;
  /** Lit floor path per room id. */
  patches: Map<Id, string>;
}

export function sunFrame(
  model: SunModel,
  date: SunDate,
  minutes: number,
  northDeg: number,
): SunFrame {
  const position = sunPosition(date, minutes);
  const patches = new Map<Id, string>();
  if (position.elevation <= 0) return { position, day: false, shadowD: '', patches };
  const dir = sunDirection(position.azimuth, northDeg);
  const away = { x: -dir.x, y: -dir.y };
  const cot = 1 / Math.tan(Math.max(MIN_SHADOW_ELEV, position.elevation) * RAD);
  let shadowD = '';
  for (const pr of model.prisms) shadowD += polyD(shadowHull(pr, away, cot));
  for (const w of model.windows) {
    const light = windowLight(w, away, position.elevation);
    if (!light?.polys.length) continue;
    let d = patches.get(w.roomId) ?? '';
    for (const poly of light.polys) d += polyD(poly);
    patches.set(w.roomId, d);
  }
  return { position, day: true, shadowD, patches };
}

export interface SunAmbient {
  color: string;
  opacity: number;
  /** Shadow fill opacity factor, 0..1. */
  shadow: number;
}

const NIGHT = '#0E1C3D';
const GLOW = '#FF9A3C';

/** Night blue below the horizon, a warm glow while the sun is low, neutral at midday. */
export function sunAmbient(elevation: number): SunAmbient {
  if (elevation <= -4) return { color: NIGHT, opacity: 0.42, shadow: 0 };
  if (elevation <= 0) {
    const t = (elevation + 4) / 4;
    return { color: NIGHT, opacity: 0.42 * (1 - t) + 0.12 * t, shadow: 0 };
  }
  const warm = Math.max(0, 1 - elevation / 18);
  return { color: GLOW, opacity: 0.12 * warm, shadow: Math.min(1, 0.45 + elevation / 15) };
}

// Daily summary

function clipToRect(poly: Vec[], r: Rect): Vec[] {
  type Edge = (p: Vec) => number;
  const planes: Edge[] = [
    (p) => p.x - r.x0,
    (p) => r.x1 - p.x,
    (p) => p.y - r.y0,
    (p) => r.y1 - p.y,
  ];
  let out = poly;
  for (const f of planes) {
    if (!out.length) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i]!;
      const q = input[(i + 1) % input.length]!;
      const fp = f(p);
      const fq = f(q);
      if (fp >= 0) out.push(p);
      if (fp >= 0 !== fq >= 0) {
        const t = fp / (fp - fq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

function polyArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export const SUMMARY_STEP = 15;
/** Lit floor, or lit glass seen from the sun, below this (mm²) does not count as sun in the room. */
const MIN_LIT_AREA = 150_000;

export interface RoomSun {
  id: Id;
  name: string;
  preset: RoomPresetId;
  /** [from, to] local minutes. */
  ranges: [number, number][];
}

/** Direct sun through the glass of each room, sampled every 15 min from sunrise to sunset. */
export function sunSummary(model: SunModel, date: SunDate, northDeg: number): RoomSun[] {
  const { sunrise, sunset } = sunTimes(date);
  const first = Math.ceil(sunrise / SUMMARY_STEP) * SUMMARY_STEP;
  const byRoom = new Map<Id, SunWindow[]>();
  for (const w of model.windows) byRoom.set(w.roomId, [...(byRoom.get(w.roomId) ?? []), w]);
  const samples: { t: number; away: Vec; elev: number }[] = [];
  for (let t = first; t <= sunset; t += SUMMARY_STEP) {
    const p = sunPosition(date, t);
    if (p.elevation <= 0) continue;
    const dir = sunDirection(p.azimuth, northDeg);
    samples.push({ t, away: { x: -dir.x, y: -dir.y }, elev: p.elevation });
  }
  return model.rooms.map((room) => {
    const ranges: [number, number][] = [];
    const wins = byRoom.get(room.id) ?? [];
    if (!wins.length) return { id: room.id, name: room.name, preset: room.preset, ranges };
    let open: [number, number] | null = null;
    for (const s of samples) {
      // Glass area counts too: a low sun that lands on the far wall is still sun in the room.
      let lit = 0;
      let glass = 0;
      for (const w of wins) {
        const light = windowLight(w, s.away, s.elev);
        if (!light) continue;
        glass += light.aperture;
        for (const poly of light.polys) {
          for (const r of room.rects) lit += polyArea(clipToRect(poly, r));
        }
        if (lit >= MIN_LIT_AREA || glass >= MIN_LIT_AREA) break;
      }
      lit = Math.max(lit, glass);
      if (lit >= MIN_LIT_AREA) {
        const end = Math.min(sunset, s.t + SUMMARY_STEP);
        if (open && open[1] >= s.t) open[1] = end;
        else {
          open = [s.t, end];
          ranges.push(open);
        }
      }
    }
    return { id: room.id, name: room.name, preset: room.preset, ranges };
  });
}

// Sun path around the lot

export interface SunArc {
  center: Vec;
  radius: Mm;
  times: SunTimes;
  /** Unwrapped bearings (azimuth + north, degrees) from sunrise to sunset, one per sample. */
  bearings: number[];
  /** Cumulative turn in degrees at each sample; the last value is the whole path. */
  cum: number[];
  /** Pieces of the drawn path, each with its middle as a 0..1 fraction of the path length. */
  pieces: { d: string; t: number }[];
  /** Unit plan directions toward the sun at sunrise and sunset. */
  rise: Vec;
  set: Vec;
}

/** Dense enough that one step never turns near 180° even when the sun passes by the zenith. */
const ARC_SAMPLE_MIN = 0.5;
/** One SVG arc command covers at most this turn. */
const ARC_MAX_TURN = 120;

const bearingVec = (b: number): Vec => ({ x: Math.sin(b * RAD), y: -Math.cos(b * RAD) });

/** Bearing at a length fraction of the path, interpolated between samples. */
function bearingAtFraction(arc: Pick<SunArc, 'bearings' | 'cum'>, f: number): number {
  const { bearings, cum } = arc;
  const total = cum[cum.length - 1] ?? 0;
  if (!total || bearings.length < 2) return bearings[0] ?? 0;
  const target = Math.min(1, Math.max(0, f)) * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const span = cum[hi]! - cum[lo]!;
  const k = span > 0 ? (target - cum[lo]!) / span : 0;
  return bearings[lo]! + (bearings[hi]! - bearings[lo]!) * k;
}

/**
 * The day's sun azimuths drawn on a circle around `center`. The bearings are unwrapped, so the path is
 * continuous, and its pieces split by length, so the color runs evenly along it.
 */
export function sunArc(
  date: SunDate,
  northDeg: number,
  center: Vec,
  radius: Mm,
  pieceCount = 24,
): SunArc {
  const times = sunTimes(date);
  const bearings: number[] = [];
  const cum: number[] = [];
  const n = Math.max(1, Math.ceil((times.sunset - times.sunrise) / ARC_SAMPLE_MIN));
  for (let i = 0; i <= n; i++) {
    const t = times.sunrise + ((times.sunset - times.sunrise) * i) / n;
    let b = sunPosition(date, t).azimuth + northDeg;
    const prev = bearings[i - 1];
    if (prev !== undefined) b = prev + ((((b - prev) % 360) + 540) % 360) - 180;
    bearings.push(b);
    cum.push(prev === undefined ? 0 : cum[i - 1]! + Math.abs(b - prev));
  }
  const total = cum[cum.length - 1]!;
  const at = (b: number) => {
    const v = bearingVec(b);
    return `${Math.round(center.x + v.x * radius)} ${Math.round(center.y + v.y * radius)}`;
  };
  const pieces: { d: string; t: number }[] = [];
  for (let k = 0; k < pieceCount; k++) {
    const l0 = (total * k) / pieceCount;
    const l1 = (total * (k + 1)) / pieceCount;
    const stops = [bearingAtFraction({ bearings, cum }, k / pieceCount)];
    for (let i = 0; i < cum.length; i++) if (cum[i]! > l0 && cum[i]! < l1) stops.push(bearings[i]!);
    stops.push(bearingAtFraction({ bearings, cum }, (k + 1) / pieceCount));
    let d = `M${at(stops[0]!)}`;
    let from = stops[0]!;
    for (let i = 1; i < stops.length; i++) {
      const b = stops[i]!;
      const last = i === stops.length - 1;
      const next = stops[i + 1];
      const turn = b - from;
      const sameWay = next !== undefined && Math.sign(next - b) === Math.sign(turn);
      if (!last && sameWay && Math.abs(next - from) <= ARC_MAX_TURN) continue;
      if (turn !== 0) d += `A${radius} ${radius} 0 0 ${turn > 0 ? 1 : 0} ${at(b)}`;
      from = b;
    }
    pieces.push({ d, t: (k + 0.5) / pieceCount });
  }
  return {
    center,
    radius,
    times,
    bearings,
    cum,
    pieces,
    rise: bearingVec(bearings[0]!),
    set: bearingVec(bearings[bearings.length - 1]!),
  };
}

/**
 * Sun disc on the path at a constant speed from sunrise to sunset, so it never jumps, even when the
 * real azimuth swings fast near the zenith. It rests at the matching end before sunrise and after sunset.
 */
export function sunArcPoint(arc: SunArc, minutes: number): Vec {
  const { sunrise, sunset } = arc.times;
  const f = sunset > sunrise ? (minutes - sunrise) / (sunset - sunrise) : 0;
  const v = bearingVec(bearingAtFraction(arc, f));
  return { x: arc.center.x + v.x * arc.radius, y: arc.center.y + v.y * arc.radius };
}
