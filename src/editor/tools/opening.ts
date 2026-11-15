import { track } from '../../analytics/track.ts';
import { OPENING_SPECS } from '../../catalog/openingSpecs.ts';
import { hitTest } from '../../geometry/hitTest.ts';
import { emit } from '../../juice/events.ts';
import { FINE_STEP } from '../../model/defaults.ts';
import { createOpening } from '../../model/factories.ts';
import type { Opening, OpeningType, Vec } from '../../model/types.ts';
import { markPlaced, markSwing, setMagnet } from '../../render/layers/OpeningsLayer.tsx';
import { EMPTY_TRANSIENT } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import {
  announceSwing,
  endGaps,
  GROUP_NOUN,
  type OpeningCandidate,
  openingCandidate,
  openingRadius,
  openingStep,
  placementProblem,
  wallKey,
} from '../select/opening.ts';
import { tolPxFor, toolContext } from '../toolContext.ts';
import { selectTool } from './select.ts';
import type { PointerInput, Tool, ToolContext } from './types.ts';

/** `placeOpeningAt` takes a point picked on a wall, so it looks a bit further than the hover magnet. */
const PLACE_AT_MIN_RADIUS = 400;

function candidateAt(
  type: OpeningType,
  at: Vec,
  radius: number,
  step: number,
  ctx: ToolContext,
): OpeningCandidate | null {
  const doc = ctx.getDoc();
  if (!doc) return null;
  return openingCandidate(type, at, radius, step, doc, ctx.getScene());
}

function commitOpening(
  type: OpeningType,
  cand: OpeningCandidate,
  ctx: ToolContext,
): Opening | null {
  const doc = ctx.getDoc();
  if (!doc || ctx.doc.readOnly) return null;
  const { snap } = cand;
  const opening: Opening = {
    ...createOpening(type, { axis: snap.axis, line: snap.line, at: snap.at }),
    width: cand.width,
    side: cand.side,
    hinge: cand.hinge,
  };
  ctx.doc.commit(`Colocar ${GROUP_NOUN[OPENING_SPECS[type].group]}`, (d) => {
    d.openings.push(opening);
  });
  if (ctx.getDoc() === doc) return null;
  markPlaced(opening.id);
  markSwing(opening.id);
  clearPreview(ctx);
  if (ctx.getUi().tool !== 'select') ctx.ui.setTool('select');
  ctx.ui.select({ kind: 'opening', ids: [opening.id] });
  ctx.ui.setSheet('inspector', 'peek');
  ctx.feedback.place();
  emit({ type: 'opening-placed', openingId: opening.id });
  track('opening_place', { opening_type: type });
  announceSwing(opening.id);
  return opening;
}

/**
 * Snaps an opening of `type` at a point picked on a wall (a wide magnet) and commits it. Returns
 * false when no compatible wall has room for it there.
 */
export function placeOpeningAt(type: OpeningType, at: Vec): boolean {
  const ctx = toolContext;
  if (ctx.doc.readOnly) return false;
  const radius = Math.max(openingRadius(ctx), PLACE_AT_MIN_RADIUS);
  const cand = candidateAt(type, at, radius, FINE_STEP, ctx);
  return cand ? commitOpening(type, cand, ctx) !== null : false;
}

let lastWall: string | null = null;

function clearPreview(ctx: ToolContext): void {
  lastWall = null;
  setMagnet(null, null);
  const t = ctx.getUi().transient;
  if (t.ghost?.kind === 'opening' || t.readout) ctx.ui.setTransient(EMPTY_TRANSIENT);
}

