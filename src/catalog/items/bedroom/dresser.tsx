import type { ReactElement } from 'react';
import {
  CERAMIC,
  clamp,
  corner,
  detailColor,
  hasDetails,
  hasShadow,
  line,
  METAL,
  outline,
  SHADOW,
  SHADOW_FILL,
  softDetail,
  splitSpan,
  strokeFor,
  WOOD,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

/** Chest of drawers: framed top, drawer columns with handles on the front edge, a small tray. */
function DresserSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 35);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const inset = clamp(Math.min(w, d) * 0.06, 15, 35);
  const columns = clamp(Math.round(w / 500), 1, 4);
  const handleY = d / 2 - inset * 0.5;
  let handles = '';
  let dividers = '';
  splitSpan(x0, -x0, columns, 0).forEach(([a, b], i) => {
    const mid = (a + b) / 2;
    const half = Math.min(70, (b - a) * 0.18);
    handles += line(mid - half, handleY, mid + half, handleY);
    if (i > 0) dividers += line(a, d / 2 - inset, a, d / 2);
  });
  const trayW = Math.min(w * 0.22, 260);
  const trayD = Math.min(d * 0.35, 180);
  return (
    <g>
      {hasShadow(ctx) && (
        <rect x={x0 + SHADOW.dx} y={y0 + SHADOW.dy} width={w} height={d} rx={r} {...SHADOW_FILL} />
      )}
      <rect
        x={x0}
        y={y0}
        width={w}
        height={d}
        rx={r}
        fill={color}
        stroke={stroke}
        {...outline(ctx)}
      />
      {hasDetails(ctx) && (
        <>
          <rect
            x={x0 + inset}
            y={y0 + inset}
            width={w - 2 * inset}
            height={d - 2 * inset}
            rx={corner(w - 2 * inset, d - 2 * inset, 25)}
            fill="none"
            stroke={detailColor(color, stroke)}
            {...softDetail(ctx)}
          />
          {dividers && <path d={dividers} fill="none" stroke={stroke} {...softDetail(ctx)} />}
          <path
            d={handles}
            fill="none"
            stroke={METAL.fill}
            strokeLinecap="round"
            {...outline(ctx)}
          />
          <rect
            x={-x0 - inset * 2 - trayW}
            y={y0 + inset * 2}
            width={trayW}
            height={trayD}
            rx={corner(trayW, trayD, 30)}
            fill={CERAMIC.fill}
            stroke={CERAMIC.stroke}
            {...softDetail(ctx)}
          />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'dresser',
  label: 'Cômoda',
  category: 'bedroom',
  keywords: ['cômoda', 'comoda', 'gaveteiro', 'gavetas', 'sapateira', 'quarto'],
  size: { w: 1000, d: 500 },
  min: { w: 400, d: 350 },
  max: { w: 2200, d: 700 },
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: DresserSymbol,
});
