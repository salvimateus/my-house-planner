import { itemDef } from '../../catalog/registry.ts';
import { hitTest } from '../../geometry/hitTest.ts';
import { snapItem } from '../../geometry/snap.ts';
import { emit } from '../../juice/events.ts';
import { tuning } from '../../juice/tuning.ts';
import { FINE_STEP } from '../../model/defaults.ts';
import { createItem } from '../../model/factories.ts';
import type { Item, ItemTypeId, Mm, Vec } from '../../model/types.ts';
import { markPlaced } from '../../render/layers/ItemsLayer.tsx';
import { EMPTY_TRANSIENT } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import {
  backRotation,
  clampToLotBox,
  itemSize,
  itemSnapContext,
  nearestFace,
} from '../select/item.ts';
import { tolPxFor, toolContext } from '../toolContext.ts';
import { handlerForSelection, selectTool } from './select.ts';
import type { PointerInput, Tool, ToolContext } from './types.ts';

/** Auto-orientation looks for a wall this close to the placement point. */
const ORIENT_REACH: Mm = 4000;
/** Offset of a new item that would land on the same spot as another item of its type. */
const STACK_OFFSET: Mm = 300;

/**
 * A new item at `at`, not committed yet: catalog size, back turned to the nearest wall that looks
 * at the point, inside the lot, then snapped (wall magnet, alignment, grid).
 */
export function placementCandidate(
  type: ItemTypeId,
  variant: string | null,
  at: Vec,
  ctx: ToolContext,
  snap = true,
): Item | null {
  const doc = ctx.getDoc();
  if (!doc) return null;
  const def = itemDef(type);
  const item: Item = { ...createItem(type, at, itemSize(def, variant)), variant };
  const scene = ctx.getScene();
  if (def.wallSnap === 'back') {
    const face = nearestFace(at, scene.faces, ORIENT_REACH);
    if (face) item.rotation = backRotation(face);
  }
  Object.assign(item, clampToLotBox(item, doc.lot));
  if (!snap) return item;
  const res = snapItem(item, def, itemSnapContext(ctx, new Set()));
  return { ...item, ...res.value };
}

export interface PlaceOptions {
  /** Look for a free spot when another item of the type already sits there. */
  avoidStack?: boolean;
  snap?: boolean;
}

/**
 * Commits a new catalog item at a world point and selects it, with the catalog still open for the
 * next one. Returns null in read-only mode.
 */
export function placeItem(
  type: ItemTypeId,
  variant: string | null,
  at: Vec,
  opts: PlaceOptions = {},
  ctx: ToolContext = toolContext,
): Item | null {
  if (ctx.doc.readOnly) {
    ctx.feedback.invalid();
    return null;
  }
  const item = placementCandidate(type, variant, at, ctx, opts.snap ?? true);
  const doc = ctx.getDoc();
  if (!item || !doc) return null;
  if (opts.avoidStack) {
    const taken = (x: Mm, y: Mm) =>
      doc.items.some(
        (i) => i.type === type && Math.abs(i.x - x) < FINE_STEP && Math.abs(i.y - y) < FINE_STEP,
      );
    for (let n = 0; n < 12 && taken(item.x, item.y); n++) {
      const next = clampToLotBox(
        { ...item, x: item.x + STACK_OFFSET, y: item.y + STACK_OFFSET },
        doc.lot,
      );
      if (next.x === item.x && next.y === item.y) break;
      item.x = next.x;
      item.y = next.y;
    }
  }
  ctx.doc.commit('Colocar objeto', (d) => {
    d.items.push(item);
  });
  if (ctx.getDoc() === doc) return null;
  markPlaced([item.id]);
  ctx.ui.setTransient(EMPTY_TRANSIENT);
  if (ctx.getUi().pendingItem) ctx.ui.setPending({ item: null });
  keepCatalog(ctx, () => ctx.ui.select({ kind: 'item', ids: [item.id] }));
  ctx.feedback.place();
  emit({ type: 'item-placed', itemId: item.id });
  hintContinueOnce();
  return item;
}

const HINT_KEY = 'casinha:hint-catalog-continue';

function hintContinueOnce(): void {
  try {
    if (localStorage.getItem(HINT_KEY)) return;
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    // Storage blocked: the hint may show again next session.
  }
  toast('Toque em outro móvel para continuar colocando.');
}

/**
 * Runs a selection change without leaving the catalog: the shell opens the inspector on every
 * new selection, so the catalog comes back at its snap. The inspector stays one tap away.
 */
export function keepCatalog(ctx: ToolContext, fn: () => void): void {
  const before = ctx.getUi().sheet;
  fn();
  const after = ctx.getUi().sheet;
  if (before.id === 'catalog' && after.id !== 'catalog' && ctx.getUi().tool === 'item') {
    ctx.ui.setSheet('catalog', before.snap);
  }
}

/** Tap on a catalog card: the item lands at the center of the view. */
export function placeItemAtViewCenter(type: ItemTypeId, variant: string | null): Item | null {
  const { cx, cy } = toolContext.camera.get();
  return placeItem(type, variant, { x: cx, y: cy }, { avoidStack: true });
}

