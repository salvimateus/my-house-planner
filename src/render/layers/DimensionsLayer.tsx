import type { CSSProperties, ReactElement } from 'react';
import { memo } from 'react';
import { bboxOf } from '../../geometry/shape.ts';
import type { AreaDerived, EdgeDim } from '../../geometry/types.ts';
import type { Area, Id } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { printSize, type RenderContext } from '../RenderContext.ts';

/** `translate(x y) rotate(-90)` maps local +y to world +x, so `inward` is always the local y offset. */
const frameOf = (e: EdgeDim) => `translate(${e.x} ${e.y})${e.angle ? ' rotate(-90)' : ''}`;

/**
 * Internal wall lengths of rooms and covered areas (geometry/dimensions.ts). Screen: the gap from
 * the wall face, the font size and the hide rule for short edges on screen are CSS, from `--mmpp`.
 */
export const DimensionsLayer = memo(function DimensionsLayer({
  areas,
  derived,
  ctx,
}: {
  areas: Area[];
  derived: Map<Id, AreaDerived>;
  ctx: RenderContext;
}): ReactElement | null {
  if (ctx.mode === 'thumb' || !ctx.layers.measures) return null;
  const { theme } = ctx;
  const screen = ctx.mode === 'screen';
  const size = printSize(ctx, 2);
  const gap = printSize(ctx, 1.2);

  return (
    <g className="scene-layer layer-dims" pointerEvents="none">
      {areas.map((a) => {
        if (a.kind === 'outdoor') return null;
        const d = derived.get(a.id);
        if (!d || d.net.length === 0) return null;
        const box = bboxOf(d.net);
        return d.edges.map((e) => {
          const text = formatLength(e.length);
          const key = `${a.id}:${e.axis}:${e.x}:${e.y}`;
          if (screen) {
            // Room extent across the text: a dim needs room for the name label beside it.
            const span = e.axis === 'h' ? box.y1 - box.y0 : box.x1 - box.x0;
            const style = { '--len': e.length, '--span': span, '--in': e.inward } as CSSProperties;
            return (
              <g key={key} className="dim" transform={frameOf(e)} style={style}>
                <text className="scene-text dim-text scene-halo" textAnchor="middle">
                  {text}
                </text>
                <text className="scene-text dim-text" textAnchor="middle" fill={theme.dim}>
                  {text}
                </text>
              </g>
            );
          }
          const y = e.inward > 0 ? gap + size * 0.72 : -gap;
          const font = {
            y,
            textAnchor: 'middle' as const,
            fontSize: size,
            fontFamily: 'Inter, sans-serif',
          };
          return (
            <g key={key} transform={frameOf(e)}>
              <text
                {...font}
                fill={theme.halo}
                stroke={theme.halo}
                strokeWidth={size * 0.3}
                strokeLinejoin="round"
              >
                {text}
              </text>
              <text {...font} fill={theme.dim}>
                {text}
              </text>
            </g>
          );
        });
      })}
    </g>
  );
});
