import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  clamp,
  corner,
  detail,
  detailColor,
  FABRIC,
  hasDetails,
  hasShadow,
  lighten,
  mix,
  outline,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  splitSpan,
  strokeFor,
} from './symbolKit.ts';

/** Straight sofa: arms on both ends, backrest at the back, one seat cushion per ~60 cm. */
export function SofaSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, FABRIC);
  const r = corner(w, d, 40);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const arm = clamp(Math.max(w * 0.09, d * 0.17), 100, 220);
  const back = clamp(d * 0.22, 120, 250);
  const inset = clamp(d * 0.035, 15, 35);
  const seatL = x0 + arm;
  const seatR = -x0 - arm;
  const seats = clamp(Math.round((seatR - seatL) / 600), 1, 4);
  const cushionTop = y0 + back + inset * 0.5;
  const cushionH = d / 2 - inset - cushionTop;
  const lineColor = detailColor(color, stroke);
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
            x={seatL}
            y={y0}
            width={seatR - seatL}
            height={back}
            fill={mix(color, stroke, 0.2)}
            stroke={stroke}
            {...detail(ctx)}
          />
          <rect
            x={x0}
            y={y0}
            width={arm}
            height={d}
            rx={r}
            fill={mix(color, stroke, 0.12)}
            stroke={stroke}
            {...detail(ctx)}
          />
          <rect
            x={seatR}
            y={y0}
            width={arm}
            height={d}
            rx={r}
            fill={mix(color, stroke, 0.12)}
            stroke={stroke}
            {...detail(ctx)}
          />
          {splitSpan(seatL + inset * 0.5, seatR - inset * 0.5, seats, inset * 0.6).map(([a, b]) => (
            <rect
              key={a}
              x={a}
              y={cushionTop}
              width={b - a}
              height={cushionH}
              rx={corner(b - a, cushionH, 40)}
              fill={lighten(color, 0.22)}
              stroke={lineColor}
              {...detail(ctx)}
            />
          ))}
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'sofa',
  label: 'Sofá',
  category: 'living',
  keywords: ['sofá', 'sofa', 'estofado', 'sala', 'assento', '3 lugares', '2 lugares'],
  size: { w: 2100, d: 900 },
  min: { w: 1200, d: 700 },
  max: { w: 4000, d: 1200 },
  variants: [
    { id: '3-lugares', label: '3 lugares', w: 2100, d: 900 },
    { id: '2-lugares', label: '2 lugares', w: 1600, d: 850 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: FABRIC.fill,
  colorable: true,
  Symbol: SofaSymbol,
});
