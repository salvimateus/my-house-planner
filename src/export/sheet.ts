import { createElement } from 'react';
import { toGray601 } from '../catalog/color.ts';
import type { ProjectDoc } from '../model/types.ts';
import type { RenderContext } from '../render/RenderContext.ts';
import { renderOffscreen } from '../render/renderOffscreen.ts';
import { themeFor } from '../render/theme.ts';
import { sceneOf } from '../store/selectors.ts';
import { contentOf, layoutSheet, type SheetLayout } from './layout.ts';
import { PrintSheet } from './PrintSheet.tsx';
import { ExportError, type ExportOptions } from './types.ts';

export function printContext(opts: ExportOptions, scale: number): RenderContext {
  return {
    mode: 'print',
    theme: themeFor(opts.mono),
    print: { scale, mono: opts.mono },
    layers: {
      grid: opts.grid,
      context: opts.context,
      textures: true,
      items: opts.items,
      openings: true,
      measures: opts.measures || opts.lotSize || opts.rulers,
    },
    reducedMotion: true,
  };
}

export function sheetLayoutFor(doc: ProjectDoc, opts: ExportOptions): SheetLayout {
  const { box, pad } = contentOf(doc, sceneOf(doc), opts.frame);
  return layoutSheet(box, pad, opts.paper, opts.scale);
}

/**
 * svg2pdf maps only `normal` and `bold` (400 and 700) to the registered Inter faces; any other
 * weight falls back to a standard font without accents.
 */
function normalizeWeights(root: Element): void {
  for (const el of root.querySelectorAll('[font-weight]')) {
    const w = el.getAttribute('font-weight') ?? '';
    if (w === 'normal' || w === 'bold') continue;
    const n = Number(w);
    el.setAttribute('font-weight', w === 'bolder' || n >= 600 ? 'bold' : 'normal');
  }
}

const PAINT_ATTRS = ['fill', 'stroke', 'stop-color'];
const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/**
 * Black and white sheet: every hex paint becomes its gray, so symbols that keep their own colors
 * in print also turn gray. Gray input stays the same.
 */
function grayPaints(root: Element): void {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const name of PAINT_ATTRS) {
      const v = el.getAttribute(name);
      if (v && HEX.test(v)) el.setAttribute(name, toGray601(v));
    }
  }
}

/** Screen-only hooks that the print output does not need. */
function stripScreenAttributes(root: Element): void {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const name of el.getAttributeNames()) {
      if (name === 'class' || name === 'pointer-events' || name.startsWith('data-')) {
        el.removeAttribute(name);
      }
    }
  }
}

export interface RenderedSheet {
  svg: SVGSVGElement;
  layout: SheetLayout;
  dispose(): void;
}

/** The print sheet mounted offscreen, with the export toggles applied. Call `dispose()`. */
export function renderSheet(
  doc: ProjectDoc,
  opts: ExportOptions,
  date = new Date(),
): RenderedSheet {
  const scene = sceneOf(doc);
  const layout = sheetLayoutFor(doc, opts);
  const ctx = printContext(opts, layout.scale);
  const shown = opts.rulers ? doc : { ...doc, rulers: [] };
  let rendered: ReturnType<typeof renderOffscreen>;
  try {
    rendered = renderOffscreen(
      createElement(PrintSheet, {
        doc: shown,
        scene,
        layout,
        ctx,
        date: new Intl.DateTimeFormat('pt-BR').format(date),
      }),
    );
  } catch (err) {
    throw new ExportError('Não foi possível desenhar a folha. Tente de novo.', { cause: err });
  }
  const svg = rendered.root as SVGSVGElement;
  // Dims, lot size and rulers share the `measures` layer; each toggle removes its own part.
  if (!opts.measures) for (const g of svg.querySelectorAll('.layer-dims')) g.remove();
  if (!opts.lotSize) for (const t of svg.querySelectorAll('.layer-lot text')) t.remove();
  normalizeWeights(svg);
  if (opts.mono) grayPaints(svg);
  stripScreenAttributes(svg);
  return { svg, layout, dispose: rendered.dispose };
}
