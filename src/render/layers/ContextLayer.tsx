import type { ReactElement, RefObject } from 'react';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { blobsD, dotsD, lineW, shade, Tile } from '../../catalog/materials/lib/kit.tsx';
import { materialDef } from '../../catalog/registry.ts';
import {
  CURB,
  curbRadius,
  frontagePoint,
  RAMP_FLARE,
  SPECIES_CYCLE,
  SPECIES_SIZE,
  sidewalkStrips,
  treeGap,
  treeOut,
} from '../../geometry/frontage.ts';
import type { Rect } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import { springOut, tween } from '../../juice/tween.ts';
import type { Id, Lot, Mm, Side, StreetTreeSpecies, Vec } from '../../model/types.ts';
import { cameraStore } from '../../store/cameraStore.ts';
import { printSize, type RenderContext } from '../RenderContext.ts';
import { CanopyShadow, StreetTreeCrown, seedOf } from '../streetTree.tsx';
import { type ContextPalette, contextPalette } from '../theme.ts';
import './ContextLayer.css';

const CW: Record<Side, Side> = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };

const STREET: Mm = 8000;
const GUTTER: Mm = 300;
/** Edge line distance from the curb face. */
const EDGE: Mm = 550;
/** Side of the sidewalk slabs. */
const SLAB_SIZE: Mm = 1000;
const TREE_PITCH: Mm = 6500;
/** Decorative trees keep this far from the user's frontage, which has its own trees. */
const OWN_FRONTAGE_GAP: Mm = 1800;
const SLIDE: Mm = 3500;
/** Overlap of abutting asphalt shapes, against antialiasing seams. */
const SEAM: Mm = 60;
const PIT_ALONG: Mm = 760;
const PIT_ACROSS: Mm = 480;
const SLOPE_PITCH: Mm = 160;
/** Pattern tiles, mm. */
const ASPHALT_TILE: Mm = 600;
const SLAB_TILE: Mm = 600;

interface Seg {
  a: Vec;
  b: Vec;
}
type PaintKey = 'asphalt' | 'gutter' | 'curb' | 'grass' | 'slab' | 'paint';
interface Paint {
  pts: Vec[];
  color: PaintKey;
}
export interface TreeMark {
  key: string;
  at: Vec;
  size: Mm;
  species: StreetTreeSpecies;
  seed: number;
  /** Model tree id; null for the decorative trees of the neighbors. */
  id: Id | null;
  /** Tree pit (soil) in the service strip. */
  pit: Vec[];
}
interface RampShape {
  key: string;
  plane: Vec[];
  flares: [Vec[], Vec[]];
  slope: Seg[];
  lowCurb: Seg;
}
interface StreetGroup {
  key: string;
  slide: Vec;
  paints: Paint[];
  joints: Seg[];
  centers: Seg[];
  edges: Seg[];
  ramps: RampShape[];
  trees: TreeMark[];
  label: { at: Vec; angle: 0 | -90 } | null;
}
interface House {
  key: string;
  body: Rect;
  ridge: Rect;
  faint: boolean;
}
interface NeighborLot {
  key: string;
  r: Rect;
  tone: 0 | 1 | 2;
  faint: boolean;
}
export interface ContextGeom {
  bounds: Rect;
  streets: StreetGroup[];
  lots: NeighborLot[];
  lotLines: Seg[];
  houses: House[];
}

/** Local frame: the lot is W × D, the front street lies below it (y > D). `pt` maps local to world. */
interface Frame {
  W: Mm;
  D: Mm;
  pt(x: Mm, y: Mm): Vec;
  /** True when the local x axis is horizontal in the world. */
  xIsWorldX: boolean;
}

function frameOf(lot: Lot): Frame {
  const { width: w, depth: d } = lot;
  switch (lot.frontSide) {
    case 'top':
      return { W: w, D: d, xIsWorldX: true, pt: (x, y) => ({ x: w - x, y: d - y }) };
    case 'left':
      return { W: d, D: w, xIsWorldX: false, pt: (x, y) => ({ x: w - y, y: x }) };
    case 'right':
      return { W: d, D: w, xIsWorldX: false, pt: (x, y) => ({ x: y, y: d - x }) };
    default:
      return { W: w, D: d, xIsWorldX: true, pt: (x, y) => ({ x, y }) };
  }
}

const rect = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Rect => ({
  x0: Math.min(x0, x1),
  y0: Math.min(y0, y1),
  x1: Math.max(x0, x1),
  y1: Math.max(y0, y1),
});

function clipRect(r: Rect, b: Rect): Rect | null {
  const out = {
    x0: Math.max(r.x0, b.x0),
    y0: Math.max(r.y0, b.y0),
    x1: Math.min(r.x1, b.x1),
    y1: Math.min(r.y1, b.y1),
  };
  return out.x1 - out.x0 > 1 && out.y1 - out.y0 > 1 ? out : null;
}

