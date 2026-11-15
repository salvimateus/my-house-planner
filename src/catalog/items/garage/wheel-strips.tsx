import type { ReactElement } from 'react';
import {
  cornerRect,
  detailPen,
  hasDetails,
  hasShadow,
  line,
  mix,
  mono,
  outlinePen,
  paint,
  rrect,
  SHADOW_FILL,
  type Swatch,
  softDetail,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const CONCRETE: Swatch = { fill: '#DAD6CE', stroke: '#9F998E' };
const STRIP = 450;
const JOINT_PITCH = 1000;
const RADIUS = 18;
/** Aggregate grid cell, across by along the strip. */
const CELL_U = 150;
const CELL_V = 230;

const hash = (a: number, b: number, salt: number): number => {
  const x = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Small stones on a fixed grid from the strip start, so a longer strip only adds stones
 * and the existing ones stay where they were.
 */
function aggregate(
  x0: number,
  y0: number,
  len: number,
  strip: number,
  seed: number,
): [string, string] {
  let dark = '';
  let light = '';
  const cols = Math.floor(strip / CELL_U);
  const rows = Math.floor(len / CELL_V);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hash(c + seed, r, 7) > 0.6) continue;
      const cx = x0 + c * CELL_U + 25 + hash(c + seed, r, 1) * (CELL_U - 50);
      const cy = y0 + r * CELL_V + 25 + hash(c + seed, r, 2) * (CELL_V - 50);
      const size = 9 + hash(c + seed, r, 3) * 13;
      const stone = rrect(
        cx,
        cy,
        size,
        size * (0.55 + hash(c + seed, r, 4) * 0.4),
        4,
        hash(c + seed, r, 5) * 3,
      );
      if (hash(c + seed, r, 6) > 0.42) dark += stone;
      else light += stone;
    }
  }
  return [dark, light];
}

/** Two concrete strips for the car wheels, with the ground left open between them. */
function WheelStripsSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = paint(ctx, color, CONCRETE);
  const strip = Math.min(STRIP, w / 2);
  const left = -w / 2;
  const right = w / 2 - strip;
  const top = -d / 2;
  const slabs = cornerRect(left, top, strip, d, RADIUS) + cornerRect(right, top, strip, d, RADIUS);

  const segments = Math.max(1, Math.round(d / JOINT_PITCH));
  const pitch = d / segments;
  const inset = 22;
  let joints = '';
  for (let i = 1; i < segments; i++) {
    const y = top + i * pitch;
    joints += line(left + inset, y, left + strip - inset, y);
    joints += line(right + inset, y, right + strip - inset, y);
  }

  const details = hasDetails(ctx);
  const [darkA, lightA] = details ? aggregate(left, top, d, strip, 0) : ['', ''];
  const [darkB, lightB] = details ? aggregate(right, top, d, strip, 17) : ['', ''];
  const stonesDark = darkA + darkB;
  const stonesLight = lightA + lightB;
  const edging =
    cornerRect(left + inset, top + inset, strip - 2 * inset, d - 2 * inset, RADIUS * 0.6) +
    cornerRect(right + inset, top + inset, strip - 2 * inset, d - 2 * inset, RADIUS * 0.6);

  return (
    <g>
      {hasShadow(ctx) && <path d={slabs} transform="translate(14 22)" {...SHADOW_FILL} />}
      <path d={slabs} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      {details && (
        <>
          <path
            d={edging}
            fill="none"
            stroke={mono(ctx, mix(p.fill, '#FFFFFF', 0.45))}
            strokeLinejoin="round"
            {...softDetail(ctx)}
          />
          {stonesLight && <path d={stonesLight} fill={mono(ctx, mix(p.fill, '#FFFFFF', 0.5))} />}
          {stonesDark && <path d={stonesDark} fill={mono(ctx, mix(p.fill, p.stroke, 0.55))} />}
          {joints && <path d={joints} fill="none" {...detailPen(ctx, p.stroke)} />}
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'wheel-strips',
  label: 'Trilho de concreto (rodas)',
  category: 'garage',
  keywords: [
    'trilho',
    'trilha',
    'concreto',
    'cimento',
    'rodas',
    'garagem',
    'grama',
    'entrada',
    'carro',
    'piso',
  ],
  size: { w: 1800, d: 5000 },
  min: { w: 1500, d: 1000 },
  max: { w: 2600, d: 20_000 },
  variants: [
    { id: 'short', label: 'Curto', w: 1800, d: 3000 },
    { id: 'standard', label: 'Padrão', w: 1800, d: 5000 },
    { id: 'long', label: 'Longo', w: 1800, d: 8000 },
  ],
  wallSnap: 'none',
  layer: 'floor',
  color: CONCRETE.fill,
  colors: [CONCRETE.fill, '#E9E5DC', '#BDB8AE', '#C9B79C'],
  colorable: true,
  Symbol: WheelStripsSymbol,
});
