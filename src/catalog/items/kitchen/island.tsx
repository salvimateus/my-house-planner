import { defineItem, type SymbolProps } from '../../types.ts';
import {
  corner,
  detail,
  ellipse,
  fixed,
  hasDetails,
  line,
  outline,
  paint,
  rrect,
  STONE,
  STONE_COLORS,
  shadow,
  WOOD,
} from '../bathroom/symbolKit.ts';

const STOOL_BAND = 400;
const STOOL_R = 170;
const OVERHANG = 250;

function Island({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, STONE);
  const s = fixed(ctx, WOOD);
  const hw = w / 2;
  const hd = d / 2;
  // Deep islands keep a front band for stools; the top overhangs the cabinets for knee room.
  const stools = d >= 1100 ? Math.max(1, Math.floor(w / 550)) : 0;
  const topD = stools ? d - STOOL_BAND + 120 : d;
  const topCy = -hd + topD / 2;
  const top = rrect(0, topCy, w, topD, corner(w, topD));
  const sh = shadow(ctx);
  if (!hasDetails(ctx)) return <path d={top} fill={p.fill} {...outline(ctx, p.stroke)} />;
  let seats = '';
  let cushions = '';
  const step = w / Math.max(1, stools);
  const sy = hd - STOOL_R - 20;
  for (let i = 0; i < stools; i++) {
    const cx = -hw + step * (i + 0.5);
    seats += ellipse(cx, sy, STOOL_R);
    cushions += ellipse(cx, sy, STOOL_R * 0.62);
  }
  const cabinetFront = -hd + topD - (stools ? OVERHANG : 30);
  return (
    <g>
      {sh && <path d={top} {...sh} />}
      {stools > 0 && <path d={seats} fill={s.fill} {...outline(ctx, s.stroke)} />}
      {stools > 0 && <path d={cushions} fill="none" {...detail(ctx, s.detail)} />}
      <path d={top} fill={p.fill} {...outline(ctx, p.stroke)} />
      <path
        d={line(-hw + 30, cabinetFront, hw - 30, cabinetFront)}
        fill="none"
        {...detail(ctx, p.detail)}
      />
      <path
        d={rrect(0, topCy, w - 60, topD - 60, corner(w, topD, 25))}
        fill="none"
        {...detail(ctx, p.detail)}
      />
    </g>
  );
}

export default defineItem({
  type: 'island',
  label: 'Ilha',
  category: 'kitchen',
  keywords: ['ilha', 'bancada', 'balcão', 'banqueta', 'cozinha americana', 'cozinha'],
  size: { w: 1800, d: 900 },
  min: { w: 900, d: 600 },
  max: { w: 4000, d: 1600 },
  variants: [
    { id: 'plain', label: 'Sem banquetas', w: 1800, d: 900 },
    { id: 'stools', label: 'Com banquetas', w: 1800, d: 1300 },
    { id: 'stools-large', label: 'Grande com banquetas', w: 2400, d: 1300 },
  ],
  wallSnap: 'none',
  layer: 'furniture',
  color: STONE.fill,
  colors: STONE_COLORS,
  colorable: true,
  Symbol: Island,
});