function clipSeg(s: Seg, b: Rect): Seg | null {
  if (s.a.y === s.b.y) {
    if (s.a.y < b.y0 || s.a.y > b.y1) return null;
    const x0 = Math.max(Math.min(s.a.x, s.b.x), b.x0);
    const x1 = Math.min(Math.max(s.a.x, s.b.x), b.x1);
    return x1 > x0 ? { a: { x: x0, y: s.a.y }, b: { x: x1, y: s.a.y } } : null;
  }
  if (s.a.x < b.x0 || s.a.x > b.x1) return null;
  const y0 = Math.max(Math.min(s.a.y, s.b.y), b.y0);
  const y1 = Math.min(Math.max(s.a.y, s.b.y), b.y1);
  return y1 > y0 ? { a: { x: s.a.x, y: y0 }, b: { x: s.a.x, y: y1 } } : null;
}

/** Deterministic pseudo random sequence, so the neighborhood is stable for a lot size. */
function random(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const seedNum = (...n: number[]) => n.reduce((h, v) => Math.imul(h ^ Math.round(v), 2654435761), 7);

type Face = 'top' | 'bottom' | 'left' | 'right';

/** Skeleton house inside a lot, set back from the street on its `face` side. */
function houseIn(lot: Rect, face: Face, seed: number): { body: Rect; ridge: Rect } {
  const rnd = random(seed);
  const horizontal = face === 'top' || face === 'bottom';
  const along = horizontal ? lot.x1 - lot.x0 : lot.y1 - lot.y0;
  const deep = horizontal ? lot.y1 - lot.y0 : lot.x1 - lot.x0;
  const gapA = Math.min(along * 0.3, 900 + rnd() * 1400);
  const gapB = Math.min(along * 0.3, 900 + rnd() * 1400);
  const setback = Math.min(deep * 0.25, 3500 + rnd() * 2500);
  const hd = Math.min(deep - setback - 1500, Math.max(5500, deep * 0.42) * (0.85 + rnd() * 0.3));
  const a0 = (horizontal ? lot.x0 : lot.y0) + gapA;
  const a1 = (horizontal ? lot.x1 : lot.y1) - gapB;
  let body: Rect;
  if (face === 'bottom') body = rect(a0, lot.y1 - setback - hd, a1, lot.y1 - setback);
  else if (face === 'top') body = rect(a0, lot.y0 + setback, a1, lot.y0 + setback + hd);
  else if (face === 'left') body = rect(lot.x0 + setback, a0, lot.x0 + setback + hd, a1);
  else body = rect(lot.x1 - setback - hd, a0, lot.x1 - setback, a1);
  const bw = body.x1 - body.x0;
  const bh = body.y1 - body.y0;
  const short = Math.min(bw, bh);
  const inset = short * 0.24;
  const ridge = rect(
    body.x0 + (bw > bh ? short * 0.3 : inset),
    body.y0 + (bw > bh ? inset : short * 0.3),
    body.x1 - (bw > bh ? short * 0.3 : inset),
    body.y1 - (bw > bh ? inset : short * 0.3),
  );
  return { body, ridge };
}

const boxPts = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Vec[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

function arcPts(c: Vec, r: Mm, a0: number, a1: number, n = 20): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return out;
}

const sectorPts = (c: Vec, r0: Mm, r1: Mm, a0: number, a1: number): Vec[] => [
  ...arcPts(c, r1, a0, a1),
  ...arcPts(c, r0, a1, a0),
];

const chain = (pts: Vec[]): Seg[] => pts.slice(1).map((b, i) => ({ a: pts[i]!, b }));

const cache = new WeakMap<Lot, ContextGeom>();

/** The neighborhood around the lot, computed in the local frame and mapped to the world. Cached per lot. */
export function contextGeometry(lot: Lot): ContextGeom {
  const hit = cache.get(lot);
  if (hit) return hit;
  const geom = buildGeometry(lot);
  cache.set(lot, geom);
  return geom;
}

type LocalGroup = StreetGroup & { alongX: boolean };

/**
 * Local layout, always with the corner street on the left (x < 0); a corner on the right mirrors it.
 * The front street runs through; the corner street ends at the front curb line, with rounded curbs on
 * both corners and a pedestrian crossing set back from the corner.
 */
function buildGeometry(lot: Lot): ContextGeom {
  const f = frameOf(lot);
  const { W, D } = f;
  const s = lot.sidewalkWidth;
  const { service } = sidewalkStrips(lot);
  const paved = s - service;
  const Rc = curbRadius(lot);
  const tOut = treeOut(lot);
  const m = Math.max(12_000, 0.8 * Math.max(W, D), 2 * s + STREET + 6000);
  const B = { x0: -m, y0: -m, x1: W + m, y1: D + m };

  const cornerAt: 'left' | 'right' | null =
    lot.cornerSide === CW[lot.frontSide]
      ? 'left'
      : lot.cornerSide && lot.cornerSide === CW[CW[CW[lot.frontSide]]]
        ? 'right'
        : null;
  const corner = cornerAt !== null;
  const toWorld = (p: Vec): Vec => f.pt(cornerAt === 'right' ? W - p.x : p.x, p.y);
  const angleFor = (alongLocalX: boolean): 0 | -90 => (alongLocalX === f.xIsWorldX ? 0 : -90);

  const yc = D + s;
  const xs = -s;
  const xf = -s - STREET;
  const xb = xf - s;

  const groupOf = (key: string, slide: Vec, alongX: boolean): LocalGroup => ({
    key,
    slide,
    alongX,
    paints: [],
    joints: [],
    centers: [],
    edges: [],
    ramps: [],
    trees: [],
    label: null,
  });
  const paint = (g: LocalGroup, pts: Vec[], color: PaintKey) => g.paints.push({ pts, color });
  const line = (list: Seg[], a: Vec, b: Vec) => {
    if (a.x !== b.x || a.y !== b.y) list.push({ a, b });
  };

  /** Straight sidewalk from a lot line toward the street: paving, grass strip, curb, gutter, joints. */
  const run = (
    g: LocalGroup,
    horizontal: boolean,
    lotLine: Mm,
    dir: 1 | -1,
    [a0, a1]: [Mm, Mm],
  ): ((along: Mm, out: Mm) => Vec) => {
    const P = (along: Mm, out: Mm): Vec =>
      horizontal ? { x: along, y: lotLine + dir * out } : { x: lotLine + dir * out, y: along };
    if (a1 - a0 <= 1) return P;
    const R = (o0: Mm, o1: Mm): Vec[] => {
      const p = P(a0, o0);
      const q = P(a1, o1);
      return boxPts(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y));
    };
    paint(g, R(0, paved), 'slab');
    paint(g, R(paved, s), 'grass');
    paint(g, R(s - CURB, s), 'curb');
    paint(g, R(s, s + GUTTER), 'gutter');
    line(g.joints, P(a0, paved), P(a1, paved));
    if (paved > 0) {
      const rows = Math.max(1, Math.round(paved / SLAB_SIZE));
      for (let k = 1; k < rows; k++) {
        line(g.joints, P(a0, (paved * k) / rows), P(a1, (paved * k) / rows));
      }
      for (let a = Math.ceil(a0 / SLAB_SIZE) * SLAB_SIZE; a < a1; a += SLAB_SIZE) {
        line(g.joints, P(a, 0), P(a, paved));
      }
    }
    return P;
  };

  /** Decorative trees on a straight run, away from its ends and from the user's own frontage. */
  const plant = (
    g: LocalGroup,
    P: (along: Mm, out: Mm) => Vec,
    [r0, r1]: [Mm, Mm],
    pitch: Mm,
    phase: Mm,
    seed: number,
    own: [Mm, Mm] | null,
  ) => {
    const lo = r0 + 1800;
    const hi = r1 - 1800;
    if (hi < lo) return;
    const first = phase - Math.floor((phase - lo) / pitch) * pitch;
    for (let a = first; a <= hi; a += pitch) {
      if (own && a > own[0] - OWN_FRONTAGE_GAP && a < own[1] + OWN_FRONTAGE_GAP) continue;
      const k = Math.abs(seedNum(seed, Math.round(a)));
      const species = SPECIES_CYCLE[k % SPECIES_CYCLE.length]!;
      const size = Math.round(SPECIES_SIZE[species] * (0.85 + ((k >>> 8) % 100) / 400));
      const p0 = P(a - PIT_ALONG / 2, tOut - PIT_ACROSS / 2);
      const p1 = P(a + PIT_ALONG / 2, tOut + PIT_ACROSS / 2);
      g.trees.push({
        key: `${g.key}:${seed}:${Math.round(a)}`,
        at: P(a, tOut),
        size,
        species,
        seed: k % 997,
        id: null,
        pit: boxPts(
          Math.min(p0.x, p1.x),
          Math.min(p0.y, p1.y),
          Math.max(p0.x, p1.x),
          Math.max(p0.y, p1.y),
        ),
      });
    }
  };

  /**
   * Rounded sidewalk corner where a corner-street curb (vertical, at `xcurb`) meets the front curb line.
   * `sigma` points from the curb into the block.
   */
  const cornerPiece = (g: LocalGroup, xcurb: Mm, sigma: 1 | -1) => {
    const c = { x: xcurb + sigma * Rc, y: yc - Rc };
    const a2 = Math.PI / 2;
    const a1 = sigma > 0 ? Math.PI : 0;
    const arc = arcPts(c, Rc, a2, a1);
    // Asphalt fills the rounded-off square between both curb lines.
    // It overlaps both street boxes a little, so no hairline seam shows between them.
    const o = SEAM;
    paint(
      g,
      [
        { x: xcurb - sigma * o, y: yc + o },
        { x: xcurb + sigma * Rc, y: yc + o },
        ...arc,
        { x: xcurb - sigma * o, y: yc - Rc },
      ],
      'asphalt',
    );
    paint(g, sectorPts(c, Rc, Rc + GUTTER, a2, a1), 'gutter');
    const kx = xcurb + sigma * s;
    paint(
      g,
      [{ x: kx, y: yc - Rc }, { x: kx, y: D }, { x: xcurb + sigma * Rc, y: D }, ...arc],
      'slab',
    );
    paint(g, sectorPts(c, Rc - service, Rc, a2, a1), 'grass');
    paint(g, sectorPts(c, Rc - CURB, Rc, a2, a1), 'curb');
    g.joints.push(...chain(arcPts(c, Rc - service, a2, a1)));
  };

  // Front street: it runs through.
  const front = groupOf('front', { x: 0, y: SLIDE }, true);
  paint(front, boxPts(B.x0, yc, B.x1, yc + STREET), 'asphalt');
  const nearA: [Mm, Mm] = [corner ? xs + Rc : B.x0, B.x1];
  const pA = run(front, true, D, 1, nearA);
  plant(front, pA, nearA, TREE_PITCH, (W / 2) % TREE_PITCH, 11, [0, W]);
  const farRange: [Mm, Mm] = [B.x0, B.x1];
  const pFar = run(front, true, D + 2 * s + STREET, -1, farRange);
  plant(front, pFar, farRange, TREE_PITCH * 1.3, TREE_PITCH * 0.4, 12, null);
  line(front.centers, { x: B.x0, y: yc + STREET / 2 }, { x: B.x1, y: yc + STREET / 2 });
  line(front.edges, { x: B.x0, y: yc + STREET - EDGE }, { x: B.x1, y: yc + STREET - EDGE });
  line(front.edges, { x: nearA[0], y: yc + EDGE }, { x: B.x1, y: yc + EDGE });
  front.label = { at: { x: W / 2, y: yc + STREET * 0.3 }, angle: 0 };
  const streets: LocalGroup[] = [front];

  if (corner) {
    // The block across the corner street, on the front street.
    const nearB: [Mm, Mm] = [B.x0, xf - Rc];
    const pB = run(front, true, D, 1, nearB);
    plant(front, pB, nearB, TREE_PITCH, 0, 13, null);
    line(front.edges, { x: B.x0, y: yc + EDGE }, { x: nearB[1], y: yc + EDGE });
    cornerPiece(front, xs, 1);
    cornerPiece(front, xf, -1);

    // Corner street: it ends at the front curb line.
    const side = groupOf('corner', { x: -SLIDE, y: 0 }, false);
    paint(side, boxPts(xf, B.y0, xs, yc + SEAM), 'asphalt');
    const along: [Mm, Mm] = [B.y0, yc - Rc];
    const pNear = run(side, false, 0, -1, along);
    plant(side, pNear, along, TREE_PITCH, D / 2, 21, [0, D]);
    const pOther = run(side, false, xb, 1, along);
    plant(side, pOther, along, TREE_PITCH, D / 2 + TREE_PITCH / 2, 22, null);
    // Pedestrian crossing set back from the corner, and the lane lines stop before it.
    const cw1 = yc - Rc - 700;
    const cw0 = cw1 - 3000;
    const bar = 450;
    const x0 = xf + GUTTER + 250;
    const x1 = xs - GUTTER - 250;
    const n = Math.max(1, Math.floor((x1 - x0 + bar) / (2 * bar)));
    const start = (x0 + x1) / 2 - (n * 2 * bar - bar) / 2;
    for (let i = 0; i < n; i++) {
      const bx = start + i * 2 * bar;
      paint(side, boxPts(bx, cw0, bx + bar, cw1), 'paint');
    }
    const stop = cw0 - 1200;
    line(side.centers, { x: xs - STREET / 2, y: B.y0 }, { x: xs - STREET / 2, y: stop });
    line(side.edges, { x: xs - EDGE, y: B.y0 }, { x: xs - EDGE, y: stop });
    line(side.edges, { x: xf + EDGE, y: B.y0 }, { x: xf + EDGE, y: stop });
    side.label = { at: { x: xs - STREET * 0.3, y: Math.min(D / 2, cw0 - 5000) }, angle: 0 };
    streets.push(side);
  }

  // Neighbor lots of the same size as the lot, each with a skeleton house, up to the context edge.
  const houses: House[] = [];
  const lots: NeighborLot[] = [];
  const lineKeys = new Set<string>();
  const lotLines: Seg[] = [];
  const addLine = (a: Vec, b: Vec) => {
    const c = clipSeg({ a, b }, B);
    if (!c) return;
    const key = `${c.a.x},${c.a.y},${c.b.x},${c.b.y}`;
    if (lineKeys.has(key)) return;
    lineKeys.add(key);
    lotLines.push(c);
  };
  const addLot = (key: string, Lr: Rect, face: Face, seed: number, faint: boolean) => {
    const r = clipRect(Lr, B);
    if (!r) return;
    lots.push({ key, r, tone: (Math.abs(seed) % 3) as 0 | 1 | 2, faint });
    addLine({ x: Lr.x0, y: Lr.y0 }, { x: Lr.x1, y: Lr.y0 });
    addLine({ x: Lr.x0, y: Lr.y1 }, { x: Lr.x1, y: Lr.y1 });
    addLine({ x: Lr.x0, y: Lr.y0 }, { x: Lr.x0, y: Lr.y1 });
    addLine({ x: Lr.x1, y: Lr.y0 }, { x: Lr.x1, y: Lr.y1 });
    const h = houseIn(Lr, face, seed);
    const body = clipRect(h.body, B);
    if (body) houses.push({ key, body, ridge: clipRect(h.ridge, B) ?? body, faint });
  };
  const kMin = Math.floor(B.x0 / W);
  const kMax = Math.ceil(B.x1 / W) - 1;
  for (let k = kMin; k <= kMax; k++) {
    if (corner && k < 0) continue;
    if (k !== 0)
      addLot(`s${k}`, rect(k * W, 0, (k + 1) * W, D), 'bottom', seedNum(k, 1, W, D), false);
    for (let j = 1; -j * D + D > B.y0; j++) {
      const face: Face = j % 2 ? 'top' : 'bottom';
      addLot(
        `b${k}:${j}`,
        rect(k * W, -j * D, (k + 1) * W, -(j - 1) * D),
        face,
        seedNum(k, 2, j, W, D),
        false,
      );
    }
  }
  for (let j = 0, y0 = D + 2 * s + STREET; y0 < B.y1; j++, y0 += D) {
    for (let k = kMin; k <= kMax; k++) {
      const face: Face = j % 2 ? 'bottom' : 'top';
      addLot(
        `a${k}:${j}`,
        rect(k * W, y0, (k + 1) * W, y0 + D),
        face,
        seedNum(k, 3, j, W, D),
        true,
      );
    }
  }
  if (corner) {
    for (let i = 0, x1 = xb; x1 > B.x0; i++, x1 -= D) {
      for (let j = 0, y1 = D; y1 > B.y0; j++, y1 -= W) {
        const face: Face = i % 2 ? 'left' : 'right';
        addLot(`c${i}:${j}`, rect(x1 - D, y1 - W, x1, y1), face, seedNum(i, 4, j, W, D), true);
      }
    }
  }

  // Map to the world, then add the user's frontage from the model.
  const toWorldRect = (r: Rect): Rect => {
    const a = toWorld({ x: r.x0, y: r.y0 });
    const b = toWorld({ x: r.x1, y: r.y1 });
    return rect(a.x, a.y, b.x, b.y);
  };
  const toWorldSeg = (sg: Seg): Seg => ({ a: toWorld(sg.a), b: toWorld(sg.b) });
  const toWorldVec = (v: Vec): Vec => {
    const o = toWorld({ x: 0, y: 0 });
    const p = toWorld(v);
    return { x: p.x - o.x, y: p.y - o.y };
  };
  const worldStreets: StreetGroup[] = streets.map((g) => ({
    key: g.key,
    slide: toWorldVec(g.slide),
    paints: g.paints.map((p) => ({ pts: p.pts.map(toWorld), color: p.color })),
    joints: g.joints.map(toWorldSeg),
    centers: g.centers.map(toWorldSeg),
    edges: g.edges.map(toWorldSeg),
    ramps: [],
    trees: g.trees.map((t) => ({ ...t, at: toWorld(t.at), pit: t.pit.map(toWorld) })),
    label: g.label ? { at: toWorld(g.label.at), angle: angleFor(g.alongX) } : null,
  }));
  const groupFor = (sd: Side): StreetGroup | undefined =>
    sd === lot.frontSide
      ? worldStreets[0]
      : sd === lot.cornerSide
        ? worldStreets.find((g) => g.key === 'corner')
        : undefined;
  const placed: TreeMark[] = [];
  for (const r of lot.frontage.ramps) {
    groupFor(r.side)?.ramps.push(rampShape(lot, r.side, r.id, r.at, r.width));
  }
  for (const t of lot.frontage.trees) {
    const g = groupFor(t.side);
    if (!g) continue;
    const p0 = frontagePoint(lot, t.side, t.at - PIT_ALONG / 2, tOut - PIT_ACROSS / 2);
    const p1 = frontagePoint(lot, t.side, t.at + PIT_ALONG / 2, tOut + PIT_ACROSS / 2);
    const mark: TreeMark = {
      key: t.id,
      at: frontagePoint(lot, t.side, t.at, tOut),
      size: t.size,
      species: t.species,
      seed: seedOf(t.id),
      id: t.id,
      pit: boxPts(
        Math.min(p0.x, p1.x),
        Math.min(p0.y, p1.y),
        Math.max(p0.x, p1.x),
        Math.max(p0.y, p1.y),
      ),
    };
    g.trees.push(mark);
    placed.push(mark);
  }
  // Decorative trees give way to the user's trees and to each other.
  for (const g of worldStreets) {
    g.trees = g.trees.filter((t) => {
      if (t.id !== null) return true;
      const free = placed.every(
        (o) => Math.hypot(o.at.x - t.at.x, o.at.y - t.at.y) >= treeGap(o.size, t.size),
      );
      if (free) placed.push(t);
      return free;
    });
  }

  return {
    bounds: toWorldRect(B),
    streets: worldStreets,
    lots: lots.map((l) => ({ ...l, r: toWorldRect(l.r) })),
    lotLines: lotLines.map(toWorldSeg),
    houses: houses.map((h) => ({ ...h, body: toWorldRect(h.body), ridge: toWorldRect(h.ridge) })),
  };
}

