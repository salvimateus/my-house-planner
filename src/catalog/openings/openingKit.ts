// Drawing helpers shared by the opening symbols. Kept as `.ts`, so the opening registry glob skips it.
//
// Symbol frame: local x runs along the wall (-width/2 .. width/2, `start` hinge at -x), local y
// runs across it (the wall fills -thickness/2 .. thickness/2), +y is side +1.
import { createElement, type ReactElement } from 'react';
import { type RenderContext, strokeProps } from '../../render/RenderContext.ts';
import { darken, mono, n } from '../symbolKit.ts';
import type { OpeningSymbolProps } from '../types.ts';

export const LEAF_FILL = '#FFFFFF';
export const GATE_FILL = '#5E636B';
/** Door frame depth along the wall. */
export const JAMB: number = 40;
/** Door leaf thickness. */
export const LEAF: number = 35;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const outlineStroke = (ctx: RenderContext) => strokeProps(ctx, 1.25, 0.18);
export const fineStroke = (ctx: RenderContext) => strokeProps(ctx, 0.85, 0.1);
export const arcStroke = (ctx: RenderContext) => strokeProps(ctx, 1, 0.12);

export const gateFill = (ctx: RenderContext): string => mono(ctx, GATE_FILL);
export const glassStroke = (ctx: RenderContext): string => darken(ctx.theme.glass, 0.28);

/** Dash length in world mm for a dashed curve of `length`: about 14 dashes, kept readable. */
export const dashFor = (length: number): number => clamp(length / 14, 30, 90);

/**
 * Dashed polyline as plain sub-paths, so no `stroke-dasharray` depends on the stroke scaling mode.
 * `points` is a dense sampling of the curve.
 */
export function dashedPolyline(
  points: readonly [number, number][],
  dash: number,
  gap = dash * 0.75,
): string {
  let out = '';
  let drawing = true;
  let left = dash;
  for (let i = 1; i < points.length; i++) {
    let [x0, y0] = points[i - 1]!;
    const [x1, y1] = points[i]!;
    let seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg === 0) continue;
    const ux = (x1 - x0) / seg;
    const uy = (y1 - y0) / seg;
    if (drawing && left === dash) out += `M${n(x0)} ${n(y0)}`;
    while (seg > 0) {
      const step = Math.min(seg, left);
      const nx = x0 + ux * step;
      const ny = y0 + uy * step;
      if (drawing) out += `L${n(nx)} ${n(ny)}`;
      x0 = nx;
      y0 = ny;
      seg -= step;
      left -= step;
      if (left <= 1e-6) {
        drawing = !drawing;
        left = drawing ? dash : gap;
        if (drawing) out += `M${n(x0)} ${n(y0)}`;
      }
    }
  }
  return out;
}

export const dashedLine = (x0: number, y0: number, x1: number, y1: number, dash?: number): string =>
  dashedPolyline(
    [
      [x0, y0],
      [x1, y1],
    ],
    dash ?? dashFor(Math.hypot(x1 - x0, y1 - y0)),
  );

export const polyPath = (pts: readonly [number, number][], close = true): string =>
  `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join('')}${close ? 'Z' : ''}`;

export const rectPath = (x0: number, y0: number, x1: number, y1: number): string =>
  `M${n(Math.min(x0, x1))} ${n(Math.min(y0, y1))}H${n(Math.max(x0, x1))}V${n(Math.max(y0, y1))}H${n(Math.min(x0, x1))}Z`;

export interface SwingLeaf {
  /** Leaf rectangle at the current opening angle. */
  leaf: string;
  /** Dashed arc from the leaf tip back to the closed position. */
  arc: string;
  /** Swept wedge, for the soft screen fill. */
  wedge: string;
}

/**
 * One hinged leaf. `hingeX` is the hinge position, `dir` = +1 when the closed leaf runs toward +x,
 * `side` the swing side, `swing` 0 (closed) .. 1 (open at 90°).
 */
export function swingLeaf(
  hingeX: number,
  dir: 1 | -1,
  length: number,
  side: 1 | -1,
  faceY: number,
  swing: number,
  leafThickness = LEAF,
): SwingLeaf {
  // A little past 90° lets the spring tween overshoot.
  const theta = (clamp(swing, 0, 1.12) * Math.PI) / 2;
  const d = (a: number): [number, number] => [dir * Math.cos(a), side * Math.sin(a)];
  const hx = hingeX;
  const hy = faceY;
  const [dx, dy] = d(theta);
  const tip: [number, number] = [hx + length * dx, hy + length * dy];
  // Leaf thickness lies on the hinge side when open, so the arc starts at the free edge.
  const nx = -dir * Math.sin(theta);
  const ny = side * Math.cos(theta);
  const leaf = polyPath([
    [hx, hy],
    tip,
    [tip[0] + nx * leafThickness, tip[1] + ny * leafThickness],
    [hx + nx * leafThickness, hy + ny * leafThickness],
  ]);
  if (theta <= 0.001) return { leaf, arc: '', wedge: '' };
  const samples = Math.max(6, Math.ceil((theta * length) / 40));
  const pts: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const a = theta * (1 - i / samples);
    const [ux, uy] = d(a);
    pts.push([hx + length * ux, hy + length * uy]);
  }
  const arc = dashedPolyline(pts, dashFor(theta * length));
  const wedge = polyPath([[hx, hy], ...pts]);
  return { leaf, arc, wedge };
}

