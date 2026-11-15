import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { edge, n, oval, pen, rrect, SHADOW, shade } from '../outdoor/kit.ts';

const TIRE = '#2B2E33';
const DARK = '#2E3136';
const CHROME = '#B7BCC4';

function MotorcycleSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  // Front at +x; u runs along the length, v across, both from -0.5 to 0.5.
  const P = (u: number, v: number): string => `${n(u * w)} ${n(v * d)}`;
  const box = (u0: number, u1: number, v0: number, v1: number, r: number): string =>
    rrect(u0 * w, v0 * d, (u1 - u0) * w, (v1 - v0) * d, r * d);
  const body =
    `M${P(-0.38, 0)}C${P(-0.38, -0.1)} ${P(-0.2, -0.17)} ${P(0, -0.2)}` +
    `C${P(0.12, -0.22)} ${P(0.28, -0.16)} ${P(0.3, 0)}` +
    `C${P(0.28, 0.16)} ${P(0.12, 0.22)} ${P(0, 0.2)}` +
    `C${P(-0.2, 0.17)} ${P(-0.38, 0.1)} ${P(-0.38, 0)}Z`;
  const paint = p.c(color);
  const stroke = p.c(edge(color));
  const dark = p.c(DARK);
  const bodyEl = <path d={body} fill={paint} stroke={stroke} strokeLinejoin="round" {...p.line} />;
  const tires = box(-0.5, -0.2, -0.1, 0.1, 0.06) + box(0.22, 0.5, -0.075, 0.075, 0.05);
  const handlebar =
    box(0.235, 0.26, -0.42, 0.42, 0.012) +
    box(0.225, 0.27, -0.5, -0.36, 0.02) +
    box(0.225, 0.27, 0.36, 0.5, 0.02) +
    oval(0.285 * w, -0.33 * d, 0.012 * w, 0.04 * d) +
    oval(0.285 * w, 0.33 * d, 0.012 * w, 0.04 * d);
  const tiresEl = <path d={tires} fill={p.c(TIRE)} stroke={p.c('#16181B')} {...p.fine} />;
  const handlebarEl = <path d={handlebar} fill={dark} stroke={p.c('#16181B')} {...p.fine} />;
  // Body alone reads as a blob; tires and handlebar keep the thumb recognizable.
  if (!p.detail) {
    return (
      <g>
        {tiresEl}
        {bodyEl}
        {handlebarEl}
      </g>
    );
  }
  return (
    <g>
      {p.shadow && (
        <path
          d={oval(SHADOW.dx, SHADOW.dy, w * 0.48, d * 0.2)}
          fill={SHADOW.fill}
          fillOpacity={SHADOW.fillOpacity}
        />
      )}
      {tiresEl}
      <path
        d={box(-0.44, -0.1, 0.13, 0.24, 0.05)}
        fill={p.c(CHROME)}
        stroke={p.c(edge(CHROME))}
        {...p.fine}
      />
      {bodyEl}
      <path
        d={oval(0.1 * w, -0.02 * d, 0.07 * w, 0.09 * d)}
        fill={p.c(shade(color, 0.22))}
        stroke={stroke}
        strokeOpacity={0.6}
        {...p.fine}
      />
      <path
        d={box(-0.31, -0.02, -0.13, 0.13, 0.06)}
        fill={dark}
        stroke={p.c('#16181B')}
        {...p.fine}
      />
      {handlebarEl}
      <path
        d={oval(0.285 * w, 0, 0.016 * w, 0.07 * d)}
        fill={p.c('#FFF6D5')}
        stroke={stroke}
        {...p.fine}
      />
      <path
        d={box(-0.395, -0.375, -0.06, 0.06, 0.02)}
        fill={p.c('#C8372F')}
        stroke={stroke}
        {...p.fine}
      />
    </g>
  );
}

export default defineItem({
  type: 'motorcycle',
  label: 'Moto',
  category: 'garage',
  keywords: ['moto', 'motocicleta', 'motoca', 'scooter', 'veículo', 'veiculo', 'garagem', 'vaga'],
  size: { w: 2100, d: 800 },
  min: { w: 1700, d: 650 },
  max: { w: 2500, d: 1000 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#C8352E',
  colors: ['#C8352E', '#2A2D33', '#F4F5F7', '#B9BEC5', '#2F5D9E'],
  colorable: true,
  Symbol: MotorcycleSymbol,
});
