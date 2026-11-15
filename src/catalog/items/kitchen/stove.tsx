import {
  APPLIANCE,
  APPLIANCE_COLORS,
  clamp,
  corner,
  DARK,
  detailPen,
  ellipse,
  hasDetails,
  mono,
  outlinePen,
  paint,
  rrect,
  shadow,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';
import { burnerCount, burnerPaths } from './burners.ts';

function Stove({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, APPLIANCE);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const guard = clamp(d * 0.1, 40, 80);
  const knobBand = clamp(d * 0.13, 55, 90);
  const top = { x: -hw + 30, y: -hd + guard + 15, w: w - 60, h: d - guard - knobBand - 30 };
  const b = burnerPaths(top.x, top.y, top.w, top.h);
  const knobs = burnerCount(top.w) + 1;
  const knobY = hd - knobBand / 2;
  let knobPath = '';
  for (let i = 0; i < knobs; i++) {
    knobPath += ellipse(-hw + (w * (i + 0.5)) / knobs, knobY, clamp(w / knobs / 4, 12, 22));
  }
  const dark = mono(ctx, DARK);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path
        d={rrect(0, -hd + guard / 2, w - 20, guard - 10, 15)}
        fill={p.detail}
        {...detailPen(ctx, p.stroke)}
      />
      <path
        d={rrect(top.x + top.w / 2, top.y + top.h / 2, top.w, top.h, 25)}
        fill="none"
        {...detailPen(ctx, p.detail)}
      />
      <path d={b.rings} fill="none" {...detailPen(ctx, dark)} />
      <path d={b.caps} fill={dark} />
      <path d={knobPath} fill={p.fill} {...detailPen(ctx, p.stroke)} />
    </g>
  );
}

export default defineItem({
  type: 'stove',
  label: 'Fogão',
  category: 'kitchen',
  keywords: ['fogão', 'forno', 'bocas', 'cozinha', 'gás'],
  size: { w: 550, d: 600 },
  min: { w: 450, d: 500 },
  max: { w: 950, d: 750 },
  variants: [
    { id: 'b4', label: '4 bocas', w: 550, d: 600 },
    { id: 'b5', label: '5 bocas', w: 760, d: 660 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: APPLIANCE.fill,
  colors: APPLIANCE_COLORS,
  colorable: true,
  Symbol: Stove,
});
