import { defineItem, type SymbolProps } from '../../types.ts';
import {
  APPLIANCE,
  APPLIANCE_COLORS,
  clamp,
  corner,
  DARK,
  detail,
  ellipse,
  hasDetails,
  ink,
  outline,
  paint,
  rrect,
  shadow,
  WATER,
} from '../bathroom/symbolKit.ts';

function WashingMachine({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, APPLIANCE);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />;
  const panel = clamp(d * 0.17, 80, 140);
  const panelY = -hd + panel / 2 + 10;
  const lidCy = (-hd + panel + 10 + hd) / 2;
  const lidR = Math.min(w * 0.38, (d - panel) * 0.4);
  const knobR = clamp(panel * 0.2, 14, 26);
  const dark = ink(ctx, DARK);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path
        d={rrect(0, panelY, w - 40, panel - 20, 18)}
        fill={p.detail}
        {...detail(ctx, p.stroke)}
      />
      <path
        d={ellipse(-hw + 60, panelY, knobR) + ellipse(hw - 60, panelY, knobR)}
        fill={p.fill}
        {...detail(ctx, p.stroke)}
      />
      <path d={rrect(0, panelY, clamp(w * 0.25, 80, 180), panel * 0.38, 8)} fill={dark} />
      <path d={ellipse(0, lidCy, lidR)} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path d={ellipse(0, lidCy, lidR * 0.8)} fill={ink(ctx, WATER)} {...detail(ctx, p.detail)} />
      <path d={ellipse(0, lidCy, lidR * 0.26)} fill={p.fill} {...detail(ctx, p.stroke)} />
    </g>
  );
}

export default defineItem({
  type: 'washing-machine',
  label: 'Máquina de lavar',
  category: 'service',
  keywords: [
    'máquina de lavar',
    'lavadora',
    'lava e seca',
    'roupa',
    'lavanderia',
    'área de serviço',
  ],
  size: { w: 600, d: 650 },
  min: { w: 450, d: 450 },
  max: { w: 800, d: 850 },
  wallSnap: 'back',
  layer: 'furniture',
  color: APPLIANCE.fill,
  colors: APPLIANCE_COLORS,
  colorable: true,
  Symbol: WashingMachine,
});
