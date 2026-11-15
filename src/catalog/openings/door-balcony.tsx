import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { arrowPath, fineStroke, pane, paneDepth, windowFrame } from './openingKit.ts';

/** Glass sliding door to a balcony or yard: frame, two glass leaves and the slide arrow. */
function BalconyDoorSymbol({
  width,
  thickness,
  hinge,
  side,
  ctx,
}: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const t2 = thickness / 2;
  const j = Math.min(40, width * 0.04);
  const overlap = Math.min(100, width * 0.06);
  const depth = paneDepth(thickness);
  const off = depth * 0.55;
  const dir = hinge === 'start' ? -1 : 1;
  const ay = side * (t2 + Math.min(120, width * 0.08));
  const reach = width * 0.18;
  return (
    <g>
      {windowFrame(width, thickness, ctx)}
      {pane(-half + j, overlap / 2, -off, depth, ctx, 'a')}
      {pane(-overlap / 2, half - j, off, depth, ctx, 'b')}
      <path
        d={arrowPath(-dir * reach, dir * reach, ay, Math.min(80, width * 0.05))}
        fill="none"
        stroke={ctx.theme.swingArc}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...fineStroke(ctx)}
      />
    </g>
  );
}

export default defineOpening({
  type: 'door-balcony',
  label: 'Porta de vidro',
  tip: 'Porta de correr de vidro para varanda ou quintal. Só em parede externa.',
  Symbol: BalconyDoorSymbol,
});
