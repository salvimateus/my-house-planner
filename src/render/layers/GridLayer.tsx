import type { ReactElement } from 'react';
import { memo } from 'react';
import type { Lot } from '../../model/types.ts';
import { printSize, type RenderContext } from '../RenderContext.ts';

const MINOR = 1000;
const MAJOR = 5000;
const SCREEN_GRID = '#3A3F47';

/**
 * 1 m and 5 m grid over the lot, above the area fills and below the walls: one rect per pattern. The tile lines run through the tile center
 * (pattern offset half a tile), so the stroke is never clipped at the tile edge.
 */
export const GridLayer = memo(function GridLayer({
  lot,
  ctx,
}: {
  lot: Lot;
  ctx: RenderContext;
}): ReactElement | null {
  const screen = ctx.mode === 'screen';
  // On screen the layer stays mounted, so the toggle can fade.
  if (!screen && !ctx.layers.grid) return null;
  if (ctx.mode === 'thumb') return null;
  const id = `grid-${ctx.mode}`;
  // On screen the grid sits over floor textures, so it needs a darker neutral than the print grid.
  const stroke = screen ? SCREEN_GRID : ctx.theme.grid;
  const lineProps = (size: number) =>
    screen
      ? { className: 'grid-line', stroke, strokeOpacity: size === MINOR ? 0.25 : 0.4 }
      : {
          stroke,
          strokeOpacity: size === MINOR ? 0.18 : 0.3,
          strokeWidth: printSize(ctx, 0.08),
        };

  return (
    <g
      className="scene-layer layer-grid"
      pointerEvents="none"
      data-hidden={screen && !ctx.layers.grid ? 'true' : undefined}
      data-reveal="grid"
    >
      <defs>
        {[MINOR, MAJOR].map((size) => (
          <pattern
            key={size}
            id={`${id}-${size}`}
            patternUnits="userSpaceOnUse"
            x={size / 2}
            y={size / 2}
            width={size}
            height={size}
          >
            <path
              d={`M0 ${size / 2}H${size}M${size / 2} 0V${size}`}
              fill="none"
              {...lineProps(size)}
            />
          </pattern>
        ))}
      </defs>
      <rect
        className="grid-minor"
        x={0}
        y={0}
        width={lot.width}
        height={lot.depth}
        fill={`url(#${id}-${MINOR})`}
      />
      <rect
        className="grid-major"
        x={0}
        y={0}
        width={lot.width}
        height={lot.depth}
        fill={`url(#${id}-${MAJOR})`}
      />
    </g>
  );
});