/** Placement preview for a catalog drag or a pending item. */
export function showPlacementGhost(
  type: ItemTypeId,
  variant: string | null,
  at: Vec,
  snap: boolean,
  ctx: ToolContext = toolContext,
): void {
  const item = placementCandidate(type, variant, at, ctx, snap);
  ctx.ui.setTransient({ ghost: item ? { kind: 'item', item, valid: true } : null, guides: [] });
}

export function clearPlacementGhost(ctx: ToolContext = toolContext): void {
  if (ctx.getUi().transient.ghost?.kind === 'item')
    ctx.ui.setTransient({ ghost: null, guides: [] });
}

function itemHit(p: PointerInput, ctx: ToolContext): boolean {
  const doc = ctx.getDoc();
  if (!doc) return false;
  const hit = hitTest(
    doc,
    ctx.getScene(),
    p.world,
    ctx.tolMm(tolPxFor(p.pointerType)),
    ctx.getUi().layers,
    null,
  );
  return hit?.kind === 'item';
}

/** A handle of the current selection or an item under the pointer: the select tool owns it. */
function selectTarget(p: PointerInput, ctx: ToolContext): boolean {
  const handles = handlerForSelection(ctx.getUi().selection)?.getHandles?.(ctx) ?? [];
  const mouse = p.pointerType === 'mouse';
  const reach = (mouse ? tuning.touch.mouseHandlePx : tuning.touch.handlePx) / 2 + (mouse ? 4 : 8);
  if (handles.some((h) => Math.hypot(h.x - p.screen.x, h.y - p.screen.y) <= reach)) return true;
  return itemHit(p, ctx);
}

let delegated = false;
let placing = false;

/**
 * Objects tool, active while the catalog is open. With a pending item, a tap or a drag places it
 * at the pointer. Without one, items and their handles work as in the select tool, and the
 * catalog stays open; a tap on an empty spot clears the selection.
 */
export const itemTool: Tool = {
  id: 'item',
  cursor: 'default',

  onHover(p, ctx) {
    const pending = ctx.getUi().pendingItem;
    if (pending) showPlacementGhost(pending.type, pending.variant, p.world, !p.alt, ctx);
    else selectTool.onHover?.(p, ctx);
  },

  onTap(p, ctx) {
    const pending = ctx.getUi().pendingItem;
    if (pending) {
      placeItem(pending.type, pending.variant, p.world, { snap: !p.alt }, ctx);
      return;
    }
    if (selectTarget(p, ctx)) keepCatalog(ctx, () => selectTool.onTap?.(p, ctx));
    else if (ctx.getUi().selection) ctx.ui.select(null);
  },

  onLongPress(p, ctx) {
    if (ctx.getUi().pendingItem || !itemHit(p, ctx)) return;
    keepCatalog(ctx, () => selectTool.onLongPress?.(p, ctx));
  },

  onDragStart(p, ctx) {
    delegated = false;
    placing = false;
    if (!ctx.getDoc() || ctx.doc.readOnly) return false;
    const pending = ctx.getUi().pendingItem;
    if (pending) {
      placing = true;
      showPlacementGhost(pending.type, pending.variant, p.world, !p.alt, ctx);
      return true;
    }
    if (!selectTarget(p, ctx)) return false;
    keepCatalog(ctx, () => {
      delegated = selectTool.onDragStart?.(p, ctx) ?? false;
    });
    return delegated;
  },

  onDrag(p, start, ctx) {
    const pending = ctx.getUi().pendingItem;
    if (placing && pending) showPlacementGhost(pending.type, pending.variant, p.world, !p.alt, ctx);
    else if (delegated) selectTool.onDrag?.(p, start, ctx);
  },

  onDragEnd(p, start, ctx) {
    const pending = ctx.getUi().pendingItem;
    if (placing && pending) {
      placing = false;
      placeItem(pending.type, pending.variant, p.world, { snap: !p.alt }, ctx);
      return;
    }
    if (!delegated) return;
    delegated = false;
    keepCatalog(ctx, () => selectTool.onDragEnd?.(p, start, ctx));
  },
  onCancel(ctx) {
    if (delegated) selectTool.onCancel?.(ctx);
    delegated = false;
    placing = false;
    clearPlacementGhost(ctx);
  },

  onDeactivate(ctx) {
    placing = false;
    if (ctx.getUi().pendingItem) ctx.ui.setPending({ item: null });
    clearPlacementGhost(ctx);
  },

  onKey(e, ctx) {
    if (e.key !== 'Escape') return false;
    if (placing || delegated) {
      itemTool.onCancel?.(ctx);
      ctx.doc.cancelGesture();
      ctx.ui.setTransient(EMPTY_TRANSIENT);
      return true;
    }
    if (!ctx.getUi().pendingItem) return false;
    ctx.ui.setPending({ item: null });
    clearPlacementGhost(ctx);
    return true;
  },
};
