import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { blob, edge, n, pen, SHADOW, shade } from './kit.ts';

const LOBES = 9;
const SEED = 3;

function TreeSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const [rx, ry] = [w / 2, d / 2];
  const stroke = p.c(edge(color));
  // Branches radiate from the trunk, the classic top-view tree mark.
  let branches = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.35;
    const r = i % 2 === 0 ? 0.58 : 0.44;
    branches += `M0 0L${n(Math.cos(a) * rx * r)} ${n(Math.sin(a) * ry * r)}`;
  }
  return (
    <g>
      {p.shadow && (
        <path
          d={blob(SHADOW.dx, SHADOW.dy, rx, ry, LOBES, SEED)}
          fill={SHADOW.fill}
          fillOpacity={SHADOW.fillOpacity}
        />
      )}
      <path
        d={blob(0, 0, rx, ry, LOBES, SEED)}
        fill={p.c(color)}
        stroke={stroke}
        strokeLinejoin="round"
        {...p.line}
      />
      {p.detail && (
        <>
          <path
            d={blob(-rx * 0.08, -ry * 0.1, rx * 0.62, ry * 0.62, 7, SEED + 2, 0.78)}
            fill={p.c(shade(color, 0.16))}
          />
          <path
            d={blob(-rx * 0.16, -ry * 0.2, rx * 0.3, ry * 0.3, 5, SEED + 5, 0.75)}
            fill={p.c(shade(color, 0.32))}
          />
          <path
            d={branches}
            fill="none"
            stroke={stroke}
            strokeLinecap="round"
            strokeOpacity={0.7}
            {...p.fine}
          />
          <circle
            r={n(Math.min(w, d) * 0.045)}
            fill={p.c('#8B6B4A')}
            stroke={p.c('#6A4F35')}
            {...p.fine}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'tree',
  label: 'Árvore',
  category: 'outdoor',
  keywords: ['árvore', 'arvore', 'copa', 'jardim', 'paisagismo', 'sombra', 'planta', 'quintal'],
  size: { w: 3000, d: 3000 },
  min: { w: 1000, d: 1000 },
  max: { w: 10_000, d: 10_000 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#7BB661',
  colors: ['#7BB661', '#5E9E48', '#9CC26A', '#E39AC0', '#F2C84B'],
  colorable: true,
  keepAspect: true,
  Symbol: TreeSymbol,
});
