import {
  clamp,
  corner,
  detailPen,
  FABRIC,
  fixed,
  hasDetails,
  line,
  outlinePen,
  paint,
  rrect,
  STEEL,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

function Clothesline({ w, d, color, ctx }: SymbolProps) {
  const p = paint(ctx, color, STEEL);
  const f = fixed(ctx, FABRIC);
  const hw = w / 2;
  const hd = d / 2;
  const frame = rrect(0, 0, w, d, corner(w, d, 30));
  // The floor stays visible under a hanging clothesline, so the frame fill is faint.
  if (!hasDetails(ctx))
    return <path d={frame} fill={p.fill} fillOpacity={0.35} {...outlinePen(ctx, p.stroke)} />;
  const end = clamp(w * 0.04, 40, 70);
  const lines = Math.max(2, Math.floor((d - 60) / 110));
  const pitch = (d - 60) / (lines - 1 || 1);
  let wires = '';
  let clothes = '';
  for (let i = 0; i < lines; i++) {
    const y = -hd + 30 + pitch * i;
    wires += line(-hw + end, y, hw - end, y);
    if (i % 2 === 1) {
      const span = w - end * 2;
      const pieces = Math.max(1, Math.floor(span / 600));
      for (let k = 0; k < pieces; k++) {
        const cx = -hw + end + (span * (k + 0.5 + (i % 4 === 1 ? 0.15 : -0.15))) / pieces;
        clothes += rrect(cx, y, clamp(span / pieces / 2.4, 120, 320), 36, 12);
      }
    }
  }
  return (
    <g>
      <path d={frame} fill={p.fill} fillOpacity={0.35} {...outlinePen(ctx, p.stroke)} />
      <path
        d={
          rrect(-hw + end / 2, 0, end - 14, d - 30, 10) +
          rrect(hw - end / 2, 0, end - 14, d - 30, 10)
        }
        fill={p.fill}
        {...detailPen(ctx, p.stroke)}
      />
      <path d={wires} fill="none" {...detailPen(ctx, p.stroke)} />
      {clothes && <path d={clothes} fill={f.fill} {...detailPen(ctx, f.stroke)} />}
    </g>
  );
}

export default defineItem({
  type: 'clothesline',
  label: 'Varal',
  category: 'service',
  keywords: ['varal', 'secar roupa', 'roupa', 'lavanderia', 'área de serviço', 'teto'],
  size: { w: 1500, d: 600 },
  min: { w: 600, d: 300 },
  max: { w: 4000, d: 1500 },
  variants: [
    { id: 'w100', label: '1 m', w: 1000, d: 600 },
    { id: 'w150', label: '1,50 m', w: 1500, d: 600 },
    { id: 'w200', label: '2 m', w: 2000, d: 600 },
  ],
  wallSnap: 'none',
  layer: 'furniture',
  color: STEEL.fill,
  colorable: true,
  Symbol: Clothesline,
});
