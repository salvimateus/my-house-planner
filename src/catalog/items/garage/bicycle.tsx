import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { edge, oval, pen, rrect, SHADOW } from '../outdoor/kit.ts';

const TIRE = '#2B2E33';
const DARK = '#2E3136';

function BicycleSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  // Front at +x; u runs along the length, v across, both from -0.5 to 0.5.
  const box = (u0: number, u1: number, v0: number, v1: number, r: number): string =>
    rrect(u0 * w, v0 * d, (u1 - u0) * w, (v1 - v0) * d, r * d);
  const tires = box(-0.5, -0.1, -0.035, 0.035, 0.035) + box(0.1, 0.5, -0.035, 0.035, 0.035);
  const handlebar =
    box(0.22, 0.245, -0.42, 0.42, 0.012) +
    box(0.212, 0.252, -0.46, -0.33, 0.02) +
    box(0.212, 0.252, 0.33, 0.46, 0.02);
  const cranks =
    box(-0.05, -0.03, -0.2, 0.2, 0.01) +
    box(-0.075, -0.005, -0.26, -0.17, 0.015) +
    box(-0.075, -0.005, 0.17, 0.26, 0.015);
  const dark = p.c(DARK);
  const stroke = p.c(edge(color));
  return (
    <g>
      {p.shadow && (
        <path
          d={oval(SHADOW.dx, SHADOW.dy, w * 0.49, d * 0.06)}
          fill={SHADOW.fill}
          fillOpacity={SHADOW.fillOpacity}
        />
      )}
      <path d={tires} fill={p.c(TIRE)} stroke={p.c('#16181B')} {...p.line} />
      {p.detail && <path d={cranks} fill={dark} stroke={p.c('#16181B')} {...p.fine} />}
      <path
        d={box(-0.3, 0.24, -0.024, 0.024, 0.02)}
        fill={p.c(color)}
        stroke={stroke}
        {...p.fine}
      />
      <path d={handlebar} fill={dark} stroke={p.c('#16181B')} {...p.fine} />
      {p.detail && (
        <path
          d={box(-0.23, -0.1, -0.06, 0.06, 0.04)}
          fill={dark}
          stroke={p.c('#16181B')}
          {...p.fine}
        />
      )}
    </g>
  );
}

export default defineItem({
  type: 'bicycle',
  label: 'Bicicleta',
  category: 'garage',
  keywords: ['bicicleta', 'bike', 'magrela', 'ciclismo', 'bicicletário', 'garagem'],
  size: { w: 1750, d: 600 },
  min: { w: 1200, d: 450 },
  max: { w: 2000, d: 800 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#2F5D9E',
  colors: ['#2F5D9E', '#C8352E', '#2A2D33', '#F4F5F7', '#3E8E5A'],
  colorable: true,
  Symbol: BicycleSymbol,
});
