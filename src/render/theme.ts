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

/** Street, sidewalk and neighborhood colors beyond `SceneTheme`. Hex only; mono print gets grays. */
export interface ContextPalette {
  asphalt: string;
  asphaltDark: string;
  asphaltLight: string;
  gutter: string;
  curb: string;
  curbLow: string;
  paint: string;
  grass: string;
  slab: string;
  joint: string;
  ramp: string;
  rampFlare: string;
  rampLine: string;
  pit: string;
  neighborGround: readonly [string, string, string];
  neighborLine: string;
  shadow: string;
}

const CONTEXT_COLOR: ContextPalette = {
  asphalt: '#5D6169',
  asphaltDark: '#464A51',
  asphaltLight: '#878B92',
  gutter: '#B9B6AE',
  curb: '#CFCBC1',
  curbLow: '#DEDAD1',
  paint: '#F4F1E8',
  grass: '#9DC47B',
  slab: '#DCD7CB',
  joint: '#C2BCAE',
  ramp: '#EAE6DC',
  rampFlare: '#DAD5C9',
  rampLine: '#ABA597',
  pit: '#9A7B58',
  neighborGround: ['#E3E7DB', '#E6E8DE', '#E0E5D7'],
  neighborLine: '#B8BBB0',
  shadow: '#1E2B17',
};

const CONTEXT_MONO: ContextPalette = {
  asphalt: '#C9C9C9',
  asphaltDark: '#B3B3B3',
  asphaltLight: '#DADADA',
  gutter: '#E0E0E0',
  curb: '#A8A8A8',
  curbLow: '#C4C4C4',
  paint: '#FFFFFF',
  grass: '#E6E6E6',
  slab: '#F2F2F2',
  joint: '#C8C8C8',
  ramp: '#FAFAFA',
  rampFlare: '#EBEBEB',
  rampLine: '#9E9E9E',
  pit: '#BDBDBD',
  neighborGround: ['#FFFFFF', '#FFFFFF', '#FFFFFF'],
  neighborLine: '#A8A8A8',
  shadow: '#000000',
};

export const contextPalette = (ctx: RenderContext): ContextPalette =>
  ctx.print?.mono ? CONTEXT_MONO : CONTEXT_COLOR;

export const themeFor = (mono: boolean): SceneTheme => (mono ? MONO_THEME : SCENE_THEME);
