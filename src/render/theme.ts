import type { RenderContext, SceneTheme } from './RenderContext.ts';

/** Scene colors. Hex only, because svg2pdf parses only hex, rgb() and named colors. */
export const SCENE_THEME: SceneTheme = {
  world: '#E9ECE4',
  street: '#6B7079',
  streetLine: '#F2EFE6',
  curb: '#B9B4A8',
  sidewalk: '#DAD5C8',
  sidewalkJoint: '#CFC9BB',
  serviceStrip: '#A8CF8E',
  neighborLine: '#C8C8C0',
  neighborHouse: '#DEDED8',
  neighborRidge: '#E8E8E3',
  lotLine: '#8C8F86',
  ground: '#EFE7D2',
  muro: '#9A9DA3',
  wall: '#2F3339',
  grid: '#8C8F86',
  label: '#23272E',
  labelSub: '#4B5260',
  halo: '#FFFFFF',
  dim: '#5B6B7A',
  ruler: '#0F8C8C',
  door: '#2F3339',
  swingArc: '#8A94A6',
  glass: '#6FB3E0',
  openingLabel: '#7A828E',
  invalid: '#E5484D',
};

/** Black and white print: white fills, black walls, grey context. */
export const MONO_THEME: SceneTheme = {
  world: '#FFFFFF',
  street: '#D4D4D4',
  streetLine: '#FFFFFF',
  curb: '#A3A3A3',
  sidewalk: '#EFEFEF',
  sidewalkJoint: '#CFCFCF',
  serviceStrip: '#E2E2E2',
  neighborLine: '#A8A8A8',
  neighborHouse: '#EDEDED',
  neighborRidge: '#F6F6F6',
  lotLine: '#5C5C5C',
  ground: '#FFFFFF',
  muro: '#7A7A7A',
  wall: '#111111',
  grid: '#9E9E9E',
  label: '#111111',
  labelSub: '#333333',
  halo: '#FFFFFF',
  dim: '#333333',
  ruler: '#222222',
  door: '#111111',
  swingArc: '#777777',
  glass: '#8C8C8C',
  openingLabel: '#555555',
  invalid: '#444444',
};

/** Street trees on the sidewalk service strip. Not part of `SceneTheme`, so mono print picks a grey here. */
export function treeColors(ctx: RenderContext): { crown: string; edge: string } {
  return ctx.print?.mono
    ? { crown: '#D6D6D6', edge: '#9E9E9E' }
    : { crown: '#8CBF6F', edge: '#6E9F55' };
}

export const themeFor = (mono: boolean): SceneTheme => (mono ? MONO_THEME : SCENE_THEME);
