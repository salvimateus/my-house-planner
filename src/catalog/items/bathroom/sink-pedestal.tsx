import { defineItem, type SymbolProps } from '../../types.ts';
import {
  CERAMIC,
  CERAMIC_COLORS,
  clamp,
  detail,
  ellipse,
  hasDetails,
  ink,
  outline,
  paint,
  rrect,
  shadow,
  WATER,
} from './symbolKit.ts';

function SinkPedestal({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, CERAMIC);
  const hw = w / 2;
  const hd = d / 2;
  const k = d * 0.28;
  // Flat back on the wall, rounded front.
  const body = `M${-hw} ${-hd}L${hw} ${-hd}L${hw} ${-hd + k}A${hw} ${d - k} 0 0 1 ${-hw} ${-hd + k}Z`;
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />;
  const cy = d * 0.06;
  const rx = w * 0.33;
  const ry = d * 0.27;
  const faucetY = -hd + clamp(d * 0.11, 30, 55);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path d={ellipse(0, cy, rx, ry)} fill={ink(ctx, WATER)} {...detail(ctx, p.detail)} />
      <path d={ellipse(0, cy + ry * 0.15, 16)} fill={p.detail} />
      <path d={rrect(0, faucetY, 50, 36, 12)} fill={p.fill} {...detail(ctx, p.stroke)} />
      <path d={rrect(0, faucetY + 45, 18, 70, 9)} fill={p.fill} {...detail(ctx, p.stroke)} />
    </g>
  );
}

export default defineItem({
  type: 'sink-pedestal',
  label: 'Pia de coluna',
  category: 'bathroom',
  keywords: ['pia', 'lavatório', 'coluna', 'cuba', 'banheiro', 'lavabo'],
  size: { w: 500, d: 420 },
  min: { w: 350, d: 300 },
  max: { w: 700, d: 550 },
  wallSnap: 'back',
  layer: 'furniture',
  color: CERAMIC.fill,
  colors: CERAMIC_COLORS,
  colorable: true,
  Symbol: SinkPedestal,
});
