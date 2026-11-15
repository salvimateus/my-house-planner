import { projectFileSlug } from '../io/projectFile.ts';
import type { ProjectDoc } from '../model/types.ts';
import { interWoff2Base64 } from './fonts.ts';
import type { SheetLayout } from './layout.ts';
import { renderSheet } from './sheet.ts';
import { ExportError, type ExportFormat, type ExportOptions } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function exportFileName(doc: ProjectDoc, opts: ExportOptions, format: ExportFormat): string {
  return `${projectFileSlug(doc.name)}-planta-${opts.paper.toLowerCase()}.${format}`;
}

/**
 * Self-contained SVG markup of the sheet: real paper size in mm and the Inter woff2 embedded as
 * the only CSS, so it renders the same in any browser, in an `<img>` and on a canvas.
 */
export async function sheetSvgMarkup(
  doc: ProjectDoc,
  opts: ExportOptions,
): Promise<{ markup: string; layout: SheetLayout }> {
  const font = await interWoff2Base64();
  const sheet = renderSheet(doc, opts);
  try {
    const { layout } = sheet;
    // A detached copy, so the `@font-face` never registers in the app document.
    const svg = sheet.svg.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('width', `${layout.w}mm`);
    svg.setAttribute('height', `${layout.h}mm`);
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = `@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2");}`;
    svg.insertBefore(style, svg.firstChild);
    return { markup: new XMLSerializer().serializeToString(svg), layout };
  } catch (err) {
    throw new ExportError('Não foi possível montar o arquivo SVG. Tente de novo.', { cause: err });
  } finally {
    sheet.dispose();
  }
}

export async function exportSvg(doc: ProjectDoc, opts: ExportOptions): Promise<File> {
  const { markup } = await sheetSvgMarkup(doc, opts);
  return new File([markup], exportFileName(doc, opts, 'svg'), { type: 'image/svg+xml' });
}
