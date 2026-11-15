import type { Mm, Vec } from '../model/types.ts';
import { largestFreeRect } from './rectilinear.ts';
import { rectHeight, rectWidth } from './shape.ts';
import type { LabelBox, Rect, Region } from './types.ts';

/** Average Inter glyph width in em. */
export const CHAR_EM = 0.58;
/** Name line + area line + spacing, in em. */
export const LINES_EM = 2.3;

const charsOf = (name: string, areaText: string) => Math.max(name.length, areaText.length, 4);

/** Font size (world mm) that fits the two label lines in a w × h box. */
export function labelFont(w: Mm, h: Mm, name: string, areaText: string): Mm {
  return Math.min((w * 0.9) / (charsOf(name, areaText) * CHAR_EM), (h * 0.9) / LINES_EM);
}

/** Approximate text box of a placed label, for hit tests. */
export function labelTextRect(label: LabelBox, name: string, areaText: string): Rect {
  const hw = (charsOf(name, areaText) * CHAR_EM * label.fit) / 2;
  const hh = (LINES_EM * label.fit) / 2;
  return { x0: label.x - hw, y0: label.y - hh, x1: label.x + hw, y1: label.y + hh };
}

/**
 * Fits name and area text inside the largest free rectangle of the net region, away from furniture.
 * When furniture shrinks the font under 60% of the open fit, the label ignores the furniture.
 * `offset` (the user's label drag) shifts the center.
 */
export function placeLabel(
  net: Region,
  furniture: Rect[],
  name: string,
  areaText: string,
  offset: Vec | null = null,
): LabelBox {
  const fontFor = (w: Mm, h: Mm) => labelFont(w, h, name, areaText);
  const open = largestFreeRect(net, [], fontFor);
  let rect = furniture.length ? largestFreeRect(net, furniture, fontFor) : open;
  if (
    !rect ||
    (open &&
      fontFor(rectWidth(rect), rectHeight(rect)) < 0.6 * fontFor(rectWidth(open), rectHeight(open)))
  ) {
    rect = open;
  }
  if (!rect) return { x: 0, y: 0, fit: 0, rect: null };
  return {
    x: (rect.x0 + rect.x1) / 2 + (offset?.x ?? 0),
    y: (rect.y0 + rect.y1) / 2 + (offset?.y ?? 0),
    fit: fontFor(rectWidth(rect), rectHeight(rect)),
    rect,
  };
}
