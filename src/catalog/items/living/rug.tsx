import type { ReactElement } from 'react';
import {
  clamp,
  detailColor,
  hasDetails,
  line,
  mix,
  outline,
  softDetail,
  strokeFor,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const RUG = { fill: '#DCCBB4', stroke: '#A8916F' };

/** Flat rug with fringes on the short sides, an inner border and a center medallion. */
function RugSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, RUG);
  const vertical = d > w;
  // Fringes sit on the short sides; work in a frame where they are on the left and right.
  const len = vertical ? d : w;
  const wid = vertical ? w : d;
  const fringe = clamp(len * 0.03, 30, 70);
  const bodyLen = len - 2 * fringe;
  const border = clamp(Math.min(bodyLen, wid) * 0.09, 40, 200);
  const pitch = 70;
  const count = Math.max(2, Math.floor((wid - 40) / pitch));
  const step = (wid - 40) / (count - 1);
  let fringes = '';
  for (let i = 0; i < count; i++) {
    const t = -wid / 2 + 20 + i * step;
    fringes += line(-len / 2, t, -len / 2 + fringe, t);
    fringes += line(len / 2 - fringe, t, len / 2, t);
  }
  const mw = bodyLen / 2 - border * 2;
  const mh = wid / 2 - border * 2;
  const medallion = mw > 0 && mh > 0 ? `M${-mw} 0L0 ${-mh}L${mw} 0L0 ${mh}Z` : '';
  const lineColor = detailColor(color, stroke);
  const transform = vertical ? 'rotate(90)' : undefined;
  return (
    <g transform={transform}>
      {hasDetails(ctx) && (
        <path
          d={fringes}
          fill="none"
          stroke={lineColor}
          strokeLinecap="round"
          {...softDetail(ctx)}
        />
      )}
      <rect
        x={-bodyLen / 2}
        y={-wid / 2}
        width={bodyLen}
        height={wid}
        rx={12}
        fill={color}
        stroke={stroke}
        {...outline(ctx)}
      />
      {hasDetails(ctx) && (
        <>
          <rect
            x={-bodyLen / 2 + border}
            y={-wid / 2 + border}
            width={bodyLen - 2 * border}
            height={wid - 2 * border}
            fill={mix(color, '#FFFFFF', 0.25)}
            stroke={lineColor}
            {...softDetail(ctx)}
          />
          {medallion && (
            <path
              d={medallion}
              fill={mix(color, stroke, 0.2)}
              stroke={lineColor}
              {...softDetail(ctx)}
            />
          )}
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'rug',
  label: 'Tapete',
  category: 'living',
  keywords: ['tapete', 'carpete', 'passadeira', 'sala', 'quarto'],
  size: { w: 2000, d: 1500 },
  min: { w: 400, d: 400 },
  max: { w: 5000, d: 4000 },
  wallSnap: 'none',
  layer: 'floor',
  color: RUG.fill,
  colorable: true,
  Symbol: RugSymbol,
});
