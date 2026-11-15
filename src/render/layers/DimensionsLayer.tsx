import type { CSSProperties, ReactElement } from 'react';
import { memo, useMemo } from 'react';
import { useStore } from 'zustand';
import { CHAR_EM } from '../../geometry/labels.ts';
import { bboxOf, rectsOverlap } from '../../geometry/shape.ts';
import type { AreaDerived, EdgeDim, Rect } from '../../geometry/types.ts';
import type { Area, Id } from '../../model/types.ts';
import { formatArea, formatLength } from '../../model/units.ts';
import { cameraStore } from '../../store/cameraStore.ts';
import { printSize, type RenderContext } from '../RenderContext.ts';

/** `translate(x y) rotate(-90)` maps local +y to world +x, so `inward` is always the local y offset. */
const frameOf = (e: EdgeDim) => `translate(${e.x} ${e.y})${e.angle ? ' rotate(-90)' : ''}`;

// Screen sizes in px, kept in step with SceneSvg.css (.dim-text and .area-label).
const DIM_FONT_PX = 10.5;
const DIM_GAP_PX = 10;
const LABEL_MIN_PX = 8;
const LABEL_MAX_PX = 15;
const PAD_PX = 2;
/** Zoom buckets 12% apart: collisions are computed once per bucket, never per frame. */
const BUCKET = Math.log(1.12);

const dimKey = (areaId: Id, e: EdgeDim) => `${areaId}:${e.axis}:${e.x}:${e.y}`;

/** Screen box of a room name and area label, in world mm at this mm-per-px. */
function labelBox(a: Area, d: AreaDerived, mmpp: number): Rect | null {
  if (!d.label.rect) return null;
  const font = Math.min(LABEL_MAX_PX * mmpp, Math.max(LABEL_MIN_PX * mmpp, d.label.fit));
  const chars = Math.max(a.name.length, formatArea(d.netArea).length, 4);
  const hw = (chars * CHAR_EM * font) / 2 + PAD_PX * mmpp;
  const { x, y } = d.label;
  // Name baseline at -0.12em, area line 0.98em below it.
  return { x0: x - hw, x1: x + hw, y0: y - 0.95 * font, y1: y + 1.1 * font };
}

/** Screen box of a dimension text, in world mm, matching the CSS offset along `inward`. */
function dimBox(e: EdgeDim, text: string, mmpp: number): Rect {
  const font = DIM_FONT_PX * mmpp;
  const hw = (text.length * CHAR_EM * font) / 2 + PAD_PX * mmpp;
  const base = e.inward * DIM_GAP_PX * mmpp + (e.inward > 0 ? 0.72 * font : 0);
  const n0 = base - 0.75 * font;
  const n1 = base + 0.2 * font;
  // Horizontal text: the normal is world y. Vertical text (rotate -90): the normal is world x.
  return e.axis === 'h'
    ? { x0: e.x - hw, x1: e.x + hw, y0: e.y + n0, y1: e.y + n1 }
    : { x0: e.x + n0, x1: e.x + n1, y0: e.y - hw, y1: e.y + hw };
}

/** Keys of the dimensions whose text would cover any room label at this zoom. */
function coveredDims(areas: Area[], derived: Map<Id, AreaDerived>, zoom: number): Set<string> {
  const mmpp = 1 / zoom;
  const labels: Rect[] = [];
  for (const a of areas) {
    const d = derived.get(a.id);
    const box = d ? labelBox(a, d, mmpp) : null;
    if (box) labels.push(box);
  }
  const out = new Set<string>();
  for (const a of areas) {
    if (a.kind === 'outdoor') continue;
    const d = derived.get(a.id);
    if (!d) continue;
    for (const e of d.edges) {
      const box = dimBox(e, formatLength(e.length), mmpp);
      if (labels.some((l) => rectsOverlap(l, box))) out.add(dimKey(a.id, e));
    }
  }
  return out;
}

const NONE = new Set<string>();

/**
 * Internal wall lengths of rooms and covered areas (geometry/dimensions.ts). Screen: the gap from
 * the wall face, the font size and the hide rule for short edges on screen are CSS, from `--mmpp`.
 * Room name and area always win: a dimension that would cover any room label is not drawn.
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
  const bucket = useStore(cameraStore, (s) => Math.round(Math.log(s.committed.zoom) / BUCKET));
  const screen = ctx.mode === 'screen';
  const covered = useMemo(
    () => (screen ? coveredDims(areas, derived, Math.exp(bucket * BUCKET)) : NONE),
    [screen, areas, derived, bucket],
  );
  // Print dimensions come from the export label layout (src/export/printLabels.tsx).
  if (ctx.mode !== 'screen' || !ctx.layers.measures) return null;
  const { theme } = ctx;
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
          const key = dimKey(a.id, e);
          if (screen) {
            if (covered.has(key)) return null;
            // Room extent across the text: a dim needs room for the name label beside it.
            const span = e.axis === 'h' ? box.y1 - box.y0 : box.x1 - box.x0;
            const style = { '--len': e.length, '--span': span, '--in': e.inward } as CSSProperties;
            return (
              <g key={key} className="dim" transform={frameOf(e)} style={style}>
                {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: SVG text is not focusable; the halo is a visual duplicate. */}
                <text
                  className="scene-text dim-text scene-halo"
                  textAnchor="middle"
                  aria-hidden="true"
                >
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
              {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: SVG text is not focusable; the halo is a visual duplicate. */}
              <text
                {...font}
                aria-hidden="true"
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