export interface DoorPens {
  leafFill: string;
  leafStroke: string;
}

/** Hinged leaves with their arcs, the swept wedge on screen, and the two frame jambs. */
export function HingedLeaves({
  width,
  thickness,
  hinge,
  side,
  swing,
  ctx,
  double,
  pens,
  leafThickness = LEAF,
  jambs = true,
}: OpeningSymbolProps & {
  double: boolean;
  pens: DoorPens;
  leafThickness?: number;
  jambs?: boolean;
}): ReactElement {
  const { theme } = ctx;
  const half = width / 2;
  const t2 = thickness / 2;
  const j = jambs ? Math.min(JAMB, width * 0.08) : 0;
  const faceY = side * t2;
  const leaves = double
    ? [
        swingLeaf(-half + j, 1, half - j, side, faceY, swing, leafThickness),
        swingLeaf(half - j, -1, half - j, side, faceY, swing, leafThickness),
      ]
    : hinge === 'start'
      ? [swingLeaf(-half + j, 1, width - 2 * j, side, faceY, swing, leafThickness)]
      : [swingLeaf(half - j, -1, width - 2 * j, side, faceY, swing, leafThickness)];
  const wedge = leaves.map((l) => l.wedge).join('');
  const arc = leaves.map((l) => l.arc).join('');
  const leaf = leaves.map((l) => l.leaf).join('');
  const children: ReactElement[] = [];
  if (ctx.mode === 'screen' && wedge) {
    children.push(
      createElement('path', {
        key: 'wedge',
        d: wedge,
        fill: theme.swingArc,
        fillOpacity: 0.09,
        stroke: 'none',
      }),
    );
  }
  if (arc) {
    children.push(
      createElement('path', {
        key: 'arc',
        d: arc,
        fill: 'none',
        stroke: theme.swingArc,
        strokeLinecap: 'round',
        ...arcStroke(ctx),
      }),
    );
  }
  if (j > 0) {
    children.push(
      createElement('path', {
        key: 'jambs',
        d: rectPath(-half, -t2, -half + j, t2) + rectPath(half - j, -t2, half, t2),
        fill: LEAF_FILL,
        stroke: theme.door,
        strokeLinejoin: 'miter',
        ...fineStroke(ctx),
      }),
    );
  }
  children.push(
    createElement('path', {
      key: 'leaf',
      d: leaf,
      fill: pens.leafFill,
      stroke: pens.leafStroke,
      strokeLinejoin: 'round',
      ...outlineStroke(ctx),
    }),
  );
  return createElement('g', null, ...children);
}

/** Window or balcony frame: the gap filled as a sill, outlined on both wall faces and at the ends. */
export function windowFrame(width: number, thickness: number, ctx: RenderContext): ReactElement {
  const half = width / 2;
  const t2 = thickness / 2;
  return createElement('path', {
    d: rectPath(-half, -t2, half, t2),
    fill: LEAF_FILL,
    stroke: ctx.theme.door,
    strokeLinejoin: 'miter',
    ...fineStroke(ctx),
  });
}

/** A glass pane between x0 and x1, centered on `cy`. */
export function pane(
  x0: number,
  x1: number,
  cy: number,
  depth: number,
  ctx: RenderContext,
  key?: string,
): ReactElement {
  return createElement('path', {
    key,
    d: rectPath(x0, cy - depth / 2, x1, cy + depth / 2),
    fill: ctx.theme.glass,
    stroke: glassStroke(ctx),
    strokeLinejoin: 'miter',
    ...fineStroke(ctx),
  });
}

/** Glass depth across the wall: thin, but never a hairline on thin walls. */
export const paneDepth = (thickness: number): number => clamp(thickness * 0.14, 14, 30);

/** Arrow along x at `y`, from `x0` to `x1` (head at x1). */
export function arrowPath(x0: number, x1: number, y: number, head: number): string {
  const dir = Math.sign(x1 - x0) || 1;
  return (
    `M${n(x0)} ${n(y)}L${n(x1)} ${n(y)}` +
    `M${n(x1 - dir * head)} ${n(y - head * 0.6)}L${n(x1)} ${n(y)}L${n(x1 - dir * head)} ${n(y + head * 0.6)}`
  );
}

/** Dashed projection outline of a window or gate that opens out of the wall plane. */
export function projection(path: string, ctx: RenderContext): ReactElement {
  return createElement('path', {
    d: path,
    fill: 'none',
    stroke: ctx.theme.swingArc,
    strokeLinecap: 'round',
    ...arcStroke(ctx),
  });
}
