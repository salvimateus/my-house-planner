import type { Area, AreaKind, Axis, Id, Lot, Mm, Side, Structure } from '../model/types.ts';
import { union } from './rectilinear.ts';
import { edges, interiorSide } from './shape.ts';
import type { Face, Rect, WallKind, WallRect, WallRun, WallSegment } from './types.ts';

interface EdgeOnLine {
  areaId: Id;
  kind: AreaKind;
  a: Mm;
  b: Mm;
  side: 1 | -1;
}

export const lineKey = (axis: Axis, line: Mm): string => `${axis}:${line}`;
export const pairKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const segmentId = (axis: Axis, line: Mm, start: Mm, end: Mm) => `${axis}:${line}:${start}:${end}`;

/**
 * House walls from room and covered edges. Each edge interval gets one segment per line, so a shared wall exists
 * once. Outdoor areas never build walls.
 */
export function deriveWallSegments(
  areas: Area[],
  lot: Lot,
  s: Structure,
  open: [Id, Id][],
): WallSegment[] {
  const openSet = new Set(open.map(([a, b]) => pairKey(a, b)));
  const byLine = new Map<string, EdgeOnLine[]>();
  for (const area of areas) {
    if (area.kind === 'outdoor') continue;
    for (const ring of area.shape) {
      for (const [p, q] of edges(ring)) {
        if (p.x === q.x && p.y === q.y) continue;
        const axis: Axis = p.y === q.y ? 'h' : 'v';
        const line = axis === 'h' ? p.y : p.x;
        const a = axis === 'h' ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
        const b = axis === 'h' ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
        const key = lineKey(axis, line);
        const entry = { areaId: area.id, kind: area.kind, a, b, side: interiorSide(p, q) };
        const list = byLine.get(key);
        if (list) list.push(entry);
        else byLine.set(key, [entry]);
      }
    }
  }

  const out: WallSegment[] = [];
  for (const [key, list] of byLine) {
    const axis = key[0] as Axis;
    const line = Number(key.slice(2));
    const cuts = [...new Set(list.flatMap((e) => [e.a, e.b]))].sort((x, y) => x - y);
    let cur: WallSegment | null = null;
    const flush = () => {
      if (cur) out.push({ ...cur, id: segmentId(axis, line, cur.start, cur.end) });
      cur = null;
    };
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i]!;
      const hi = cuts[i + 1]!;
      const plus = list.find((e) => e.side === 1 && e.a <= lo && e.b >= hi) ?? null;
      const minus = list.find((e) => e.side === -1 && e.a <= lo && e.b >= hi) ?? null;
      const spec = wallSpec(plus, minus, s, openSet);
      if (!spec) {
        flush();
        continue;
      }
      const offset = boundaryOffset(axis, line, spec.thickness, lot, plus, minus);
      const plusId = plus?.areaId ?? null;
      const minusId = minus?.areaId ?? null;
      const c = cur as WallSegment | null;
      if (
        c &&
        c.end === lo &&
        c.kind === spec.kind &&
        c.thickness === spec.thickness &&
        c.offset === offset &&
        c.plus === plusId &&
        c.minus === minusId
      ) {
        c.end = hi;
      } else {
        flush();
        cur = {
          id: '',
          axis,
          line,
          start: lo,
          end: hi,
          thickness: spec.thickness,
          kind: spec.kind,
          offset,
          plus: plusId,
          minus: minusId,
        };
      }
    }
    flush();
  }
  return out;
}

function wallSpec(
  plus: EdgeOnLine | null,
  minus: EdgeOnLine | null,
  s: Structure,
  openSet: Set<string>,
): { kind: WallKind; thickness: Mm } | null {
  const pRoom = plus?.kind === 'room';
  const mRoom = minus?.kind === 'room';
  if (!pRoom && !mRoom) return null;
  if (pRoom && mRoom) {
    return openSet.has(pairKey(plus!.areaId, minus!.areaId))
      ? null
      : { kind: 'internal', thickness: s.internal };
  }
  return { kind: 'external', thickness: s.external };
}

/** A wall whose axis lies on the lot line moves fully inside the lot; the muro is suppressed there. */
function boundaryOffset(
  axis: Axis,
  line: Mm,
  t: Mm,
  lot: Lot,
  plus: EdgeOnLine | null,
  minus: EdgeOnLine | null,
): Mm {
  const max = axis === 'h' ? lot.depth : lot.width;
  if (line === 0 && plus && !minus) return t / 2;
  if (line === max && minus && !plus) return -t / 2;
  return 0;
}

interface LotSide {
  side: Side;
  axis: Axis;
  line: Mm;
  length: Mm;
  sign: 1 | -1;
}

export function lotSides(lot: Lot): LotSide[] {
  return [
    { side: 'top', axis: 'h', line: 0, length: lot.width, sign: 1 },
    { side: 'bottom', axis: 'h', line: lot.depth, length: lot.width, sign: -1 },
    { side: 'left', axis: 'v', line: 0, length: lot.depth, sign: 1 },
    { side: 'right', axis: 'v', line: lot.width, length: lot.depth, sign: -1 },
  ];
}

