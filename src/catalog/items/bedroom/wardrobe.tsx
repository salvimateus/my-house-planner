import type { ReactElement } from 'react';
import {
  clamp,
  corner,
  darken,
  detailColor,
  hasDetails,
  hasShadow,
  line,
  outline,
  SHADOW,
  SHADOW_FILL,
  softDetail,
  strokeFor,
  WOOD,
} from '../../symbolKit.ts';
import { defineItem, type SymbolProps } from '../../types.ts';

/** Wardrobe in plan: doors on the front edge, the hanging rod and hangers inside. */
function WardrobeSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, WOOD);
  const r = corner(w, d, 30);
  const x0 = -w / 2;
  const y0 = -d / 2;
  const y1 = d / 2;
  const board = clamp(d * 0.03, 15, 25);
  const door = clamp(d * 0.05, 20, 35);
  const doors = clamp(Math.round(w / 500), 1, 8);
  const doorLine = y1 - door;
  const rodY = (y0 + board + doorLine) / 2;
  const hangerHalf = (doorLine - y0 - board) * 0.36;
  const left = x0 + board + 50;
  const right = -x0 - board - 50;
  const hangers = Math.max(1, Math.floor((right - left) / 110));
  const hangerStep = (right - left) / hangers;

  let doorPath = line(x0 + board, doorLine, -x0 - board, doorLine);
  for (let i = 1; i < doors; i++) {
    const x = x0 + (w * i) / doors;
    doorPath += line(x, doorLine, x, y1);
  }
  let hangerPath = '';
  for (let i = 0; i <= hangers; i++) {
    const x = left + i * hangerStep;
    hangerPath += line(x, rodY - hangerHalf, x + 8, rodY + hangerHalf);
  }
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
          <path
            d={hangerPath}
            fill="none"
            stroke={detailColor(color, stroke)}
            strokeLinecap="round"
            {...softDetail(ctx)}
          />
          <path
            d={line(left - 30, rodY, right + 30, rodY)}
            fill="none"
            stroke={darken(stroke, 0.1)}
            strokeLinecap="round"
            {...outline(ctx)}
          />
          <path d={doorPath} fill="none" stroke={stroke} {...softDetail(ctx)} />
        </>
      )}
    </g>
  );
}

export default defineItem({
  type: 'wardrobe',
  label: 'Guarda-roupa',
  category: 'bedroom',
  keywords: ['guarda-roupa', 'guarda roupa', 'armário', 'roupeiro', 'closet', 'quarto'],
  size: { w: 1600, d: 600 },
  min: { w: 500, d: 400 },
  max: { w: 4000, d: 800 },
  variants: [
    { id: '120', label: '1,20 m', w: 1200, d: 600 },
    { id: '160', label: '1,60 m', w: 1600, d: 600 },
    { id: '200', label: '2,00 m', w: 2000, d: 600 },
    { id: '240', label: '2,40 m', w: 2400, d: 600 },
  ],
  wallSnap: 'back',
  layer: 'furniture',
  color: WOOD.fill,
  colorable: true,
  Symbol: WardrobeSymbol,
});
