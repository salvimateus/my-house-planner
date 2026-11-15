import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import type { Id, Item, Mm, OpeningType, ProjectDoc, RoomPresetId, Vec } from '../model/types.ts';
import { toRings, unionMask } from './rectilinear.ts';
import { pointInRegion, pointInShape, regionPath } from './shape.ts';
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
  /** Depth of the covered area outside the window, 0 when the outside is open. */
  coverDepth: Mm;
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
    const outside = roomSide === 1 ? minus : plus;
    const c = seg.line + seg.offset;
    const lo = o.at - o.width / 2;
    const hi = o.at + o.width / 2;
    const inward = o.axis === 'h' ? { x: 0, y: roomSide } : { x: roomSide, y: 0 };
    let coverDepth = 0;
    if (outside?.kind === 'covered') {
      const start = seg.thickness / 2 + 10;
      const probe = (k: number): Vec =>
        o.axis === 'h'
          ? { x: o.at, y: c - roomSide * (start + k) }
          : { x: c - roomSide * (start + k), y: o.at };
      let k = 0;
      while (k < 30_000 && pointInShape(probe(k), outside.shape)) k += 100;
      coverDepth = k;
    }
    windows.push({
      roomId: room.id,
      a: o.axis === 'h' ? { x: lo, y: c } : { x: c, y: lo },
      b: o.axis === 'h' ? { x: hi, y: c } : { x: c, y: hi },
      inward,
      sill: o.sill,
      head: o.sill + o.height,
      coverDepth,
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

/**
 * Floor polygon lit through a window, or null when the sun is behind the wall or under the cover roof.
 * `beam` widens it to the floor under the light, from the wall on, so a low sun that lands on the far
 * wall still counts as sun in the room.
 */
function patchOf(w: SunWindow, away: Vec, elevation: number, beam = false): Vec[] | null {
  const facing = away.x * w.inward.x + away.y * w.inward.y;
  if (facing <= 0.02) return null;
  const tan = Math.tan(Math.max(MIN_PATCH_ELEV, elevation) * RAD);
  let top = w.head;
  if (w.coverDepth > 0) {
    // A ray from height z must leave the covered area before it climbs to the cover roof.
    top = Math.min(top, SUN_HEIGHTS.roof - (w.coverDepth * tan) / facing);
  }
  if (top <= w.sill) return null;
  const s0 = beam ? 0 : w.sill / tan;
  const s1 = top / tan;
  return convexHull([
    { x: w.a.x + away.x * s0, y: w.a.y + away.y * s0 },
    { x: w.b.x + away.x * s0, y: w.b.y + away.y * s0 },
    { x: w.b.x + away.x * s1, y: w.b.y + away.y * s1 },
    { x: w.a.x + away.x * s1, y: w.a.y + away.y * s1 },
  ]);
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
    const poly = patchOf(w, away, position.elevation);
    if (!poly) continue;
    patches.set(w.roomId, (patches.get(w.roomId) ?? '') + polyD(poly));
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
/** Lit floor below this (mm²) does not count as sun in the room. */
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
      let lit = 0;
      for (const w of wins) {
        const poly = patchOf(w, s.away, s.elev, true);
        if (!poly) continue;
        for (const r of room.rects) lit += polyArea(clipToRect(poly, r));
        if (lit >= MIN_LIT_AREA) break;
      }
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
