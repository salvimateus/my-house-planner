import type { Area, Axis, Id, Mm, Vec } from '../model/types.ts';
import { interiorSide } from './shape.ts';
import type { EdgeDim, WallSegment } from './types.ts';
import { lineKey } from './walls.ts';

const MIN_DIM: Mm = 300;

/**
 * How far a wall on the given line reaches into the area at `along`: half thickness plus the lot-line offset.
 * Boundary segments count for any area edge on the lot line. 0 when there is no wall.
 */
export function intrusion(
  segsByLine: Map<string, WallSegment[]>,
  areaId: Id,
  axis: Axis,
  line: Mm,
  along: number,
): Mm {
  let best = 0;
  for (const seg of segsByLine.get(lineKey(axis, line)) ?? []) {
    if (along < seg.start || along > seg.end) continue;
    if (seg.kind !== 'boundary' && seg.plus !== areaId && seg.minus !== areaId) continue;
    best = Math.max(best, seg.thickness / 2 + Math.abs(seg.offset));
  }
  return best;
}

const cross = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);

/** Wall reach on the edge a→b, sampled 0.5 mm inside the edge from `corner` (a or b). */
function edgeCut(
  segsByLine: Map<string, WallSegment[]>,
  areaId: Id,
  a: Vec,
  b: Vec,
  corner: Vec,
): Mm {
  const axis: Axis = a.y === b.y ? 'h' : 'v';
  const other = corner === a ? b : a;
  const c = axis === 'h' ? corner.x : corner.y;
  const o = axis === 'h' ? other.x : other.y;
  return intrusion(segsByLine, areaId, axis, axis === 'h' ? a.y : a.x, c + Math.sign(o - c) * 0.5);
}

/** Internal length of each wall of a room or covered area, deduplicated per axis by rounded centimeters. */
export function edgeDimensions(a: Area, segsByLine: Map<string, WallSegment[]>): EdgeDim[] {
  if (a.kind === 'outdoor') return [];
  const dims: EdgeDim[] = [];
  for (const ring of a.shape) {
    const n = ring.length;
    if (n < 4) continue;
    for (let i = 0; i < n; i++) {
      const p0 = ring[(i - 1 + n) % n]!;
      const p = ring[i]!;
      const q = ring[(i + 1) % n]!;
      const q1 = ring[(i + 2) % n]!;
      const axis: Axis = p.y === q.y ? 'h' : 'v';
      const pA = axis === 'h' ? p.x : p.y;
      const qA = axis === 'h' ? q.x : q.y;
      const dir = Math.sign(qA - pA);
      const startCut = edgeCut(segsByLine, a.id, p0, p, p);
      const endCut = edgeCut(segsByLine, a.id, q, q1, q);
      const startSign = cross(p0, p, q) > 0 ? -1 : 1;
      const endSign = cross(p, q, q1) > 0 ? -1 : 1;
      const netStart = pA - dir * startSign * startCut;
      const netEnd = qA + dir * endSign * endCut;
      const length = Math.abs(netEnd - netStart);
      const inward = interiorSide(p, q);
      const line = axis === 'h' ? p.y : p.x;
      const mid = (netStart + netEnd) / 2;
      const ownCut = intrusion(segsByLine, a.id, axis, line, mid);
      const face = line + inward * ownCut;
      dims.push({
        axis,
        length,
        inward,
        angle: axis === 'h' ? 0 : -90,
        x: axis === 'h' ? mid : face,
        y: axis === 'h' ? face : mid,
      });
    }
  }
  const seen = { h: new Set<number>(), v: new Set<number>() };
  return dims
    .filter((d) => d.length >= MIN_DIM)
    .sort((x, y) => y.length - x.length || x.y - y.y || x.x - y.x)
    .filter((d) => {
      const cm = Math.round(d.length / 10);
      if (seen[d.axis].has(cm)) return false;
      seen[d.axis].add(cm);
      return true;
    });
}
