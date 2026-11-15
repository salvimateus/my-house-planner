import { strokeProps } from '../../../render/RenderContext.ts';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  clamp,
  corner,
  detail,
  ellipse,
  fixed,
  hasDetails,
  line,
  mirror,
  outline,
  paint,
  rrect,
  STEEL,
  STONE,
  STONE_COLORS,
  shadow,
} from '../bathroom/symbolKit.ts';

function KitchenSink({ w, d, color, mirrored, ctx }: SymbolProps) {
  const p = paint(ctx, color, STONE);
  const s = fixed(ctx, STEEL);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />;

  const count = w >= 1750 ? 2 : 1;
  const margin = clamp(w * 0.06, 50, 120);
  const bw = clamp((w * 0.42) / count, 300, 500);
  const bh = clamp(d * 0.62, 250, 420);
  const by = d * 0.06;
  const gap = 50;
  let bowls = '';
  let drains = '';
  for (let i = 0; i < count; i++) {
    const cx = -hw + margin + bw / 2 + i * (bw + gap);
    bowls += rrect(cx, by, bw, bh, 45);
    drains += ellipse(cx, by + bh * 0.12, 28);
  }
  const bowlsEnd = -hw + margin + count * bw + (count - 1) * gap;
  const boardX0 = bowlsEnd + 60;
  const boardX1 = hw - margin;
  const boardW = boardX1 - boardX0;
  let ribs = '';
  if (boardW > 160) {
    const steps = Math.floor((boardW - 60) / 70);
    for (let i = 0; i <= steps; i++) {
      const x = boardX0 + 30 + i * ((boardW - 60) / Math.max(1, steps));
      ribs += line(x, by - bh * 0.36, x, by + bh * 0.36);
    }
  }
  const faucetX = -hw + margin + bw / 2 + (count - 1) * ((bw + gap) / 2);
  const faucetY = -hd + clamp(d * 0.09, 35, 60);
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path
        d={line(-hw + 20, -hd + 25, hw - 20, -hd + 25)}
        fill="none"
        {...detail(ctx, p.detail)}
      />
      <g transform={mirror(mirrored)}>
        {boardW > 160 && (
          <path
            d={rrect((boardX0 + boardX1) / 2, by, boardW, bh, 40)}
            fill={s.fill}
            {...outline(ctx, s.stroke)}
          />
        )}
        {ribs && <path d={ribs} fill="none" {...detail(ctx, s.detail)} />}
        <path d={bowls} fill={s.fill} {...outline(ctx, s.stroke)} />
        <path d={drains} fill={s.detail} {...detail(ctx, s.stroke)} />
        <path
          d={line(faucetX, faucetY, faucetX, faucetY + clamp(d * 0.3, 120, 200))}
          fill="none"
          stroke={s.stroke}
          strokeLinecap="round"
          {...strokeProps(ctx, 2.5, 0.35)}
        />
        <path d={ellipse(faucetX, faucetY, 28)} fill={s.fill} {...outline(ctx, s.stroke)} />
      </g>
    </g>
  );
}

export default defineItem({
  type: 'kitchen-sink',
  label: 'Pia de cozinha',
  category: 'kitchen',
  keywords: ['pia', 'cuba', 'bancada', 'cozinha', 'torneira', 'escorredor'],
  size: { w: 1200, d: 600 },
  min: { w: 800, d: 450 },
  max: { w: 3000, d: 700 },
  variants: [
    { id: 'w120', label: '1,20 m', w: 1200, d: 600 },
    { id: 'w150', label: '1,50 m', w: 1500, d: 600 },
    { id: 'w180', label: '1,80 m (2 cubas)', w: 1800, d: 600 },
    { id: 'w200', label: '2,00 m (2 cubas)', w: 2000, d: 600 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: STONE.fill,
  colors: STONE_COLORS,
  colorable: true,
  Symbol: KitchenSink,
});
