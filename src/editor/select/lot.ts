import { castDraft } from 'immer';
import { clampToLot } from '../../geometry/areaOps.ts';
import type { Fill, Lot, Mm, Side } from '../../model/types.ts';
import { docStore } from '../../store/docStore.ts';
import type { SelectHandler } from '../tools/types.ts';

/** Clockwise order on screen (y down). */
export const CW_SIDE: Record<Side, Side> = {
  top: 'right',
  right: 'bottom',
  bottom: 'left',
  left: 'top',
};
export const OPPOSITE_SIDE: Record<Side, Side> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};
const CCW_SIDE: Record<Side, Side> = { top: 'left', left: 'bottom', bottom: 'right', right: 'top' };

export const LOT_LIMITS = {
  front: { min: 3000, max: 100_000 },
  depth: { min: 3000, max: 200_000 },
} as const;

const alongX = (side: Side) => side === 'top' || side === 'bottom';

/** Lot size as the user reads it: the front along the street, the depth away from it. */
export function frontAndDepth(lot: Lot): { front: Mm; depth: Mm } {
  return alongX(lot.frontSide)
    ? { front: lot.width, depth: lot.depth }
    : { front: lot.depth, depth: lot.width };
}

/**
 * Side names from the street, looking at the lot: the left of that viewer is the next side
 * clockwise from the front.
 */
export function sideRole(lot: Lot, side: Side): 'front' | 'back' | 'left' | 'right' {
  if (side === lot.frontSide) return 'front';
  if (side === OPPOSITE_SIDE[lot.frontSide]) return 'back';
  return side === CW_SIDE[lot.frontSide] ? 'left' : 'right';
}

/** The two sides that can hold a corner street, as [left, right] from the street. */
export const cornerChoices = (lot: Lot): [Side, Side] => [
  CW_SIDE[lot.frontSide],
  CCW_SIDE[lot.frontSide],
];

/** Resizes the lot and clips the plan to it. Returns the pt-BR messages of the clip. */
export function resizeLot(front: Mm, depth: Mm): string[] {
  const ds = docStore.getState();
  const doc = ds.doc;
  if (!doc || ds.readOnly) return [];
  const f = Math.round(front);
  const d = Math.round(depth);
  const size = alongX(doc.lot.frontSide) ? { width: f, depth: d } : { width: d, depth: f };
  if (size.width === doc.lot.width && size.depth === doc.lot.depth) return [];
  const next = { ...doc, lot: { ...doc.lot, ...size } };
  const res = clampToLot(next);
  ds.commit('Medidas do terreno', (draft) => {
    draft.lot.width = size.width;
    draft.lot.depth = size.depth;
    Object.assign(draft, castDraft(res.patch));
  });
  return res.messages;
}

/** "Girar frente": the street moves to the next side clockwise; the house keeps lot coordinates. */
export function rotateFront(): void {
  docStore.getState().commit('Girar frente', (d) => {
    d.lot.frontSide = CW_SIDE[d.lot.frontSide];
    if (d.lot.cornerSide) d.lot.cornerSide = CW_SIDE[d.lot.cornerSide];
  });
}

export function setCornerSide(side: Side | null): void {
  docStore.getState().commit(side ? 'Terreno de esquina' : 'Terreno sem esquina', (d) => {
    d.lot.cornerSide = side;
  });
}

export function setBoundaryWall(side: Side, on: boolean): void {
  docStore.getState().commit(on ? 'Incluir muro' : 'Tirar muro', (d) => {
    d.lot.boundaryWalls[side] = on;
  });
}

export const normalizeDeg = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;

export function setNorth(deg: number): void {
  docStore.getState().commit('Direção do norte', (d) => {
    d.lot.northDeg = normalizeDeg(deg);
  });
}

export function setGround(fill: Fill): void {
  docStore.getState().commit('Piso do terreno', (d) => {
    d.lot.ground = fill;
  });
}

/**
 * The lot and its lot walls. A tap on a lot wall selects the lot. A tap on the empty lot selects it
 * when nothing is selected, and clears the selection otherwise. A drag pans.
 */
export const lotHandler: SelectHandler = {
  kind: 'lot',
  onTap(hit, _p, ctx) {
    if (hit?.kind === 'boundary' || ctx.getUi().selection === null) ctx.ui.select({ kind: 'lot' });
    else ctx.ui.select(null);
  },
  onDragStart: () => false,
};
