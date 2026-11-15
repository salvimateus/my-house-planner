import { createStore } from 'zustand';
import { hitTest } from '../../geometry/hitTest.ts';
import type { Handle, HitTarget } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import type { Id } from '../../model/types.ts';
import { EMPTY_TRANSIENT, type Selection } from '../../store/uiStore.ts';
import { areaHandler } from '../select/area.ts';
import { sidewalkRampHandler, streetTreeHandler } from '../select/frontage.ts';
import { itemHandler } from '../select/item.ts';
import { lotHandler } from '../select/lot.ts';
import { openingHandler } from '../select/opening.ts';
import { rulerHandler } from '../select/ruler.ts';
import { wallHandler } from '../select/wall.ts';
import { setCanvasCursor, tolPxFor } from '../toolContext.ts';
import type { PointerInput, SelectHandler, Tool, ToolContext } from './types.ts';

type HitKind = NonNullable<HitTarget>['kind'];
type MultiKind = 'item' | 'opening' | 'ruler';

/** Handler per hit kind. Labels belong to their area, lot walls to the lot. */
export const SELECT_HANDLERS: Record<HitKind, SelectHandler> = {
  opening: openingHandler,
  item: itemHandler,
  ruler: rulerHandler,
  label: areaHandler,
  wall: wallHandler,
  boundary: lotHandler,
  area: areaHandler,
  'street-tree': streetTreeHandler,
  'sidewalk-ramp': sidewalkRampHandler,
  lot: lotHandler,
};

/** The handler that owns the handles of the current selection. */
export function handlerForSelection(sel: Selection): SelectHandler | null {
  if (!sel) return null;
  return SELECT_HANDLERS[sel.kind];
}

/** Screen-space marquee of a Shift+drag, drawn by the overlay. */
export const marqueeStore = createStore<{
  box: { x0: number; y0: number; x1: number; y1: number } | null;
}>()(() => ({ box: null }));

type Gesture =
  | { kind: 'hit'; handler: SelectHandler; hit: NonNullable<HitTarget> }
  | { kind: 'handle'; handler: SelectHandler; id: string }
  | { kind: 'marquee' };

let gesture: Gesture | null = null;

function hitAt(p: PointerInput, ctx: ToolContext): HitTarget {
  const doc = ctx.getDoc();
  if (!doc) return null;
  const ui = ctx.getUi();
  const selectedArea = ui.selection?.kind === 'area' ? ui.selection.id : null;
  return hitTest(
    doc,
    ctx.getScene(),
    p.world,
    ctx.tolMm(tolPxFor(p.pointerType)),
    ui.layers,
    selectedArea,
  );
}

