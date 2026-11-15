import type { ReactElement } from 'react';
import { clamp, corner, edge, n, pen, SHADOW } from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function AcSplitSymbol({ w, d, color, mirrored, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const r = corner(w, d);
  const stroke = p.c(edge(color));
  const side = mirrored ? -1 : 1;
  const pad = Math.max(w * 0.05, 30);
  // Intake grille on top toward the wall, air flap along the front edge.
  const slots = clamp(Math.round((w - pad * 2) / 60), 4, 30);
  const y0 = n(-d / 2 + d * 0.16);
  const y1 = n(-d / 2 + d * 0.46);
  let grille = '';
  for (let i = 0; i <= slots; i++) {
    const x = n(-w / 2 + pad + ((w - pad * 2) * i) / slots);
    grille += `M${x} ${y0}V${y1}`;
  }
  const flapY = d / 2 - d * 0.3;
  const flapH = d * 0.2;
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
          <path d={grille} fill="none" stroke={stroke} strokeLinecap="round" {...p.fine} />
          <rect
            x={n(-w / 2 + pad)}
            y={n(flapY)}
            width={n(w - pad * 2)}
            height={n(flapH)}
            rx={n(flapH / 2)}
            fill={p.c('#DDE2E8')}
            stroke={stroke}
            {...p.fine}
          />
          <circle
            cx={n(side * (w / 2 - pad * 1.4))}
            cy={n((-d / 2 + d * 0.46 + flapY) / 2)}
            r={n(Math.min(10, d * 0.05))}
            fill={p.c('#4FB477')}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'ac-split',
  label: 'Ar-condicionado split',
  category: 'structure',
  keywords: [
    'ar-condicionado',
    'ar condicionado',
    'split',
    'climatização',
    'evaporadora',
    'btu',
    'ar',
  ],
  size: { w: 900, d: 250 },
  min: { w: 600, d: 180 },
  max: { w: 1400, d: 350 },
  variants: [
    { id: '9000-btu', label: '9.000 BTUs', w: 800, d: 200 },
    { id: '18000-btu', label: '18.000 BTUs', w: 1000, d: 250 },
    { id: '24000-btu', label: '24.000 BTUs', w: 1100, d: 300 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: '#F1F3F6',
  colorable: false,
  Symbol: AcSplitSymbol,
});
