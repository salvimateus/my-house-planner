import type { ReactElement } from 'react';
import { frontagePoint, treeOut } from '../../geometry/frontage.ts';
import type { Lot } from '../../model/types.ts';
import type { FrontageSelection } from '../select/frontage.ts';

/** Selection outline of a street tree (its canopy) or a sidewalk ramp (its span across the sidewalk). */
export function FrontageOutline({
  sel,
  lot,
}: {
  sel: FrontageSelection;
  lot: Lot;
}): ReactElement | null {
  const ns = 'non-scaling-stroke';
  if (sel.kind === 'street-tree') {
    const t = lot.frontage.trees.find((x) => x.id === sel.id);
    if (!t) return null;
    const c = frontagePoint(lot, t.side, t.at, treeOut(lot));
    return (
      <circle
        key={t.id}
        className="overlay-sel overlay-sel-frontage"
        cx={c.x}
        cy={c.y}
        r={t.size / 2}
        vectorEffect={ns}
      />
    );
  }
  const r = lot.frontage.ramps.find((x) => x.id === sel.id);
  if (!r) return null;
  const a = frontagePoint(lot, r.side, r.at - r.width / 2, 0);
  const b = frontagePoint(lot, r.side, r.at + r.width / 2, lot.sidewalkWidth);
  return (
    <rect
      key={r.id}
      className="overlay-sel overlay-sel-frontage"
      x={Math.min(a.x, b.x)}
      y={Math.min(a.y, b.y)}
      width={Math.abs(b.x - a.x)}
      height={Math.abs(b.y - a.y)}
      vectorEffect={ns}
    />
  );
}
