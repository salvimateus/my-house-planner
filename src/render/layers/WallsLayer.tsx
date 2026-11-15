import type { ReactElement } from 'react';
import { memo } from 'react';
import { regionPath } from '../../geometry/shape.ts';
import type { Region, WallRect } from '../../geometry/types.ts';
import { type RenderContext, strokeProps } from '../RenderContext.ts';

const rectsPath = (rects: WallRect[]) =>
  rects.map((r) => `M${r.x0} ${r.y0}H${r.x1}V${r.y1}H${r.x0}Z`).join('');

/**
 * House walls as one path. During a gesture that changes the areas, the raw wall rects (same fill,
 * no outline) skip the path of the union on every frame. The outline keeps thin walls visible when
 * zoomed out.
 */
export const WallsLayer = memo(function WallsLayer({
  wallsGeom,
  wallRects,
  live,
  ctx,
}: {
  wallsGeom: Region;
  wallRects: WallRect[];
  live: boolean;
  ctx: RenderContext;
}): ReactElement | null {
  const fill = ctx.theme.wall;
  if (live && ctx.mode === 'screen') {
    if (wallRects.length === 0) return null;
    return (
      <g className="scene-layer layer-walls" pointerEvents="none">
        <path d={rectsPath(wallRects)} fill={fill} />
      </g>
    );
  }
  if (wallsGeom.length === 0) return null;
  return (
    <g className="scene-layer layer-walls" pointerEvents="none">
      <path
        d={regionPath(wallsGeom)}
        fillRule="evenodd"
        fill={fill}
        stroke={fill}
        strokeLinejoin="miter"
        {...(ctx.mode === 'thumb' ? { strokeWidth: 0 } : strokeProps(ctx, 0.75, 0.05))}
      />
    </g>
  );
});
