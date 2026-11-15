import type { ReactElement } from 'react';
import { clamp, corner, edge, n, pen, SHADOW, shade } from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const WOOD = '#E7D3B5';

function LoungeChairSymbol({ w, d, color, mirrored, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const r = corner(w, d);
  const side = mirrored ? 1 : -1;
  const frame = clamp(d * 0.07, 25, 60);
  const cw = w - frame * 2;
  const cd = d - frame * 2;
  // Head end holds the raised backrest and a pillow; the rest is the seat cushion.
  const back = cw * 0.34;
  const hinge = side * (cw / 2 - back);
  const headX = side < 0 ? -cw / 2 : hinge;
  const pillowW = Math.min(back * 0.42, 300);
  const pillowX = side < 0 ? -cw / 2 + cw * 0.03 : cw / 2 - cw * 0.03 - pillowW;
  const tufts = clamp(Math.round((cw - back) / 300), 1, 8);
  let quilt = '';
  for (let i = 1; i <= tufts; i++) {
    const x = n(hinge - side * (((cw - back) * i) / (tufts + 1)));
    quilt += `M${x} ${n(-cd * 0.32)}V${n(cd * 0.32)}`;
  }
  const fabric = p.c(color);
  const fabricEdge = p.c(edge(color));
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
        fill={p.c(WOOD)}
        stroke={p.c(edge(WOOD))}
        {...p.line}
      />
      {p.detail && (
        <>
          <rect
            x={n(-cw / 2)}
            y={n(-cd / 2)}
            width={n(cw)}
            height={n(cd)}
            rx={n(r * 1.4)}
            fill={fabric}
            stroke={fabricEdge}
            {...p.fine}
          />
          <rect
            x={n(headX)}
            y={n(-cd / 2)}
            width={n(back)}
            height={n(cd)}
            rx={n(r * 1.4)}
            fill={p.c(shade(color, 0.18))}
            stroke={fabricEdge}
            {...p.line}
          />
          <rect
            x={n(pillowX)}
            y={n(-cd * 0.38)}
            width={n(pillowW)}
            height={n(cd * 0.76)}
            rx={n(Math.min(pillowW, cd) * 0.3)}
            fill={p.c(shade(color, 0.42))}
            stroke={fabricEdge}
            {...p.fine}
          />
          <path d={quilt} fill="none" stroke={fabricEdge} strokeOpacity={0.6} {...p.fine} />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'lounge-chair',
  label: 'Espreguiçadeira',
  category: 'outdoor',
  keywords: ['espreguiçadeira', 'espreguicadeira', 'piscina', 'chaise', 'sol', 'deck', 'descanso'],
  size: { w: 1900, d: 700 },
  min: { w: 1500, d: 550 },
  max: { w: 2200, d: 900 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#C9D3E0',
  colors: ['#C9D3E0', '#F4EFE6', '#7FA7C9', '#E8C36A', '#9BB98A'],
  colorable: true,
  Symbol: LoungeChairSymbol,
});
