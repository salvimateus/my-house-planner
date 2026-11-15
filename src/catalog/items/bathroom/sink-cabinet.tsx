import {
  CERAMIC,
  clamp,
  corner,
  detailPen,
  ellipse,
  fixed,
  hasDetails,
  line,
  mono,
  outlinePen,
  paint,
  rrect,
  STONE,
  STONE_COLORS,
  shadow,
  WATER,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function SinkCabinet({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, STONE);
  const c = fixed(ctx, CERAMIC);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;

  const count = w >= 1150 ? 2 : 1;
  const slot = w / count;
  const rx = clamp(slot * 0.34, 120, 260);
  const ry = clamp(d * 0.29, 90, 190);
  const cy = d * 0.07;
  let basins = '';
  let water = '';
  let drains = '';
  let faucets = '';
  for (let i = 0; i < count; i++) {
    const cx = -hw + slot * (i + 0.5);
    basins += ellipse(cx, cy, rx, ry);
    water += ellipse(cx, cy + ry * 0.06, rx * 0.8, ry * 0.76);
    drains += ellipse(cx, cy + ry * 0.12, 18);
    faucets += rrect(cx, cy - ry - 45, 40, 70, 15);
  }
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path
        d={line(-hw + 20, -hd + 30, hw - 20, -hd + 30)}
        fill="none"
        {...detailPen(ctx, p.detail)}
      />
      <path d={basins} fill={c.fill} {...outlinePen(ctx, c.stroke)} />
      <path d={water} fill={mono(ctx, WATER)} {...detailPen(ctx, c.detail)} />
      <path d={drains} fill={c.detail} />
      <path d={faucets} fill={c.fill} {...detailPen(ctx, c.stroke)} />
    </g>
  );
}

export default defineItem({
  type: 'sink-cabinet',
  label: 'Gabinete com pia',
  category: 'bathroom',
  keywords: ['pia', 'cuba', 'lavatório', 'gabinete', 'bancada', 'banheiro', 'lavabo'],
  size: { w: 600, d: 450 },
  min: { w: 400, d: 350 },
  max: { w: 1800, d: 600 },
  variants: [
    { id: 'w50', label: '50 cm', w: 500, d: 450 },
    { id: 'w60', label: '60 cm', w: 600, d: 450 },
    { id: 'w80', label: '80 cm', w: 800, d: 450 },
    { id: 'w100', label: '1 m', w: 1000, d: 450 },
    { id: 'w120', label: '1,20 m (2 cubas)', w: 1200, d: 450 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: STONE.fill,
  colors: STONE_COLORS,
  colorable: true,
  Symbol: SinkCabinet,
});
