import type { ReactElement } from 'react';
import { blob, clamp, corner, edge, n, pen, SHADOW } from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const LEAF = '#7BB661';

function PlanterSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const r = corner(w, d);
  const rim = clamp(Math.min(w, d) * 0.14, 25, 60);
  const soilW = w - rim * 2;
  const soilD = d - rim * 2;
  const count = clamp(Math.round(soilW / 320), 1, 10);
  const pitch = soilW / count;
  const ry = soilD * 0.58;
  const rx = Math.min(pitch * 0.62, ry * 1.25);
  let plants = '';
  for (let i = 0; i < count; i++) {
    const cx = -soilW / 2 + pitch * (i + 0.5);
    plants += blob(cx, 0, rx, ry, 7, 20 + i, 0.72);
  }
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
        stroke={p.c(edge(color))}
        {...p.line}
      />
      {p.detail && (
        <>
          <rect
            x={n(-soilW / 2)}
            y={n(-soilD / 2)}
            width={n(soilW)}
            height={n(soilD)}
            rx={n(r / 2)}
            fill={p.c('#8A6A4F')}
            stroke={p.c(edge(color))}
            {...p.fine}
          />
          <path
            d={plants}
            fill={p.c(LEAF)}
            stroke={p.c(edge(LEAF))}
            strokeLinejoin="round"
            {...p.fine}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'planter',
  label: 'Jardineira',
  category: 'outdoor',
  keywords: ['jardineira', 'floreira', 'vaso', 'canteiro', 'plantas', 'flores', 'jardim'],
  size: { w: 2000, d: 500 },
  min: { w: 300, d: 250 },
  max: { w: 6000, d: 1500 },
  wallSnap: 'back',
  layer: 'furniture',
  color: '#C8825F',
  colors: ['#C8825F', '#B8B4AC', '#E7D3B5', '#6E747C'],
  colorable: true,
  Symbol: PlanterSymbol,
});
