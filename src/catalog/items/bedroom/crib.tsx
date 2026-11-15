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
  lighten,
  outline,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  segPath,
  strokeFor,
  WOOD,
} from '../living/symbolKit.ts';

const BLANKET = { fill: '#D6E6F5', stroke: '#93AFCB' };

/** Crib with slatted rails on the long sides, a mattress and a small blanket in `color`. */
function CribSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, BLANKET);
  const r = corner(w, d, 35);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const rail = clamp(Math.min(w, d) * 0.07, 30, 60);
  const mW = w - 2 * rail;
  const mH = d - 2 * rail;
  const pitch = 90;
  const count = Math.max(2, Math.floor((d - 2 * rail) / pitch));
  const step = (d - 2 * rail) / count;
  let slats = '';
  for (let i = 1; i < count; i++) {
    const y = y0 + rail + i * step;
    slats += segPath(x0, y, x0 + rail, y) + segPath(-x0 - rail, y, -x0, y);
  }
  const blanketTop = y0 + rail + mH * 0.42;
  const blanketH = y0 + rail + mH - blanketTop;
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
        fill={WOOD.fill}
        stroke={WOOD.stroke}
        {...outline(ctx)}
      />
      <rect
        x={x0 + rail}
        y={y0 + rail}
        width={mW}
        height={mH}
        rx={corner(mW, mH, 30)}
        fill={CERAMIC.fill}
        stroke={CERAMIC.stroke}
        {...detail(ctx)}
      />
      {hasDetails(ctx) && (
        <>
          <path d={slats} fill="none" stroke={WOOD.stroke} {...detail(ctx)} />
          <rect
            x={x0 + rail + mW * 0.06}
            y={blanketTop}
            width={mW * 0.88}
            height={blanketH}
            rx={corner(mW, blanketH, 40)}
            fill={color}
            stroke={stroke}
            {...detail(ctx)}
          />
          <rect
            x={x0 + rail + mW * 0.06}
            y={blanketTop}
            width={mW * 0.88}
            height={blanketH * 0.16}
            rx={corner(mW, blanketH * 0.16, 30)}
            fill={lighten(color, 0.5)}
            stroke={detailColor(color, stroke)}
            {...detail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'crib',
  label: 'Berço',
  category: 'bedroom',
  keywords: ['berço', 'bebê', 'nenê', 'quarto do bebê', 'infantil', 'criança'],
  size: { w: 700, d: 1300 },
  min: { w: 550, d: 1000 },
  max: { w: 900, d: 1600 },
  wallSnap: 'back',
  layer: 'furniture',
  color: BLANKET.fill,
  colorable: true,
  Symbol: CribSymbol,
});
