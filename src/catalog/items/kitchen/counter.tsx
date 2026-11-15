import { defineItem, type SymbolProps } from '../../types.ts';
import {
  corner,
  detail,
  hasDetails,
  line,
  outline,
  paint,
  rrect,
  STONE,
  STONE_COLORS,
  shadow,
} from '../bathroom/symbolKit.ts';

function Counter({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, STONE);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d, 30));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />;
  // Short ticks on the front edge mark the base cabinet modules below the top.
  const modules = Math.max(1, Math.round(w / 600));
  const step = w / modules;
  let ticks = '';
  for (let i = 1; i < modules; i++) {
    const x = -hw + step * i;
    ticks += line(x, hd - 30, x, hd - 110);
  }
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path
        d={line(-hw + 20, -hd + 25, hw - 20, -hd + 25) + line(-hw + 20, hd - 30, hw - 20, hd - 30)}
        fill="none"
        {...detail(ctx, p.detail)}
      />
      {ticks && <path d={ticks} fill="none" {...detail(ctx, p.detail)} />}
    </g>
  );
}

export default defineItem({
  type: 'counter',
  label: 'Bancada',
  category: 'kitchen',
  keywords: ['bancada', 'balcão', 'armário', 'gabinete', 'tampo', 'granito', 'cozinha'],
  size: { w: 1200, d: 600 },
  min: { w: 300, d: 300 },
  max: { w: 6000, d: 900 },
  wallSnap: 'back',
  layer: 'furniture',
  color: STONE.fill,
  colors: STONE_COLORS,
  colorable: true,
  Symbol: Counter,
});
