import {
  clamp,
  corner,
  detailPen,
  hasDetails,
  line,
  outlinePen,
  paint,
  rrect,
  shadow,
  WOOD,
  WOOD_COLORS,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function TallCabinet({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, WOOD);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d, 30));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const door = clamp(d * 0.05, 18, 30);
  const doors = Math.max(1, Math.round(w / 500));
  let splits = '';
  for (let i = 1; i < doors; i++) {
    const x = -hw + (w * i) / doors;
    splits += line(x, hd - door, x, hd - 4);
  }
  const cy = hd - door;
  // A cross marks a full-height unit in plan drawings.
  const cross =
    line(-hw + 40, -hd + 40, hw - 40, cy - 30) + line(hw - 40, -hd + 40, -hw + 40, cy - 30);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path d={cross} fill="none" {...detailPen(ctx, p.detail)} />
      <path d={line(-hw + 6, cy, hw - 6, cy) + splits} fill="none" {...detailPen(ctx, p.stroke)} />
    </g>
  );
}

export default defineItem({
  type: 'tall-cabinet',
  label: 'Armário alto (torre)',
  category: 'kitchen',
  keywords: ['armário', 'torre', 'paneleiro', 'despensa', 'forno embutido', 'cozinha'],
  size: { w: 600, d: 600 },
  min: { w: 300, d: 300 },
  max: { w: 1500, d: 700 },
  variants: [
    { id: 'w40', label: '40 cm', w: 400, d: 600 },
    { id: 'w60', label: '60 cm', w: 600, d: 600 },
    { id: 'w90', label: '90 cm', w: 900, d: 600 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colors: WOOD_COLORS,
  colorable: true,
  Symbol: TallCabinet,
});