/** Curb cut across the service strip: a ramp plane between two side flares, the curb lowered at the street. */
function rampShape(lot: Lot, side: Side, id: Id, at: Mm, width: Mm): RampShape {
  const { service0, total: s } = sidewalkStrips(lot);
  const P = (a: Mm, o: Mm) => frontagePoint(lot, side, a, o);
  const a = at - width / 2;
  const b = at + width / 2;
  const fl = Math.min(RAMP_FLARE, width / 4);
  const slope: Seg[] = [];
  const inner = b - fl - (a + fl);
  const count = Math.max(1, Math.floor(inner / SLOPE_PITCH));
  const pitch = inner / count;
  for (let i = 1; i < count; i++) {
    const x = a + fl + i * pitch;
    slope.push({ a: P(x, service0 + 110), b: P(x, s - 110) });
  }
  return {
    key: id,
    plane: [P(a + fl, service0), P(b - fl, service0), P(b - fl, s), P(a + fl, s)],
    flares: [
      [P(a, s), P(a + fl, s), P(a + fl, service0)],
      [P(b, s), P(b - fl, s), P(b - fl, service0)],
    ],
    slope,
    lowCurb: { a: P(a, s - 30), b: P(b, s - 30) },
  };
}

const segPath = (list: Seg[]) =>
  list.map((sg) => `M${sg.a.x} ${sg.a.y}L${sg.b.x} ${sg.b.y}`).join('');

