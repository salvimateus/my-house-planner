import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import {
  arrowPath,
  fineStroke,
  JAMB,
  LEAF,
  LEAF_FILL,
  outlineStroke,
  rectPath,
} from './openingKit.ts';

/** Two leaves on parallel tracks; the arrow points to where the moving leaf goes. */
function SlidingDoorSymbol({
  width,
  thickness,
  hinge,
  side,
  ctx,
}: OpeningSymbolProps): ReactElement {
  const { theme } = ctx;
  const half = width / 2;
  const t2 = thickness / 2;
  const j = Math.min(JAMB, width * 0.08);
  const overlap = Math.min(80, width * 0.08);
  const gap = Math.min(6, thickness * 0.05);
  const leafA = rectPath(-half + j, -gap - LEAF, overlap / 2, -gap);
  const leafB = rectPath(-overlap / 2, gap, half - j, gap + LEAF);
  const dir = hinge === 'start' ? -1 : 1;
  const ay = side * (t2 + Math.min(110, width * 0.12));
  const reach = width * 0.22;
  return (
    <g>
      <path
        d={rectPath(-half, -t2, -half + j, t2) + rectPath(half - j, -t2, half, t2)}
        fill={LEAF_FILL}
        stroke={theme.door}
        {...fineStroke(ctx)}
      />
      <path
        d={leafA + leafB}
        fill={LEAF_FILL}
        stroke={theme.door}
        strokeLinejoin="round"
        {...outlineStroke(ctx)}
      />
      <path
        d={arrowPath(-dir * reach, dir * reach, ay, Math.min(70, width * 0.07))}
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
  type: 'door-sliding',
  label: 'Porta de correr',
  tip: 'Corre na parede e não ocupa espaço do cômodo. Ótima em lugar apertado.',
  Symbol: SlidingDoorSymbol,
});
