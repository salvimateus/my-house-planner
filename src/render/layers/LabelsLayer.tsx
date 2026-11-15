import type { CSSProperties, ReactElement } from 'react';
import { memo } from 'react';
import type { AreaDerived } from '../../geometry/types.ts';
import type { Area, Id } from '../../model/types.ts';
import { formatArea } from '../../model/units.ts';
import { printSize, type RenderContext } from '../RenderContext.ts';

/**
 * Name and net area of every area, centered in the largest free rectangle (geometry/labels.ts).
 * Screen: the font size comes from CSS (`--fit` clamped by `--mmpp`), so zoom needs no re-render.
 * Print: explicit sizes and a duplicate text as the halo.
 */
export const LabelsLayer = memo(function LabelsLayer({
  areas,
  derived,
  ctx,
}: {
  areas: Area[];
  derived: Map<Id, AreaDerived>;
  ctx: RenderContext;
}): ReactElement | null {
  if (ctx.mode === 'thumb') return null;
  return (
    <g className="scene-layer layer-labels" pointerEvents="none">
      {areas.map((a) => {
        const d = derived.get(a.id);
        if (!d?.label.rect) return null;
        const areaText = formatArea(d.netArea);
        return ctx.mode === 'screen' ? (
          <ScreenLabel key={a.id} name={a.name} areaText={areaText} d={d} ctx={ctx} />
        ) : (
          <PrintLabel key={a.id} name={a.name} areaText={areaText} d={d} ctx={ctx} />
        );
      })}
    </g>
  );
});

interface LabelProps {
  name: string;
  areaText: string;
  d: AreaDerived;
  ctx: RenderContext;
}

function ScreenLabel({ name, areaText, d, ctx }: LabelProps): ReactElement {
  const { label } = d;
  const style = { '--fit': label.fit } as CSSProperties;
  const lines = (
    <>
      <tspan className="area-label-name" x={0} dy="-0.12em">
        {name}
      </tspan>
      <tspan className="area-label-area" x={0} dy="1.15em">
        {areaText}
      </tspan>
    </>
  );
  return (
    <g className="area-label" transform={`translate(${label.x} ${label.y})`} style={style}>
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: SVG text is not focusable; the halo is a visual duplicate. */}
      <text className="scene-text scene-halo" textAnchor="middle" aria-hidden="true">
        {lines}
      </text>
      <text className="scene-text" textAnchor="middle" fill={ctx.theme.label}>
        <tspan className="area-label-name" x={0} dy="-0.12em">
          {name}
        </tspan>
        <tspan className="area-label-area" x={0} dy="1.15em" fill={ctx.theme.labelSub}>
          {areaText}
        </tspan>
      </text>
    </g>
  );
}

function PrintLabel({ name, areaText, d, ctx }: LabelProps): ReactElement {
  const { label } = d;
  const size = Math.min(printSize(ctx, 3.2), Math.max(printSize(ctx, 1.8), label.fit));
  const sub = size * 0.85;
  const nameY = label.y - size * 0.12;
  const areaY = nameY + sub * 1.15;
  const { theme } = ctx;
  const font = { fontFamily: 'Inter, sans-serif', textAnchor: 'middle' as const };
  const halo = {
    'aria-hidden': true,
    fill: theme.halo,
    stroke: theme.halo,
    strokeLinejoin: 'round' as const,
  };
  return (
    <g>
      <text
        {...font}
        {...halo}
        x={label.x}
        y={nameY}
        fontSize={size}
        fontWeight="bold"
        strokeWidth={size * 0.3}
      >
        {name}
      </text>
      <text {...font} {...halo} x={label.x} y={areaY} fontSize={sub} strokeWidth={sub * 0.3}>
        {areaText}
      </text>
      <text {...font} x={label.x} y={nameY} fontSize={size} fontWeight="bold" fill={theme.label}>
        {name}
      </text>
      <text {...font} x={label.x} y={areaY} fontSize={sub} fill={theme.labelSub}>
        {areaText}
      </text>
    </g>
  );
}