const pointsOf = (pts: Vec[]) => pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

const cwSteps = (from: Side, to: Side): number => {
  let n = 0;
  let s = from;
  while (s !== to && n < 4) {
    s = CW[s];
    n += 1;
  }
  return n;
};

/** "Girar frente": the new context turns in from where the old street was. */
export function useFrontTurn(
  ref: RefObject<SVGGElement | null>,
  lot: Lot,
  ctx: RenderContext,
): void {
  const prevFront = useRef<Side>(lot.frontSide);
  useLayoutEffect(() => {
    const from = prevFront.current;
    prevFront.current = lot.frontSide;
    const g = ref.current;
    if (!g || ctx.mode !== 'screen' || from === lot.frontSide) return;
    const steps = cwSteps(from, lot.frontSide);
    const start = steps === 3 ? 90 : -90 * steps;
    const cx = lot.width / 2;
    const cy = lot.depth / 2;
    const handle = tween(
      tuning.lotReveal.outlineMs,
      (t) => {
        if (t >= 1) {
          g.removeAttribute('transform');
          g.style.opacity = '';
          return;
        }
        g.setAttribute('transform', `rotate(${start * (1 - t)} ${cx} ${cy})`);
        g.style.opacity = String(Math.min(1, 0.35 + 0.65 * t));
      },
      springOut,
    );
    return () => {
      handle.cancel();
      g.removeAttribute('transform');
      g.style.opacity = '';
    };
  }, [lot.frontSide, lot.width, lot.depth, ctx.mode, ref]);
}

