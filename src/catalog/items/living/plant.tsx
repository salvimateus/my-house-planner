import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  detail,
  hasDetails,
  hasShadow,
  lighten,
  outline,
  PLANT,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  strokeFor,
} from './symbolKit.ts';

const POT = { fill: '#D39A7A', stroke: '#A56A4C' };
const OUTER_LEAVES = [0, 51, 103, 154, 206, 257, 309];
const INNER_LEAVES = [25, 115, 205, 295];

/** Potted plant seen from above: a pot rim under a rosette of leaves. */
function PlantSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const rx = w / 2;
  const ry = d / 2;
  const s = Math.min(rx, ry);
  const leafFill = color;
  const leafStroke = strokeFor(color, PLANT);
  const innerFill = lighten(color, 0.22);
  return (
    <g transform={rx === ry ? undefined : `scale(${rx / s} ${ry / s})`}>
      {hasShadow(ctx) && <circle cx={SHADOW_DX} cy={SHADOW_DY} r={s * 0.96} {...SHADOW_FILL} />}
      <circle r={s * 0.6} fill={POT.fill} stroke={POT.stroke} {...outline(ctx)} />
      {hasDetails(ctx) ? (
        <>
          {OUTER_LEAVES.map((a) => (
            <ellipse
              key={a}
              cx={s * 0.5}
              rx={s * 0.48}
              ry={s * 0.2}
              transform={`rotate(${a})`}
              fill={leafFill}
              stroke={leafStroke}
              {...detail(ctx)}
            />
          ))}
          {INNER_LEAVES.map((a) => (
            <ellipse
              key={a}
              cx={s * 0.26}
              rx={s * 0.28}
              ry={s * 0.13}
              transform={`rotate(${a})`}
              fill={innerFill}
              stroke={leafStroke}
              {...detail(ctx)}
            />
          ))}
        </>
      ) : (
        <circle r={s * 0.9} fill={leafFill} stroke={leafStroke} {...outline(ctx)} />
      )}
    </g>
  );
}

export default defineItem({
  type: 'plant',
  label: 'Planta em vaso',
  category: 'living',
  keywords: ['planta', 'vaso', 'folhagem', 'verde', 'decoração', 'jardim interno'],
  size: { w: 500, d: 500 },
  min: { w: 250, d: 250 },
  max: { w: 1500, d: 1500 },
  wallSnap: 'none',
  layer: 'furniture',
  color: PLANT.fill,
  colorable: true,
  keepAspect: true,
  Symbol: PlantSymbol,
});
