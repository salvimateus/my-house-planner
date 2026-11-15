import { strokeProps } from '../../../render/RenderContext.ts';
import {
  CERAMIC,
  CERAMIC_COLORS,
  clamp,
  corner,
  detailPen,
  ellipse,
  hasDetails,
  line,
  mono,
  outlinePen,
  paint,
  rrect,
  STEEL,
  shadow,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function ShowerBox({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, CERAMIC);
  const hw = w / 2;
  const hd = d / 2;
  const tray = rrect(0, 0, w, d, corner(w, d, 30));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={tray} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;

  const inset = clamp(Math.min(w, d) * 0.06, 30, 60);
  const ix = hw - inset;
  const iy = hd - inset;
  // The drain sits at the center; slope lines run from the inner corners to it.
  const drainR = clamp(Math.min(w, d) * 0.06, 35, 55);
  const k = drainR / Math.hypot(ix, iy);
  const slopes =
    line(-ix, -iy, -ix * k, -iy * k) +
    line(ix, -iy, ix * k, -iy * k) +
    line(-ix, iy, -ix * k, iy * k) +
    line(ix, iy, ix * k, iy * k);
  const slots =
    line(-drainR * 0.5, -drainR * 0.35, drainR * 0.5, -drainR * 0.35) +
    line(-drainR * 0.6, 0, drainR * 0.6, 0) +
    line(-drainR * 0.5, drainR * 0.35, drainR * 0.5, drainR * 0.35);
  const headY = -hd + clamp(d * 0.16, 110, 190);
  const glass = mono(ctx, ctx.theme.glass);
  const gy = hd - 12;
  const overlap = w * 0.1;
  const steel = mono(ctx, STEEL.stroke);
  return (
    <g>
      {sh && <path d={tray} {...sh} />}
      <path d={tray} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path
        d={rrect(0, 0, w - inset * 2, d - inset * 2, 20)}
        fill="none"
        {...detailPen(ctx, p.detail)}
      />
      <path d={slopes} fill="none" {...detailPen(ctx, p.detail)} />
      <path d={ellipse(0, 0, drainR)} fill={mono(ctx, STEEL.fill)} {...detailPen(ctx, steel)} />
      <path d={slots} fill="none" {...detailPen(ctx, steel)} />
      <path
        d={line(0, -hd, 0, headY)}
        fill="none"
        stroke={steel}
        strokeLinecap="round"
        {...strokeProps(ctx, 2, 0.3)}
      />
      <path
        d={ellipse(0, headY, clamp(w * 0.08, 45, 80))}
        fill={mono(ctx, STEEL.fill)}
        {...outlinePen(ctx, steel)}
      />
      <path
        d={line(-hw + 15, gy - 14, overlap, gy - 14) + line(-overlap, gy, hw - 15, gy)}
        fill="none"
        stroke={glass}
        strokeLinecap="round"
        {...strokeProps(ctx, 2.5, 0.35)}
      />
    </g>
  );
}

export default defineItem({
  type: 'shower-box',
  label: 'Box de chuveiro',
  category: 'bathroom',
  keywords: ['box', 'chuveiro', 'ducha', 'banho', 'banheiro', 'vidro'],
  size: { w: 900, d: 900 },
  min: { w: 700, d: 700 },
  max: { w: 1800, d: 1800 },
  variants: [
    { id: 's80', label: '80 × 80 cm', w: 800, d: 800 },
    { id: 's90', label: '90 × 90 cm', w: 900, d: 900 },
    { id: 's90x120', label: '90 × 120 cm', w: 900, d: 1200 },
    { id: 's90x140', label: '90 × 140 cm', w: 900, d: 1400 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: CERAMIC.fill,
  colors: CERAMIC_COLORS,
  colorable: true,
  Symbol: ShowerBox,
});
