import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { clamp, corner, edge, n, pen, SHADOW, shade } from './kit.ts';

function BbqSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const r = corner(w, d);
  const stroke = p.c(edge(color));
  const wall = clamp(Math.min(w, d) * 0.1, 40, 90);
  // Chimney hood at the back, fire box with the grill in front of it.
  const hoodW = w * 0.5;
  const hoodD = d * 0.36;
  const hoodY = -d / 2 + wall * 0.5;
  const flue = Math.min(hoodW, hoodD) * 0.55;
  const boxX = -w / 2 + wall;
  const boxW = w - wall * 2;
  const boxY = hoodY + hoodD;
  const boxD = d / 2 - wall * 1.4 - boxY;
  const bars = clamp(Math.round(boxW / 45), 4, 24);
  let grill = '';
  for (let i = 1; i < bars; i++) {
    const x = n(boxX + (boxW * i) / bars);
    grill += `M${x} ${n(boxY + 12)}V${n(boxY + boxD - 12)}`;
  }
  const lipY = n(d / 2 - wall * 0.7);
  return (
    <g>
      {p.shadow && (
        <rect
          x={n(-w / 2 + SHADOW.dx)}
          y={n(-d / 2 + SHADOW.dy)}
          width={w}
          height={d}
          rx={r}
          fill={SHADOW.fill}
          fillOpacity={SHADOW.fillOpacity}
        />
      )}
      <rect
        x={n(-w / 2)}
        y={n(-d / 2)}
        width={w}
        height={d}
        rx={r}
        fill={p.c(color)}
        stroke={stroke}
        {...p.line}
      />
      {p.detail && (
        <>
          <rect
            x={n(boxX)}
            y={n(boxY)}
            width={n(boxW)}
            height={n(Math.max(boxD, 10))}
            rx={n(r / 2)}
            fill={p.c('#4A4440')}
            stroke={stroke}
            {...p.fine}
          />
          <path d={grill} fill="none" stroke={p.c('#A8A29A')} strokeLinecap="round" {...p.fine} />
          <rect
            x={n(-hoodW / 2)}
            y={n(hoodY)}
            width={n(hoodW)}
            height={n(hoodD)}
            rx={n(r / 2)}
            fill={p.c(shade(color, 0.25))}
            stroke={stroke}
            {...p.line}
          />
          <rect
            x={n(-flue / 2)}
            y={n(hoodY + (hoodD - flue) / 2)}
            width={n(flue)}
            height={n(flue)}
            rx={n(flue * 0.12)}
            fill={p.c('#3A3532')}
            stroke={stroke}
            {...p.fine}
          />
          <path
            d={`M${n(-w / 2 + wall)} ${lipY}H${n(w / 2 - wall)}`}
            fill="none"
            stroke={stroke}
            {...p.fine}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'bbq',
  label: 'Churrasqueira',
  category: 'outdoor',
  keywords: [
    'churrasqueira',
    'churrasco',
    'pré-moldada',
    'pre-moldada',
    'grelha',
    'chaminé',
    'gourmet',
    'carvão',
  ],
  size: { w: 900, d: 600 },
  min: { w: 600, d: 450 },
  max: { w: 2000, d: 1000 },
  wallSnap: 'back',
  layer: 'furniture',
  color: '#D6CFC4',
  colors: ['#D6CFC4', '#C46A4E', '#B8B4AC', '#F1EEE8'],
  colorable: true,
  Symbol: BbqSymbol,
});
