import { createElement } from 'react';
import type { Rect } from '../geometry/types.ts';
import type { ProjectDoc } from '../model/types.ts';
import { sceneOf } from '../store/selectors.ts';
import type { RenderContext } from './RenderContext.ts';
import { renderOffscreen } from './renderOffscreen.ts';
import { SceneSvg } from './SceneSvg.tsx';
import { SCENE_THEME } from './theme.ts';

export const THUMB_W = 240;
export const THUMB_H = 160;

const THUMB_CTX: RenderContext = {
  mode: 'thumb',
  theme: SCENE_THEME,
  print: null,
  layers: {
    grid: false,
    context: true,
    textures: false,
    items: true,
    openings: true,
    measures: false,
  },
  reducedMotion: true,
};

/** The lot, padded and widened to the 3:2 thumbnail box. */
function thumbViewBox(doc: ProjectDoc): Rect {
  const { width: w, depth: d } = doc.lot;
  const pad = Math.max(w, d) * 0.06;
  let bw = w + 2 * pad;
  let bh = d + 2 * pad;
  const aspect = THUMB_W / THUMB_H;
  if (bw / bh < aspect) bw = bh * aspect;
  else bh = bw / aspect;
  return { x0: w / 2 - bw / 2, y0: d / 2 - bh / 2, x1: w / 2 + bw / 2, y1: d / 2 + bh / 2 };
}

/** Gallery thumbnail: flat colors, no text, 240 × 160, serialized SVG markup. */
export function renderThumbSvg(doc: ProjectDoc): string {
  const { root, dispose } = renderOffscreen(
    createElement(SceneSvg, {
      doc,
      scene: sceneOf(doc),
      ctx: THUMB_CTX,
      viewBox: thumbViewBox(doc),
      width: THUMB_W,
      height: THUMB_H,
    }),
  );
  try {
    return new XMLSerializer().serializeToString(root);
  } finally {
    dispose();
  }
}
