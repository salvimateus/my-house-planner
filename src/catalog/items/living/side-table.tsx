import type { ReactElement } from 'react';
import {
  corner,
  hasDetails,
  hasShadow,
  outline,
  SHADOW,
  SHADOW_FILL,
  softDetail,
  strokeFor,
  WOOD,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

export const LAMP = { fill: '#FBF3DC', stroke: '#C9B27C', bulb: '#EFDDA6' };

/** Small table with a lamp seen from above. */
export function SideTableSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 35);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const shade = Math.min(w, d) * 0.32;
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
          <circle r={shade} fill={LAMP.fill} stroke={LAMP.stroke} {...softDetail(ctx)} />
          <circle r={shade * 0.3} fill={LAMP.bulb} stroke={LAMP.stroke} {...softDetail(ctx)} />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'side-table',
  label: 'Mesa lateral',
  category: 'living',
  keywords: ['mesa lateral', 'mesa de apoio', 'mesinha', 'abajur', 'luminária', 'sala'],
  size: { w: 450, d: 450 },
  min: { w: 250, d: 250 },
  max: { w: 900, d: 900 },
  wallSnap: 'none',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: SideTableSymbol,
});
