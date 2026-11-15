import { hitTest } from '../../geometry/hitTest.ts';
import { fitSpan, snapRulerEnd } from '../../geometry/raycast.ts';
import { rotatedAabb } from '../../geometry/shape.ts';
import type { Face, Rect, Scene } from '../../geometry/types.ts';
import { emit } from '../../juice/events.ts';
import { tuning } from '../../juice/tuning.ts';
import { FINE_STEP } from '../../model/defaults.ts';
import { createFitRuler, createFreeRuler } from '../../model/factories.ts';
import type { Axis, Mm, ProjectDoc, Ruler, Vec } from '../../model/types.ts';
import { tolPxFor } from '../toolContext.ts';
import type { PointerInput, Tool, ToolContext } from './types.ts';

/** Shorter free rulers are dropped: the press was a tap that moved. */
export const MIN_RULER_LENGTH: Mm = 100;
const AXIS_LOCK_DEG = 8;

export const lotBounds = (doc: ProjectDoc): Rect => ({
  x0: 0,
  y0: 0,
  x1: doc.lot.width,
  y1: doc.lot.depth,
});

/** House and lot wall bodies: the same solids that `deriveScene` resolves fit rulers against. */
export const rulerSolids = (scene: Scene): Rect[] => [...scene.wallRects, ...scene.boundaryRects];

const insideLot = (doc: ProjectDoc, p: Vec) =>
  p.x >= 0 && p.y >= 0 && p.x <= doc.lot.width && p.y <= doc.lot.depth;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, step: Mm) => Math.round(v / step) * step;

export const rulerLength = (a: Vec, b: Vec): Mm => Math.round(Math.hypot(b.x - a.x, b.y - a.y));

/** 'h' or 'v' when the segment is axis aligned, else null. */
export function segmentAxis(a: Vec, b: Vec): Axis | null {
  if (a.y === b.y && a.x !== b.x) return 'h';
  if (a.x === b.x && a.y !== b.y) return 'v';
  return null;
}

function itemFaces(doc: ProjectDoc, ctx: ToolContext): Face[] {
  const layer = ctx.getUi().layers.items;
  if (!layer.visible) return [];
  const faces: Face[] = [];
  for (const it of doc.items) {
    const r = rotatedAabb(it.x, it.y, it.w, it.d, it.rotation);
    faces.push(
      { axis: 'v', at: r.x0, from: r.y0, to: r.y1, normal: -1 },
      { axis: 'v', at: r.x1, from: r.y0, to: r.y1, normal: 1 },
      { axis: 'h', at: r.y0, from: r.x0, to: r.x1, normal: -1 },
      { axis: 'h', at: r.y1, from: r.x0, to: r.x1, normal: 1 },
    );
  }
  return faces;
}

function nearestVertex(doc: ProjectDoc, p: Vec, tol: Mm): Vec | null {
  let best: Vec | null = null;
  let bestD = tol;
  for (const a of doc.areas) {
    for (const ring of a.shape) {
      for (const v of ring) {
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d <= bestD) {
          best = v;
          bestD = d;
        }
      }
    }
  }
  return best;
}

export interface RulerSnap {
  point: Vec;
  /** A wall face or an item edge holds at least one coordinate. */
  attached: boolean;
  axis: Axis | null;
}

/**
 * Snaps a free ruler endpoint. With `other`, the segment locks to horizontal or vertical within 8°.
 * Each free coordinate takes, in order: a wall face, an item edge, a room vertex, the 50 mm grid.
 */
export function snapRulerPoint(p: Vec, other: Vec | null, ctx: ToolContext): RulerSnap {
  const doc = ctx.getDoc();
  if (!doc) return { point: p, attached: false, axis: null };
  const tol = ctx.tolMm(tuning.magnet.rulerFaceRadiusPx);
  let axis: Axis | null = null;
  const q = { x: p.x, y: p.y };
  if (other) {
    const deg = (Math.atan2(Math.abs(p.y - other.y), Math.abs(p.x - other.x)) * 180) / Math.PI;
    if (deg <= AXIS_LOCK_DEG) {
      axis = 'h';
      q.y = other.y;
    } else if (deg >= 90 - AXIS_LOCK_DEG) {
      axis = 'v';
      q.x = other.x;
    }
  }
  const walls = ctx.getScene().faces;
  const items = itemFaces(doc, ctx);
  const vertex = nearestVertex(doc, q, tol);
  let attached = false;

  const snapDim = (dim: 'x' | 'y'): Mm => {
    // A face across the dimension: vertical faces fix x, horizontal faces fix y.
    const across: Axis = dim === 'x' ? 'h' : 'v';
    for (const faces of [walls, items]) {
      const r = snapRulerEnd(q, across, faces, tol);
      if (r !== q) {
        attached = true;
        return r[dim];
      }
    }
    if (vertex) return vertex[dim];
    return roundTo(q[dim], FINE_STEP);
  };

  const x = axis === 'v' ? q.x : snapDim('x');
  const y = axis === 'h' ? q.y : snapDim('y');
  return {
    point: {
      x: Math.round(clamp(x, 0, doc.lot.width)),
      y: Math.round(clamp(y, 0, doc.lot.depth)),
    },
    attached,
    axis,
  };
}