/** Lot side of a boundary segment, or null for a house segment. */
export function boundarySide(seg: Pick<WallSegment, 'axis' | 'line'>, lot: Lot): Side | null {
  if (seg.axis === 'h') return seg.line === 0 ? 'top' : seg.line === lot.depth ? 'bottom' : null;
  return seg.line === 0 ? 'left' : seg.line === lot.width ? 'right' : null;
}

/** Muro inside the lot on each enabled side, minus the intervals where a house wall sits on the lot line. */
export function deriveBoundarySegments(
  lot: Lot,
  s: Structure,
  house: WallSegment[],
): WallSegment[] {
  const t = s.boundary;
  if (t <= 0) return [];
  const out: WallSegment[] = [];
  for (const ls of lotSides(lot)) {
    if (!lot.boundaryWalls[ls.side] || ls.length <= 0) continue;
    let intervals: [Mm, Mm][] = [[0, ls.length]];
    for (const h of house) {
      if (h.axis !== ls.axis || h.line !== ls.line || h.offset === 0) continue;
      intervals = subtractInterval(intervals, h.start, h.end);
    }
    for (const [start, end] of intervals) {
      out.push({
        id: segmentId(ls.axis, ls.line, start, end),
        axis: ls.axis,
        line: ls.line,
        start,
        end,
        thickness: t,
        kind: 'boundary',
        offset: (ls.sign * t) / 2,
        plus: null,
        minus: null,
      });
    }
  }
  return out;
}

export function subtractInterval(list: [Mm, Mm][], a: Mm, b: Mm): [Mm, Mm][] {
  const out: [Mm, Mm][] = [];
  for (const [s, e] of list) {
    if (b <= s || a >= e) {
      out.push([s, e]);
      continue;
    }
    if (a > s) out.push([s, a]);
    if (b < e) out.push([b, e]);
  }
  return out;
}

/** Segments grouped by `${axis}:${line}`. */
export function segmentsByLine(segs: WallSegment[]): Map<string, WallSegment[]> {
  const map = new Map<string, WallSegment[]>();
  for (const seg of segs) {
    const key = lineKey(seg.axis, seg.line);
    const list = map.get(key);
    if (list) list.push(seg);
    else map.set(key, [seg]);
  }
  return map;
}

/** Wall bodies. Each end extends to the far face of a perpendicular wall through that point (corners, T-joints). */
export function wallRects(segs: WallSegment[]): WallRect[] {
  const index = segmentsByLine(segs);
  const perpAt = (seg: WallSegment, coord: Mm): WallSegment[] =>
    (index.get(lineKey(seg.axis === 'h' ? 'v' : 'h', coord)) ?? []).filter(
      (p) => p.start <= seg.line && p.end >= seg.line,
    );
  return segs.map((seg) => {
    const c = seg.line + seg.offset;
    const h = seg.thickness / 2;
    let lo = seg.start;
    let hi = seg.end;
    for (const p of perpAt(seg, seg.start)) lo = Math.min(lo, p.line + p.offset - p.thickness / 2);
    for (const p of perpAt(seg, seg.end)) hi = Math.max(hi, p.line + p.offset + p.thickness / 2);
    return seg.axis === 'h'
      ? { segId: seg.id, x0: lo, x1: hi, y0: c - h, y1: c + h }
      : { segId: seg.id, x0: c - h, x1: c + h, y0: lo, y1: hi };
  });
}

/** Consecutive segments on one line with the same thickness, offset and kind. Openings host on runs. */
export function wallRuns(segs: WallSegment[]): WallRun[] {
  const out: WallRun[] = [];
  for (const list of segmentsByLine(segs).values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    let cur: WallRun | null = null;
    for (const seg of sorted) {
      if (
        cur &&
        cur.end === seg.start &&
        cur.thickness === seg.thickness &&
        cur.offset === seg.offset &&
        cur.kind === seg.kind
      ) {
        cur.end = seg.end;
        cur.segmentIds.push(seg.id);
        continue;
      }
      if (cur) out.push(cur);
      cur = {
        axis: seg.axis,
        line: seg.line,
        start: seg.start,
        end: seg.end,
        thickness: seg.thickness,
        offset: seg.offset,
        kind: seg.kind,
        segmentIds: [seg.id],
      };
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Faces of the union of the wall bodies, each with its normal toward the free side. */
export function wallFaces(rects: Rect[]): Face[] {
  if (!rects.length) return [];
  const faces: Face[] = [];
  for (const shape of union(...rects)) {
    for (const ring of shape) {
      for (const [p, q] of edges(ring)) {
        const s = interiorSide(p, q);
        const normal = (s === 1 ? -1 : 1) as 1 | -1;
        if (p.y === q.y) {
          faces.push({
            axis: 'h',
            at: p.y,
            from: Math.min(p.x, q.x),
            to: Math.max(p.x, q.x),
            normal,
          });
        } else {
          faces.push({
            axis: 'v',
            at: p.x,
            from: Math.min(p.y, q.y),
            to: Math.max(p.y, q.y),
            normal,
          });
        }
      }
    }
  }
  return faces;
}
