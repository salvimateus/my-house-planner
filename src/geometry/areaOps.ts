import { GENERIC_PRESET_ID, presetFor } from '../catalog/roomPresets.ts';
import { MIN_ROOM_SIDE, SLIVER_MIN_AREA, SLIVER_MIN_SIDE } from '../model/defaults.ts';
import { newId } from '../model/ids.ts';
import type { Area, Axis, Id, Item, Mm, Opening, ProjectDoc, Shape } from '../model/types.ts';
import { resolveHost } from './openings.ts';
import { area, difference, intersection, union } from './rectilinear.ts';
import {
  bboxOf,
  edges,
  interiorSide,
  normalizeShape,
  pointInShape,
  rectsOverlap,
  translateShape,
} from './shape.ts';
import type { OpResult, Rect, Region, WallRun } from './types.ts';
import { deriveBoundarySegments, deriveWallSegments, pairKey, wallRuns } from './walls.ts';

export interface EdgeRef {
  ring: number;
  index: number;
}

export interface SplitLine {
  axis: Axis;
  at: Mm;
  from: Mm;
  to: Mm;
}

export interface SharedInterval {
  axis: Axis;
  line: Mm;
  a: Mm;
  b: Mm;
}

const isBuilt = (a: Area) => a.kind !== 'outdoor';
const lotRectOf = (doc: ProjectDoc): Rect => ({
  x0: 0,
  y0: 0,
  x1: doc.lot.width,
  y1: doc.lot.depth,
});
const invalid = (message: string): OpResult => ({ patch: {}, messages: [message], valid: false });
const sortedPair = (a: Id, b: Id): [Id, Id] => (a < b ? [a, b] : [b, a]);

interface EdgeSpan {
  line: Mm;
  a: Mm;
  b: Mm;
  side: 1 | -1;
}

function edgeSpans(shape: Shape): { h: EdgeSpan[]; v: EdgeSpan[] } {
  const out = { h: [] as EdgeSpan[], v: [] as EdgeSpan[] };
  for (const ring of shape) {
    for (const [p, q] of edges(ring)) {
      if (p.y === q.y) {
        out.h.push({
          line: p.y,
          a: Math.min(p.x, q.x),
          b: Math.max(p.x, q.x),
          side: interiorSide(p, q),
        });
      } else {
        out.v.push({
          line: p.x,
          a: Math.min(p.y, q.y),
          b: Math.max(p.y, q.y),
          side: interiorSide(p, q),
        });
      }
    }
  }
  return out;
}

/** Boundary intervals where two shapes touch from opposite sides. */
export function sharedIntervals(s1: Shape, s2: Shape): SharedInterval[] {
  const b1 = bboxOf(s1);
  const b2 = bboxOf(s2);
  if (b1.x0 > b2.x1 || b2.x0 > b1.x1 || b1.y0 > b2.y1 || b2.y0 > b1.y1) return [];
  const e1 = edgeSpans(s1);
  const e2 = edgeSpans(s2);
  const out: SharedInterval[] = [];
  for (const axis of ['h', 'v'] as const) {
    for (const x of e1[axis]) {
      for (const y of e2[axis]) {
        if (x.line !== y.line || x.side === y.side) continue;
        const a = Math.max(x.a, y.a);
        const b = Math.min(x.b, y.b);
        if (b > a) out.push({ axis, line: x.line, a, b });
      }
    }
  }
  return out;
}

export const areasTouch = (s1: Shape, s2: Shape): boolean => sharedIntervals(s1, s2).length > 0;

export function isSliver(shape: Shape): boolean {
  const b = bboxOf(shape);
  return Math.min(b.x1 - b.x0, b.y1 - b.y0) < SLIVER_MIN_SIDE || area([shape]) < SLIVER_MIN_AREA;
}

