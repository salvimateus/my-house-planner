import type { ReactElement } from 'react';
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import type { Rect } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import { springOut, tween } from '../../juice/tween.ts';
import type { Lot, Mm, Side, Vec } from '../../model/types.ts';
import { printSize, type RenderContext } from '../RenderContext.ts';
import { treeColors } from '../theme.ts';

const CW: Record<Side, Side> = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };

const STREET: Mm = 8000;
const CURB: Mm = 150;
const SERVICE_STRIP: Mm = 700;
const FREE_STRIP: Mm = 1200;
const JOINT_PITCH: Mm = 1500;
const TREE_PITCH: Mm = 6500;
const SLIDE: Mm = 3500;

interface Seg {
  a: Vec;
  b: Vec;
}
interface Paint {
  r: Rect;
  color: 'street' | 'curb' | 'sidewalk' | 'serviceStrip' | 'sidewalkJoint';
}
interface StreetGroup {
  key: string;
  slide: Vec;
  rects: Paint[];
  joints: Seg[];
  centers: Seg[];
  trees: Vec[];
  label: { at: Vec; angle: 0 | -90 } | null;
}
interface House {
  key: string;
  body: Rect;
  ridge: Rect;
  faint: boolean;
}
interface ContextGeom {
  bounds: Rect;
  streets: StreetGroup[];
  lotLines: Seg[];
  faintLotLines: Seg[];
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

const seedOf = (...n: number[]) => n.reduce((h, v) => Math.imul(h ^ Math.round(v), 2654435761), 7);

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

/** The neighborhood around the lot, computed in the local frame and mapped to the world. */
export function contextGeometry(lot: Lot): ContextGeom {
  const f = frameOf(lot);
  const { W, D } = f;
  const s = lot.sidewalkWidth;
  const service = Math.min(SERVICE_STRIP, s);
  const free = Math.min(FREE_STRIP, s - service);
  const access = s - service - free;
  const m = Math.max(12_000, 0.8 * Math.max(W, D), 2 * s + STREET + 6000);
  const B = { x0: -m, y0: -m, x1: W + m, y1: D + m };

  const corner: 'left' | 'right' | null =
    lot.cornerSide === CW[lot.frontSide]
      ? 'left'
      : lot.cornerSide && lot.cornerSide === CW[CW[CW[lot.frontSide]]]
        ? 'right'
        : null;

  const toWorldRect = (r: Rect): Rect => {
    const a = f.pt(r.x0, r.y0);
    const b = f.pt(r.x1, r.y1);
    return rect(a.x, a.y, b.x, b.y);
  };
  const toWorldSeg = (sg: Seg): Seg => ({ a: f.pt(sg.a.x, sg.a.y), b: f.pt(sg.b.x, sg.b.y) });
  const toWorldVec = (v: Vec): Vec => {
    const o = f.pt(0, 0);
    const p = f.pt(v.x, v.y);
    return { x: p.x - o.x, y: p.y - o.y };
  };
  const angleFor = (alongLocalX: boolean): 0 | -90 => (alongLocalX === f.xIsWorldX ? 0 : -90);

  const groupOf = (
    key: string,
    slide: Vec,
    alongX: boolean,
  ): StreetGroup & { alongX: boolean } => ({
    key,
    slide,
    alongX,
    rects: [],
    joints: [],
    centers: [],
    trees: [],
    label: null,
  });
  const add = (g: StreetGroup, r: Rect, color: Paint['color']) => {
    const c = clipRect(r, B);
    if (c) g.rects.push({ r: c, color });
  };
  const addSeg = (list: Seg[], sg: Seg) => {
    const c = clipSeg(sg, B);
    if (c) list.push(c);
  };

  // Front street, below the lot.
  const front = groupOf('front', { x: 0, y: SLIDE }, true);
  const fx0 = corner === 'left' ? -s : B.x0;
  const fx1 = corner === 'right' ? W + s : B.x1;
  add(front, rect(fx0, D, fx1, D + s), 'sidewalk');
  add(front, rect(fx0, D + s - service, fx1, D + s), 'sidewalkJoint');
  add(front, rect(B.x0, D + s, B.x1, D + s + STREET), 'street');
  add(front, rect(fx0, D + s - CURB, fx1, D + s), 'curb');
  add(front, rect(B.x0, D + s + STREET, B.x1, D + 2 * s + STREET), 'sidewalk');
  add(front, rect(B.x0, D + s + STREET, B.x1, D + s + STREET + CURB), 'curb');
  addSeg(front.joints, { a: { x: fx0, y: D + access }, b: { x: fx1, y: D + access } });
  addSeg(front.joints, { a: { x: fx0, y: D + s - service }, b: { x: fx1, y: D + s - service } });
  for (let x = Math.ceil(fx0 / JOINT_PITCH) * JOINT_PITCH; x < fx1; x += JOINT_PITCH) {
    addSeg(front.joints, { a: { x, y: D }, b: { x, y: D + s - service } });
  }
  addSeg(front.centers, {
    a: { x: B.x0, y: D + s + STREET / 2 },
    b: { x: B.x1, y: D + s + STREET / 2 },
  });
  const firstTree = W / 2 - Math.floor((W / 2 - fx0 - 1500) / TREE_PITCH) * TREE_PITCH;
  for (let x = firstTree; x < fx1 - 1500; x += TREE_PITCH) {
    if (x < B.x0 || x > B.x1) continue;
    add(front, rect(x - 1000, D + s - service + 60, x + 1000, D + s - CURB - 30), 'serviceStrip');
    front.trees.push({ x, y: D + s - service / 2 - 40 });
  }
  front.label = { at: { x: W / 2, y: D + s + STREET * 0.27 }, angle: 0 };

  const streets = [front];

  // Corner street, built on the left and mirrored for the right.
  if (corner) {
    const mx = (x: Mm) => (corner === 'left' ? x : W - x);
    const cr = (x0: Mm, y0: Mm, x1: Mm, y1: Mm) => rect(mx(x0), y0, mx(x1), y1);
    const side = groupOf('corner', { x: corner === 'left' ? -SLIDE : SLIDE, y: 0 }, false);
    add(side, cr(-s, B.y0, 0, D), 'sidewalk');
    add(side, cr(-s, B.y0, -s + service, D), 'sidewalkJoint');
    add(side, cr(-s - STREET, B.y0, -s, D + s + STREET), 'street');
    add(side, cr(-s, B.y0, -s + CURB, D + s), 'curb');
    add(side, cr(-2 * s - STREET, B.y0, -s - STREET, D + s), 'sidewalk');
    add(side, cr(-s - STREET - CURB, B.y0, -s - STREET, D + s), 'curb');
    addSeg(side.joints, { a: { x: mx(-access), y: B.y0 }, b: { x: mx(-access), y: D } });
    addSeg(side.joints, { a: { x: mx(-s + service), y: B.y0 }, b: { x: mx(-s + service), y: D } });
    for (let y = Math.ceil(B.y0 / JOINT_PITCH) * JOINT_PITCH; y < D; y += JOINT_PITCH) {
      addSeg(side.joints, { a: { x: mx(0), y }, b: { x: mx(-s + service), y } });
    }
    addSeg(side.centers, {
      a: { x: mx(-s - STREET / 2), y: B.y0 },
      b: { x: mx(-s - STREET / 2), y: D + s },
    });
    for (
      let y = D / 2 - Math.floor((D / 2 - B.y0) / TREE_PITCH) * TREE_PITCH;
      y < D - 1500;
      y += TREE_PITCH
    ) {
      add(side, cr(-s + CURB + 30, y - 1000, -s + service - 60, y + 1000), 'serviceStrip');
      side.trees.push({ x: mx(-s + service / 2 + 40), y });
    }
    side.label = { at: { x: mx(-s - STREET * 0.27), y: D / 2 }, angle: 0 };
    streets.push(side);
  }

  // Back street, when the block behind is shorter than the margin.
  if (-D > B.y0) {
    const back = groupOf('back', { x: 0, y: -SLIDE }, true);
    add(back, rect(B.x0, -D - s, B.x1, -D), 'sidewalk');
    add(back, rect(B.x0, -D - s - STREET, B.x1, -D - s), 'street');
    add(back, rect(B.x0, -D - s - CURB, B.x1, -D - s), 'curb');
    addSeg(back.centers, {
      a: { x: B.x0, y: -D - s - STREET / 2 },
      b: { x: B.x1, y: -D - s - STREET / 2 },
    });
    streets.push(back);
  }

  // Neighbor lots and skeleton houses.
  const houses: House[] = [];
  const lotLines: Seg[] = [];
  const faintLotLines: Seg[] = [];
  const outline = (r: Rect, list: Seg[]) => {
    addSeg(list, { a: { x: r.x0, y: r.y0 }, b: { x: r.x1, y: r.y0 } });
    addSeg(list, { a: { x: r.x0, y: r.y1 }, b: { x: r.x1, y: r.y1 } });
    addSeg(list, { a: { x: r.x0, y: r.y0 }, b: { x: r.x0, y: r.y1 } });
    addSeg(list, { a: { x: r.x1, y: r.y0 }, b: { x: r.x1, y: r.y1 } });
  };
  const addHouse = (key: string, L: Rect, face: Face, seed: number, faint: boolean) => {
    const h = houseIn(L, face, seed);
    const body = clipRect(h.body, B);
    if (!body) return;
    houses.push({ key, body, ridge: clipRect(h.ridge, B) ?? body, faint });
  };
  const kMin = Math.floor(B.x0 / W);
  const kMax = Math.ceil(B.x1 / W) - 1;
  const blocked = (k: number) => (corner === 'left' && k < 0) || (corner === 'right' && k > 0);
  for (let k = kMin; k <= kMax; k++) {
    if (blocked(k)) continue;
    if (k !== 0) {
      const L = rect(k * W, 0, (k + 1) * W, D);
      outline(L, lotLines);
      addHouse(`s${k}`, L, 'bottom', seedOf(k, 1, W, D), false);
    }
    const back = rect(k * W, -D, (k + 1) * W, 0);
    outline(back, lotLines);
    addHouse(`b${k}`, back, 'top', seedOf(k, 2, W, D), false);
  }
  const across = D + 2 * s + STREET;
  for (let k = kMin; k <= kMax; k++) {
    const L = rect(k * W, across, (k + 1) * W, across + D);
    outline(L, faintLotLines);
    addHouse(`a${k}`, L, 'top', seedOf(k, 3, W, D), true);
  }
  if (corner) {
    const x1 = -2 * s - STREET;
    for (let j = 0; D + s - j * W > B.y0; j++) {
      const L0 = rect(x1 - D, D + s - (j + 1) * W, x1, D + s - j * W);
      const L = corner === 'left' ? L0 : rect(W - L0.x1, L0.y0, W - L0.x0, L0.y1);
      outline(L, faintLotLines);
      addHouse(`c${j}`, L, corner === 'left' ? 'right' : 'left', seedOf(j, 4, W, D), true);
    }
  }

  return {
    bounds: toWorldRect(B),
    streets: streets.map((g) => ({
      key: g.key,
      slide: toWorldVec(g.slide),
      rects: g.rects.map((p) => ({ r: toWorldRect(p.r), color: p.color })),
      joints: g.joints.map(toWorldSeg),
      centers: g.centers.map(toWorldSeg),
      trees: g.trees.map((t) => f.pt(t.x, t.y)),
      label: g.label ? { at: f.pt(g.label.at.x, g.label.at.y), angle: angleFor(g.alongX) } : null,
    })),
    lotLines: lotLines.map(toWorldSeg),
    faintLotLines: faintLotLines.map(toWorldSeg),
    houses: houses.map((h) => ({ ...h, body: toWorldRect(h.body), ridge: toWorldRect(h.ridge) })),
  };
}

const segPath = (list: Seg[]) =>
  list.map((sg) => `M${sg.a.x} ${sg.a.y}L${sg.b.x} ${sg.b.y}`).join('');

const cwSteps = (from: Side, to: Side): number => {
  let n = 0;
  let s = from;
  while (s !== to && n < 4) {
    s = CW[s];
    n += 1;
  }
  return n;
};

/** Street, sidewalk (SP pattern), curb and the neighbor lots around the lot. */
export const ContextLayer = memo(function ContextLayer({
  lot,
  ctx,
}: {
  lot: Lot;
  ctx: RenderContext;
}): ReactElement | null {
  const geom = useMemo(() => contextGeometry(lot), [lot]);
  const groupRef = useRef<SVGGElement>(null);
  const prevFront = useRef<Side>(lot.frontSide);

  // "Girar frente": the new context turns in from where the old street was.
  useLayoutEffect(() => {
    const from = prevFront.current;
    prevFront.current = lot.frontSide;
    const g = groupRef.current;
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
  }, [lot.frontSide, lot.width, lot.depth, ctx.mode]);

  if (!ctx.layers.context) return null;
  const { theme } = ctx;
  const screen = ctx.mode === 'screen';
  const thumb = ctx.mode === 'thumb';
  const lineProps = screen
    ? { className: 'ctx-lot-line' }
    : {
        strokeWidth: printSize(ctx, 0.18),
        strokeDasharray: `${printSize(ctx, 1.2)} ${printSize(ctx, 0.9)}`,
      };
  const tree = treeColors(ctx);
  const labelProps = screen
    ? { className: 'scene-text ctx-street-label' }
    : {
        fontSize: printSize(ctx, 2.6),
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        letterSpacing: printSize(ctx, 1),
      };

  return (
    <g className="scene-layer layer-context" pointerEvents="none" ref={groupRef}>
      {thumb ? null : (
        <>
          <path
            d={segPath(geom.lotLines)}
            fill="none"
            stroke={theme.neighborLine}
            {...lineProps}
            data-reveal="neighbor"
          />
          <path
            d={segPath(geom.faintLotLines)}
            fill="none"
            stroke={theme.neighborLine}
            strokeOpacity={0.6}
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
                fillOpacity={h.faint ? 0.55 : 1}
              />
              <rect
                x={h.ridge.x0}
                y={h.ridge.y0}
                width={h.ridge.x1 - h.ridge.x0}
                height={h.ridge.y1 - h.ridge.y0}
                rx={200}
                fill={theme.neighborRidge}
                fillOpacity={h.faint ? 0.55 : 1}
              />
            </g>
          ))}
          {screen ? <Shimmer geom={geom} /> : null}
        </>
      )}
      {geom.streets.map((g) => (
        <g key={g.key} data-reveal="street" data-dx={g.slide.x} data-dy={g.slide.y}>
          {g.rects.map((p, i) => (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: static geometry list, rebuilt as a whole
              key={i}
              x={p.r.x0}
              y={p.r.y0}
              width={p.r.x1 - p.r.x0}
              height={p.r.y1 - p.r.y0}
              fill={theme[p.color]}
            />
          ))}
          {thumb ? null : (
            <>
              <path
                d={segPath(g.joints)}
                fill="none"
                stroke={theme.sidewalkJoint}
                strokeWidth={30}
              />
              <path
                d={segPath(g.centers)}
                fill="none"
                stroke={theme.streetLine}
                strokeWidth={120}
                strokeDasharray="2000 3000"
              />
              {g.trees.map((t) => (
                <circle
                  key={`${t.x},${t.y}`}
                  cx={t.x}
                  cy={t.y}
                  r={900}
                  fill={tree.crown}
                  fillOpacity={0.92}
                  stroke={tree.edge}
                  strokeWidth={40}
                />
              ))}
              {g.label ? (
                <text
                  x={g.label.at.x}
                  y={g.label.at.y}
                  transform={
                    g.label.angle ? `rotate(-90 ${g.label.at.x} ${g.label.at.y})` : undefined
                  }
                  textAnchor="middle"
                  dy="0.35em"
                  fill={theme.streetLine}
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
