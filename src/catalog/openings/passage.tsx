import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import { dashedLine, fineStroke } from './openingKit.ts';

/** Open passage: the two jamb lines and, dashed, the wall faces of the beam above. */
function PassageSymbol({ width, thickness, ctx }: OpeningSymbolProps): ReactElement {
  const { theme } = ctx;
  const half = width / 2;
  const t2 = thickness / 2;
  const ext = Math.min(30, thickness * 0.2);
  const jambs = `M${-half} ${-t2 - ext}L${-half} ${t2 + ext}M${half} ${-t2 - ext}L${half} ${t2 + ext}`;
  return (
    <g>
      <path
        d={dashedLine(-half, -t2, half, -t2) + dashedLine(-half, t2, half, t2)}
        fill="none"
        stroke={theme.swingArc}
        strokeLinecap="round"
        {...fineStroke(ctx)}
      />
      <path d={jambs} fill="none" stroke={theme.door} strokeLinecap="round" {...fineStroke(ctx)} />
    </g>
  );
}

export default defineOpening({
  type: 'passage',
  label: 'Vão livre',
  tip: 'Abertura sem porta, para integrar ambientes.',
  Symbol: PassageSymbol,
});