/** Pattern ids per render mode, so a print copy next to the canvas never resolves to the screen tiles. */
const idSuffix = (ctx: RenderContext) =>
  `${ctx.mode === 'screen' ? '' : `-${ctx.mode}`}${ctx.print?.mono ? '-mono' : ''}`;

/** True when the context textures draw as flat color: thumbnails, textures off, or tiles under the LOD size. */
function useFlatTextures(ctx: RenderContext): boolean {
  const small = useStore(
    cameraStore,
    (st) => ctx.mode === 'screen' && SLAB_TILE * st.committed.zoom < tuning.lod.patternMinTilePx,
  );
  return ctx.mode === 'thumb' || !ctx.layers.textures || small;
}

/** Street, sidewalk (SP pattern), curb, the user's ramps and tree pits, and the neighbor lots around the lot. */
export const ContextLayer = memo(function ContextLayer({
  lot,
  ctx,
}: {
  lot: Lot;
  ctx: RenderContext;
}): ReactElement | null {
  const geom = contextGeometry(lot);
  const groupRef = useRef<SVGGElement>(null);
  const flat = useFlatTextures(ctx);
  useFrontTurn(groupRef, lot, ctx);
  const body = useMemo(() => <ContextBody geom={geom} ctx={ctx} flat={flat} />, [geom, ctx, flat]);
  if (!ctx.layers.context) return null;
  return (
    <g className="scene-layer layer-context" pointerEvents="none" ref={groupRef}>
      {body}
    </g>
  );
});

