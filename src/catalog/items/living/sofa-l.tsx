import type { ReactElement } from 'react';
import {
  clamp,
  corner,
  detailColor,
  FABRIC,
  hasDetails,
  hasShadow,
  lighten,
  mix,
  outline,
  type Point,
  roundedPolygon,
  SHADOW,
  SHADOW_FILL,
  softDetail,
  splitSpan,
  strokeFor,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

/** Corner sofa with the chaise on the right; `mirrored` moves the chaise to the left. */
function SofaLSymbol({ w, d, color, mirrored, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, FABRIC);
  const r = corner(w, d, 40);
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const seatDepth = clamp(d * 0.53, 650, Math.min(1100, d - 300));
  const chaise = clamp(w * 0.33, 650, Math.min(1100, w - 600));
  const arm = clamp(seatDepth * 0.17, 100, 200);
  const back = clamp(seatDepth * 0.22, 120, 250);
  const inset = clamp(seatDepth * 0.035, 15, 35);
  const mainBottom = y0 + seatDepth;
  const chaiseLeft = x1 - chaise;

  const fx = (x: number): number => (mirrored ? -x : x);
  /** Rect props for an unmirrored span [a, b] on x. */
  const span = (a: number, b: number) => ({ x: Math.min(fx(a), fx(b)), width: Math.abs(b - a) });

  const shape = (
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [chaiseLeft, y1],
      [chaiseLeft, mainBottom],
      [x0, mainBottom],
    ] as Point[]
  ).map(([x, y]): Point => [fx(x), y]);

  const seats = clamp(Math.round((chaiseLeft - (x0 + arm)) / 600), 1, 4);
  const cushionTop = y0 + back + inset * 0.5;
  const cushionFill = lighten(color, 0.22);
  const lineColor = detailColor(color, stroke);
  const armFill = mix(color, stroke, 0.12);

  return (
    <g>
      {hasShadow(ctx) && (
        <path d={roundedPolygon(shape, r, SHADOW.dx, SHADOW.dy)} {...SHADOW_FILL} />
      )}
      <path d={roundedPolygon(shape, r)} fill={color} stroke={stroke} {...outline(ctx)} />
      {hasDetails(ctx) && (
        <>
          <rect
            {...span(x0 + arm, x1 - arm)}
            y={y0}
            height={back}
            fill={mix(color, stroke, 0.2)}
            stroke={stroke}
            {...softDetail(ctx)}
          />
          <rect
            {...span(x0, x0 + arm)}
            y={y0}
            height={seatDepth}
            rx={r}
            fill={armFill}
            stroke={stroke}
            {...softDetail(ctx)}
          />
          <rect
            {...span(x1 - arm, x1)}
            y={y0}
            height={d}
            rx={r}
            fill={armFill}
            stroke={stroke}
            {...softDetail(ctx)}
          />
          {splitSpan(x0 + arm + inset * 0.5, chaiseLeft - inset * 0.3, seats, inset * 0.6).map(
            ([a, b]) => (
              <rect
                key={a}
                {...span(a, b)}
                y={cushionTop}
                height={mainBottom - inset - cushionTop}
                rx={corner(b - a, mainBottom - cushionTop, 40)}
                fill={cushionFill}
                stroke={lineColor}
                {...softDetail(ctx)}
              />
            ),
          )}
          <rect
            {...span(chaiseLeft + inset * 0.3, x1 - arm - inset * 0.5)}
            y={cushionTop}
            height={y1 - inset - cushionTop}
            rx={corner(chaise - arm, y1 - cushionTop, 40)}
            fill={cushionFill}
            stroke={lineColor}
            {...softDetail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'sofa-l',
  label: 'Sofá de canto (L)',
  category: 'living',
  keywords: ['sofá', 'sofa', 'canto', 'chaise', 'chaise longue', 'retrátil', 'sala', 'estofado'],
  size: { w: 2600, d: 1700 },
  min: { w: 1800, d: 1300 },
  max: { w: 4000, d: 2600 },
  wallSnap: 'back',
  layer: 'furniture',
  color: FABRIC.fill,
  colorable: true,
  Symbol: SofaLSymbol,
});
