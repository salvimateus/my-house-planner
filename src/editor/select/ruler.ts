import { snapRulerEnd } from '../../geometry/raycast.ts';
import type { Handle } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import { FINE_STEP } from '../../model/defaults.ts';
import type { Id, Ruler, Vec } from '../../model/types.ts';
import { docStore } from '../../store/docStore.ts';
import { sceneOf } from '../../store/selectors.ts';
import { MIN_RULER_LENGTH, rulerLength, segmentAxis, snapRulerPoint } from '../tools/ruler.ts';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';

type FreeRuler = Extract<Ruler, { mode: 'free' }>;

type Drag =
  | { kind: 'end'; base: FreeRuler; end: 'a' | 'b'; attached: boolean }
  | { kind: 'body'; base: Ruler };

let drag: Drag | null = null;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

function findRuler(id: Id): Ruler | null {
  return docStore.getState().doc?.rulers.find((r) => r.id === id) ?? null;
}

function replaceRuler(ctx: ToolContext, next: Ruler): void {
  ctx.doc.updateGesture((d) => {
    const i = d.rulers.findIndex((r) => r.id === next.id);
    if (i >= 0) d.rulers[i] = next;
  });
}

function singleSelected(ctx: ToolContext): Ruler | null {
  const sel = ctx.getUi().selection;
  if (sel?.kind !== 'ruler' || sel.ids.length !== 1) return null;
  return findRuler(sel.ids[0]!);
}

function beginEnd(base: FreeRuler, end: 'a' | 'b', ctx: ToolContext): void {
  drag = { kind: 'end', base, end, attached: false };
  ctx.doc.beginGesture('Ajustar régua');
}

function moveEnd(p: PointerInput, ctx: ToolContext): void {
  const g = drag;
  if (g?.kind !== 'end') return;
  const other = g.end === 'a' ? g.base.b : g.base.a;
  const s = snapRulerPoint(p.world, other, ctx);
  if (s.attached && !g.attached) ctx.feedback.thunk();
  g.attached = s.attached;
  replaceRuler(ctx, g.end === 'a' ? { ...g.base, a: s.point } : { ...g.base, b: s.point });
}

/** Grid step for the move, then the nearest wall face for either end, perpendicular to the ruler. */
function movedFree(base: FreeRuler, dx: number, dy: number, ctx: ToolContext): FreeRuler {
  const mx = roundTo(dx, FINE_STEP);
  const my = roundTo(dy, FINE_STEP);
  const a = { x: base.a.x + mx, y: base.a.y + my };
  const b = { x: base.b.x + mx, y: base.b.y + my };
  const faces = ctx.getScene().faces;
  const tol = ctx.tolMm(tuning.magnet.rulerFaceRadiusPx);
  const axis = segmentAxis(base.a, base.b);
  let fix = { x: 0, y: 0 };
  let best = Number.POSITIVE_INFINITY;
  for (const p of [a, b]) {
    const s = snapRulerEnd(p, axis, faces, tol);
    if (s === p) continue;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < best) {
      best = d;
      fix = { x: s.x - p.x, y: s.y - p.y };
    }
  }
  const shift = (v: Vec) => ({ x: Math.round(v.x + fix.x), y: Math.round(v.y + fix.y) });
  return { ...base, a: shift(a), b: shift(b) };
}

function finishGesture(ctx: ToolContext): void {
  const g = drag;
  drag = null;
  if (!g) return;
  const doc = ctx.getDoc();
  const id = g.base.id;
  const now = doc?.rulers.find((r) => r.id === id);
  if (!doc || !now) {
    ctx.doc.cancelGesture();
    return;
  }
  const tooShort = now.mode === 'free' && rulerLength(now.a, now.b) < MIN_RULER_LENGTH;
  const invalid = now.mode === 'fit' && !sceneOf(doc).rulers.get(id)?.valid;
  if (tooShort || invalid) {
    ctx.doc.cancelGesture();
    ctx.feedback.invalid();
    return;
  }
  ctx.doc.endGesture();
  ctx.feedback.place();
}

