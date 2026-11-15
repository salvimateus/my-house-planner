import type { Mm, Ring, Shape } from '../model/types.ts';
import { pointInRing, rectsOverlap, signedArea } from './shape.ts';
import type { CellMask, Operand, Rect, Region } from './types.ts';

const isRect = (op: Operand): op is Rect => !Array.isArray(op);

interface Grid {
  xs: Mm[];
  ys: Mm[];
  xi: Map<Mm, number>;
  yi: Map<Mm, number>;
  cols: number;
  rows: number;
}

function buildGrid(ops: Operand[]): Grid {
  const xset = new Set<Mm>();
  const yset = new Set<Mm>();
  for (const op of ops) {
    if (isRect(op)) {
      if (op.x0 >= op.x1 || op.y0 >= op.y1) continue;
      xset.add(op.x0);
      xset.add(op.x1);
      yset.add(op.y0);
      yset.add(op.y1);
      continue;
    }
    for (const shape of op) {
      for (const ring of shape) {
        for (const p of ring) {
          xset.add(p.x);
          yset.add(p.y);
        }
      }
    }
  }
  const xs = [...xset].sort((a, b) => a - b);
  const ys = [...yset].sort((a, b) => a - b);
  const xi = new Map<Mm, number>();
  const yi = new Map<Mm, number>();
  for (const [i, x] of xs.entries()) xi.set(x, i);
  for (const [i, y] of ys.entries()) yi.set(y, i);
  const cols = Math.max(0, xs.length - 1);
  const rows = Math.max(0, ys.length - 1);
  return { xs, ys, xi, yi, cols: rows ? cols : 0, rows: cols ? rows : 0 };
}

/** Writes `value` into every cell covered by the operand. Shapes use even-odd per shape. */
function paint(cells: Uint8Array, g: Grid, op: Operand, value: 0 | 1): void {
  if (!g.cols || !g.rows) return;
  if (isRect(op)) {
    if (op.x0 >= op.x1 || op.y0 >= op.y1) return;
    const c0 = g.xi.get(op.x0)!;
    const c1 = g.xi.get(op.x1)!;
    const r0 = g.yi.get(op.y0)!;
    const r1 = g.yi.get(op.y1)!;
    for (let r = r0; r < r1; r++) cells.fill(value, r * g.cols + c0, r * g.cols + c1);
    return;
  }
  for (const shape of op) paintShape(cells, g, shape, value);
}

function paintShape(cells: Uint8Array, g: Grid, shape: Shape, value: 0 | 1): void {
  const vert: { x: Mm; y0: Mm; y1: Mm }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of shape) {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      if (a.x !== b.x || a.y === b.y) continue;
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      vert.push({ x: a.x, y0, y1 });
      if (y0 < minY) minY = y0;
      if (y1 > maxY) maxY = y1;
    }
  }
  if (!vert.length) return;
  const r0 = g.yi.get(minY)!;
  const r1 = g.yi.get(maxY)!;
  const xsAt: Mm[] = [];
  for (let r = r0; r < r1; r++) {
    const cy = (g.ys[r]! + g.ys[r + 1]!) / 2;
    xsAt.length = 0;
    for (const e of vert) if (e.y0 < cy && e.y1 > cy) xsAt.push(e.x);
    xsAt.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xsAt.length; k += 2) {
      cells.fill(value, r * g.cols + g.xi.get(xsAt[k]!)!, r * g.cols + g.xi.get(xsAt[k + 1]!)!);
    }
  }
}

function planeOf(g: Grid, op: Operand): Uint8Array {
  const out = new Uint8Array(g.cols * g.rows);
  paint(out, g, op, 1);
  return out;
}

const maskOf = (g: Grid, cells: Uint8Array): CellMask => ({ xs: g.xs, ys: g.ys, cells });

