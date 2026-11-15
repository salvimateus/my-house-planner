import type { ReactElement } from 'react';
import { memo } from 'react';
import { regionPath } from '../../geometry/shape.ts';
import type { AreaDerived } from '../../geometry/types.ts';
import type { Area, Id } from '../../model/types.ts';
import { fillPaint } from '../PatternDefs.tsx';
import { printSize, type RenderContext, strokeProps } from '../RenderContext.ts';

const pathCache = new WeakMap<AreaDerived['visible'], string>();

function visiblePath(d: AreaDerived): string {
  let p = pathCache.get(d.visible);
  if (p === undefined) {
    p = regionPath(d.visible);
    pathCache.set(d.visible, p);
  }
  return p;
}

/**
 * Area fills: outdoor first, then covered areas and rooms. `pxPerMm` is the committed zoom, so
 * the layer re-renders only when a fill crosses the pattern LOD threshold.
 */
export const AreasLayer = memo(function AreasLayer({
  areas,
  derived,
  ctx,
  pxPerMm,
}: {
  areas: Area[];
  derived: Map<Id, AreaDerived>;
  ctx: RenderContext;
  pxPerMm?: number;
}): ReactElement {
  const ordered = [
    ...areas.filter((a) => a.kind === 'outdoor'),
    ...areas.filter((a) => a.kind !== 'outdoor'),
  ];
  const screen = ctx.mode === 'screen';
  const edgeColor = ctx.theme.lotLine;

  return (
    <g className="scene-layer layer-areas" pointerEvents="none">
      {ordered.map((a) => {
        const d = derived.get(a.id);
        if (!d || d.visible.length === 0) return null;
        const path = visiblePath(d);
        const edge =
          a.kind === 'covered'
            ? screen
              ? { className: 'area-edge-covered' }
              : {
                  strokeWidth: printSize(ctx, 0.18),
                  strokeDasharray: `${printSize(ctx, 1.4)} ${printSize(ctx, 0.8)}`,
                }
            : a.kind === 'outdoor'
              ? strokeProps(ctx, 1, 0.13)
              : null;
        return (
          <g key={a.id} data-area={a.id}>
            <path d={path} fillRule="evenodd" fill={fillPaint(a.fill, ctx, pxPerMm)} />
            {edge && ctx.mode !== 'thumb' ? (
              <path
                d={path}
                fill="none"
                stroke={edgeColor}
                strokeOpacity={a.kind === 'covered' ? 0.9 : 0.45}
                {...edge}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
});
