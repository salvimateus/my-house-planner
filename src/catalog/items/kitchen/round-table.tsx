import { defineItem, type SymbolProps } from '../../types.ts';
import {
  detail,
  ellipse,
  FABRIC,
  fixed,
  hasDetails,
  outline,
  paint,
  shadow,
  WOOD,
  WOOD_COLORS,
} from '../bathroom/symbolKit.ts';
import { addChair, type ChairPaths } from './chairs.ts';

const SEAT_ARC = 700;

function RoundTable({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, WOOD);
  const c = fixed(ctx, FABRIC);
  const rx = w / 2;
  const ry = d / 2;
  const top = ellipse(0, 0, rx, ry);
  if (!hasDetails(ctx)) return <path d={top} fill={p.fill} {...outline(ctx, p.stroke)} />;
  const count = Math.max(2, Math.floor((Math.PI * Math.min(w, d)) / SEAT_ARC));
  const chairs: ChairPaths = { seats: '', backs: '' };
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    addChair(chairs, Math.cos(a) * rx, Math.sin(a) * ry, a);
  }
  const sh = shadow(ctx);
  return (
    <g>
      {sh && <path d={chairs.seats + top} {...sh} />}
      <path d={chairs.seats} fill={c.fill} {...outline(ctx, c.stroke)} />
      <path d={chairs.backs} fill={c.stroke} {...detail(ctx, c.stroke)} />
      <path d={top} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path d={ellipse(0, 0, rx - 35, ry - 35)} fill="none" {...detail(ctx, p.detail)} />
    </g>
  );
}

export default defineItem({
  type: 'round-table',
  label: 'Mesa redonda',
  category: 'kitchen',
  keywords: ['mesa', 'redonda', 'jantar', 'cadeiras', 'lugares', 'cozinha'],
  size: { w: 1000, d: 1000 },
  min: { w: 600, d: 600 },
  max: { w: 1800, d: 1800 },
  variants: [
    { id: 'd80', label: 'Ø 80 cm', w: 800, d: 800 },
    { id: 'd100', label: 'Ø 1 m', w: 1000, d: 1000 },
    { id: 'd120', label: 'Ø 1,20 m', w: 1200, d: 1200 },
  ],
  wallSnap: 'none',
  layer: 'furniture',
  color: WOOD.fill,
  colors: WOOD_COLORS,
  colorable: true,
  keepAspect: true,
  Symbol: RoundTable,
});
