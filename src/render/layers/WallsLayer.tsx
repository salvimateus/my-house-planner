import type { ReactElement } from 'react';
import { memo, useMemo } from 'react';
import { sharedIntervals } from '../../geometry/areaOps.ts';
import { regionPath } from '../../geometry/shape.ts';
import type { Region, WallRect } from '../../geometry/types.ts';
import type { Area, Id } from '../../model/types.ts';
import { printSize, type RenderContext, strokeProps } from '../RenderContext.ts';

const rectsPath = (rects: WallRect[]) =>
  rects.map((r) => `M${r.x0} ${r.y0}H${r.x1}V${r.y1}H${r.x0}Z`).join('');

/** Removed walls: the intervals shared by each open pair of rooms, as `M…L…` path data. */
function openBoundaryPath(areas: Area[], pairs: [Id, Id][]): string {
  if (pairs.length === 0) return '';
  const byId = new Map(areas.map((a) => [a.id, a]));
  let d = '';
  for (const [a, b] of pairs) {
    const x = byId.get(a);
    const y = byId.get(b);
    if (!x || !y) continue;
    for (const iv of sharedIntervals(x.shape, y.shape)) {
      d += iv.axis === 'h' ? `M${iv.a} ${iv.line}H${iv.b}` : `M${iv.line} ${iv.a}V${iv.b}`;
    }
  }
  return d;
}

/**
 * House walls as one path. During a gesture that changes the areas, the raw wall rects (same fill,
 * no outline) skip the path of the union on every frame. The outline keeps thin walls visible when
 * zoomed out. Removed walls (open boundaries) draw as a dashed line on the shared wall axis.
 */
export const WallsLayer = memo(function WallsLayer({
  wallsGeom,
  wallRects,
  areas,
  openBoundaries,
  live,
  ctx,
}: {
  wallsGeom: Region;
  wallRects: WallRect[];
  areas: Area[];
  openBoundaries: [Id, Id][];
  live: boolean;
  ctx: RenderContext;
}): ReactElement | null {
  const fill = ctx.theme.wall;
  const open = useMemo(
    () => (ctx.mode === 'thumb' ? '' : openBoundaryPath(areas, openBoundaries)),
    [areas, openBoundaries, ctx.mode],
  );
  const openLine = open ? (
    <path
      className="open-boundary"
      d={open}
      fill="none"
      stroke={fill}
      strokeOpacity={0.75}
      {...(ctx.mode === 'screen'
        ? {}
        : {
            strokeWidth: printSize(ctx, 0.25),
            strokeDasharray: `${printSize(ctx, 1.2)} ${printSize(ctx, 0.8)}`,
          })}
    />
  ) : null;
  if (live && ctx.mode === 'screen') {
    if (wallRects.length === 0 && !openLine) return null;
    return (
      <g className="scene-layer layer-walls" pointerEvents="none">
        {wallRects.length ? <path d={rectsPath(wallRects)} fill={fill} /> : null}
        {openLine}
      </g>
    );
  }
  if (wallsGeom.length === 0 && !openLine) return null;
  return (
    <g className="scene-layer layer-walls" pointerEvents="none">
      {wallsGeom.length ? (
        <path
          d={regionPath(wallsGeom)}
          fillRule="evenodd"
          fill={fill}
          stroke={fill}
          strokeLinejoin="miter"
          {...(ctx.mode === 'thumb' ? { strokeWidth: 0 } : strokeProps(ctx, 0.75, 0.05))}
        />
      ) : null}
      {openLine}
    </g>
  );
});
