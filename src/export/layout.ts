import type { Rect, Scene } from '../geometry/types.ts';
import type { ProjectDoc, Shape } from '../model/types.ts';
import type { PaperId, SheetFrame } from './types.ts';

/** Landscape size in mm. */
export const PAPERS: Record<PaperId, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
};
export const SCALES = [50, 75, 100, 125, 150, 200, 250, 300];
/** Used only when the drawing does not fit at 1:300 (big lots). */
const LARGE_SCALES = [400, 500, 750, 1000, 1250, 1500, 2000];

const MARGIN = 10;
const GAP = 4;
/** Paper room around the lot for the lot size texts. */
const LOT_PAD = 9;
const BUILDING_PAD = 2;
/** World margin around the built footprint. */
const BUILDING_MARGIN = 1000;
/** World context shown around the lot in the "Terreno inteiro" frame. */
const LOT_CONTEXT = 3000;

export type Orientation = 'landscape' | 'portrait';

export interface SheetLayout {
  paper: PaperId;
  orientation: Orientation;
  /** Paper size in mm. */
  w: number;
  h: number;
  scale: number;
  /** False when a fixed scale cuts part of the content. */
  fits: boolean;
  /** Drawing box on paper (mm). */
  drawing: Rect;
  /** Visible part of the drawing box (mm): the lot frame shows at most 3 m of context. */
  clip: Rect;
  /** Title block and area table on paper (mm). */
  panel: Rect;
  panelColumns: 1 | 2;
  /** World window (mm) that the drawing box shows. */
  view: Rect;
}

function shapesBox(shapes: Shape[], into: Rect): void {
  for (const shape of shapes) {
    for (const ring of shape) {
      for (const p of ring) {
        if (p.x < into.x0) into.x0 = p.x;
        if (p.y < into.y0) into.y0 = p.y;
        if (p.x > into.x1) into.x1 = p.x;
        if (p.y > into.y1) into.y1 = p.y;
      }
    }
  }
}

/** Rooms, covered areas and house walls; null when nothing is built. */
export function builtBox(doc: ProjectDoc, scene: Scene): Rect | null {
  const box: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  shapesBox(
    doc.areas.filter((a) => a.kind !== 'outdoor').map((a) => a.shape),
    box,
  );
  for (const r of scene.wallRects) {
    box.x0 = Math.min(box.x0, r.x0);
    box.y0 = Math.min(box.y0, r.y0);
    box.x1 = Math.max(box.x1, r.x1);
    box.y1 = Math.max(box.y1, r.y1);
  }
  return Number.isFinite(box.x0) ? box : null;
}

/** World content to frame, and the paper padding it needs around it. */
export function contentOf(
  doc: ProjectDoc,
  scene: Scene,
  frame: SheetFrame,
): { box: Rect; pad: number; context: Rect | null } {
  const built = frame === 'building' ? builtBox(doc, scene) : null;
  if (built) {
    return {
      box: {
        x0: built.x0 - BUILDING_MARGIN,
        y0: built.y0 - BUILDING_MARGIN,
        x1: built.x1 + BUILDING_MARGIN,
        y1: built.y1 + BUILDING_MARGIN,
      },
      pad: BUILDING_PAD,
      context: null,
    };
  }
  const { width: w, depth: d } = doc.lot;
  return {
    box: { x0: 0, y0: 0, x1: w, y1: d },
    pad: LOT_PAD,
    context: { x0: -LOT_CONTEXT, y0: -LOT_CONTEXT, x1: w + LOT_CONTEXT, y1: d + LOT_CONTEXT },
  };
}

