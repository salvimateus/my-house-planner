import {
  APPLIANCE,
  APPLIANCE_COLORS,
  clamp,
  detailPen,
  ellipse,
  FLAME,
  fixed,
  hasDetails,
  mix,
  mono,
  n,
  outlinePen,
  paint,
  rrect,
  STEEL,
  shadow,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

/** Teardrop flame of height ~1.6·s, centered at (cx, cy). */
function flame(cx: number, cy: number, s: number): string {
  const p = (x: number, y: number) => `${n(cx + x * s)} ${n(cy + y * s)}`;
  return `M${p(0, -1)}C${p(0.55, -0.4)} ${p(0.62, 0.15)} ${p(0, 0.6)}C${p(-0.62, 0.15)} ${p(-0.55, -0.4)} ${p(0, -1)}Z`;
}

function WaterHeater({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, APPLIANCE);
  const s = fixed(ctx, STEEL);
  const hd = d / 2;
  const pipe = clamp(d * 0.12, 40, 80);
  const rx = w / 2;
  const ry = (d - pipe) / 2;
  const cy = pipe / 2;
  const tank = ellipse(0, cy, rx, ry);
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={tank} fill={p.fill} {...outlinePen(ctx, p.stroke)} />;
  const pipeX = clamp(w * 0.18, 40, 120);
  const flameColor = mono(ctx, FLAME);
  return (
    <g>
      <path
        d={
          rrect(-pipeX, -hd + pipe / 2 + 10, 34, pipe + 20, 10) +
          rrect(pipeX, -hd + pipe / 2 + 10, 34, pipe + 20, 10)
        }
        fill={s.fill}
        {...detailPen(ctx, s.stroke)}
      />
      {sh && <path d={tank} {...sh} />}
      <path d={tank} fill={p.fill} {...outlinePen(ctx, p.stroke)} />
      <path d={ellipse(0, cy, rx * 0.78, ry * 0.78)} fill="none" {...detailPen(ctx, p.detail)} />
      <path
        d={flame(0, cy + Math.min(rx, ry) * 0.06, Math.min(rx, ry) * 0.36)}
        fill={mono(ctx, mix(FLAME, '#FFFFFF', 0.55))}
        {...detailPen(ctx, flameColor)}
      />
    </g>
  );
}

export default defineItem({
  type: 'water-heater',
  label: 'Aquecedor',
  category: 'service',
  keywords: ['aquecedor', 'boiler', 'água quente', 'gás', 'aquecedor a gás', 'área de serviço'],
  size: { w: 500, d: 500 },
  min: { w: 300, d: 300 },
  max: { w: 900, d: 900 },
  wallSnap: 'back',
  layer: 'furniture',
  color: APPLIANCE.fill,
  colors: APPLIANCE_COLORS,
  colorable: true,
  Symbol: WaterHeater,
});