// Fine aggregate and wear on the asphalt, pores and faint stains on the concrete.
const asphaltDark = dotsD(401, 120, ASPHALT_TILE, ASPHALT_TILE, [5, 12]);
const asphaltLight = dotsD(402, 70, ASPHALT_TILE, ASPHALT_TILE, [4, 9]);
const asphaltWear = blobsD(403, 3, ASPHALT_TILE, ASPHALT_TILE, [90, 200], { points: 8 });
const slabPores = dotsD(404, 60, SLAB_TILE, SLAB_TILE, [3, 7]);
const slabStain = blobsD(405, 3, SLAB_TILE, SLAB_TILE, [80, 180], { points: 8 });

function ContextPatterns({ ctx, pal }: { ctx: RenderContext; pal: ContextPalette }): ReactElement {
  const sfx = idSuffix(ctx);
  const GrassPattern = materialDef('grass').Pattern;
  const tile = (id: string, color: string) => ({ id, color, scale: 1, angle: 0 as const, ctx });
  return (
    <defs>
      <Tile p={tile(`ctx-asphalt${sfx}`, pal.asphalt)} w={ASPHALT_TILE} h={ASPHALT_TILE}>
        <path d={asphaltWear} fill={pal.asphaltDark} fillOpacity={0.18} />
        <path d={asphaltDark} fill={pal.asphaltDark} fillOpacity={0.6} />
        <path d={asphaltLight} fill={pal.asphaltLight} fillOpacity={0.55} />
      </Tile>
      <Tile p={tile(`ctx-slab${sfx}`, pal.slab)} w={SLAB_TILE} h={SLAB_TILE}>
        <path d={slabStain} fill={shade(pal.slab, 0.2)} fillOpacity={0.08} />
        <path d={slabPores} fill={shade(pal.slab, 0.4)} fillOpacity={0.4} />
      </Tile>
      <GrassPattern {...tile(`ctx-grass${sfx}`, pal.grass)} />
    </defs>
  );
}

