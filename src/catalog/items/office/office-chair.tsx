import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import {
  circlePath,
  corner,
  detail,
  hasDetails,
  hasShadow,
  METAL,
  mix,
  outline,
  SHADOW_DX,
  SHADOW_DY,
  SHADOW_FILL,
  strokeFor,
} from '../living/symbolKit.ts';

const CHAIR = { fill: '#5E6878', stroke: '#3F4753' };
const CASTER = '#2F343B';

/** Swivel chair: five-star base with casters, seat, backrest at the back, two armrests. */
function OfficeChairSymbol({ w, d, color, ctx }: SymbolProps): ReactElement {
  const stroke = strokeFor(color, CHAIR);
  const s = Math.min(w, d) / 2;
  const sx = w / 2 / s;
  const sy = d / 2 / s;
  const reach = s * 0.97;
  const caster = s * 0.08;
  let legs = '';
  let casters = '';
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy;
    const py = ux;
    const tipX = ux * (reach - caster) * sx;
    const tipY = uy * (reach - caster) * sy;
    const base = s * 0.08;
    const tip = s * 0.04;
    legs += `M${px * base} ${py * base}L${tipX + px * tip} ${tipY + py * tip}L${tipX - px * tip} ${tipY - py * tip}L${-px * base} ${-py * base}Z`;
    casters += circlePath(tipX, tipY, caster);
  }
  const seatW = w * 0.64;
  const seatD = d * 0.54;
  const seatY = -d / 2 + d * 0.24;
  const backW = w * 0.6;
  const backD = d * 0.15;
  const backY = -d / 2 + d * 0.08;
  const armW = w * 0.08;
  const armD = d * 0.38;
  const armY = seatY + seatD * 0.18;
  const seatR = Math.min(seatW, seatD) * 0.28;
  return (
    <g>
      {hasShadow(ctx) && (
        <rect
          x={-seatW / 2 + SHADOW_DX}
          y={seatY + SHADOW_DY}
          width={seatW}
          height={seatD}
          rx={seatR}
          {...SHADOW_FILL}
        />
      )}
      {hasDetails(ctx) && (
        <>
          <path d={legs} fill={METAL.fill} stroke={METAL.stroke} {...detail(ctx)} />
          <path d={casters} fill={CASTER} stroke={CASTER} {...detail(ctx)} />
        </>
      )}
      <rect
        x={-seatW / 2}
        y={seatY}
        width={seatW}
        height={seatD}
        rx={seatR}
        fill={color}
        stroke={stroke}
        {...outline(ctx)}
      />
      <rect
        x={-backW / 2}
        y={backY}
        width={backW}
        height={backD}
        rx={backD / 2}
        fill={mix(color, stroke, 0.35)}
        stroke={stroke}
        {...outline(ctx)}
      />
      {hasDetails(ctx) &&
        [-1, 1].map((side) => (
          <rect
            key={side}
            x={side < 0 ? -seatW / 2 - armW * 0.4 : seatW / 2 - armW * 0.6}
            y={armY}
            width={armW}
            height={armD}
            rx={corner(armW, armD, 30)}
            fill={METAL.fill}
            stroke={METAL.stroke}
            {...detail(ctx)}
          />
        ))}
    </g>
  );
}

export default defineItem({
  type: 'office-chair',
  label: 'Cadeira de escritório',
  category: 'office',
  keywords: ['cadeira', 'cadeira de escritório', 'giratória', 'gamer', 'home office', 'estudo'],
  size: { w: 600, d: 600 },
  min: { w: 450, d: 450 },
  max: { w: 900, d: 900 },
  wallSnap: 'none',
  layer: 'furniture',
  color: CHAIR.fill,
  colorable: true,
  Symbol: OfficeChairSymbol,
});
