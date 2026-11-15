import {
  alongOf,
  clampRampAt,
  clampRampWidth,
  clampTreeAt,
  clampTreeSize,
  DEFAULT_RAMP_WIDTH,
  FRONTAGE_STEP,
  freeRampSpot,
  freeTreeSpot,
  frontagePoint,
  gateSide,
  isVehicleGate,
  SPECIES_CYCLE,
  SPECIES_SIZE,
  sideLength,
  sidewalkStrips,
  treeOut,
} from '../../geometry/frontage.ts';
import type { Handle } from '../../geometry/types.ts';
import { newId } from '../../model/ids.ts';
import type {
  Id,
  Lot,
  Mm,
  Opening,
  ProjectDoc,
  SidewalkRamp,
  StreetTree,
  StreetTreeSpecies,
  Vec,
} from '../../model/types.ts';
import { docStore } from '../../store/docStore.ts';
import type { Selection } from '../../store/uiStore.ts';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';

type FrontageKind = 'street-tree' | 'sidewalk-ramp';
export type FrontageSelection = Extract<NonNullable<Selection>, { kind: FrontageKind }>;

const snap = (v: number) => Math.round(v / FRONTAGE_STEP) * FRONTAGE_STEP;

export const findTree = (doc: ProjectDoc | null, id: Id): StreetTree | null =>
  doc?.lot.frontage.trees.find((t) => t.id === id) ?? null;

export const findRamp = (doc: ProjectDoc | null, id: Id): SidewalkRamp | null =>
  doc?.lot.frontage.ramps.find((r) => r.id === id) ?? null;

const contextUsable = (ctx: ToolContext): boolean => {
  const l = ctx.getUi().layers.context;
  return l.visible && !l.locked && !ctx.doc.readOnly;
};

/** World point of the item, for effects and the selection outline. */
export function frontageCenter(lot: Lot, sel: FrontageSelection): Vec | null {
  if (sel.kind === 'street-tree') {
    const t = lot.frontage.trees.find((x) => x.id === sel.id);
    return t ? frontagePoint(lot, t.side, t.at, treeOut(lot)) : null;
  }
  const r = lot.frontage.ramps.find((x) => x.id === sel.id);
  return r ? frontagePoint(lot, r.side, r.at, lot.sidewalkWidth / 2) : null;
}

// ---------------------------------------------------------------------------
// Commands (one undo step each)

export function setTreeSpecies(id: Id, species: StreetTreeSpecies): void {
  docStore.getState().commit('Espécie da árvore', (d) => {
    const t = d.lot.frontage.trees.find((x) => x.id === id);
    if (t) t.species = species;
  });
}

export function setTreeSize(id: Id, size: Mm): void {
  docStore.getState().commit('Tamanho da árvore', (d) => {
    const t = d.lot.frontage.trees.find((x) => x.id === id);
    if (t) t.size = clampTreeSize(size);
  });
}

export function setRampWidth(id: Id, width: Mm): void {
  docStore.getState().commit('Largura da rampa', (d) => {
    const r = d.lot.frontage.ramps.find((x) => x.id === id);
    if (!r) return;
    r.width = clampRampWidth(width);
    r.at = clampRampAt(d.lot, r.side, r.at, r.width);
    r.gateId = null;
  });
}

