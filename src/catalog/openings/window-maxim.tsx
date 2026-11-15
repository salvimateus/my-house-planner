import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { dashedPolyline, dashFor, pane, paneDepth, projection, windowFrame } from './openingKit.ts';

/** Top-hung window (maxim-ar): one pane and the dashed outline of the sash pushed out. */
function MaximWindowSymbol({
  width,
  thickness,
  side,
  swing,
  ctx,
}: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const t2 = thickness / 2;
  const j = Math.min(35, width * 0.05);
  const reach = Math.min(width * 0.3, 350) * Math.max(0, Math.min(1, swing));
  const inset = Math.min(width * 0.12, 120);
  const face = side * t2;
  const out = face + side * reach;
  const pts: [number, number][] = [
    [-half + j, face],
    [-half + j + inset, out],
    [half - j - inset, out],
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
  type: 'window-maxim',
  label: 'Maxim-ar',
  tip: 'Abre empurrando para fora. Ventila mesmo com chuva fraca.',
  Symbol: MaximWindowSymbol,
});
