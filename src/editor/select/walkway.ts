import type { Handle } from '../../geometry/types.ts';
import {
  type Pt,
  pointsBounds,
  segmentMidpoints,
  walkwayCurve,
  walkwayLength,
} from '../../geometry/walkway.ts';
import { tuning } from '../../juice/tuning.ts';
import { FINE_STEP } from '../../model/defaults.ts';
import { WALKWAY_COLORS, WALKWAY_MAX_POINTS, WALKWAY_WIDTH } from '../../model/factories.ts';
import { newId } from '../../model/ids.ts';
import type { Id, Lot, Mm, ProjectDoc, Vec, Walkway, WalkwayStyle } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { docStore } from '../../store/docStore.ts';
import { uiStore } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';
import { rememberWalkwayLook } from '../tools/walkway.ts';

/** "+" markers show only on segments at least this long on screen. */
export const INSERT_MIN_SEGMENT_PX = 56;
const DOUBLE_TAP_MS = 400;
const COPY_OFFSET: Mm = 500;

type Drag =
  | { kind: 'body'; base: Walkway }
  | { kind: 'point'; base: Walkway; index: number; from: Vec };

let drag: Drag | null = null;
let lastHandleTap: { id: string; time: number } | null = null;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const findWalkway = (doc: ProjectDoc | null, id: Id): Walkway | null =>
  doc?.walkways.find((w) => w.id === id) ?? null;

/** The point halfway along the path, for effects and toasts. */
export function walkwayCenter(w: Walkway): Vec {
  const curve = walkwayCurve(w.points);
  const half = curve.length / 2;
  const s = curve.samples.find((x) => x.s >= half) ?? curve.samples[0];
  return s ? { x: Math.round(s.x), y: Math.round(s.y) } : (w.points[0] ?? { x: 0, y: 0 });
}

/** World points of the "+" markers that insert a point, by segment index, at a zoom in px per mm. */
export function insertMarkers(points: readonly Vec[], zoom: number): { index: number; at: Pt }[] {
  const mids = segmentMidpoints(points);
  const out: { index: number; at: Pt }[] = [];
  mids.forEach((at, i) => {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) * zoom >= INSERT_MIN_SEGMENT_PX)
      out.push({ index: i, at });
  });
  return out;
}

/** Shift that keeps the control points inside the lot after a move by (dx, dy). */
function clampShift(points: readonly Vec[], dx: Mm, dy: Mm, lot: Lot): Vec {
  const b = pointsBounds(points);
  return {
    x: clamp(dx, Math.min(0, -b.x0), Math.max(0, lot.width - b.x1)),
    y: clamp(dy, Math.min(0, -b.y0), Math.max(0, lot.depth - b.y1)),
  };
}

const shifted = (points: readonly Vec[], d: Vec): Vec[] =>
  points.map((p) => ({ x: Math.round(p.x + d.x), y: Math.round(p.y + d.y) }));

