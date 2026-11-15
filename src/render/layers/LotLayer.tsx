import type { CSSProperties, ReactElement } from 'react';
import { memo } from 'react';
import { regionPath } from '../../geometry/shape.ts';
import type { Region } from '../../geometry/types.ts';
import type { Lot, Side } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { fillPaint } from '../PatternDefs.tsx';
import { printSize, type RenderContext, strokeProps } from '../RenderContext.ts';
import { StreetCanopies } from './ContextLayer.tsx';

const streetSides = (lot: Lot): Side[] =>
  lot.cornerSide ? [lot.frontSide, lot.cornerSide] : [lot.frontSide];

/** Lot ground, muro (lot walls), street tree crowns over them, lot line and the lot size outside the lot. */
export const LotLayer = memo(function LotLayer({
  lot,
  boundaryGeom,
  ctx,
  pxPerMm,
}: {
  lot: Lot;
  boundaryGeom: Region;
  ctx: RenderContext;
  pxPerMm?: number;
}): ReactElement {
  const { theme } = ctx;
  const { width: w, depth: d } = lot;
  const screen = ctx.mode === 'screen';
  const streets = streetSides(lot);
  // The size labels sit on a side without a street when possible.
  const widthSide: Side = streets.includes('top') ? 'bottom' : 'top';
  const depthSide: Side = streets.includes('left') ? 'right' : 'left';
  const showSize = screen && ctx.layers.measures;

  return (
    <g className="scene-layer layer-lot" pointerEvents="none">
      <rect
        x={0}
        y={0}
        width={w}
        height={d}
        fill={fillPaint(lot.ground, ctx, pxPerMm)}
        data-reveal="ground"
      />
      {boundaryGeom.length ? (
        <path
          d={regionPath(boundaryGeom)}
          fill={theme.muro}
          fillRule="evenodd"
          data-reveal="muro"
        />
      ) : null}
      <StreetCanopies lot={lot} ctx={ctx} />
      <rect
        x={0}
        y={0}
        width={w}
        height={d}
        fill="none"
        stroke={theme.lotLine}
        {...strokeProps(ctx, 1.25, 0.25)}
        data-reveal="lotline"
      />
      {screen ? (
        <rect
          className="lot-reveal-outline"
          x={0}
          y={0}
          width={w}
          height={d}
          pathLength={1}
          fill="none"
          stroke={theme.lotLine}
          data-reveal="outline"
        />
      ) : null}
      {showSize ? (
        <>
          <LotSize ctx={ctx} side={widthSide} x={w / 2} y={widthSide === 'top' ? 0 : d}>
            {formatLength(w)}
          </LotSize>
          <LotSize ctx={ctx} side={depthSide} x={depthSide === 'left' ? 0 : w} y={d / 2}>
            {formatLength(d)}
          </LotSize>
        </>
      ) : null}
    </g>
  );
});

/** A lot size text just outside the lot line, with a halo. */
function LotSize({
  ctx,
  side,
  x,
  y,
  children,
}: {
  ctx: RenderContext;
  side: Side;
  x: number;
  y: number;
  children: string;
}): ReactElement {
  const vertical = side === 'left' || side === 'right';
  // Outward along the text frame y: rotate(-90) maps local +y to world +x.
  const out = side === 'top' || side === 'left' ? -1 : 1;
  const transform = `translate(${x} ${y})${vertical ? ' rotate(-90)' : ''}`;
  const { theme } = ctx;
  if (ctx.mode === 'screen') {
    const style = { '--out': out } as CSSProperties;
    return (
      <g transform={transform} className="lot-size" style={style}>
        {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: SVG text is not focusable; the halo is a visual duplicate. */}
        <text
          className="scene-text lot-size-text scene-halo"
          textAnchor="middle"
          aria-hidden="true"
        >
          {children}
        </text>
        <text className="scene-text lot-size-text" textAnchor="middle" fill={theme.dim}>
          {children}
        </text>
      </g>
    );
  }
  const size = printSize(ctx, 2.4);
  const gap = printSize(ctx, 1.6);
  const dy = out > 0 ? gap + size * 0.72 : -gap;
  const common = {
    y: dy,
    textAnchor: 'middle' as const,
    fontSize: size,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 'bold',
  };
  return (
    <g transform={transform}>
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: SVG text is not focusable; the halo is a visual duplicate. */}
      <text
        {...common}
        aria-hidden="true"
        fill={theme.halo}
        stroke={theme.halo}
        strokeWidth={size * 0.3}
        strokeLinejoin="round"
      >
        {children}
      </text>
      <text {...common} fill={theme.dim}>
        {children}
      </text>
    </g>
  );
}