/** Fit ruler for a tap: the shorter clear span through the point. Null inside a wall or off the lot. */
export function fitRulerAt(at: Vec, ctx: ToolContext): Ruler | null {
  const doc = ctx.getDoc();
  if (!doc || !insideLot(doc, at)) return null;
  const span = fitSpan(at, 'auto', rulerSolids(ctx.getScene()), lotBounds(doc));
  if (!span || span.length <= 0) return null;
  return createFitRuler(at, span.axis);
}

interface DrawState {
  ruler: Ruler & { mode: 'free' };
  attached: boolean;
}

let draw: DrawState | null = null;

function rulerHit(p: PointerInput, ctx: ToolContext) {
  const doc = ctx.getDoc();
  if (!doc) return null;
  const hit = hitTest(
    doc,
    ctx.getScene(),
    p.world,
    ctx.tolMm(tolPxFor(p.pointerType)),
    ctx.getUi().layers,
    null,
  );
  return hit?.kind === 'ruler' ? hit : null;
}

/** Makes the measures layer visible so a new ruler shows. False when the layer is locked. */
function ensureMeasures(ctx: ToolContext): boolean {
  const l = ctx.getUi().layers.measures;
  if (l.locked) return false;
  if (!l.visible) ctx.ui.toggleLayer('measures', 'visible');
  return true;
}

/**
 * Ruler tool. A tap in a free space makes a fit ruler (wall face to wall face, net of wall and lot
 * wall bodies); a tap on a ruler selects it. A drag draws a free ruler with snapped endpoints.
 */
export const rulerTool: Tool = {
  id: 'ruler',
  cursor: 'crosshair',

  onTap(p, ctx) {
    const doc = ctx.getDoc();
    if (!doc) return;
    const hit = rulerHit(p, ctx);
    if (hit) {
      ctx.ui.select({ kind: 'ruler', ids: [hit.id] });
      ctx.feedback.tick();
      return;
    }
    if (ctx.doc.readOnly) return;
    const ruler = fitRulerAt(p.world, ctx);
    if (!ruler || !ensureMeasures(ctx)) {
      ctx.feedback.invalid();
      return;
    }
    ctx.doc.commit('Régua', (d) => {
      d.rulers.push(ruler);
    });
    ctx.ui.select({ kind: 'ruler', ids: [ruler.id] });
    ctx.feedback.place();
    emit({ type: 'ruler-created', rulerId: ruler.id });
  },

  onDragStart(p, ctx) {
    draw = null;
    const doc = ctx.getDoc();
    if (!doc || ctx.doc.readOnly || !insideLot(doc, p.world)) return false;
    if (!ensureMeasures(ctx)) return false;
    const start = snapRulerPoint(p.world, null, ctx);
    const ruler = createFreeRuler(start.point, start.point) as DrawState['ruler'];
    draw = { ruler, attached: start.attached };
    ctx.doc.beginGesture('Régua livre');
    if (start.attached) ctx.feedback.thunk();
    return true;
  },

  onDrag(p, _start, ctx) {
    const g = draw;
    if (!g) return;
    const end = snapRulerPoint(p.world, g.ruler.a, ctx);
    if (end.attached && !g.attached) ctx.feedback.thunk();
    g.attached = end.attached;
    g.ruler = { ...g.ruler, b: end.point };
    const next = g.ruler;
    ctx.doc.updateGesture((d) => {
      d.rulers.push(next);
    });
  },

  onDragEnd(_p, _start, ctx) {
    const g = draw;
    draw = null;
    if (!g) return;
    if (rulerLength(g.ruler.a, g.ruler.b) < MIN_RULER_LENGTH) {
      ctx.doc.cancelGesture();
      return;
    }
    ctx.doc.endGesture();
    ctx.ui.select({ kind: 'ruler', ids: [g.ruler.id] });
    ctx.feedback.place();
    emit({ type: 'ruler-created', rulerId: g.ruler.id });
  },

  onCancel(ctx) {
    draw = null;
    ctx.doc.cancelGesture();
  },

  onDeactivate(ctx) {
    if (draw) rulerTool.onCancel?.(ctx);
  },

  onKey(e, ctx) {
    if (e.key === 'Escape' && draw) {
      rulerTool.onCancel?.(ctx);
      return true;
    }
    return false;
  },
};