/** Turns a ruler 90°: a fit ruler swaps its axis, a free ruler turns around its midpoint. */
export function rotateRuler(id: Id): void {
  const r = findRuler(id);
  if (!r) return;
  docStore.getState().commit('Girar régua', (d) => {
    const t = d.rulers.find((x) => x.id === id);
    if (!t) return;
    if (t.mode === 'fit') {
      t.axis = t.axis === 'h' ? 'v' : 'h';
      return;
    }
    const mx = (t.a.x + t.b.x) / 2;
    const my = (t.a.y + t.b.y) / 2;
    const turn = (v: Vec) => ({ x: Math.round(mx - (v.y - my)), y: Math.round(my + (v.x - mx)) });
    t.a = turn(t.a);
    t.b = turn(t.b);
  });
}

/** "Soltar": a fit ruler becomes a free ruler with its current ends. */
export function releaseRuler(id: Id): boolean {
  const doc = docStore.getState().doc;
  const r = findRuler(id);
  const d = doc ? sceneOf(doc).rulers.get(id) : undefined;
  if (r?.mode !== 'fit' || !d?.valid) return false;
  docStore.getState().commit('Soltar régua', (draft) => {
    const i = draft.rulers.findIndex((x) => x.id === id);
    if (i >= 0) draft.rulers[i] = { id, mode: 'free', a: { ...d.a }, b: { ...d.b } };
  });
  return true;
}

/**
 * Rulers in the select tool. A fit ruler moves its origin and re-measures live. A free ruler moves
 * as a whole, or by one end with the same snaps as the ruler tool (the ends are also handles).
 */
export const rulerHandler: SelectHandler = {
  kind: 'ruler',

  onDragStart(hit, _p, ctx) {
    drag = null;
    if (hit?.kind !== 'ruler' || ctx.doc.readOnly) return false;
    const r = findRuler(hit.id);
    if (!r) return false;
    const sel = ctx.getUi().selection;
    if (!(sel?.kind === 'ruler' && sel.ids.includes(r.id))) {
      ctx.ui.select({ kind: 'ruler', ids: [r.id] });
    }
    if (r.mode === 'free' && hit.end) {
      beginEnd(r, hit.end, ctx);
      return true;
    }
    drag = { kind: 'body', base: r };
    ctx.doc.beginGesture('Mover régua');
    return true;
  },

  onDrag(_hit, p, start, ctx) {
    const g = drag;
    if (!g) return;
    if (g.kind === 'end') {
      moveEnd(p, ctx);
      return;
    }
    const dx = p.world.x - start.world.x;
    const dy = p.world.y - start.world.y;
    const base = g.base;
    if (base.mode === 'fit') {
      const origin = { x: Math.round(base.origin.x + dx), y: Math.round(base.origin.y + dy) };
      replaceRuler(ctx, { ...base, origin });
    } else {
      replaceRuler(ctx, movedFree(base, dx, dy, ctx));
    }
  },

  onDragEnd(_hit, _p, _start, ctx) {
    finishGesture(ctx);
  },

  onCancel() {
    drag = null;
  },

  getHandles(ctx) {
    const r = singleSelected(ctx);
    if (r?.mode !== 'free' || ctx.doc.readOnly) return [];
    const handle = (id: 'a' | 'b', v: Vec): Handle => {
      const s = ctx.camera.worldToScreen(v);
      return { id, x: s.x, y: s.y, shape: 'circle', cursor: 'grab' };
    };
    return [handle('a', r.a), handle('b', r.b)];
  },

  onHandleDrag(handleId, p, _start, ctx, phase) {
    if (phase === 'start') {
      const r = singleSelected(ctx);
      if (r?.mode !== 'free' || (handleId !== 'a' && handleId !== 'b')) return;
      beginEnd(r, handleId, ctx);
      return;
    }
    if (phase === 'move') moveEnd(p, ctx);
    else finishGesture(ctx);
  },
};
