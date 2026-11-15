import type { ReactElement } from 'react';
import type { Lot, Vec } from '../model/types.ts';
import { contextGeometry } from '../render/layers/ContextLayer.tsx';

const SIDEWALK = '#F1F1EE';
const STREET = '#E4E4E1';
const CURB = '#B9B9B4';
const NEIGHBOR_LINE = '#BDBDB8';
const TREE_LINE = '#AEB5A8';

const points = (pts: Vec[]) => pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

/**
 * The street context of the print sheet, in world mm: flat light sidewalk and street bands and the
 * curb. With `neighbors`, also the neighbor lot lines and the street trees as thin outlines.
 */
export function PrintStreet({
  lot,
  scale,
  neighbors,
}: {
  lot: Lot;
  scale: number;
  neighbors: boolean;
}): ReactElement {
  const geom = contextGeometry(lot);
  const line = 0.13 * scale;
  return (
    <g>
      {geom.streets.map((g) => (
        <g key={g.key}>
          {g.paints.map((p, i) =>
            p.color === 'paint' ? null : (
              <polygon
                // biome-ignore lint/suspicious/noArrayIndexKey: static geometry list, rebuilt as a whole
                key={i}
                points={points(p.pts)}
                fill={
                  p.color === 'curb'
                    ? CURB
                    : p.color === 'asphalt' || p.color === 'gutter'
                      ? STREET
                      : SIDEWALK
                }
              />
            ),
          )}
        </g>
      ))}
      {neighbors ? (
        <>
          <path
            d={geom.lotLines.map((s) => `M${s.a.x} ${s.a.y}L${s.b.x} ${s.b.y}`).join('')}
            fill="none"
            stroke={NEIGHBOR_LINE}
            strokeWidth={line}
            strokeDasharray={`${1.2 * scale} ${0.9 * scale}`}
          />
          {geom.streets.flatMap((g) =>
            g.trees.map((t) => (
              <circle
                key={t.key}
                cx={t.at.x}
                cy={t.at.y}
                r={t.size / 2}
                fill="none"
                stroke={TREE_LINE}
                strokeWidth={line}
              />
            )),
          )}
        </>
      ) : null}
    </g>
  );
}
