import {
  CERAMIC,
  CERAMIC_COLORS,
  clamp,
  corner,
  detailPen,
  ellipse,
  fixed,
  hasDetails,
  mirror,
  mono,
  outlinePen,
  paint,
  rrect,
  STEEL,
  shadow,
  WATER,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function Bathtub({ w, d, color, mirrored, ctx }: SymbolProps) {
  const p = paint(ctx, color, CERAMIC);
  const s = fixed(ctx, STEEL);
  const hw = w / 2;
  const body = rrect(0, 0, w, d, corner(w, d, 40));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const rim = clamp(d * 0.1, 50, 90);
  const deck = clamp(w * 0.08, 70, 160);
  const iw = w - rim - deck;
  const ih = d - rim * 2;
  const icx = (-hw + deck + hw - rim) / 2;
  const drainX = -hw + deck + clamp(iw * 0.12, 80, 160);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <g transform={mirror(mirrored)}>
        <path
          d={rrect(icx, 0, iw, ih, Math.min(ih / 2, 260))}
          fill={mono(ctx, WATER)}
          {...detailPen(ctx, p.stroke)}
        />
        <path d={ellipse(drainX, 0, 22)} fill={s.fill} {...detailPen(ctx, s.stroke)} />
        <path
          d={rrect(-hw + deck / 2, 0, clamp(deck * 0.4, 30, 50), 110, 12)}
          fill={s.fill}
          {...detailPen(ctx, s.stroke)}
        />
        <path
          d={ellipse(-hw + deck / 2, -ih * 0.32, 16) + ellipse(-hw + deck / 2, ih * 0.32, 16)}
          fill={s.detail}
        />
      </g>
    </g>
  );
}

export default defineItem({
  type: 'bathtub',
  label: 'Banheira',
  category: 'bathroom',
  keywords: ['banheira', 'banho', 'hidro', 'ofurô', 'banheiro'],
  size: { w: 1700, d: 700 },
  min: { w: 1200, d: 600 },
  max: { w: 2100, d: 1000 },
  variants: [
    { id: 'b150', label: '150 × 70 cm', w: 1500, d: 700 },
    { id: 'b170', label: '170 × 70 cm', w: 1700, d: 700 },
    { id: 'b180', label: '180 × 80 cm', w: 1800, d: 800 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: CERAMIC.fill,
  colors: CERAMIC_COLORS,
  colorable: true,
  Symbol: Bathtub,
});