/** Ghost, magnet glow and readout for the pending type at the pointer. */
function preview(p: PointerInput, ctx: ToolContext, dragging: boolean): OpeningCandidate | null {
  const type = ctx.getUi().pendingOpening;
  if (!type) return null;
  const radius = openingRadius(ctx);
  const cand = candidateAt(type, p.world, radius, openingStep(p), ctx);
  if (!cand) {
    lastWall = null;
    setMagnet(type, null);
    const spec = OPENING_SPECS[type];
    const problem = placementProblem(type, p.world, radius * 3, ctx.getScene());
    ctx.ui.setTransient({
      ghost: {
        kind: 'opening',
        type,
        axis: 'h',
        line: p.world.y,
        at: p.world.x,
        width: spec.defaultWidth,
        side: 1,
        hinge: 'start',
        world: p.world,
        snapped: false,
      },
      readout: {
        x: p.screen.x,
        y: p.screen.y,
        text: dragging ? 'Solte sobre uma parede' : problem,
        sub: dragging ? problem : undefined,
        invalid: true,
      },
      guides: [],
    });
    return null;
  }
  const { snap } = cand;
  const key = wallKey(snap.axis, snap.line);
  if (key !== lastWall) ctx.feedback.thunk();
  lastWall = key;
  setMagnet(type, { axis: snap.axis, line: snap.line, at: snap.at, width: cand.width });
  ctx.ui.setTransient({
    ghost: {
      kind: 'opening',
      type,
      axis: snap.axis,
      // The ghost draws at `line` as given: the lot-line offset goes in here.
      line: snap.line + snap.run.offset,
      at: snap.at,
      width: cand.width,
      side: cand.side,
      hinge: cand.hinge,
      world: p.world,
      snapped: true,
    },
    readout: {
      x: p.screen.x,
      y: p.screen.y,
      text: endGaps(snap.at, cand.width, snap.run),
      sub: 'até as pontas da parede',
    },
    guides: [],
  });
  return cand;
}

function place(p: PointerInput, ctx: ToolContext): void {
  const type = ctx.getUi().pendingOpening;
  if (!type) return;
  const radius = openingRadius(ctx);
  const cand = candidateAt(type, p.world, radius, openingStep(p), ctx);
  if (cand && commitOpening(type, cand, ctx)) return;
  clearPreview(ctx);
  ctx.feedback.invalid();
  toast(placementProblem(type, p.world, radius * 3, ctx.getScene(), true));
}

function openingHit(p: PointerInput, ctx: ToolContext): boolean {
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
  return hit?.kind === 'opening';
}

let placing = false;
let delegated = false;

/**
 * Doors and windows tool. With a model picked in the panel, the ghost follows the mouse and jumps
 * onto compatible walls by magnet; a click, a tap or a drop on a wall places it. A press on an
 * existing opening hands the gesture to the select tool.
 */
export const openingTool: Tool = {
  id: 'opening',
  cursor: 'crosshair',

  onActivate(ctx) {
    if (!ctx.getUi().pendingOpening) ctx.ui.setPending({ opening: 'door' });
  },

  onDeactivate(ctx) {
    placing = false;
    delegated = false;
    clearPreview(ctx);
  },

  onHover(p, ctx) {
    if (p.pointerType !== 'mouse') return;
    preview(p, ctx, false);
  },

  onTap(p, ctx) {
    if (openingHit(p, ctx)) {
      clearPreview(ctx);
      ctx.ui.setTool('select');
      selectTool.onTap?.(p, ctx);
      return;
    }
    place(p, ctx);
  },

  onDragStart(p, ctx) {
    placing = false;
    delegated = false;
    if (!ctx.getDoc() || ctx.doc.readOnly) return false;
    if (openingHit(p, ctx)) {
      clearPreview(ctx);
      delegated = selectTool.onDragStart?.(p, ctx) ?? false;
      return delegated;
    }
    if (!ctx.getUi().pendingOpening) return false;
    // Drag the ghost to a wall and drop it there.
    placing = true;
    preview(p, ctx, true);
    return true;
  },

  onDrag(p, start, ctx) {
    if (placing) preview(p, ctx, true);
    else if (delegated) selectTool.onDrag?.(p, start, ctx);
  },

  onDragEnd(p, start, ctx) {
    if (placing) {
      placing = false;
      place(p, ctx);
      return;
    }
    if (!delegated) return;
    delegated = false;
    selectTool.onDragEnd?.(p, start, ctx);
    ctx.ui.setTool('select');
  },

  onCancel(ctx) {
    if (delegated) selectTool.onCancel?.(ctx);
    placing = false;
    delegated = false;
    clearPreview(ctx);
  },

  onKey(e, ctx) {
    if (e.key !== 'Escape') return false;
    if (placing || delegated) {
      openingTool.onCancel?.(ctx);
      ctx.doc.cancelGesture();
      return true;
    }
    clearPreview(ctx);
    ctx.ui.setTool('select');
    return true;
  },
};