function handleAt(
  p: PointerInput,
  ctx: ToolContext,
): { handler: SelectHandler; handle: Handle } | null {
  const handler = handlerForSelection(ctx.getUi().selection);
  const handles = handler?.getHandles?.(ctx);
  if (!handler || !handles?.length) return null;
  const mouse = p.pointerType === 'mouse';
  const reach = (mouse ? tuning.touch.mouseHandlePx : tuning.touch.handlePx) / 2 + (mouse ? 4 : 8);
  // Touch icon handles (door flips) get a 44 px hit area.
  const reachFor = (h: Handle) => (!mouse && h.shape === 'icon' ? Math.max(22, reach) : reach);
  let best: Handle | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const h of handles) {
    const d = Math.hypot(h.x - p.screen.x, h.y - p.screen.y);
    if (d <= reachFor(h) && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best ? { handler, handle: best } : null;
}

const isMulti = (k: HitKind): k is MultiKind => k === 'item' || k === 'opening' || k === 'ruler';

function toggleInSelection(kind: MultiKind, id: Id, ctx: ToolContext): void {
  const sel = ctx.getUi().selection;
  if (sel?.kind === kind) {
    const ids = sel.ids.includes(id) ? sel.ids.filter((x) => x !== id) : [...sel.ids, id];
    ctx.ui.select(ids.length ? { kind, ids } : null);
  } else {
    ctx.ui.select({ kind, ids: [id] });
  }
}

/** Selection for a hit when its handler has no tap behavior of its own. */
function selectHit(hit: HitTarget, ctx: ToolContext, additive: boolean): void {
  if (!hit) {
    ctx.ui.select(null);
    return;
  }
  switch (hit.kind) {
    case 'area':
      ctx.ui.select({ kind: 'area', id: hit.id });
      return;
    case 'label':
      ctx.ui.select({ kind: 'area', id: hit.areaId });
      return;
    case 'wall':
      ctx.ui.select({ kind: 'wall', segmentId: hit.segmentId });
      return;
    case 'boundary':
    case 'lot':
      ctx.ui.select({ kind: 'lot' });
      return;
    case 'street-tree':
    case 'sidewalk-ramp':
      ctx.ui.select({ kind: hit.kind, id: hit.id });
      return;
    default:
      if (additive) toggleInSelection(hit.kind, hit.id, ctx);
      else ctx.ui.select({ kind: hit.kind, ids: [hit.id] });
  }
}

function endGesture(ctx: ToolContext): void {
  gesture = null;
  marqueeStore.setState({ box: null });
  ctx.ui.setTransient(EMPTY_TRANSIENT);
}

function marqueeSelect(a: PointerInput, b: PointerInput, ctx: ToolContext): void {
  const doc = ctx.getDoc();
  if (!doc) return;
  const scene = ctx.getScene();
  const r = {
    x0: Math.min(a.world.x, b.world.x),
    y0: Math.min(a.world.y, b.world.y),
    x1: Math.max(a.world.x, b.world.x),
    y1: Math.max(a.world.y, b.world.y),
  };
  const inside = (x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const layers = ctx.getUi().layers;
  const usable = (id: 'items' | 'openings' | 'measures') =>
    layers[id].visible && !layers[id].locked;
  const items = usable('items') ? doc.items.filter((i) => inside(i.x, i.y)).map((i) => i.id) : [];
  if (items.length) {
    ctx.ui.select({ kind: 'item', ids: items });
    return;
  }
  const openings = usable('openings')
    ? doc.openings
        .filter((o) => {
          const c = scene.openings.get(o.id)?.center;
          return c ? inside(c.x, c.y) : false;
        })
        .map((o) => o.id)
    : [];
  if (openings.length) {
    ctx.ui.select({ kind: 'opening', ids: openings });
    return;
  }
  const rulers = usable('measures')
    ? doc.rulers
        .filter((rl) => {
          const d = scene.rulers.get(rl.id);
          return d ? inside(d.a.x, d.a.y) && inside(d.b.x, d.b.y) : false;
        })
        .map((rl) => rl.id)
    : [];
  ctx.ui.select(rulers.length ? { kind: 'ruler', ids: rulers } : null);
}

/**
 * Select tool router: handles of the selection first, then the geometric hit test and the handler
 * of the hit kind. A drag on empty space or on an unselected area pans. Shift+drag with a mouse
 * draws a marquee for items, openings and rulers.
 */
export const selectTool: Tool = {
  id: 'select',

  onTap(p, ctx) {
    const h = handleAt(p, ctx);
    if (h) {
      h.handler.onHandleTap?.(h.handle.id, ctx);
      return;
    }
    const hit = hitAt(p, ctx);
    const handler = hit ? SELECT_HANDLERS[hit.kind] : null;
    if (hit && handler?.onTap) handler.onTap(hit, p, ctx);
    else selectHit(hit, ctx, p.shift);
  },

  onLongPress(p, ctx) {
    const hit = hitAt(p, ctx);
    if (!hit) return;
    // Long press is the touch way to add to a multi selection.
    if (hit.kind === 'item' || hit.kind === 'opening' || hit.kind === 'ruler') {
      toggleInSelection(hit.kind, hit.id, ctx);
    } else {
      selectHit(hit, ctx, false);
    }
    ctx.feedback.tick();
  },

  onDragStart(p, ctx) {
    gesture = null;
    if (ctx.getDoc() === null) return false;
    const h = handleAt(p, ctx);
    if (h?.handler.onHandleDrag) {
      gesture = { kind: 'handle', handler: h.handler, id: h.handle.id };
      h.handler.onHandleDrag(h.handle.id, p, p, ctx, 'start');
      return true;
    }
    if (p.shift && p.pointerType === 'mouse') {
      gesture = { kind: 'marquee' };
      marqueeStore.setState({
        box: { x0: p.screen.x, y0: p.screen.y, x1: p.screen.x, y1: p.screen.y },
      });
      return true;
    }
    const hit = hitAt(p, ctx);
    if (!hit || hit.kind === 'lot') return false;
    const sel = ctx.getUi().selection;
    if (hit.kind === 'area' && !(sel?.kind === 'area' && sel.id === hit.id)) return false;
    const handler = SELECT_HANDLERS[hit.kind];
    if (!handler.onDragStart?.(hit, p, ctx)) return false;
    gesture = { kind: 'hit', handler, hit };
    return true;
  },

  onDrag(p, start, ctx) {
    const g = gesture;
    if (!g) return;
    if (g.kind === 'handle') g.handler.onHandleDrag?.(g.id, p, start, ctx, 'move');
    else if (g.kind === 'hit') g.handler.onDrag?.(g.hit, p, start, ctx);
    else
      marqueeStore.setState({
        box: { x0: start.screen.x, y0: start.screen.y, x1: p.screen.x, y1: p.screen.y },
      });
  },

  onDragEnd(p, start, ctx) {
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === 'handle') g.handler.onHandleDrag?.(g.id, p, start, ctx, 'end');
    else if (g.kind === 'hit') g.handler.onDragEnd?.(g.hit, p, start, ctx);
    else {
      marqueeSelect(start, p, ctx);
      endGesture(ctx);
    }
  },

  onCancel(ctx) {
    const g = gesture;
    if (g && g.kind !== 'marquee') g.handler.onCancel?.(ctx);
    ctx.doc.cancelGesture();
    endGesture(ctx);
  },

  onHover(p, ctx) {
    if (p.pointerType !== 'mouse') return;
    const h = handleAt(p, ctx);
    if (h) {
      setCanvasCursor(h.handle.cursor ?? 'pointer');
      return;
    }
    const hit = hitAt(p, ctx);
    const sel = ctx.getUi().selection;
    const movable =
      hit !== null &&
      (isMulti(hit.kind) ||
        hit.kind === 'street-tree' ||
        hit.kind === 'sidewalk-ramp' ||
        hit.kind === 'wall' ||
        hit.kind === 'label' ||
        (hit.kind === 'area' && sel?.kind === 'area' && sel.id === hit.id));
    setCanvasCursor(movable ? 'pointer' : null);
  },

  onDeactivate(ctx) {
    if (gesture) selectTool.onCancel?.(ctx);
    setCanvasCursor(null);
  },

  onKey(e, ctx) {
    if (e.key === 'Escape' && gesture) {
      selectTool.onCancel?.(ctx);
      return true;
    }
    return false;
  },
};
