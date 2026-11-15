import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import {
  dashedPolyline,
  dashFor,
  fineStroke,
  gateFill,
  motorBox,
  outlineStroke,
  projection,
  rectPath,
} from './openingKit.ts';

/**
 * Electric tilting garage gate (basculante): the panel in the gap, the dashed area it sweeps and the
 * ceiling motor on the inner side, with its arm to the panel.
 */
function TiltGateSymbol({ width, thickness, side, swing, ctx }: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const t2 = thickness / 2;
  const panel = Math.max(35, Math.min(60, thickness * 0.4));
  const reach = Math.min(width * 0.32, 1100) * Math.max(0, Math.min(1, swing));
  const face = side * t2;
  const out = face + side * reach;
  const motorW = Math.min(300, width * 0.1);
  const motorNear = side * (panel / 2 + 140);
  const motorFar = motorNear + side * 170;
  const pts: [number, number][] = [
    [-half, face],
    [-half, out],
    [half, out],
    [half, face],
  ];
  return (
    <g>
      {reach > 1 ? projection(dashedPolyline(pts, dashFor(width)), ctx) : null}
      <path
        d={rectPath(-half, -panel / 2, half, panel / 2)}
        fill={gateFill(ctx)}
        stroke={ctx.theme.door}
        strokeLinejoin="round"
        {...outlineStroke(ctx)}
      />
      <path
        d={rectPath(-14, side * (panel / 2), 14, motorNear)}
        fill={gateFill(ctx)}
        stroke={ctx.theme.door}
        strokeLinejoin="round"
        {...fineStroke(ctx)}
      />
      {motorBox(-motorW / 2, motorNear, motorW / 2, motorFar, ctx)}
    </g>
  );
}

export default defineOpening({
  type: 'gate-tilt',
  label: 'Portão eletrônico basculante',
  tip: 'Sobe girando para dentro. Ocupa espaço na frente da garagem quando abre.',
  Symbol: TiltGateSymbol,
});
