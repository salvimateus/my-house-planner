import { defineItem, type SymbolProps } from '../../types.ts';
import {
  CERAMIC,
  CERAMIC_COLORS,
  clamp,
  corner,
  detail,
  ellipse,
  fixed,
  hasDetails,
  ink,
  line,
  outline,
  paint,
  rrect,
  STEEL,
  shadow,
  WATER,
} from '../bathroom/symbolKit.ts';

function LaundryTank({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, CERAMIC);
  const s = fixed(ctx, STEEL);
  const hw = w / 2;
  const hd = d / 2;
  const body = rrect(0, 0, w, d, corner(w, d));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />;
  const rim = clamp(w * 0.07, 35, 60);
  const basinTop = -hd + clamp(d * 0.12, 50, 80);
  const basinBottom = basinTop + (d - rim - (basinTop + hd)) * 0.58;
  const basinH = basinBottom - basinTop;
  // The ribbed washboard fills the front, between basin and rim.
  const boardTop = basinBottom + 25;
  const boardBottom = hd - rim;
  const ribs = Math.max(2, Math.floor((boardBottom - boardTop) / 40));
  let ribPath = '';
  for (let i = 0; i <= ribs; i++) {
    const y = boardTop + ((boardBottom - boardTop) * i) / ribs;
    ribPath += line(-hw + rim + 20, y, hw - rim - 20, y);
  }
  return (
    <g>
      {sh && <path d={body} {...sh} />}
      <path d={body} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path
        d={rrect(0, (basinTop + basinBottom) / 2, w - rim * 2, basinH, 40)}
        fill={ink(ctx, WATER)}
        {...detail(ctx, p.stroke)}
      />
      <path d={ellipse(0, basinTop + basinH * 0.62, 22)} fill={s.fill} {...detail(ctx, s.stroke)} />
      <path d={ribPath} fill="none" {...detail(ctx, p.detail)} />
      <path d={rrect(0, -hd + 22, 50, 34, 12)} fill={s.fill} {...detail(ctx, s.stroke)} />
      <path d={rrect(0, -hd + 70, 18, 80, 9)} fill={s.fill} {...detail(ctx, s.stroke)} />
    </g>
  );
}

export default defineItem({
  type: 'laundry-tank',
  label: 'Tanque',
  category: 'service',
  keywords: ['tanque', 'lavar roupa', 'lavanderia', 'área de serviço', 'esfregar'],
  size: { w: 600, d: 550 },
  min: { w: 400, d: 400 },
  max: { w: 1200, d: 700 },
  wallSnap: 'back',
  layer: 'furniture',
  color: CERAMIC.fill,
  colors: CERAMIC_COLORS,
  colorable: true,
  Symbol: LaundryTank,
});