/** A vehicle gate on the ramp side that the ramp can follow: the one under it, else the nearest free one. */
export function matchingGate(doc: ProjectDoc, ramp: SidewalkRamp): Opening | null {
  const taken = new Set(
    doc.lot.frontage.ramps.filter((r) => r.id !== ramp.id && r.gateId).map((r) => r.gateId),
  );
  let best: Opening | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const o of doc.openings) {
    if (!isVehicleGate(o.type) || taken.has(o.id) || gateSide(o, doc.lot) !== ramp.side) continue;
    const d = Math.abs(o.at - ramp.at);
    if (d < bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

/** Links the ramp to its matching gate again; the frontage sync moves it in the same step. */
export function followGate(id: Id): boolean {
  const doc = docStore.getState().doc;
  const ramp = findRamp(doc, id);
  const gate = doc && ramp ? matchingGate(doc, ramp) : null;
  if (!gate) return false;
  docStore.getState().commit('Rampa segue o portão', (d) => {
    const r = d.lot.frontage.ramps.find((x) => x.id === id);
    if (r) r.gateId = gate.id;
  });
  return true;
}

/** Adds a ramp at a free spot on the front side. Returns its id, or null when the side is full. */
export function addRamp(): Id | null {
  const ds = docStore.getState();
  const doc = ds.doc;
  if (!doc || ds.readOnly) return null;
  const side = doc.lot.frontSide;
  const width = Math.min(DEFAULT_RAMP_WIDTH, sideLength(doc.lot, side));
  if (width < 2500) return null;
  const at = freeRampSpot(doc.lot, side, width, sideLength(doc.lot, side) / 2);
  if (at === null) return null;
  const ramp: SidewalkRamp = { id: newId(), side, at, width, gateId: null };
  ds.commit('Colocar rampa', (d) => {
    d.lot.frontage.ramps.push(ramp);
  });
  return docStore.getState().doc !== doc ? ramp.id : null;
}

/** Adds a tree at a free spot on a street side, the front first. Returns its id, or null when no spot is free. */
export function addTree(): Id | null {
  const ds = docStore.getState();
  const doc = ds.doc;
  if (!doc || ds.readOnly) return null;
  const lot = doc.lot;
  const sides = lot.cornerSide ? [lot.frontSide, lot.cornerSide] : [lot.frontSide];
  const species = SPECIES_CYCLE[lot.frontage.trees.length % SPECIES_CYCLE.length]!;
  for (const side of sides) {
    const at = freeTreeSpot(
      lot,
      side,
      sideLength(lot, side) / 2,
      SPECIES_SIZE[species],
      doc.openings,
    );
    if (at === null) continue;
    const tree: StreetTree = { id: newId(), side, at, size: SPECIES_SIZE[species], species };
    ds.commit('Plantar árvore', (d) => {
      d.lot.frontage.trees.push(tree);
    });
    return docStore.getState().doc !== doc ? tree.id : null;
  }
  return null;
}

/** Deletes the selected tree or ramp. Returns the world point of the removed item, or null. */
export function deleteFrontageItem(sel: FrontageSelection): Vec | null {
  const ds = docStore.getState();
  const doc = ds.doc;
  if (!doc) return null;
  const at = frontageCenter(doc.lot, sel);
  if (!at) return null;
  if (sel.kind === 'street-tree') {
    ds.commit('Excluir árvore', (d) => {
      d.lot.frontage.trees = d.lot.frontage.trees.filter((t) => t.id !== sel.id);
    });
  } else {
    ds.commit('Excluir rampa', (d) => {
      d.lot.frontage.ramps = d.lot.frontage.ramps.filter((r) => r.id !== sel.id);
    });
  }
  return at;
}

// ---------------------------------------------------------------------------
// Gestures

type Drag =
  | { kind: 'move-tree'; base: StreetTree; grab: Mm; lastMeter: number }
  | { kind: 'move-ramp'; base: SidewalkRamp; grab: Mm; lastMeter: number }
  | { kind: 'size-tree'; base: StreetTree; last: Mm }
  | { kind: 'end-ramp'; base: SidewalkRamp; fixed: Mm; last: Mm };

let drag: Drag | null = null;

function tickOnMeter(g: { lastMeter: number }, at: Mm, ctx: ToolContext): void {
  const meter = Math.floor(at / 1000);
  if (meter !== g.lastMeter) ctx.feedback.tick();
  g.lastMeter = meter;
}

function moveTo(p: PointerInput, ctx: ToolContext): void {
  const g = drag;
  const doc = ctx.getDoc();
  if (!g || !doc) return;
  if (g.kind === 'move-tree') {
    const at = clampTreeAt(
      doc.lot,
      g.base.side,
      snap(g.base.at + alongOf(g.base.side, p.world) - g.grab),
    );
    tickOnMeter(g, at, ctx);
    ctx.doc.updateGesture((d) => {
      const t = d.lot.frontage.trees.find((x) => x.id === g.base.id);
      if (t) t.at = at;
    });
    return;
  }
  if (g.kind === 'move-ramp') {
    const r = g.base;
    const at = clampRampAt(
      doc.lot,
      r.side,
      snap(r.at + alongOf(r.side, p.world) - g.grab),
      r.width,
    );
    tickOnMeter(g, at, ctx);
    ctx.doc.updateGesture((d) => {
      const x = d.lot.frontage.ramps.find((y) => y.id === r.id);
      if (!x || at === r.at) return;
      x.at = at;
      x.gateId = null;
    });
    return;
  }
  if (g.kind === 'size-tree') {
    const t = g.base;
    const size = clampTreeSize(snap(2 * Math.abs(alongOf(t.side, p.world) - t.at)));
    if (size !== g.last) ctx.feedback.tick();
    g.last = size;
    ctx.doc.updateGesture((d) => {
      const x = d.lot.frontage.trees.find((y) => y.id === t.id);
      if (x) x.size = size;
    });
    return;
  }
  const r = g.base;
  const len = sideLength(doc.lot, r.side);
  const moving = Math.max(0, Math.min(len, alongOf(r.side, p.world)));
  const width = clampRampWidth(snap(Math.abs(moving - g.fixed)));
  const dir = moving >= g.fixed ? 1 : -1;
  const at = clampRampAt(doc.lot, r.side, g.fixed + (dir * width) / 2, width);
  if (width !== g.last) ctx.feedback.tick();
  g.last = width;
  ctx.doc.updateGesture((d) => {
    const x = d.lot.frontage.ramps.find((y) => y.id === r.id);
    if (!x || (width === r.width && at === r.at)) return;
    x.width = width;
    x.at = at;
    x.gateId = null;
  });
}

function finish(ctx: ToolContext): void {
  if (!drag) return;
  drag = null;
  const changed = docStore.getState().gesture?.base !== ctx.getDoc();
  ctx.doc.endGesture();
  if (changed) ctx.feedback.place();
}

function selectedTree(ctx: ToolContext): StreetTree | null {
  const sel = ctx.getUi().selection;
  return sel?.kind === 'street-tree' ? findTree(ctx.getDoc(), sel.id) : null;
}

function selectedRamp(ctx: ToolContext): SidewalkRamp | null {
  const sel = ctx.getUi().selection;
  return sel?.kind === 'sidewalk-ramp' ? findRamp(ctx.getDoc(), sel.id) : null;
}

function makeHandler(kind: FrontageKind): SelectHandler {
  return {
    kind,

    onTap(hit, _p, ctx) {
      if (hit?.kind !== kind) return;
      ctx.ui.select({ kind, id: hit.id });
      ctx.feedback.tick();
    },

    onDragStart(hit, p, ctx) {
      drag = null;
      const doc = ctx.getDoc();
      if (hit?.kind !== kind || !doc || !contextUsable(ctx)) return false;
      if (kind === 'street-tree') {
        const t = findTree(doc, hit.id);
        if (!t) return false;
        drag = {
          kind: 'move-tree',
          base: t,
          grab: alongOf(t.side, p.world),
          lastMeter: Math.floor(t.at / 1000),
        };
        ctx.doc.beginGesture('Mover árvore');
      } else {
        const r = findRamp(doc, hit.id);
        if (!r) return false;
        drag = {
          kind: 'move-ramp',
          base: r,
          grab: alongOf(r.side, p.world),
          lastMeter: Math.floor(r.at / 1000),
        };
        ctx.doc.beginGesture('Mover rampa');
      }
      const sel = ctx.getUi().selection;
      if (!(sel?.kind === kind && sel.id === hit.id)) ctx.ui.select({ kind, id: hit.id });
      return true;
    },

    onDrag(_hit, p, _start, ctx) {
      moveTo(p, ctx);
    },

    onDragEnd(_hit, _p, _start, ctx) {
      finish(ctx);
    },

    onCancel() {
      drag = null;
    },

    getHandles(ctx) {
      const doc = ctx.getDoc();
      if (!doc || !contextUsable(ctx)) return [];
      const lot = doc.lot;
      if (kind === 'street-tree') {
        const t = selectedTree(ctx);
        if (!t) return [];
        const s = ctx.camera.worldToScreen(
          frontagePoint(lot, t.side, t.at + t.size / 2, treeOut(lot)),
        );
        return [{ id: 'size', x: s.x, y: s.y, shape: 'square', cursor: resizeCursor(t.side) }];
      }
      const r = selectedRamp(ctx);
      if (!r) return [];
      const { service0, total } = sidewalkStrips(lot);
      const out = (service0 + total) / 2;
      const end = (id: 'start' | 'end', at: Mm): Handle => {
        const s = ctx.camera.worldToScreen(frontagePoint(lot, r.side, at, out));
        return { id, x: s.x, y: s.y, shape: 'square', cursor: resizeCursor(r.side) };
      };
      return [end('start', r.at - r.width / 2), end('end', r.at + r.width / 2)];
    },

    onHandleDrag(handleId, p, _start, ctx, phase) {
      if (phase === 'start') {
        drag = null;
        if (!contextUsable(ctx)) return;
        if (kind === 'street-tree') {
          const t = selectedTree(ctx);
          if (!t || handleId !== 'size') return;
          drag = { kind: 'size-tree', base: t, last: t.size };
          ctx.doc.beginGesture('Tamanho da árvore');
          return;
        }
        const r = selectedRamp(ctx);
        if (!r || (handleId !== 'start' && handleId !== 'end')) return;
        const fixed = handleId === 'start' ? r.at + r.width / 2 : r.at - r.width / 2;
        drag = { kind: 'end-ramp', base: r, fixed, last: r.width };
        ctx.doc.beginGesture('Largura da rampa');
        return;
      }
      if (phase === 'move') moveTo(p, ctx);
      else finish(ctx);
    },
  };
}

const resizeCursor = (side: StreetTree['side']): string =>
  side === 'top' || side === 'bottom' ? 'ew-resize' : 'ns-resize';

/** Street trees in the select tool: tap selects, a drag moves the tree along the sidewalk. */
export const streetTreeHandler = makeHandler('street-tree');
/** Sidewalk ramps in the select tool: tap selects, a drag moves it, the end handles change its width. */
export const sidewalkRampHandler = makeHandler('sidewalk-ramp');
