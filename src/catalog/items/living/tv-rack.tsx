import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  APPLIANCE,
  clamp,
  corner,
  detail,
  detailColor,
  hasDetails,
  hasShadow,
  outline,
  SCREEN,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  strokeFor,
  WOOD,
} from './symbolKit.ts';

/** Low rack with a flat TV standing near the back edge. */
function TvRackSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 35);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const inset = clamp(Math.min(w, d) * 0.06, 15, 30);
  const tvW = clamp(w * 0.7, 300, w - 2 * inset);
  const tvD = clamp(d * 0.09, 25, 50);
  const tvY = y0 + d * 0.3;
  const standW = tvW * 0.3;
  const standD = clamp(d * 0.32, 60, 180);
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
            rx={corner(w - 2 * inset, d - 2 * inset, 25)}
            fill="none"
            stroke={detailColor(color, stroke)}
            {...detail(ctx)}
          />
          <rect
            x={-standW / 2}
            y={tvY - standD * 0.35}
            width={standW}
            height={standD}
            rx={corner(standW, standD, 30)}
            fill={APPLIANCE.fill}
            stroke={APPLIANCE.stroke}
            {...detail(ctx)}
          />
          <rect
            x={-tvW / 2}
            y={tvY - tvD / 2}
            width={tvW}
            height={tvD}
            rx={tvD / 3}
            fill={SCREEN.fill}
            stroke={SCREEN.stroke}
            {...outline(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'tv-rack',
  label: 'Rack com TV',
  category: 'living',
  keywords: ['rack', 'tv', 'televisão', 'painel', 'home theater', 'sala', 'estante'],
  size: { w: 1800, d: 450 },
  min: { w: 600, d: 300 },
  max: { w: 3500, d: 700 },
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: TvRackSymbol,
});