function ContextBody({
  geom,
  ctx,
  flat,
}: {
  geom: ContextGeom;
  ctx: RenderContext;
  flat: boolean;
}): ReactElement {
  const { theme } = ctx;
  const pal = contextPalette(ctx);
  const screen = ctx.mode === 'screen';
  const thumb = ctx.mode === 'thumb';
  const sfx = idSuffix(ctx);
  const paint: Record<PaintKey, string> = flat
    ? {
        asphalt: pal.asphalt,
        gutter: pal.gutter,
        curb: pal.curb,
        grass: materialDef('grass').flatColor(pal.grass),
        slab: pal.slab,
        paint: pal.paint,
      }
    : {
        asphalt: `url(#ctx-asphalt${sfx})`,
        gutter: pal.gutter,
        curb: pal.curb,
        grass: `url(#ctx-grass${sfx})`,
        slab: `url(#ctx-slab${sfx})`,
        paint: pal.paint,
      };
  const lineProps = screen ? { className: 'ctx-boundary' } : { strokeWidth: printSize(ctx, 0.1) };
  const labelProps = screen
    ? { className: 'scene-text ctx-street-label' }
    : {
        fontSize: printSize(ctx, 2.6),
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        letterSpacing: printSize(ctx, 1),
      };
  const joint = lineW(ctx, 25);

  return (
    <>
      {flat ? null : <ContextPatterns ctx={ctx} pal={pal} />}
      {thumb ? null : (
        <>
          {geom.lots.map((l) => (
            <rect
              key={l.key}
              x={l.r.x0}
              y={l.r.y0}
              width={l.r.x1 - l.r.x0}
              height={l.r.y1 - l.r.y0}
              fill={pal.neighborGround[l.tone]}
              fillOpacity={l.faint ? 0.7 : 1}
              data-reveal="neighbor"
            />
          ))}
          <path
            d={segPath(geom.lotLines)}
            fill="none"
            stroke={pal.neighborLine}
            {...lineProps}
            data-reveal="neighbor"
          />
          {geom.houses.map((h) => (
            <g key={h.key} data-reveal="neighbor">
              <rect
                x={h.body.x0}
                y={h.body.y0}
                width={h.body.x1 - h.body.x0}
                height={h.body.y1 - h.body.y0}
                rx={350}
                fill={theme.neighborHouse}
                fillOpacity={h.faint ? 0.6 : 1}
              />
              <rect
                x={h.ridge.x0}
                y={h.ridge.y0}
                width={h.ridge.x1 - h.ridge.x0}
                height={h.ridge.y1 - h.ridge.y0}
                rx={200}
                fill={theme.neighborRidge}
                fillOpacity={h.faint ? 0.6 : 1}
              />
            </g>
          ))}
          {screen ? <Shimmer geom={geom} /> : null}
        </>
      )}
      {geom.streets.map((g) => (
        <g key={g.key} data-reveal="street" data-dx={g.slide.x} data-dy={g.slide.y}>
          {g.paints.map((p, i) => (
            <polygon
              // biome-ignore lint/suspicious/noArrayIndexKey: static geometry list, rebuilt as a whole
              key={i}
              points={pointsOf(p.pts)}
              fill={paint[p.color]}
            />
          ))}
          {thumb ? null : (
            <>
              <path d={segPath(g.joints)} fill="none" stroke={pal.joint} strokeWidth={joint} />
              <path
                d={segPath(g.edges)}
                fill="none"
                stroke={pal.paint}
                strokeWidth={100}
                strokeOpacity={0.85}
              />
              <path
                d={segPath(g.centers)}
                fill="none"
                stroke={pal.paint}
                strokeWidth={120}
                strokeDasharray="2000 2500"
              />
              {g.label ? (
                <text
                  x={g.label.at.x}
                  y={g.label.at.y}
                  transform={
                    g.label.angle ? `rotate(-90 ${g.label.at.x} ${g.label.at.y})` : undefined
                  }
                  textAnchor="middle"
                  dy="0.35em"
                  fill={pal.paint}
                  fillOpacity={0.9}
                  {...labelProps}
                >
                  RUA
                </text>
              ) : null}
            </>
          )}
        </g>
      ))}
    </>
  );
}

