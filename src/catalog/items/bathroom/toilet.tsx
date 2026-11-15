import {
  CERAMIC,
  CERAMIC_COLORS,
  clamp,
  corner,
  detailPen,
  ellipse,
  hasDetails,
  mono,
  outlinePen,
  paint,
  rrect,
  shadow,
  WATER,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function Toilet({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, CERAMIC);
  const hd = d / 2;
  const tankD = clamp(d * 0.27, 120, 230);
  const tankW = w;
  const tankCy = -hd + tankD / 2;
  const bowlTop = -hd + tankD - 40;
  const bowlRy = (hd - bowlTop) / 2;
  const bowlCy = bowlTop + bowlRy;
  const bowlRx = w * 0.43;
  const tank = rrect(0, tankCy, tankW, tankD, corner(tankW, tankD));
  const bowl = ellipse(0, bowlCy, bowlRx, bowlRy);
  const sh = shadow(ctx);
  if (!hasDetails(ctx))
    return <path d={tank + bowl} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  return (
    <g>
      {sh && <path d={tank + bowl} {...sh} />}
      <path d={bowl} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path
        d={ellipse(0, bowlCy + bowlRy * 0.1, bowlRx * 0.74, bowlRy * 0.72)}
        fill={p.fill}
        {...detailPen(ctx, p.detail)}
      />
      <path
        d={ellipse(0, bowlCy + bowlRy * 0.18, bowlRx * 0.46, bowlRy * 0.44)}
        fill={mono(ctx, WATER)}
        {...detailPen(ctx, p.detail)}
      />
      <path d={tank} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path
        d={rrect(0, tankCy, tankW - 60, tankD - 50, corner(tankW, tankD, 25))}
        fill="none"
        {...detailPen(ctx, p.detail)}
      />
      <path d={ellipse(0, tankCy, clamp(tankD * 0.18, 15, 30))} fill={p.detail} />
    </g>
  );
}

export default defineItem({
  type: 'toilet',
  label: 'Vaso sanitário',
  category: 'bathroom',
  keywords: ['vaso', 'privada', 'bacia', 'sanitário', 'banheiro', 'wc', 'caixa acoplada'],
  size: { w: 400, d: 650 },
  min: { w: 340, d: 500 },
  max: { w: 500, d: 800 },
  wallSnap: 'back',
  layer: 'furniture',
  color: CERAMIC.fill,
  colors: CERAMIC_COLORS,
  colorable: true,
  Symbol: Toilet,
});
