import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { dashedPolyline, dashFor, pane, paneDepth, projection, windowFrame } from './openingKit.ts';

/** Tilting window (basculante): one pane and the dashed triangle of the open sash. */
function TiltWindowSymbol({
  width,
  thickness,
  side,
  swing,
  ctx,
}: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const t2 = thickness / 2;
  const j = Math.min(35, width * 0.05);
  const reach = Math.min(width * 0.4, 450) * Math.max(0, Math.min(1, swing));
  const face = side * t2;
  const pts: [number, number][] = [
    [-half + j, face],
    [0, face + side * reach],
    [half - j, face],
  ];
  return (
    <g>
      {windowFrame(width, thickness, ctx)}
      {pane(-half + j, half - j, 0, paneDepth(thickness), ctx)}
      {reach > 1 ? projection(dashedPolyline(pts, dashFor(width)), ctx) : null}
    </g>
  );
}

export default defineOpening({
  type: 'window-tilt',
  label: 'Basculante',
  tip: 'Janela pequena que gira no meio. Comum em banheiro e área de serviço.',
  Symbol: TiltWindowSymbol,
});
