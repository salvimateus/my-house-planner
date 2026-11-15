import type { ReactElement } from 'react';
import { clamp, corner, edge, n, pen, SHADOW } from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const STEEL = '#F1F3F6';

function GourmetCounterSymbol({ w, d, color, mirrored, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const r = corner(w, d);
  const stroke = p.c(edge(color));
  const side = mirrored ? -1 : 1;
  // Sink basin toward one end, faucet behind it, backsplash line along the wall.
  const sinkW = clamp(w * 0.28, 300, 600);
  const sinkD = clamp(d * 0.62, 250, 450);
  const sinkCx = side * (w / 2 - Math.max(w * 0.06, 80) - sinkW / 2);
  const sinkCy = d * 0.06;
  const faucetY = sinkCy - sinkD / 2 - Math.min(45, d * 0.08);
  const splashY = n(-d / 2 + Math.min(25, d * 0.05));
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
          <path
            d={`M${n(-w / 2 + r)} ${splashY}H${n(w / 2 - r)}`}
            fill="none"
            stroke={stroke}
            {...p.fine}
          />
          <rect
            x={n(sinkCx - sinkW / 2)}
            y={n(sinkCy - sinkD / 2)}
            width={n(sinkW)}
            height={n(sinkD)}
            rx={n(Math.min(60, sinkD / 4))}
            fill={p.c(STEEL)}
            stroke={p.c(edge(STEEL))}
            {...p.line}
          />
          <circle
            cx={n(sinkCx)}
            cy={n(sinkCy + sinkD * 0.12)}
            r={n(Math.min(25, sinkD * 0.08))}
            fill="none"
            stroke={p.c(edge(STEEL))}
            {...p.fine}
          />
          <path
            d={`M${n(sinkCx)} ${n(faucetY)}V${n(sinkCy - sinkD * 0.2)}`}
            fill="none"
            stroke={p.c('#8A93A0')}
            strokeLinecap="round"
            strokeWidth={n(Math.min(22, d * 0.04))}
          />
          <circle
            cx={n(sinkCx)}
            cy={n(faucetY)}
            r={n(Math.min(28, d * 0.05))}
            fill={p.c('#C3C9D1')}
            stroke={p.c('#8A93A0')}
            {...p.fine}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'gourmet-counter',
  label: 'Bancada gourmet',
  category: 'outdoor',
  keywords: ['bancada', 'gourmet', 'pia', 'cuba', 'balcão', 'churrasco', 'área gourmet', 'granito'],
  size: { w: 2000, d: 600 },
  min: { w: 800, d: 450 },
  max: { w: 5000, d: 900 },
  wallSnap: 'back',
  layer: 'furniture',
  color: '#E4E0DA',
  colors: ['#E4E0DA', '#3F3F44', '#F4F2EE', '#E7D3B5'],
  colorable: true,
  Symbol: GourmetCounterSymbol,
});
