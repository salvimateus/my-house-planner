import {
  APPLIANCE,
  APPLIANCE_COLORS,
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
  shadow,
  WATER,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function Dishwasher({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, APPLIANCE);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const panel = clamp(d * 0.13, 55, 90);
  const rackTop = -hd + 50;
  const rackBottom = hd - panel - 40;
  const rackH = rackBottom - rackTop;
  // Plates standing in the rack, seen from above as rows of thin slots.
  const rows = 2;
  const cols = Math.max(3, Math.floor((w - 120) / 55));
  let tines = '';
  for (let r = 0; r < rows; r++) {
    const y0 = rackTop + (rackH * r) / rows + 25;
    const y1 = rackTop + (rackH * (r + 1)) / rows - 25;
    for (let c = 0; c < cols; c++) {
      const x = -hw + 60 + ((w - 120) * (c + 0.5)) / cols;
      tines += line(x, y0, x, y1);
    }
  }
  const panelY = hd - panel / 2;
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path
        d={rrect(0, (rackTop + rackBottom) / 2, w - 70, rackH + 10, 25)}
        fill={mono(ctx, WATER)}
        {...detailPen(ctx, p.detail)}
      />
      <path d={tines} fill="none" {...detailPen(ctx, p.stroke)} />
      <path
        d={rrect(0, panelY, w - 20, panel - 14, 15)}
        fill={p.detail}
        {...detailPen(ctx, p.stroke)}
      />
      <path d={ellipse(hw - 70, panelY, 14) + ellipse(hw - 120, panelY, 14)} fill={p.fill} />
    </g>
  );
}

export default defineItem({
  type: 'dishwasher',
  label: 'Lava-louças',
  category: 'kitchen',
  keywords: ['lava-louças', 'lava louças', 'máquina de lavar louça', 'louça', 'cozinha'],
  size: { w: 600, d: 600 },
  min: { w: 450, d: 500 },
  max: { w: 700, d: 700 },
  variants: [
    { id: 'w45', label: '45 cm', w: 450, d: 600 },
    { id: 'w60', label: '60 cm', w: 600, d: 600 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: APPLIANCE.fill,
  colors: APPLIANCE_COLORS,
  colorable: true,
  Symbol: Dishwasher,
});
