import type { ReactElement } from 'react';
import { clamp, corner, cornerRect, edge, n, oval, pen, SHADOW, shade } from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

const SEAT = 600;

function OutdoorTableSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const cs = clamp(Math.min(w, d) * 0.35, 300, 450);
  // Chairs tuck halfway under the top.
  const inset = cs * 0.55;
  const tw = w - inset * 2;
  const td = d - inset * 2;
  const across = clamp(Math.floor(tw / SEAT), 1, 4);
  const along = clamp(Math.floor(td / SEAT), 1, 3);
  // A small, near square table reads best round, as a classic umbrella table.
  const round = across === 1 && along === 1 && Math.abs(w - d) <= Math.max(w, d) * 0.1;
  const chairR = Math.min(60, cs * 0.18);
  const backT = cs * 0.2;
  let seats = '';
  let backs = '';
  for (let i = 0; i < across; i++) {
    const x = -tw / 2 + (tw * (i + 0.5)) / across - cs / 2;
    seats += cornerRect(x, -d / 2, cs, cs, chairR) + cornerRect(x, d / 2 - cs, cs, cs, chairR);
    backs +=
      cornerRect(x, -d / 2, cs, backT, chairR) + cornerRect(x, d / 2 - backT, cs, backT, chairR);
  }
  for (let i = 0; i < along; i++) {
    const y = -td / 2 + (td * (i + 0.5)) / along - cs / 2;
    seats += cornerRect(-w / 2, y, cs, cs, chairR) + cornerRect(w / 2 - cs, y, cs, cs, chairR);
    backs +=
      cornerRect(-w / 2, y, backT, cs, chairR) + cornerRect(w / 2 - backT, y, backT, cs, chairR);
  }
  const top = round
    ? oval(0, 0, tw / 2, td / 2)
    : cornerRect(-tw / 2, -td / 2, tw, td, corner(tw, td));
  const shadowTop = round
    ? oval(SHADOW.dx, SHADOW.dy, tw / 2, td / 2)
    : cornerRect(-tw / 2 + SHADOW.dx, -td / 2 + SHADOW.dy, tw, td, corner(tw, td));
  const wood = p.c(color);
  const woodEdge = p.c(edge(color));
  const chair = p.c(shade(color, -0.12));
  return (
    <g>
      {p.shadow && <path d={shadowTop} fill={SHADOW.fill} fillOpacity={SHADOW.fillOpacity} />}
      <path d={seats} fill={chair} stroke={woodEdge} {...p.line} />
      {p.detail && <path d={backs} fill={p.c(shade(color, -0.3))} stroke={woodEdge} {...p.fine} />}
      <path d={top} fill={wood} stroke={woodEdge} {...p.line} />
      {p.detail && (
        <>
          <path
            d={
              round
                ? oval(0, 0, tw * 0.42, td * 0.42)
                : cornerRect(-tw * 0.43, -td * 0.43, tw * 0.86, td * 0.86, corner(tw, td))
            }
            fill="none"
            stroke={woodEdge}
            strokeOpacity={0.6}
            {...p.fine}
          />
          <circle
            r={n(Math.min(tw, td) * 0.04)}
            fill={p.c('#F4F1EA')}
            stroke={woodEdge}
            {...p.fine}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'outdoor-table',
  label: 'Mesa externa com cadeiras',
  category: 'outdoor',
  keywords: [
    'mesa',
    'cadeiras',
    'externa',
    'jardim',
    'varanda',
    'área gourmet',
    'ombrelone',
    'quintal',
  ],
  size: { w: 1200, d: 1200 },
  min: { w: 900, d: 900 },
  max: { w: 3600, d: 2400 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#E7D3B5',
  colors: ['#E7D3B5', '#B8B4AC', '#F4F2EE', '#5A5F66'],
  colorable: true,
  Symbol: OutdoorTableSymbol,
});
