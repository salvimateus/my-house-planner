import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  CERAMIC,
  clamp,
  corner,
  detail,
  detailColor,
  hasDetails,
  hasShadow,
  outline,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  strokeFor,
  WOOD,
} from './symbolKit.ts';

const BOOK = { fill: '#9DB4CC', stroke: '#6F87A0' };

/** Center table with a framed top, a book and a bowl. */
function CoffeeTableSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 40);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const inset = clamp(Math.min(w, d) * 0.07, 20, 45);
  const m = Math.min(w, d);
  const bookW = m * 0.42;
  const bookD = m * 0.3;
  const bowlR = m * 0.15;
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
          <rect
            x={x0 + inset}
            y={y0 + inset}
            width={w - 2 * inset}
            height={d - 2 * inset}
            rx={corner(w - 2 * inset, d - 2 * inset, 30)}
            fill="none"
            stroke={detailColor(color, stroke)}
            {...detail(ctx)}
          />
          <rect
            x={-w * 0.25 - bookW / 2}
            y={-bookD / 2}
            width={bookW}
            height={bookD}
            rx={10}
            transform={`rotate(-8 ${-w * 0.25} 0)`}
            fill={BOOK.fill}
            stroke={BOOK.stroke}
            {...detail(ctx)}
          />
          <circle
            cx={w * 0.24}
            cy={0}
            r={bowlR}
            fill={CERAMIC.fill}
            stroke={CERAMIC.stroke}
            {...detail(ctx)}
          />
          <circle
            cx={w * 0.24}
            cy={0}
            r={bowlR * 0.6}
            fill="none"
            stroke={detailColor(CERAMIC.fill, CERAMIC.stroke)}
            {...detail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'coffee-table',
  label: 'Mesa de centro',
  category: 'living',
  keywords: ['mesa de centro', 'mesa', 'centro', 'mesinha', 'sala'],
  size: { w: 1000, d: 550 },
  min: { w: 400, d: 400 },
  max: { w: 1800, d: 1200 },
  wallSnap: 'none',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: CoffeeTableSymbol,
});
