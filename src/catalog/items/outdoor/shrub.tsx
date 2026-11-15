import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { blob, edge, pen, SHADOW, shade } from './kit.ts';

const LOBES = 12;
const SEED = 11;

function ShrubSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const [rx, ry] = [w / 2, d / 2];
  const stroke = p.c(edge(color));
  // Three leaf clumps give the bush its dense, layered look.
  const clumps =
    blob(-rx * 0.22, -ry * 0.18, rx * 0.42, ry * 0.42, 7, SEED + 1, 0.74) +
    blob(rx * 0.24, -ry * 0.06, rx * 0.36, ry * 0.36, 6, SEED + 2, 0.74) +
    blob(-rx * 0.02, ry * 0.26, rx * 0.36, ry * 0.36, 6, SEED + 3, 0.74);
  return (
    <g>
      {p.shadow && (
        <path
          d={blob(SHADOW.dx, SHADOW.dy, rx, ry, LOBES, SEED, 0.82)}
          fill={SHADOW.fill}
          fillOpacity={SHADOW.fillOpacity}
        />
      )}
      <path
        d={blob(0, 0, rx, ry, LOBES, SEED, 0.82)}
        fill={p.c(color)}
        stroke={stroke}
        strokeLinejoin="round"
        {...p.line}
      />
      {p.detail && (
        <>
          <path
            d={clumps}
            fill={p.c(shade(color, 0.14))}
            stroke={stroke}
            strokeOpacity={0.55}
            strokeLinejoin="round"
            {...p.fine}
          />
          <path
            d={blob(-rx * 0.28, -ry * 0.26, rx * 0.18, ry * 0.18, 5, SEED + 4, 0.72)}
            fill={p.c(shade(color, 0.32))}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'shrub',
  label: 'Arbusto',
  category: 'outdoor',
  keywords: ['arbusto', 'planta', 'jardim', 'moita', 'cerca viva', 'paisagismo', 'folhagem'],
  size: { w: 1000, d: 1000 },
  min: { w: 300, d: 300 },
  max: { w: 3000, d: 3000 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#5E9E48',
  colors: ['#5E9E48', '#7BB661', '#4F8A5B', '#D97FA8'],
  colorable: true,
  keepAspect: true,
  Symbol: ShrubSymbol,
});
