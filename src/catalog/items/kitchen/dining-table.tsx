import { defineItem, type SymbolProps } from '../../types.ts';
import {
  corner,
  detail,
  FABRIC,
  fixed,
  hasDetails,
  outline,
  paint,
  rrect,
  shadow,
  WOOD,
  WOOD_COLORS,
} from '../bathroom/symbolKit.ts';
import { addChair, type ChairPaths } from './chairs.ts';

const SEAT_PITCH = 550;

function DiningTable({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, WOOD);
  const c = fixed(ctx, FABRIC);
  const hw = w / 2;
  const hd = d / 2;
  const top = rrect(0, 0, w, d, corner(w, d, 40));
  if (!hasDetails(ctx)) return <path d={top} fill={p.fill} {...outline(ctx, p.stroke)} />;
  // Chairs sit outside the table box, tucked under its edge.
  const perSide = Math.max(1, Math.floor(w / SEAT_PITCH));
  const chairs: ChairPaths = { seats: '', backs: '' };
  for (let i = 0; i < perSide; i++) {
    const x = -hw + (w * (i + 0.5)) / perSide;
    addChair(chairs, x, -hd, -Math.PI / 2);
    addChair(chairs, x, hd, Math.PI / 2);
  }
  if (d >= 900) {
    addChair(chairs, -hw, 0, Math.PI);
    addChair(chairs, hw, 0, 0);
  }
  const sh = shadow(ctx);
  return (
    <g>
      {sh && <path d={chairs.seats + top} {...sh} />}
      <path d={chairs.seats} fill={c.fill} {...outline(ctx, c.stroke)} />
      <path d={chairs.backs} fill={c.stroke} {...detail(ctx, c.stroke)} />
      <path d={top} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path
        d={rrect(0, 0, w - 70, d - 70, corner(w, d, 25))}
        fill="none"
        {...detail(ctx, p.detail)}
      />
    </g>
  );
}

export default defineItem({
  type: 'dining-table',
  label: 'Mesa de jantar',
  category: 'kitchen',
  keywords: ['mesa', 'jantar', 'cadeiras', 'lugares', 'sala de jantar', 'refeição', 'cozinha'],
  size: { w: 1200, d: 800 },
  min: { w: 600, d: 600 },
  max: { w: 3200, d: 1400 },
  variants: [
    { id: 'seats4', label: '4 lugares', w: 1200, d: 800 },
    { id: 'seats6', label: '6 lugares', w: 1600, d: 900 },
    { id: 'seats8', label: '8 lugares', w: 2000, d: 1000 },
  ],
  wallSnap: 'none',
  layer: 'furniture',
  color: WOOD.fill,
  colors: WOOD_COLORS,
  colorable: true,
  Symbol: DiningTable,
});
