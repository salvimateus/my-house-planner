import {
  APPLIANCE,
  APPLIANCE_COLORS,
  clamp,
  corner,
  detailPen,
  FROST,
  hasDetails,
  line,
  mirror,
  mono,
  outlinePen,
  paint,
  rrect,
  shadow,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function snowflake(r: number): string {
  let s = '';
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 2;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    s += line(-dx, -dy, dx, dy);
  }
  return s;
}

function Fridge({ w, d, color, mirrored, ctx }: SymbolProps) {
  const p = paint(ctx, color, APPLIANCE);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const door = clamp(d * 0.09, 45, 80);
  const doorY = hd - door / 2;
  const twoDoors = w >= 850;
  const len = clamp(w * (twoDoors ? 0.12 : 0.2), 60, 160);
  const handles = twoDoors
    ? rrect(-25 - len / 2, doorY, len, 14, 7) + rrect(25 + len / 2, doorY, len, 14, 7)
    : rrect(-hw + 45 + len / 2, doorY, len, 14, 7);
  const coilY = -hd + clamp(d * 0.07, 30, 55);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path d={line(-hw + 40, coilY, hw - 40, coilY)} fill="none" {...detailPen(ctx, p.detail)} />
      <path d={rrect(0, doorY, w - 16, door - 8, 20)} fill={p.fill} {...detailPen(ctx, p.stroke)} />
      {twoDoors && (
        <path d={line(0, hd - door + 4, 0, hd - 4)} fill="none" {...detailPen(ctx, p.stroke)} />
      )}
      <g transform={mirror(mirrored && !twoDoors)}>
        <path d={handles} fill={p.detail} {...detailPen(ctx, p.stroke)} />
      </g>
      <path
        d={snowflake(clamp(Math.min(w, d) * 0.13, 50, 110))}
        fill="none"
        {...detailPen(ctx, mono(ctx, FROST))}
      />
    </g>
  );
}

export default defineItem({
  type: 'fridge',
  label: 'Geladeira',
  category: 'kitchen',
  keywords: ['geladeira', 'refrigerador', 'freezer', 'duplex', 'side by side', 'cozinha'],
  size: { w: 700, d: 720 },
  min: { w: 500, d: 550 },
  max: { w: 1000, d: 850 },
  variants: [
    { id: 'single', label: '1 porta', w: 700, d: 720 },
    { id: 'duplex', label: 'Duplex', w: 700, d: 750 },
    { id: 'side-by-side', label: 'Side by side', w: 910, d: 750 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: APPLIANCE.fill,
  colors: APPLIANCE_COLORS,
  colorable: true,
  Symbol: Fridge,
});
