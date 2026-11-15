import type { ReactElement } from 'react';
import { defineOpening, type OpeningSymbolProps } from '../types.ts';
import {
  dashedPolyline,
  dashFor,
  gateFill,
  outlineStroke,
  projection,
  rectPath,
} from './openingKit.ts';

/** Tilting garage gate (basculante): the panel in the gap and the dashed area it sweeps. */
function TiltGateSymbol({ width, thickness, side, swing, ctx }: OpeningSymbolProps): ReactElement {
  const half = width / 2;
  const t2 = thickness / 2;
  const panel = Math.max(35, Math.min(60, thickness * 0.4));
  const reach = Math.min(width * 0.32, 1100) * Math.max(0, Math.min(1, swing));
  const face = side * t2;
  const out = face + side * reach;
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
    </g>
  );
}

export default defineOpening({
  type: 'gate-tilt',
  label: 'Portão basculante',
  tip: 'Sobe girando para dentro. Ocupa espaço na frente da garagem quando abre.',
  Symbol: TiltGateSymbol,
});
