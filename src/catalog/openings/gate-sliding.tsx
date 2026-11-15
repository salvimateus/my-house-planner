import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import {
  arrowPath,
  dashedLine,
  fineStroke,
  gateFill,
  motorBox,
  outlineStroke,
  rackPath,
  rectPath,
} from './openingKit.ts';

/**
 * Electric sliding gate: a thick panel in the gap with its rack, the motor on the inner side at the
 * parking end, the slide arrow and, dashed, where the panel parks.
 */
function SlidingGateSymbol({
  width,
  thickness,
  hinge,
  side,
  swing,
  ctx,
}: OpeningSymbolProps): ReactElement {
  const { theme } = ctx;
  const half = width / 2;
  const t2 = thickness / 2;
  const panel = Math.max(40, Math.min(70, thickness * 0.45));
  const dir = hinge === 'start' ? -1 : 1;
  const rail = side * (t2 + panel * 0.9);
  const park = width * Math.max(0, Math.min(1, swing));
  const parkFrom = dir * half;
  const ay = side * (t2 + Math.min(260, width * 0.08));
  const reach = width * 0.16;
  const rackY = side * (panel / 2 + 6);
  const motorNear = side * (panel / 2 + 24);
  const motorEnd = dir * (half - Math.min(60, width * 0.02));
  const motorLen = Math.min(340, width * 0.12);
  return (
    <g>
      {park > 1 ? (
        <path
          d={dashedLine(parkFrom, rail, parkFrom + dir * park, rail)}
          fill="none"
          stroke={theme.swingArc}
          strokeLinecap="round"
          {...fineStroke(ctx)}
        />
      ) : null}
      <path
        d={rectPath(-half, -panel / 2, half, panel / 2)}
        fill={gateFill(ctx)}
        stroke={theme.door}
        strokeLinejoin="round"
        {...outlineStroke(ctx)}
      />
      <path
        d={rackPath(-half + 60, half - 60, rackY, side)}
        fill="none"
        stroke={theme.door}
        strokeLinecap="round"
        {...fineStroke(ctx)}
      />
      {motorBox(motorEnd, motorNear, motorEnd - dir * motorLen, motorNear + side * 190, ctx)}
      <path
        d={arrowPath(-dir * reach, dir * reach, ay, Math.min(120, width * 0.04))}
        fill="none"
        stroke={theme.swingArc}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...fineStroke(ctx)}
      />
    </g>
  );
}

export default defineOpening({
  type: 'gate-sliding',
  label: 'Portão eletrônico de correr',
  tip: 'Portão de garagem que corre ao lado do muro. Precisa de muro livre do lado.',
  Symbol: SlidingGateSymbol,
});