/**
 * The user's ramps, every tree pit and every street tree crown, drawn above the lot ground and the lot
 * walls so the crowns overhang them. Pits and crowns come from the same tree list. One group per street,
 * so the lot reveal slides them in with their sidewalk.
 */
export const StreetCanopies = memo(function StreetCanopies({
  lot,
  ctx,
}: {
  lot: Lot;
  ctx: RenderContext;
}): ReactElement | null {
  const geom = contextGeometry(lot);
  const ref = useRef<SVGGElement>(null);
  useFrontTurn(ref, lot, ctx);
  const body = useMemo(() => {
    const pal = contextPalette(ctx);
    return geom.streets.map((g) =>
      g.trees.length || g.ramps.length ? (
        <g key={g.key} data-reveal="street" data-dx={g.slide.x} data-dy={g.slide.y}>
          {g.ramps.map((r) => (
            <g key={r.key}>
              <polygon points={pointsOf(r.plane)} fill={pal.ramp} />
              <polygon points={pointsOf(r.flares[0])} fill={pal.rampFlare} />
              <polygon points={pointsOf(r.flares[1])} fill={pal.rampFlare} />
              <path
                d={segPath(r.slope)}
                fill="none"
                stroke={pal.rampLine}
                strokeWidth={lineW(ctx, 18)}
                strokeOpacity={0.6}
                strokeLinecap="round"
              />
              <path
                d={segPath([
                  { a: r.flares[0][0]!, b: r.flares[0][2]! },
                  { a: r.flares[1][0]!, b: r.flares[1][2]! },
                ])}
                fill="none"
                stroke={pal.rampLine}
                strokeWidth={lineW(ctx, 22)}
                strokeOpacity={0.8}
              />
              <path d={segPath([r.lowCurb])} fill="none" stroke={pal.curbLow} strokeWidth={60} />
            </g>
          ))}
          {g.trees.map((t) => (
            <polygon
              key={t.key}
              points={pointsOf(t.pit)}
              fill={pal.pit}
              stroke={shade(pal.pit, 0.3)}
              strokeWidth={lineW(ctx, 20)}
              strokeLinejoin="round"
            />
          ))}
          {g.trees.map((t) => (
            <CanopyShadow key={t.key} x={t.at.x} y={t.at.y} size={t.size} seed={t.seed} ctx={ctx} />
          ))}
          {g.trees.map((t) => (
            <StreetTreeCrown
              key={t.key}
              x={t.at.x}
              y={t.at.y}
              size={t.size}
              species={t.species}
              seed={t.seed}
              ctx={ctx}
            />
          ))}
        </g>
      ) : null,
    );
  }, [geom, ctx]);
  if (!ctx.layers.context || ctx.mode === 'thumb') return null;
  return (
    <g className="scene-layer layer-canopies" pointerEvents="none" ref={ref}>
      {body}
    </g>
  );
});

/** Skeleton-loader sweep over the neighbor houses, played only by the lot reveal. */
function Shimmer({ geom }: { geom: ContextGeom }): ReactElement {
  const b = geom.bounds;
  const band = (b.x1 - b.x0) * 0.3;
  return (
    <>
      <defs>
        <linearGradient id="ctx-shimmer-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.6} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
        <clipPath id="ctx-shimmer-clip">
          {geom.houses.map((h) => (
            <rect
              key={h.key}
              x={h.body.x0}
              y={h.body.y0}
              width={h.body.x1 - h.body.x0}
              height={h.body.y1 - h.body.y0}
              rx={350}
            />
          ))}
        </clipPath>
      </defs>
      <g clipPath="url(#ctx-shimmer-clip)">
        <rect
          className="ctx-shimmer"
          data-reveal="shimmer"
          data-travel={b.x1 - b.x0 + band}
          x={b.x0 - band}
          y={b.y0}
          width={band}
          height={b.y1 - b.y0}
          fill="url(#ctx-shimmer-grad)"
        />
      </g>
    </>
  );
}
