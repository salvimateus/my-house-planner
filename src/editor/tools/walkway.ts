import { createStore } from 'zustand';
import { FINE_STEP } from '../../model/defaults.ts';
import { createWalkway, WALKWAY_MAX_POINTS } from '../../model/factories.ts';
import type { Vec, Walkway } from '../../model/types.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import { toolContext } from '../toolContext.ts';
import type { PointerInput, Tool, ToolContext } from './types.ts';

export interface WalkwayDraft {
  points: Vec[];
  /** Snapped mouse position: the ghost runs to it. */
  hover: Vec | null;
}

/** The walkway being drawn. The doc gets it only on "Concluir", in one undo step. */
export const walkwayDraftStore = createStore<{ draft: WalkwayDraft | null }>()(() => ({
  draft: null,
}));

/** Width, style and color of the last walkway the user touched: the next one starts like it. */
let lastLook: Partial<Pick<Walkway, 'width' | 'style' | 'color'>> = {};

export function rememberWalkwayLook(w: Pick<Walkway, 'width' | 'style' | 'color'>): void {
  lastLook = { width: w.width, style: w.style, color: w.color };
}

/** Look of a new walkway, for the ghost and the commit. */
export const nextWalkwayLook = (): Partial<Pick<Walkway, 'width' | 'style' | 'color'>> => lastLook;

/** A second tap this close in time and space finishes the path. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = { mouse: 12, touch: 28 };

let lastTap: { time: number; x: number; y: number } | null = null;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

function snapPoint(p: Vec, ctx: ToolContext): Vec {
  const doc = ctx.getDoc();
  const x = roundTo(p.x, FINE_STEP);
  const y = roundTo(p.y, FINE_STEP);
  if (!doc) return { x, y };
  return {
    x: Math.min(doc.lot.width, Math.max(0, x)),
    y: Math.min(doc.lot.depth, Math.max(0, y)),
  };
}

const setDraft = (draft: WalkwayDraft | null) => walkwayDraftStore.setState({ draft });
const getDraft = () => walkwayDraftStore.getState().draft;

/** Items layer visible and unlocked: walkways live on it. False when it is locked. */
function ensureItemsLayer(ctx: ToolContext): boolean {
  const l = ctx.getUi().layers.items;
  if (l.locked) return false;
  if (!l.visible) ctx.ui.toggleLayer('items', 'visible');
  return true;
}

/** Commits the draft as a new walkway and selects it. False when it has fewer than 2 points. */
function commitDraft(ctx: ToolContext): Walkway | null {
  const draft = getDraft();
  setDraft(null);
  lastTap = null;
  if (!draft || draft.points.length < 2 || ctx.doc.readOnly) return null;
  const walkway = createWalkway(draft.points, lastLook);
  const before = ctx.getDoc();
  ctx.doc.commit('Caminho no jardim', (d) => {
    d.walkways.push(walkway);
  });
  return ctx.getDoc() === before ? null : walkway;
}

/** "Concluir": saves the path and goes back to the select tool with the path selected. */
export function finishWalkwayDraft(ctx: ToolContext = toolContext): boolean {
  const draft = getDraft();
  if (!draft) return false;
  if (draft.points.length < 2) {
    ctx.feedback.invalid();
    toast('Marque pelo menos dois pontos para fazer o caminho.');
    return false;
  }
  const walkway = commitDraft(ctx);
  if (!walkway) return false;
  ctx.ui.setTool('select');
  ctx.ui.select({ kind: 'walkway', id: walkway.id });
  ctx.feedback.place();
  return true;
}

/** "Cancelar": drops the draft and goes back to the select tool. */
export function cancelWalkwayDraft(ctx: ToolContext = toolContext): void {
  setDraft(null);
  lastTap = null;
  ctx.ui.setTool('select');
}

/** Removes the last marked point. */
export function undoWalkwayPoint(): boolean {
  const draft = getDraft();
  if (!draft || draft.points.length === 0) return false;
  setDraft({ ...draft, points: draft.points.slice(0, -1) });
  return true;
}

function nearLastPoint(p: PointerInput, ctx: ToolContext, draft: WalkwayDraft): boolean {
  const last = draft.points[draft.points.length - 1];
  if (!last) return false;
  const s = ctx.camera.worldToScreen(last);
  const reach = p.pointerType === 'mouse' ? DOUBLE_TAP_PX.mouse : DOUBLE_TAP_PX.touch;
  return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= reach;
}

/**
 * Garden walkway tool. Each tap marks a point (50 mm grid) and the path runs as a smooth curve
 * through them. A double tap, a tap on the last point, Enter or "Concluir" saves it; Escape or
 * "Cancelar" drops it. A drag pans the view, so a long path can go past the screen edge.
 */
export const walkwayTool: Tool = {
  id: 'walkway',
  cursor: 'crosshair',

  onActivate(ctx) {
    lastTap = null;
    setDraft({ points: [], hover: null });
    if (ctx.getUi().selection) ctx.ui.select(null);
  },

  onDeactivate(ctx) {
    // Another tool was picked mid-path: keep the work when it is already a path.
    if (getDraft()) commitDraft(ctx);
    setDraft(null);
    lastTap = null;
  },

  onHover(p, ctx) {
    const draft = getDraft();
    if (!draft || p.pointerType !== 'mouse') return;
    const hover = snapPoint(p.world, ctx);
    if (draft.hover?.x === hover.x && draft.hover?.y === hover.y) return;
    setDraft({ ...draft, hover });
  },

  onTap(p, ctx) {
    const draft = getDraft();
    if (!draft) return;
    if (ctx.doc.readOnly || !ensureItemsLayer(ctx)) {
      ctx.feedback.invalid();
      return;
    }
    const reach = p.pointerType === 'mouse' ? DOUBLE_TAP_PX.mouse : DOUBLE_TAP_PX.touch;
    const double =
      lastTap !== null &&
      p.time - lastTap.time <= DOUBLE_TAP_MS &&
      Math.hypot(p.screen.x - lastTap.x, p.screen.y - lastTap.y) <= reach;
    lastTap = { time: p.time, x: p.screen.x, y: p.screen.y };
    if (draft.points.length >= 2 && (double || nearLastPoint(p, ctx, draft))) {
      finishWalkwayDraft(ctx);
      return;
    }
    if (double || nearLastPoint(p, ctx, draft)) return;
    const point = snapPoint(p.world, ctx);
    const last = draft.points[draft.points.length - 1];
    if (last && last.x === point.x && last.y === point.y) return;
    const points = [...draft.points, point];
    setDraft({ points, hover: p.pointerType === 'mouse' ? point : null });
    ctx.feedback.tick();
    if (points.length >= WALKWAY_MAX_POINTS) {
      toast('O caminho chegou ao limite de 40 pontos.');
      finishWalkwayDraft(ctx);
    }
  },

  onDragStart() {
    return false;
  },

  onCancel() {
    // Pinch zoom also lands here: the draft is not a doc gesture, so it stays.
  },

  onKey(e, ctx) {
    if (!getDraft()) return false;
    // Enter or Backspace on a focused pill button belongs to that button.
    if (e.target instanceof Element && e.target.closest('button')) return false;
    if (e.key === 'Enter') {
      finishWalkwayDraft(ctx);
      return true;
    }
    if (e.key === 'Escape') {
      cancelWalkwayDraft(ctx);
      return true;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      undoWalkwayPoint();
      return true;
    }
    return false;
  },
};
