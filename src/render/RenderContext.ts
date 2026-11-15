import { createContext, useContext } from 'react';
import type { LayerId } from '../model/types.ts';

export type SceneColor =
  | 'world'
  | 'street'
  | 'streetLine'
  | 'curb'
  | 'sidewalk'
  | 'sidewalkJoint'
  | 'serviceStrip'
  | 'neighborLine'
  | 'neighborHouse'
  | 'neighborRidge'
  | 'lotLine'
  | 'ground'
  | 'muro'
  | 'wall'
  | 'grid'
  | 'label'
  | 'labelSub'
  | 'halo'
  | 'dim'
  | 'ruler'
  | 'door'
  | 'swingArc'
  | 'glass'
  | 'openingLabel'
  | 'invalid';
/** Hex colors only: svg2pdf parses hex, rgb() and named colors. */
export type SceneTheme = Record<SceneColor, string>;

export interface RenderContext {
  mode: 'screen' | 'print' | 'thumb';
  theme: SceneTheme;
  /** scale 100 = 1:100 */
  print: { scale: number; mono: boolean } | null;
  layers: Record<LayerId, boolean>;
  reducedMotion: boolean;
}

const Ctx = createContext<RenderContext | null>(null);

export const RenderContextProvider = Ctx.Provider;

export function useRenderContext(): RenderContext {
  const c = useContext(Ctx);
  if (!c) throw new Error('RenderContext missing');
  return c;
}

/** Screen: non-scaling stroke of `screenPx`; print: `paperMm` on paper; thumb: a fixed world width. */
export function strokeProps(
  ctx: RenderContext,
  screenPx: number,
  paperMm: number,
): { strokeWidth: number; vectorEffect?: 'non-scaling-stroke' } {
  if (ctx.mode === 'screen') return { strokeWidth: screenPx, vectorEffect: 'non-scaling-stroke' };
  if (ctx.mode === 'print') return { strokeWidth: paperMm * (ctx.print?.scale ?? 100) };
  return { strokeWidth: 20 };
}

export const printSize = (ctx: RenderContext, paperMm: number): number =>
  paperMm * (ctx.print?.scale ?? 100);
