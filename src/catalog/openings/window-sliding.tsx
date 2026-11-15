import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { pane, paneDepth, windowFrame } from './openingKit.ts';

/** Frame on the wall faces and two overlapping glass panes on parallel tracks. */
function SlidingWindowSymbol({ width, thickness, ctx }: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const j = Math.min(35, width * 0.04);
  const overlap = Math.min(90, width * 0.08);
  const depth = paneDepth(thickness);
  const off = depth * 0.55;
  return (
    <g>
      {windowFrame(width, thickness, ctx)}
      {pane(-half + j, overlap / 2, -off, depth, ctx, 'a')}
      {pane(-overlap / 2, half - j, off, depth, ctx, 'b')}
    </g>
  );
}

export default defineOpening({
  type: 'window-sliding',
  label: 'Janela de correr',
  tip: 'Duas folhas de vidro que correm. Boa para quartos e salas.',
  Symbol: SlidingWindowSymbol,
});