/** Generic raster combine: one bit plane per operand, `combine` decides each cell. */
export function rasterize(
  ops: Operand[],
  combine: (bits: Uint8Array[], i: number) => boolean,
): CellMask {
  const g = buildGrid(ops);
  const planes = ops.map((op) => planeOf(g, op));
  const cells = new Uint8Array(g.cols * g.rows);
  for (let i = 0; i < cells.length; i++) cells[i] = combine(planes, i) ? 1 : 0;
  return maskOf(g, cells);
}

export function unionMask(ops: Operand[]): CellMask {
  const g = buildGrid(ops);
  const cells = new Uint8Array(g.cols * g.rows);
  for (const op of ops) paint(cells, g, op, 1);
  return maskOf(g, cells);
}

export function differenceMask(a: Operand, cuts: Operand[]): CellMask {
  const g = buildGrid([a, ...cuts]);
  const cells = new Uint8Array(g.cols * g.rows);
  paint(cells, g, a, 1);
  for (const op of cuts) paint(cells, g, op, 0);
  return maskOf(g, cells);
}

/** `a` minus every cut, where `a` is itself a union of operands. */
export function unionDifferenceMask(adds: Operand[], cuts: Operand[]): CellMask {
  const g = buildGrid([...adds, ...cuts]);
  const cells = new Uint8Array(g.cols * g.rows);
  for (const op of adds) paint(cells, g, op, 1);
  for (const op of cuts) paint(cells, g, op, 0);
  return maskOf(g, cells);
}

export function intersectionMask(a: Operand, others: Operand[]): CellMask {
  const g = buildGrid([a, ...others]);
  const cells = planeOf(g, a);
  for (const op of others) {
    const p = planeOf(g, op);
    for (let i = 0; i < cells.length; i++) cells[i]! &= p[i]!;
  }
  return maskOf(g, cells);
}

export const union = (...ops: Operand[]): Region => toRings(unionMask(ops));
export const difference = (a: Operand, ...cuts: Operand[]): Region =>
  toRings(differenceMask(a, cuts));
export const intersection = (a: Operand, ...others: Operand[]): Region =>
  toRings(intersectionMask(a, others));

/** Exact area in mm². Regions are disjoint shapes with holes, so ring areas add up. */
export function area(op: Operand): number {
  if (isRect(op)) return Math.max(0, op.x1 - op.x0) * Math.max(0, op.y1 - op.y0);
  let total = 0;
  for (const shape of op) {
    shape.forEach((ring, i) => {
      const a = Math.abs(signedArea(ring));
      total += i === 0 ? a : -a;
    });
  }
  return total;
}

export function maskArea({ xs, ys, cells }: CellMask): number {
  const cols = xs.length - 1;
  let total = 0;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    const c = i % cols;
    const r = (i - c) / cols;
    total += (xs[c + 1]! - xs[c]!) * (ys[r + 1]! - ys[r]!);
  }
  return total;
}

// Directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y. Left turn (algebraic) of d is (d + 1) % 4.

/**
 * Boundary trace. Each filled cell side next to an empty cell becomes a directed edge with the filled cell on
 * its algebraic left. At a vertex with two outgoing edges the left turn wins, so diagonal neighbors form
 * separate rings. Collinear edges merge. Positive rings are outers; each hole joins the smallest outer that
 * contains a point 0.5 mm to the left of one of its horizontal edges.
 */
