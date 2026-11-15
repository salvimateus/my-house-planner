import type { ReactElement } from 'react';
import {
  clamp,
  corner,
  detailColor,
  hasDetails,
  hasShadow,
  line,
  outline,
  SHADOW,
  SHADOW_FILL,
  softDetail,
  strokeFor,
  WOOD,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';
import { LAMP } from '../living/side-table.tsx';

/** Bedside table: drawer front at the front edge and a lamp toward the back. */
function NightstandSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 35);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const front = clamp(d * 0.08, 20, 40);
  const shade = Math.min(w, d - front) * 0.3;
  const lampY = -front / 2 - d * 0.04;
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
        fill={color}
        stroke={stroke}
        {...outline(ctx)}
      />
      {hasDetails(ctx) && (
        <>
          <path
            d={line(x0 + r, d / 2 - front, -x0 - r, d / 2 - front)}
            fill="none"
            stroke={detailColor(color, stroke)}
            {...softDetail(ctx)}
          />
          <circle cy={lampY} r={shade} fill={LAMP.fill} stroke={LAMP.stroke} {...softDetail(ctx)} />
          <circle
            cy={lampY}
            r={shade * 0.3}
            fill={LAMP.bulb}
            stroke={LAMP.stroke}
            {...softDetail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'nightstand',
  label: 'Criado-mudo',
  category: 'bedroom',
  keywords: ['criado-mudo', 'criado mudo', 'mesa de cabeceira', 'cabeceira', 'abajur', 'quarto'],
  size: { w: 450, d: 400 },
  min: { w: 300, d: 250 },
  max: { w: 800, d: 600 },
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: NightstandSymbol,
});
