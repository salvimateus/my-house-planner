import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  clamp,
  corner,
  darken,
  detail,
  hasDetails,
  hasShadow,
  outline,
  rectPath,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  segPath,
  strokeFor,
  WOOD,
} from './symbolKit.ts';

const BOOK_COLORS = ['#C97B63', '#7E9CC0', '#9DBB84'] as const;
// Fixed book widths and depth ratios give a natural, stable look on every render.
const BOOK_WIDTHS = [32, 24, 40, 28, 22, 36, 30, 26, 44, 24];
const BOOK_DEPTHS = [0.82, 0.7, 0.9, 0.76, 0.66, 0.86, 0.74, 0.8];

/** Open shelf seen from above: side panels, module dividers and rows of books. */
function BookshelfSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 30);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const board = clamp(w * 0.02, 15, 25);
  const modules = Math.max(1, Math.round(w / 450));
  const moduleW = (w - 2 * board) / modules;
  const innerTop = y0 + board;
  const innerDepth = d - 2 * board;

  let dividers = segPath(x0 + board, innerTop, x0 + board, y0 + d - board);
  dividers += segPath(-x0 - board, innerTop, -x0 - board, y0 + d - board);
  const books = ['', '', ''];
  let k = 0;
  for (let m = 0; m < modules; m++) {
    const left = x0 + board + m * moduleW;
    const right = left + moduleW;
    if (m > 0) dividers += segPath(left, innerTop, left, y0 + d - board);
    let x = left + 8;
    while (true) {
      const bw = BOOK_WIDTHS[k % BOOK_WIDTHS.length]!;
      if (x + bw > right - 8) break;
      const bd = innerDepth * BOOK_DEPTHS[k % BOOK_DEPTHS.length]!;
      books[k % 3] += rectPath(x, innerTop, bw - 3, bd);
      x += bw;
      k++;
      // A gap every few books keeps the rows from looking like a solid block.
      if (k % 9 === 0) x += 50;
    }
  }

  return (
    <g>
      {hasShadow(ctx) && (
        <rect x={x0 + SHADOW_DX} y={y0 + SHADOW_DY} width={w} height={d} rx={r} {...SHADOW_FILL} />
      )}
      <rect
        x={x0}
        y={y0}
        width={w}
        height={d}
        rx={r}
        fill={color}
        stroke={stroke}
        {...outline(ctx)}
      />
      {hasDetails(ctx) && (
        <>
          {BOOK_COLORS.map((c, i) =>
            books[i] ? (
              <path key={c} d={books[i]} fill={c} stroke={darken(c, 0.22)} {...detail(ctx)} />
            ) : null,
          )}
          <path d={dividers} fill="none" stroke={stroke} {...detail(ctx)} />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'bookshelf',
  label: 'Estante de livros',
  category: 'living',
  keywords: ['estante', 'livros', 'prateleira', 'biblioteca', 'nicho', 'sala', 'escritório'],
  size: { w: 1000, d: 350 },
  min: { w: 400, d: 200 },
  max: { w: 4000, d: 600 },
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: BookshelfSymbol,
});
