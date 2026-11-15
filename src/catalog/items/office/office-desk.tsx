import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  APPLIANCE,
  clamp,
  corner,
  detail,
  hasDetails,
  hasShadow,
  outline,
  type Point,
  roundedPolygon,
  SCREEN,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  strokeFor,
  WOOD,
} from '../living/symbolKit.ts';

/** Desks this deep in both directions draw as an L. */
const L_MIN = 1100;

/**
 * Desk with monitor, keyboard and mouse. From 1,10 m in both directions it draws as an L,
 * with the return on the right; `mirrored` moves the return to the left.
 */
function OfficeDeskSymbol({ w, d, color, mirrored, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 35);
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const isL = w >= L_MIN && d >= L_MIN;
  const arm = isL ? clamp(Math.min(w, d) * 0.45, 500, 800) : d;
  const fx = (x: number): number => (mirrored ? -x : x);
  const shape = (
    (isL
      ? [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x1 - arm, y1],
          [x1 - arm, y0 + arm],
          [x0, y0 + arm],
        ]
      : [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ]) as Point[]
  ).map(([x, y]): Point => [fx(x), y]);

  // The work spot sits on the main top, away from the return.
  const workW = isL ? w - arm : w;
  const cx = fx(x0 + workW / 2);
  const monW = clamp(workW * 0.45, 300, 700);
  const monD = clamp(arm * 0.045, 18, 35);
  const monY = y0 + arm * 0.2;
  const standW = monW * 0.32;
  const standD = clamp(arm * 0.16, 60, 140);
  const keyW = clamp(workW * 0.36, 250, 450);
  const keyD = clamp(arm * 0.22, 90, 150);
  const keyY = y0 + arm * 0.58;
  const mouseX = cx + keyW / 2 + clamp(workW * 0.08, 50, 110);
  return (
    <g>
      {hasShadow(ctx) && (
        <path d={roundedPolygon(shape, r, SHADOW_DX, SHADOW_DY)} {...SHADOW_FILL} />
      )}
      <path d={roundedPolygon(shape, r)} fill={color} stroke={stroke} {...outline(ctx)} />
      {hasDetails(ctx) && (
        <>
          <rect
            x={cx - standW / 2}
            y={monY - standD * 0.3}
            width={standW}
            height={standD}
            rx={corner(standW, standD, 30)}
            fill={APPLIANCE.fill}
            stroke={APPLIANCE.stroke}
            {...detail(ctx)}
          />
          <rect
            x={cx - monW / 2}
            y={monY - monD / 2}
            width={monW}
            height={monD}
            rx={monD / 3}
            fill={SCREEN.fill}
            stroke={SCREEN.stroke}
            {...outline(ctx)}
          />
          <rect
            x={cx - keyW / 2}
            y={keyY - keyD / 2}
            width={keyW}
            height={keyD}
            rx={corner(keyW, keyD, 20)}
            fill={APPLIANCE.fill}
            stroke={APPLIANCE.stroke}
            {...detail(ctx)}
          />
          <ellipse
            cx={mouseX}
            cy={keyY}
            rx={keyD * 0.24}
            ry={keyD * 0.38}
            fill={APPLIANCE.fill}
            stroke={APPLIANCE.stroke}
            {...detail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'office-desk',
  label: 'Escrivaninha',
  category: 'office',
  keywords: ['escrivaninha', 'mesa', 'mesa de escritório', 'home office', 'computador', 'estudo'],
  size: { w: 1200, d: 600 },
  min: { w: 600, d: 400 },
  max: { w: 2400, d: 2000 },
  variants: [
    { id: '120x60', label: '1,20 × 0,60 m', w: 1200, d: 600 },
    { id: '150x70', label: '1,50 × 0,70 m', w: 1500, d: 700 },
    { id: 'l', label: 'Em L 1,50 × 1,50 m', w: 1500, d: 1500 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: OfficeDeskSymbol,
});