export function toRings(mask: CellMask): Region {
  const { xs, ys, cells } = mask;
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols <= 0 || rows <= 0) return [];
  const nx = xs.length;
  const filled = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows && cells[r * cols + c] === 1;

  const from: number[] = [];
  const dir: number[] = [];
  const outgoing = new Map<number, number[]>();
  const add = (v: number, d: number) => {
    const id = from.length;
    from.push(v);
    dir.push(d);
    const list = outgoing.get(v);
    if (list) list.push(id);
    else outgoing.set(v, [id]);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r * cols + c] !== 1) continue;
      if (!filled(c, r - 1)) add(r * nx + c, 0);
      if (!filled(c + 1, r)) add(r * nx + c + 1, 1);
      if (!filled(c, r + 1)) add((r + 1) * nx + c + 1, 2);
      if (!filled(c - 1, r)) add((r + 1) * nx + c, 3);
    }
  }
  if (!from.length) return [];

  const step = [1, nx, -1, -nx];
  const used = new Uint8Array(from.length);
  const rings: Ring[] = [];
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue;
    const vs: number[] = [];
    const ds: number[] = [];
    let e = e0;
    while (!used[e]) {
      used[e] = 1;
      vs.push(from[e]!);
      ds.push(dir[e]!);
      const end = from[e]! + step[dir[e]!]!;
      const cands = outgoing.get(end) ?? [];
      const d = dir[e]!;
      let next = -1;
      for (const want of [(d + 1) % 4, d, (d + 3) % 4]) {
        const hit = cands.find((k) => dir[k] === want);
        if (hit !== undefined) {
          next = hit;
          break;
        }
      }
      if (next < 0) break;
      e = next;
    }
    const ring: Ring = [];
    const n = vs.length;
    for (let i = 0; i < n; i++) {
      if (ds[i] === ds[(i - 1 + n) % n]) continue;
      const v = vs[i]!;
      const c = v % nx;
      ring.push({ x: xs[c]!, y: ys[(v - c) / nx]! });
    }
    if (ring.length >= 4) rings.push(ring);
  }

  const outers: { ring: Ring; area: number; holes: Ring[] }[] = [];
  const holes: Ring[] = [];
  for (const ring of rings) {
    const a = signedArea(ring);
    if (a > 0) outers.push({ ring, area: a, holes: [] });
    else if (a < 0) holes.push(ring);
  }
  for (const hole of holes) {
    const probe = holeProbe(hole);
    let best: (typeof outers)[number] | null = null;
    for (const o of outers) {
      if ((!best || o.area < best.area) && pointInRing(probe, o.ring)) best = o;
    }
    best?.holes.push(hole);
  }
  return outers.map((o) => [o.ring, ...o.holes]);
}

function holeProbe(ring: Ring): { x: number; y: number } {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % n]!;
    if (p.y !== q.y) continue;
    const dx = Math.sign(q.x - p.x);
    return { x: (p.x + q.x) / 2, y: p.y + 0.5 * dx };
  }
  return ring[0]!;
}

/**
 * Largest axis-aligned rectangle inside `region` that avoids every obstacle. For each column pair keep a running
 * AND per row and scan the row runs; the best `score(w, h)` wins (default: area).
 */
export function largestFreeRect(
  region: Operand,
  obstacles: Rect[],
  score: (w: Mm, h: Mm) => number = (w, h) => w * h,
): Rect | null {
  const box = isRect(region) ? region : regionBox(region);
  if (!box) return null;
  const cuts = obstacles.filter((o) => rectsOverlap(o, box));
  const { xs, ys, cells } = differenceMask(region, cuts);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols <= 0 || rows <= 0) return null;
  let best: Rect | null = null;
  let bestScore = -Infinity;
  const run = new Uint8Array(rows);
  for (let i = 0; i < cols; i++) {
    run.fill(1);
    for (let k = i; k < cols; k++) {
      let any = false;
      for (let r = 0; r < rows; r++) {
        run[r]! &= cells[r * cols + k]!;
        if (run[r]) any = true;
      }
      if (!any) break;
      const w = xs[k + 1]! - xs[i]!;
      let r = 0;
      while (r < rows) {
        if (!run[r]) {
          r++;
          continue;
        }
        const j0 = r;
        while (r < rows && run[r]) r++;
        const h = ys[r]! - ys[j0]!;
        const s = score(w, h);
        if (s > bestScore) {
          bestScore = s;
          best = { x0: xs[i]!, x1: xs[k + 1]!, y0: ys[j0]!, y1: ys[r]! };
        }
      }
    }
  }
  return best;
}

function regionBox(region: Region): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const shape of region) {
    for (const p of shape[0] ?? []) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return x0 < x1 && y0 < y1 ? { x0, y0, x1, y1 } : null;
}
