import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { n, pen } from '../outdoor/kit.ts';

// Same fill as the walls, so the pillar reads as part of the structure, like a cut section.
function PillarSymbol({ w, d, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const fill = p.c(ctx.theme.wall);
  return (
    <rect
      x={n(-w / 2)}
      y={n(-d / 2)}
      width={w}
      height={d}
      fill={fill}
      stroke={fill}
      strokeLinejoin="miter"
      {...p.line}
    />
  );
}

export default defineItem({
  type: 'pillar',
  label: 'Pilar',
  category: 'structure',
  keywords: ['pilar', 'coluna', 'estrutura', 'concreto', 'viga', 'sustentação', 'estrutural'],
  size: { w: 200, d: 200 },
  min: { w: 100, d: 100 },
  max: { w: 1000, d: 1000 },
  variants: [
    { id: '15x30', label: '15×30 cm', w: 150, d: 300 },
    { id: '20x40', label: '20×40 cm', w: 200, d: 400 },
    { id: '30x30', label: '30×30 cm', w: 300, d: 300 },
  ],
  wallSnap: 'none',
  layer: 'structure',
  color: '#3B4048',
  colorable: false,
  rotationStep: 90,
  Symbol: PillarSymbol,
});