/** "Cômodo N" with the next free N. */
export function nextRoomName(areas: Area[]): string {
  const base = presetFor(GENERIC_PRESET_ID).label;
  const re = new RegExp(`^${base} (\\d+)$`);
  let max = 0;
  for (const a of areas) {
    if (a.name === base) max = Math.max(max, 1);
    const m = re.exec(a.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${base} ${max + 1}`;
}

function pieces(region: Region): Shape[] {
  return region.map(normalizeShape).filter((s) => s.length > 0);
}

/**
 * The largest piece keeps the area id, other pieces become copies with new ids. Slivers are dropped with a
 * message.
 */
function assignPieces(base: Area, shapes: Shape[], messages: string[], gone: string): Area[] {
  const sorted = shapes
    .map((shape) => ({ shape, size: area([shape]) }))
    .sort((x, y) => y.size - x.size);
  const kept = sorted.filter((x) => !isSliver(x.shape));
  if (kept.length < sorted.length && kept.length > 0) {
    messages.push(`Sobrou uma faixa pequena de ${base.name} e ela foi removida.`);
  }
  if (!kept.length) {
    messages.push(gone);
    return [];
  }
  return kept.map((x, i) =>
    i === 0
      ? { ...base, shape: x.shape }
      : { ...base, id: newId(), shape: x.shape, labelOffset: null },
  );
}

const runsCache = new WeakMap<Area[], { pairs: [Id, Id][]; doc: ProjectDoc; runs: WallRun[] }>();

function runsFor(areas: Area[], doc: ProjectDoc, pairs: [Id, Id][]): WallRun[] {
  const hit = runsCache.get(areas);
  if (
    hit &&
    hit.pairs === pairs &&
    hit.doc.lot === doc.lot &&
    hit.doc.structure === doc.structure
  ) {
    return hit.runs;
  }
  const house = deriveWallSegments(areas, doc.lot, doc.structure, pairs);
  const boundary = deriveBoundarySegments(doc.lot, doc.structure, house);
  const runs = [...wallRuns(house), ...wallRuns(boundary)];
  runsCache.set(areas, { pairs, doc, runs });
  return runs;
}

const samePairs = (a: [Id, Id][], b: [Id, Id][]) =>
  a.length === b.length && a.every((p, i) => p[0] === b[i]![0] && p[1] === b[i]![1]);

interface FinalizeOpts {
  messages: string[];
  pairs?: [Id, Id][];
  openings?: Opening[];
  items?: Item[];
  valid?: boolean;
}

/**
 * Shared bookkeeping: drops open boundaries whose rooms no longer touch, and openings whose host wall
 * vanished (an opening that was already orphan stays).
 */
function finalize(doc: ProjectDoc, areas: Area[], opts: FinalizeOpts): OpResult {
  const messages = opts.messages;
  const byId = new Map(areas.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const pairs = (opts.pairs ?? doc.openBoundaries).filter(([a, b]) => {
    const x = byId.get(a);
    const y = byId.get(b);
    const key = pairKey(a, b);
    if (!x || !y || a === b || seen.has(key)) return false;
    seen.add(key);
    return x.kind === 'room' && y.kind === 'room' && areasTouch(x.shape, y.shape);
  });
  const nextPairs = samePairs(pairs, doc.openBoundaries) ? doc.openBoundaries : pairs;

  const candidate = opts.openings ?? doc.openings;
  const before = runsFor(doc.areas, doc, doc.openBoundaries);
  const after = runsFor(areas, doc, nextPairs);
  const original = new Map(doc.openings.map((o) => [o.id, o]));
  const keptOpenings = candidate.filter((o) => {
    const orig = original.get(o.id);
    const wasHosted = orig ? resolveHost(orig, before) !== null : true;
    return !wasHosted || resolveHost(o, after) !== null;
  });
  const removed = candidate.length - keptOpenings.length;
  if (removed === 1) messages.push('Uma porta ou janela ficou sem parede e foi removida.');
  else if (removed > 1)
    messages.push(`${removed} portas ou janelas ficaram sem parede e foram removidas.`);
  const openingsChanged =
    keptOpenings.length !== doc.openings.length ||
    keptOpenings.some((o, i) => o !== doc.openings[i]);

  const patch: OpResult['patch'] = { areas };
  if (nextPairs !== doc.openBoundaries) patch.openBoundaries = nextPairs;
  if (openingsChanged) patch.openings = keptOpenings;
  if (opts.items) patch.items = opts.items;
  return { patch, messages, valid: opts.valid ?? true };
}

/** Clips a shape to the lot and keeps its largest piece. */
function clipToLot(doc: ProjectDoc, shape: Shape): Shape | null {
  const b = bboxOf(shape);
  if (b.x0 >= 0 && b.y0 >= 0 && b.x1 <= doc.lot.width && b.y1 <= doc.lot.depth) return shape;
  const list = pieces(intersection([shape], lotRectOf(doc)));
  if (!list.length) return null;
  return list.reduce((best, s) => (area([s]) > area([best]) ? s : best));
}

/** Adds an area. Rooms and covered areas carve the rooms and covered areas below them; outdoor never carves. */
export function insertArea(doc: ProjectDoc, input: Area): OpResult {
  const messages: string[] = [];
  const normalized = normalizeShape(input.shape);
  const shape = normalized.length ? clipToLot(doc, normalized) : null;
  if (!shape) return invalid('A área precisa ficar dentro do terreno.');
  const added: Area = { ...input, shape };
  if (!isBuilt(added)) return finalize(doc, [...doc.areas, added], { messages });

  const box = bboxOf(shape);
  const next: Area[] = [];
  for (const r of doc.areas) {
    if (!isBuilt(r) || !rectsOverlap(box, bboxOf(r.shape))) {
      next.push(r);
      continue;
    }
    const rest = difference([r.shape], [shape]);
    if (area(rest) === area([r.shape])) {
      next.push(r);
      continue;
    }
    next.push(
      ...assignPieces(
        r,
        pieces(rest),
        messages,
        `${r.name} ficou dentro da nova área e foi substituído.`,
      ),
    );
  }
  next.push(added);
  return finalize(doc, next, { messages });
}

/** Opposite parallel edges of the shape seen from `line` toward the interior side `s`, inside [a, b]. */
function depthAt(shape: Shape, axis: Axis, line: Mm, s: 1 | -1, a: Mm, b: Mm): number {
  let best = Infinity;
  for (const e of edgeSpans(shape)[axis]) {
    if (e.side !== -s || e.b <= a || e.a >= b) continue;
    const d = (e.line - line) * s;
    if (d > 0 && d < best) best = d;
  }
  return best;
}

/**
 * Moves one edge of an area along its normal. Growing takes the strip from the other rooms and covered areas;
 * shrinking gives the strip to the neighbors that shared the edge, so the shared wall moves.
 */
export function moveEdge(doc: ProjectDoc, areaId: Id, edge: EdgeRef, delta: Mm): OpResult {
  const target = doc.areas.find((x) => x.id === areaId);
  const ring = target?.shape[edge.ring];
  if (!target || !ring || ring.length < 4) return invalid('Parede não encontrada.');
  const p = ring[edge.index % ring.length]!;
  const q = ring[(edge.index + 1) % ring.length]!;
  const axis: Axis = p.y === q.y ? 'h' : 'v';
  const line = axis === 'h' ? p.y : p.x;
  const a = axis === 'h' ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
  const b = axis === 'h' ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
  const s = interiorSide(p, q);
  const max = axis === 'h' ? doc.lot.depth : doc.lot.width;
  const newLine = Math.min(max, Math.max(0, line + Math.round(delta)));
  const dd = newLine - line;
  if (dd === 0) return { patch: {}, messages: [], valid: true };

  const lo = Math.min(line, newLine);
  const hi = Math.max(line, newLine);
  const strip: Rect =
    axis === 'h' ? { x0: a, x1: b, y0: lo, y1: hi } : { x0: lo, x1: hi, y0: a, y1: b };
  const band = (from: Mm, to: Mm): Rect =>
    axis === 'h' ? { x0: from, x1: to, y0: lo, y1: hi } : { x0: lo, x1: hi, y0: from, y1: to };
  const growing = dd * s < 0;
  const messages: string[] = [];

  const ownRegion = growing ? union([target.shape], strip) : difference([target.shape], strip);
  const own = pieces(ownRegion);
  if (own.length !== 1) return invalid('A parede não pode cortar o ambiente em partes.');
  const shape = own[0]!;
  const box = bboxOf(shape);
  if (box.x1 - box.x0 < MIN_ROOM_SIDE || box.y1 - box.y0 < MIN_ROOM_SIDE) {
    return invalid('O ambiente ficaria estreito demais.');
  }
  if (depthAt(shape, axis, newLine, s, a, b) < MIN_ROOM_SIDE) {
    return invalid('O ambiente ficaria estreito demais.');
  }

  const next: Area[] = [];
  for (const r of doc.areas) {
    if (r.id === areaId) {
      next.push({ ...target, shape });
      continue;
    }
    if (!isBuilt(r) || !isBuilt(target)) {
      next.push(r);
      continue;
    }
    if (growing) {
      if (!rectsOverlap(strip, bboxOf(r.shape))) {
        next.push(r);
        continue;
      }
      const rest = difference([r.shape], strip);
      if (area(rest) === area([r.shape])) next.push(r);
      else
        next.push(...assignPieces(r, pieces(rest), messages, `${r.name} foi coberto e removido.`));
      continue;
    }
    const bands = edgeSpans(r.shape)
      [axis].filter((e) => e.line === line && e.side === -s && e.b > a && e.a < b)
      .map((e) => band(Math.max(a, e.a), Math.min(b, e.b)));
    if (!bands.length) {
      next.push(r);
      continue;
    }
    const grown = pieces(union([r.shape], ...bands));
    next.push(grown.length === 1 ? { ...r, shape: grown[0]! } : r);
  }

  const openings = doc.openings.map((o) =>
    o.axis === axis && o.line === line && o.at - o.width / 2 >= a && o.at + o.width / 2 <= b
      ? { ...o, line: newLine }
      : o,
  );
  return finalize(doc, next, { messages, openings });
}

/**
 * Moves an area with the items whose center is inside it and the openings on its walls. Invalid (with the moved
 * patch kept for the ghost) when a room or covered area would overlap another one or leave the lot.
 */
export function translateArea(doc: ProjectDoc, areaId: Id, dx: Mm, dy: Mm): OpResult {
  const target = doc.areas.find((x) => x.id === areaId);
  if (!target) return invalid('Ambiente não encontrado.');
  const mx = Math.round(dx);
  const my = Math.round(dy);
  if (mx === 0 && my === 0) return { patch: {}, messages: [], valid: true };
  const shape = translateShape(target.shape, mx, my);
  const box = bboxOf(shape);
  const messages: string[] = [];
  let valid = true;
  if (box.x0 < 0 || box.y0 < 0 || box.x1 > doc.lot.width || box.y1 > doc.lot.depth) {
    valid = false;
    messages.push('O ambiente precisa ficar dentro do terreno.');
  }
  if (isBuilt(target)) {
    const hit = doc.areas.some(
      (r) =>
        r.id !== areaId &&
        isBuilt(r) &&
        rectsOverlap(box, bboxOf(r.shape)) &&
        area(intersection([shape], [r.shape])) > 0,
    );
    if (hit) {
      valid = false;
      messages.push('O ambiente não pode ficar por cima de outro.');
    }
  }

  const items = doc.items.map((it) =>
    pointInShape({ x: it.x, y: it.y }, target.shape) ? { ...it, x: it.x + mx, y: it.y + my } : it,
  );
  const own = deriveWallSegments(doc.areas, doc.lot, doc.structure, doc.openBoundaries).filter(
    (seg) => seg.plus === areaId || seg.minus === areaId,
  );
  const openings = doc.openings.map((o) => {
    const onOwnWall = own.some(
      (seg) => seg.axis === o.axis && seg.line === o.line && o.at >= seg.start && o.at <= seg.end,
    );
    if (!onOwnWall) return o;
    return o.axis === 'h'
      ? { ...o, line: o.line + my, at: o.at + mx }
      : { ...o, line: o.line + mx, at: o.at + my };
  });
  const next = doc.areas.map((x) => (x.id === areaId ? { ...target, shape } : x));
  const itemsChanged = items.some((it, i) => it !== doc.items[i]);
  return finalize(doc, next, {
    messages,
    openings,
    items: itemsChanged ? items : undefined,
    valid,
  });
}

/**
 * Splits an area along a line that must cross it from boundary to boundary. Pieces that still share boundary
 * on the line outside [from, to] merge back. The largest piece keeps the id.
 */
export function splitArea(doc: ProjectDoc, areaId: Id, cut: SplitLine): OpResult {
  const target = doc.areas.find((x) => x.id === areaId);
  if (!target) return invalid('Ambiente não encontrado.');
  const at = Math.round(cut.at);
  const from = Math.min(cut.from, cut.to);
  const to = Math.max(cut.from, cut.to);
  const box = bboxOf(target.shape);
  const lo = cut.axis === 'h' ? box.y0 : box.x0;
  const hi = cut.axis === 'h' ? box.y1 : box.x1;
  if (at <= lo || at >= hi)
    return invalid('A divisão precisa cruzar o ambiente de parede a parede.');
  const halves: Rect[] =
    cut.axis === 'h'
      ? [
          { x0: box.x0, x1: box.x1, y0: box.y0, y1: at },
          { x0: box.x0, x1: box.x1, y0: at, y1: box.y1 },
        ]
      : [
          { x0: box.x0, x1: at, y0: box.y0, y1: box.y1 },
          { x0: at, x1: box.x1, y0: box.y0, y1: box.y1 },
        ];
  const first = pieces(intersection([target.shape], halves[0]!));
  const second = pieces(intersection([target.shape], halves[1]!));
  const all = [...first, ...second];
  const parent = all.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i]!;
    return i;
  };
  first.forEach((s1, i) => {
    second.forEach((s2, j) => {
      let outside = 0;
      for (const iv of sharedIntervals(s1, s2)) {
        if (iv.axis !== cut.axis || iv.line !== at) continue;
        outside +=
          Math.max(0, Math.min(iv.b, from) - iv.a) + Math.max(0, iv.b - Math.max(iv.a, to));
      }
      if (outside > 0) parent[find(first.length + j)] = find(i);
    });
  });
  const groups = new Map<number, Shape[]>();
  all.forEach((s, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(s);
    else groups.set(root, [s]);
  });
  const shapes: Shape[] = [];
  for (const list of groups.values()) {
    const merged = list.length === 1 ? list : pieces(union(...list.map((s) => [s] as Region)));
    shapes.push(...merged);
  }
  if (shapes.length < 2) return invalid('A divisão precisa cruzar o ambiente de parede a parede.');
  if (shapes.some(isSliver)) return invalid('Um dos lados ficaria pequeno demais.');
  shapes.sort((x, y) => area([y]) - area([x]));

  const created: Area[] = [];
  let names = doc.areas;
  for (const s of shapes.slice(1)) {
    const piece: Area = isBuilt(target)
      ? {
          ...target,
          id: newId(),
          shape: s,
          preset: GENERIC_PRESET_ID,
          name: nextRoomName(names),
          labelOffset: null,
        }
      : { ...target, id: newId(), shape: s, labelOffset: null };
    created.push(piece);
    names = [...names, piece];
  }
  const kept: Area = { ...target, shape: shapes[0]! };
  const next: Area[] = [];
  for (const x of doc.areas) {
    if (x.id === areaId) next.push(kept, ...created);
    else next.push(x);
  }

  const parts = [kept, ...created];
  const pairs: [Id, Id][] = [];
  for (const [a, b] of doc.openBoundaries) {
    if (a !== areaId && b !== areaId) {
      pairs.push([a, b]);
      continue;
    }
    const otherId = a === areaId ? b : a;
    const other = doc.areas.find((x) => x.id === otherId);
    if (!other) continue;
    for (const part of parts)
      if (areasTouch(part.shape, other.shape)) pairs.push(sortedPair(part.id, otherId));
  }
  return finalize(doc, next, { messages: [], pairs });
}

/** Joins two areas that share an edge. Openings on the removed wall go away with a message. */
export function mergeAreas(doc: ProjectDoc, keepId: Id, otherId: Id): OpResult {
  const keep = doc.areas.find((x) => x.id === keepId);
  const other = doc.areas.find((x) => x.id === otherId);
  if (!keep || !other || keepId === otherId) return invalid('Ambiente não encontrado.');
  if (!areasTouch(keep.shape, other.shape)) {
    return invalid('Os ambientes precisam encostar um no outro para juntar.');
  }
  const merged = pieces(union([keep.shape], [other.shape]));
  if (merged.length !== 1)
    return invalid('Os ambientes precisam encostar um no outro para juntar.');
  const next = doc.areas
    .filter((x) => x.id !== otherId)
    .map((x) => (x.id === keepId ? { ...keep, shape: merged[0]! } : x));
  const pairs = doc.openBoundaries
    .map(([a, b]) => sortedPair(a === otherId ? keepId : a, b === otherId ? keepId : b))
    .filter(([a, b]) => a !== b);
  return finalize(doc, next, { messages: [], pairs });
}

/** Removes an area. Items stay; openings whose wall vanished go away. */
export function deleteArea(doc: ProjectDoc, areaId: Id): OpResult {
  if (!doc.areas.some((x) => x.id === areaId)) return invalid('Ambiente não encontrado.');
  return finalize(
    doc,
    doc.areas.filter((x) => x.id !== areaId),
    { messages: [] },
  );
}

/** Removes (open) or puts back (closed) the wall between two neighbor rooms. */
export function setOpenBoundary(doc: ProjectDoc, a: Id, b: Id, open: boolean): OpResult {
  const x = doc.areas.find((r) => r.id === a);
  const y = doc.areas.find((r) => r.id === b);
  if (!x || !y || a === b) return invalid('Ambiente não encontrado.');
  const key = pairKey(a, b);
  const rest = doc.openBoundaries.filter(([p, q]) => pairKey(p, q) !== key);
  if (!open) return finalize(doc, doc.areas, { messages: [], pairs: rest });
  if (x.kind !== 'room' || y.kind !== 'room' || !areasTouch(x.shape, y.shape)) {
    return invalid('Só dá para integrar dois cômodos vizinhos.');
  }
  return finalize(doc, doc.areas, { messages: [], pairs: [...rest, sortedPair(a, b)] });
}

/** After a lot resize: every area is clipped to the lot rect; empty areas and slivers go away. */
export function clampToLot(doc: ProjectDoc): OpResult {
  const lot = lotRectOf(doc);
  const messages: string[] = [];
  const next: Area[] = [];
  for (const r of doc.areas) {
    const b = bboxOf(r.shape);
    if (b.x0 >= lot.x0 && b.y0 >= lot.y0 && b.x1 <= lot.x1 && b.y1 <= lot.y1) {
      next.push(r);
      continue;
    }
    next.push(
      ...assignPieces(
        r,
        pieces(intersection([r.shape], lot)),
        messages,
        `${r.name} ficou fora do terreno e foi removido.`,
      ),
    );
  }
  return finalize(doc, next, { messages });
}