function boxes(
  paper: PaperId,
  orientation: Orientation,
): {
  w: number;
  h: number;
  drawing: Rect;
  panel: Rect;
  panelColumns: 1 | 2;
} {
  const size = PAPERS[paper];
  const w = orientation === 'landscape' ? size.w : size.h;
  const h = orientation === 'landscape' ? size.h : size.w;
  if (orientation === 'landscape') {
    const panelW = paper === 'A3' ? 84 : 74;
    const px0 = w - MARGIN - panelW;
    return {
      w,
      h,
      drawing: { x0: MARGIN, y0: MARGIN, x1: px0 - GAP, y1: h - MARGIN },
      panel: { x0: px0, y0: MARGIN, x1: w - MARGIN, y1: h - MARGIN },
      panelColumns: 1,
    };
  }
  const panelH = paper === 'A3' ? 76 : 70;
  const py0 = h - MARGIN - panelH;
  return {
    w,
    h,
    drawing: { x0: MARGIN, y0: MARGIN, x1: w - MARGIN, y1: py0 - GAP },
    panel: { x0: MARGIN, y0: py0, x1: w - MARGIN, y1: h - MARGIN },
    panelColumns: 2,
  };
}

const widthOf = (r: Rect) => r.x1 - r.x0;
const heightOf = (r: Rect) => r.y1 - r.y0;

function fitsAt(content: Rect, pad: number, drawing: Rect, scale: number): boolean {
  return (
    widthOf(content) / scale + 2 * pad <= widthOf(drawing) &&
    heightOf(content) / scale + 2 * pad <= heightOf(drawing)
  );
}

/** Ratio above 1 when the content fits with room to spare. */
function fillRatio(content: Rect, pad: number, drawing: Rect, scale: number): number {
  return Math.min(
    widthOf(drawing) / (widthOf(content) / scale + 2 * pad),
    heightOf(drawing) / (heightOf(content) / scale + 2 * pad),
  );
}

function smallestFit(content: Rect, pad: number, drawing: Rect): number | null {
  for (const s of [...SCALES, ...LARGE_SCALES]) if (fitsAt(content, pad, drawing, s)) return s;
  return null;
}

/**
 * Paper orientation, scale and boxes. Auto scale: the smallest denominator in `SCALES` that fits
 * (larger ones only for lots that do not fit at 1:300). Orientation: the one that allows the
 * larger drawing; on a tie, the one that matches the content aspect.
 */
export function layoutSheet(
  content: Rect,
  pad: number,
  paper: PaperId,
  fixedScale: number | null,
  context: Rect | null = null,
): SheetLayout {
  const tall = heightOf(content) > widthOf(content);
  const order: Orientation[] = tall ? ['portrait', 'landscape'] : ['landscape', 'portrait'];
  const candidates = order.map((orientation) => {
    const b = boxes(paper, orientation);
    const fit = fixedScale ?? smallestFit(content, pad, b.drawing);
    const scale = fit ?? LARGE_SCALES[LARGE_SCALES.length - 1] ?? 2000;
    return {
      orientation,
      ...b,
      scale,
      fits: fitsAt(content, pad, b.drawing, scale),
      ratio: fillRatio(content, pad, b.drawing, scale),
    };
  });
  const [first, second] = candidates as [(typeof candidates)[0], (typeof candidates)[0]];
  let pick = first;
  if (fixedScale === null) {
    if (second.scale < first.scale) pick = second;
  } else if (!first.fits && (second.fits || second.ratio > first.ratio)) {
    pick = second;
  }
  const cx = (content.x0 + content.x1) / 2;
  const cy = (content.y0 + content.y1) / 2;
  const vw = widthOf(pick.drawing) * pick.scale;
  const vh = heightOf(pick.drawing) * pick.scale;
  const view = { x0: cx - vw / 2, y0: cy - vh / 2, x1: cx + vw / 2, y1: cy + vh / 2 };
  const dr = pick.drawing;
  const clip = context
    ? {
        x0: Math.max(dr.x0, dr.x0 + (context.x0 - view.x0) / pick.scale),
        y0: Math.max(dr.y0, dr.y0 + (context.y0 - view.y0) / pick.scale),
        x1: Math.min(dr.x1, dr.x0 + (context.x1 - view.x0) / pick.scale),
        y1: Math.min(dr.y1, dr.y0 + (context.y1 - view.y0) / pick.scale),
      }
    : dr;
  return {
    paper,
    orientation: pick.orientation,
    w: pick.w,
    h: pick.h,
    scale: pick.scale,
    fits: pick.fits,
    drawing: dr,
    clip,
    panel: pick.panel,
    panelColumns: pick.panelColumns,
    view,
  };
}
