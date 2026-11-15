import type { ReactElement } from 'react';
import {
  CERAMIC,
  clamp,
  corner,
  detailColor,
  FABRIC,
  hasDetails,
  hasShadow,
  lighten,
  mix,
  outline,
  SHADOW,
  SHADOW_FILL,
  softDetail,
  splitSpan,
  strokeFor,
  WOOD,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const PILLOW_STROKE = '#B3BBC6';

/** Bed with headboard at the back, pillows (two from 1,20 m wide) and a folded blanket in `color`. */
export function BedSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, FABRIC);
  const r = corner(w, d, 40);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const head = clamp(d * 0.045, 50, 110);
  const side = clamp(w * 0.025, 15, 40);
  const mTop = y0 + head;
  const mW = w - 2 * side;
  const mH = d / 2 - side - mTop;
  const pillows = w >= 1200 ? 2 : 1;
  const pillowGap = clamp(mW * 0.04, 30, 60);
  const pillowTop = mTop + clamp(d * 0.025, 30, 60);
  const pillowH = clamp(d * 0.14, 180, 330);
  const blanketTop = pillowTop + pillowH + clamp(d * 0.04, 50, 100);
  const blanketH = d / 2 - blanketTop;
  const fold = clamp(d * 0.08, 90, 180);
  const blanketLine = detailColor(color, stroke);
  return (
    <g>
      {hasShadow(ctx) && (
        <rect x={x0 + SHADOW.dx} y={y0 + SHADOW.dy} width={w} height={d} rx={r} {...SHADOW_FILL} />
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
        x={x0}
        y={y0}
        width={w}
        height={head}
        rx={Math.min(r, head / 2)}
        fill={mix(WOOD.fill, WOOD.stroke, 0.4)}
        stroke={WOOD.stroke}
        {...outline(ctx)}
      />
      <rect
        x={x0 + side}
        y={mTop}
        width={mW}
        height={mH}
        rx={corner(mW, mH, 40)}
        fill={CERAMIC.fill}
        stroke={CERAMIC.stroke}
        {...softDetail(ctx)}
      />
      {hasDetails(ctx) &&
        splitSpan(x0 + side + pillowGap, -x0 - side - pillowGap, pillows, pillowGap).map(
          ([a, b]) => (
            <rect
              key={a}
              x={a}
              y={pillowTop}
              width={b - a}
              height={pillowH}
              rx={Math.min(70, pillowH / 3)}
              fill={CERAMIC.fill}
              stroke={PILLOW_STROKE}
              {...softDetail(ctx)}
            />
          ),
        )}
      <rect
        x={x0 + side * 0.4}
        y={blanketTop}
        width={w - side * 0.8}
        height={blanketH}
        rx={corner(w, blanketH, 40)}
        fill={color}
        stroke={stroke}
        {...outline(ctx)}
      />
      {hasDetails(ctx) && (
        <>
          <rect
            x={x0 + side * 0.4}
            y={blanketTop}
            width={w - side * 0.8}
            height={fold}
            rx={corner(w, fold, 40)}
            fill={lighten(color, 0.5)}
            stroke={blanketLine}
            {...softDetail(ctx)}
          />
          <path
            d={`M${x0 + side * 0.4 + w * 0.12} ${blanketTop + fold + blanketH * 0.12}Q0 ${blanketTop + fold + blanketH * 0.2} ${-x0 - side * 0.4 - w * 0.12} ${blanketTop + fold + blanketH * 0.1}`}
            fill="none"
            stroke={blanketLine}
            strokeLinecap="round"
            {...softDetail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'bed-double',
  label: 'Cama de casal',
  category: 'bedroom',
  keywords: ['cama', 'casal', 'queen', 'king', 'quarto', 'dormitório', 'suíte'],
  size: { w: 1380, d: 1880 },
  min: { w: 1200, d: 1800 },
  max: { w: 2200, d: 2300 },
  variants: [
    { id: 'casal', label: 'Casal', w: 1380, d: 1880 },
    { id: 'queen', label: 'Queen', w: 1580, d: 1980 },
    { id: 'king', label: 'King', w: 1930, d: 2030 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: FABRIC.fill,
  colorable: true,
  Symbol: BedSymbol,
});
