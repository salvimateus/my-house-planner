import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { pane, paneDepth, windowFrame } from './openingKit.ts';

/** Fixed glass: frame and one pane, nothing opens. */
function FixedWindowSymbol({ width, thickness, ctx }: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const j = Math.min(35, width * 0.05);
  return (
    <g>
      {windowFrame(width, thickness, ctx)}
      {pane(-half + j, half - j, 0, paneDepth(thickness) * 1.2, ctx)}
    </g>
  );
}

export default defineOpening({
  type: 'window-fixed',
  label: 'Vidro fixo',
  tip: 'Só deixa entrar luz, não abre. Bom para iluminar sem ventilar.',
  Symbol: FixedWindowSymbol,
});
