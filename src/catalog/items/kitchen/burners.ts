import { ellipse } from '../../symbolKit.ts';

export interface BurnerPaths {
  rings: string;
  caps: string;
}

/**
 * Burner grid in the box (x0, y0, w, h): 2 burners in a narrow column,
 * 4 in a 2 × 2 grid, 5 with a large center burner when the box is wide.
 */
export function burnerPaths(x0: number, y0: number, w: number, h: number): BurnerPaths {
  const cols = w >= 650 ? 3 : w >= 400 ? 2 : 1;
  const spots: Array<[number, number, number]> = [];
  const cellW = w / cols;
  const cellH = h / 2;
  const r = Math.min(cellW, cellH) * 0.34;
  for (let c = 0; c < cols; c++) {
    const cx = x0 + cellW * (c + 0.5);
    if (cols === 3 && c === 1) {
      spots.push([cx, y0 + h / 2, r * 1.25]);
      continue;
    }
    spots.push([cx, y0 + cellH * 0.5, r]);
    spots.push([cx, y0 + cellH * 1.5, r * (c === 0 ? 1.1 : 0.9)]);
  }
  let rings = '';
  let caps = '';
  for (const [cx, cy, rr] of spots) {
    rings += ellipse(cx, cy, rr) + ellipse(cx, cy, rr * 0.62);
    caps += ellipse(cx, cy, rr * 0.3);
  }
  return { rings, caps };
}

export const burnerCount = (w: number): number => (w >= 650 ? 5 : w >= 400 ? 4 : 2);