/** Consecutive equal points collapse into one. */
function dedupe(points: readonly Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

const samePoints = (a: readonly Vec[], b: readonly Vec[]): boolean =>
  a.length === b.length && a.every((p, i) => p.x === b[i]!.x && p.y === b[i]!.y);

function withPoint(points: readonly Vec[], index: number, at: Vec): Vec[] {
  const next = points.slice();
  next[index] = at;
  return next;
}

function insertedAt(points: readonly Vec[], segment: number): Vec[] {
  const mid = segmentMidpoints(points)[segment];
  if (!mid) return points.slice();
  const next = points.slice();
  next.splice(segment + 1, 0, { x: Math.round(mid.x), y: Math.round(mid.y) });
  return next;
}

// ---------------------------------------------------------------------------
// Commands (one undo step each)

function update(label: string, id: Id, fn: (w: Walkway) => void): void {
  docStore.getState().commit(label, (d) => {
    const w = d.walkways.find((x) => x.id === id);
    if (w) fn(w);
  });
  const now = findWalkway(docStore.getState().doc, id);
  if (now) rememberWalkwayLook(now);
}

export function setWalkwayStyle(id: Id, style: WalkwayStyle): void {
  update('Estilo do caminho', id, (w) => {
    w.style = style;
    if (!WALKWAY_COLORS[style].includes(w.color)) w.color = WALKWAY_COLORS[style][0]!;
  });
}

export function setWalkwayWidth(id: Id, width: Mm): void {
  update('Largura do caminho', id, (w) => {
    w.width = clamp(Math.round(width), WALKWAY_WIDTH.min, WALKWAY_WIDTH.max);
  });
}

export function setWalkwayColor(id: Id, color: string): void {
  update('Cor do caminho', id, (w) => {
    w.color = color;
  });
}

/** Adds a copy of `source` shifted by `offset` (kept inside the lot), selects it. */
export function placeWalkwayCopy(source: Walkway, offset: Mm, label: string): Walkway | null {
  const ds = docStore.getState();
  const doc = ds.doc;
  if (!doc || ds.readOnly) return null;
  const d = clampShift(source.points, offset, offset, doc.lot);
  const copy: Walkway = { ...source, id: newId(), points: shifted(source.points, d) };
  ds.commit(label, (draft) => {
    draft.walkways.push(copy);
  });
  if (docStore.getState().doc === doc) return null;
  uiStore.getState().select({ kind: 'walkway', id: copy.id });
  return copy;
}

export function duplicateWalkway(id: Id): Walkway | null {
  const w = findWalkway(docStore.getState().doc, id);
  return w ? placeWalkwayCopy(w, COPY_OFFSET, 'Duplicar caminho') : null;
}

/** Deletes the walkway. Returns its center for the delete effect, or null. */
export function deleteWalkway(id: Id): Vec | null {
  const w = findWalkway(docStore.getState().doc, id);
  if (!w) return null;
  docStore.getState().commit('Excluir caminho', (d) => {
    d.walkways = d.walkways.filter((x) => x.id !== id);
  });
  return walkwayCenter(w);
}

function removePoint(id: Id, index: number, ctx: ToolContext): void {
  const w = findWalkway(ctx.getDoc(), id);
  const at = w?.points[index];
  if (!w || !at || ctx.doc.readOnly) return;
  if (w.points.length <= 2) {
    ctx.feedback.invalid();
    toast('O caminho precisa de pelo menos dois pontos.');
    return;
  }
  ctx.doc.commit('Remover ponto do caminho', (d) => {
    const t = d.walkways.find((x) => x.id === id);
    if (t) t.points.splice(index, 1);
  });
  ctx.feedback.remove(at);
}

// ---------------------------------------------------------------------------
// Gestures

function selected(ctx: ToolContext): Walkway | null {
  const sel = ctx.getUi().selection;
  return sel?.kind === 'walkway' ? findWalkway(ctx.getDoc(), sel.id) : null;
}

function editable(ctx: ToolContext): boolean {
  const l = ctx.getUi().layers.items;
  return !ctx.doc.readOnly && l.visible && !l.locked;
}

/** Same reach as the select router gives handles. */
const reachPx = (p: PointerInput) =>
  p.pointerType === 'mouse' ? tuning.touch.mouseHandlePx / 2 + 4 : tuning.touch.handlePx / 2 + 8;

/** Segment index of the "+" marker under the pointer, or null. */
function markerAt(w: Walkway, p: PointerInput, ctx: ToolContext): number | null {
  const reach = reachPx(p);
  let best: number | null = null;
  let bestD = reach;
  for (const m of insertMarkers(w.points, 1 / ctx.camera.mmPerPx())) {
    const s = ctx.camera.worldToScreen(m.at);
    const d = Math.hypot(s.x - p.screen.x, s.y - p.screen.y);
    if (d <= bestD) {
      bestD = d;
      best = m.index;
    }
  }
  return best;
}

function replace(ctx: ToolContext, next: Walkway): void {
  ctx.doc.updateGesture((d) => {
    const i = d.walkways.findIndex((w) => w.id === next.id);
    if (i >= 0) d.walkways[i] = next;
  });
}

function beginPoint(base: Walkway, index: number, ctx: ToolContext): void {
  const from = base.points[index];
  if (!from) return;
  ctx.doc.beginGesture('Curvar caminho');
  drag = { kind: 'point', base, index, from };
  replace(ctx, base);
}

function movePoint(p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const g = drag;
  const doc = ctx.getDoc();
  if (g?.kind !== 'point' || !doc) return;
  const at = {
    x: clamp(roundTo(g.from.x + p.world.x - start.world.x, FINE_STEP), 0, doc.lot.width),
    y: clamp(roundTo(g.from.y + p.world.y - start.world.y, FINE_STEP), 0, doc.lot.depth),
  };
  const points = withPoint(g.base.points, g.index, at);
  replace(ctx, { ...g.base, points });
  const s = ctx.camera.worldToScreen(at);
  ctx.ui.setTransient({
    readout: { x: s.x, y: s.y, text: formatLength(walkwayLength(points)), sub: 'Comprimento' },
  });
}

function moveBody(p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const g = drag;
  const doc = ctx.getDoc();
  if (g?.kind !== 'body' || !doc) return;
  const d = clampShift(
    g.base.points,
    roundTo(p.world.x - start.world.x, FINE_STEP),
    roundTo(p.world.y - start.world.y, FINE_STEP),
    doc.lot,
  );
  replace(ctx, { ...g.base, points: shifted(g.base.points, d) });
}

function finish(ctx: ToolContext): void {
  const g = drag;
  drag = null;
  ctx.ui.setTransient({ readout: null });
  if (!g) return;
  const now = findWalkway(ctx.getDoc(), g.base.id);
  if (!now) {
    ctx.doc.cancelGesture();
    return;
  }
  // A point dropped on its neighbor merges into it.
  const clean = dedupe(now.points);
  if (clean.length < 2) {
    ctx.doc.cancelGesture();
    ctx.feedback.invalid();
    return;
  }
  // A drag that ends where it began leaves no undo step.
  const before = findWalkway(docStore.getState().gesture?.base ?? null, g.base.id);
  if (before && samePoints(before.points, clean)) {
    ctx.doc.cancelGesture();
    return;
  }
  if (clean.length !== now.points.length) replace(ctx, { ...now, points: clean });
  ctx.doc.endGesture();
  ctx.feedback.place();
}

/**
 * Walkways in the select tool. A tap selects; a drag on the body moves the whole path. When
 * selected, each control point is a handle (drag to curve, long press or double tap to remove)
 * and a "+" in the middle of each segment adds a point (tap, or drag it out at once).
 */
export const walkwayHandler: SelectHandler = {
  kind: 'walkway',

  onTap(hit, p, ctx) {
    if (hit?.kind !== 'walkway') return;
    const w = selected(ctx);
    if (w?.id === hit.id && editable(ctx)) {
      const m = markerAt(w, p, ctx);
      if (m !== null) {
        if (w.points.length >= WALKWAY_MAX_POINTS) {
          ctx.feedback.invalid();
          toast('O caminho já tem o máximo de 40 pontos.');
          return;
        }
        const points = insertedAt(w.points, m);
        ctx.doc.commit('Novo ponto no caminho', (d) => {
          const t = d.walkways.find((x) => x.id === w.id);
          if (t) t.points = points;
        });
        ctx.feedback.tick();
        return;
      }
    }
    if (w?.id !== hit.id) ctx.ui.select({ kind: 'walkway', id: hit.id });
  },

  onDragStart(hit, p, ctx) {
    drag = null;
    if (hit?.kind !== 'walkway' || !editable(ctx)) return false;
    const w = findWalkway(ctx.getDoc(), hit.id);
    if (!w) return false;
    const wasSelected = selected(ctx)?.id === w.id;
    if (!wasSelected) ctx.ui.select({ kind: 'walkway', id: w.id });
    if (wasSelected) {
      const m = markerAt(w, p, ctx);
      if (m !== null && w.points.length < WALKWAY_MAX_POINTS) {
        beginPoint({ ...w, points: insertedAt(w.points, m) }, m + 1, ctx);
        ctx.feedback.tick();
        return true;
      }
      if (hit.point !== null) {
        beginPoint(w, hit.point, ctx);
        return true;
      }
    }
    drag = { kind: 'body', base: w };
    ctx.doc.beginGesture('Mover caminho');
    return true;
  },

  onDrag(_hit, p, start, ctx) {
    if (drag?.kind === 'point') movePoint(p, start, ctx);
    else moveBody(p, start, ctx);
  },

  onDragEnd(_hit, _p, _start, ctx) {
    finish(ctx);
  },

  onCancel(ctx) {
    drag = null;
    ctx.ui.setTransient({ readout: null });
  },

  getHandles(ctx) {
    const w = selected(ctx);
    if (!w || !editable(ctx)) return [];
    return w.points.map((v, i): Handle => {
      const s = ctx.camera.worldToScreen(v);
      return { id: `p${i}`, x: s.x, y: s.y, shape: 'circle', cursor: 'grab' };
    });
  },

  onHandleDrag(handleId, p, start, ctx, phase) {
    if (phase === 'start') {
      drag = null;
      const w = selected(ctx);
      const index = Number(handleId.slice(1));
      if (w && editable(ctx) && w.points[index]) beginPoint(w, index, ctx);
      return;
    }
    if (phase === 'move') movePoint(p, start, ctx);
    else finish(ctx);
  },

  onHandleTap(handleId, ctx) {
    const now = performance.now();
    const double = lastHandleTap?.id === handleId && now - lastHandleTap.time <= DOUBLE_TAP_MS;
    lastHandleTap = double ? null : { id: handleId, time: now };
    const w = selected(ctx);
    if (double && w && editable(ctx)) removePoint(w.id, Number(handleId.slice(1)), ctx);
  },

  onHandleLongPress(handleId, ctx) {
    const w = selected(ctx);
    if (w && editable(ctx)) removePoint(w.id, Number(handleId.slice(1)), ctx);
  },
};
