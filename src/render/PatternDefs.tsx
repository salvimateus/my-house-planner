import type { ReactElement } from 'react';
import { toGray } from '../catalog/materials/lib/kit.tsx';
import { materialDef } from '../catalog/registry.ts';
import { tuning } from '../juice/tuning.ts';
import type { Fill } from '../model/types.ts';
import { type RenderContext, useRenderContext } from './RenderContext.ts';

const colorFor = (fill: Fill, ctx: RenderContext): string =>
  ctx.print?.mono ? toGray(fill.color) : fill.color;

const safe = (s: string): string => s.replace(/[^a-zA-Z0-9-]/g, '_');
const numToken = (n: number): string =>
  String(Math.round(n * 1000) / 1000)
    .replace('.', 'p')
    .replace('-', 'm');

/** `pat-<material>-<hex>-<scale>-<angle>`, a valid SVG id and CSS-safe in `url(#…)`. */
export function patternId(fill: Fill): string {
  const hex = fill.color
    .replace('#', '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  return `pat-${safe(fill.material)}-${hex}-${numToken(fill.scale)}-${fill.angle}`;
}

/**
 * True when the fill draws as flat color: `solid` or unknown material, thumbnails, the
 * textures layer off, or (with `pxPerMm`) a tile smaller than the LOD threshold on screen.
 */
export function isFlatFill(fill: Fill, ctx: RenderContext, pxPerMm?: number): boolean {
  const def = materialDef(fill.material);
  if (def.id === 'solid' || ctx.mode === 'thumb' || !ctx.layers.textures) return true;
  if (ctx.mode === 'screen' && pxPerMm !== undefined) {
    const tilePx = Math.min(def.tile.w, def.tile.h) * fill.scale * pxPerMm;
    if (tilePx < tuning.lod.patternMinTilePx) return true;
  }
  return false;
}

/**
 * The paint for an area fill: `url(#id)` of the pattern that `PatternDefs` renders, or a flat
 * hex color. Pass the screen `pxPerMm` (camera zoom) to apply the pattern LOD.
 */
export function fillPaint(fill: Fill, ctx: RenderContext, pxPerMm?: number): string {
  const def = materialDef(fill.material);
  const color = colorFor(fill, ctx);
  if (def.id === 'solid') return color;
  if (isFlatFill(fill, ctx, pxPerMm)) return def.flatColor(color);
  return `url(#${patternId(fill)})`;
}

/** One `<pattern>` per unique (material, color, scale, angle) among the fills in use. */
export function PatternDefs({ fills }: { fills: Fill[] }): ReactElement | null {
  const ctx = useRenderContext();
  if (ctx.mode === 'thumb' || !ctx.layers.textures) return null;
  const seen = new Map<string, Fill>();
  for (const f of fills) {
    if (materialDef(f.material).id === 'solid') continue;
    const id = patternId(f);
    if (!seen.has(id)) seen.set(id, f);
  }
  if (seen.size === 0) return null;
  return (
    <>
      {[...seen].map(([id, f]) => {
        const { Pattern } = materialDef(f.material);
        return (
          <Pattern
            key={id}
            id={id}
            color={colorFor(f, ctx)}
            scale={f.scale}
            angle={f.angle}
            ctx={ctx}
          />
        );
      })}
    </>
  );
}
