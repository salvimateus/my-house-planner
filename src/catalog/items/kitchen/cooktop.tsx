import {
  clamp,
  corner,
  detailPen,
  ellipse,
  GLASS_TOP,
  hasDetails,
  mix,
  outlinePen,
  paint,
  rrect,
  shadow,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';
import { burnerCount, burnerPaths } from './burners.ts';

function Cooktop({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, GLASS_TOP);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d, 30));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const strip = clamp(d * 0.14, 50, 80);
  const b = burnerPaths(-hw + 25, -hd + 25, w - 50, d - strip - 40);
  const n = burnerCount(w - 50);
  let dots = '';
  for (let i = 0; i < n; i++) {
    dots += ellipse(-hw + (w * (i + 0.5)) / n, hd - strip / 2 - 5, clamp(w / n / 9, 8, 16));
  }
  // Light marks over a dark glass; the mix keeps them readable on custom colors too.
  const ring = mix(p.fill, '#FFFFFF', 0.45);
  const cap = mix(p.fill, '#FFFFFF', 0.22);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path d={b.rings} fill="none" {...detailPen(ctx, ring)} />
      <path d={b.caps} fill={cap} />
      <path d={dots} fill={ring} />
    </g>
  );
}

export default defineItem({
  type: 'cooktop',
  label: 'Cooktop',
  category: 'kitchen',
  keywords: ['cooktop', 'fogão', 'bocas', 'indução', 'cozinha', 'bancada'],
  size: { w: 600, d: 500 },
  min: { w: 300, d: 450 },
  max: { w: 900, d: 550 },
  variants: [
    { id: 'b2', label: '2 bocas', w: 300, d: 500 },
    { id: 'b4', label: '4 bocas', w: 600, d: 500 },
    { id: 'b5', label: '5 bocas', w: 750, d: 520 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: GLASS_TOP.fill,
  colors: [GLASS_TOP.fill, '#C9CED6'],
  colorable: true,
  Symbol: Cooktop,
});
