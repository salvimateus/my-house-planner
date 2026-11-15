import type { ProjectDoc } from '../model/types.ts';
import type { SheetLayout } from './layout.ts';
import { sheetLayoutFor } from './sheet.ts';
import { exportFileName, sheetSvgMarkup } from './svgExport.ts';
import { ExportError, type ExportOptions } from './types.ts';

export type PngDpi = 150 | 300;

/** iOS Safari refuses canvases above about 16.7 M pixels. */
const MOBILE_MAX_PIXELS = 16_000_000;
/** Desktop browsers accept far more; this keeps memory reasonable. */
const DESKTOP_MAX_PIXELS = 64_000_000;
const MM_PER_INCH = 25.4;

const CANVAS_ERROR =
  'Este aparelho não conseguiu criar uma imagem desse tamanho. Escolha 150 DPI ou a folha A4.';

function isMobileDevice(): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export const maxCanvasPixels = (): number =>
  isMobileDevice() ? MOBILE_MAX_PIXELS : DESKTOP_MAX_PIXELS;

export interface PngSize {
  width: number;
  height: number;
  /** The DPI after the pixel cap; lower than the asked DPI on small devices. */
  dpi: number;
}

/** Pixel size for the paper at `dpi`, with the DPI lowered until the canvas fits the cap. */
export function pngSize(wMm: number, hMm: number, dpi: number, maxPixels: number): PngSize {
  const px = (mm: number, d: number) => Math.round((mm / MM_PER_INCH) * d);
  let d = dpi;
  if (px(wMm, d) * px(hMm, d) > maxPixels) {
    d = Math.floor(dpi * Math.sqrt(maxPixels / (px(wMm, dpi) * px(hMm, dpi))));
    while (d > 1 && px(wMm, d) * px(hMm, d) > maxPixels) d -= 1;
  }
  return { width: px(wMm, d), height: px(hMm, d), dpi: d };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adds a `pHYs` chunk after `IHDR`, so image and print apps open the PNG at its paper size. */
async function withDpi(blob: Blob, dpi: number): Promise<Blob> {
  const src = new Uint8Array(await blob.arrayBuffer());
  // Signature (8) + IHDR chunk (4 length + 4 type + 13 data + 4 crc).
  const at = 33;
  if (src.length < at || String.fromCharCode(...src.subarray(12, 16)) !== 'IHDR') return blob;
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  return new Blob([src.subarray(0, at), chunk, src.subarray(at)], { type: 'image/png' });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new ExportError('Não foi possível desenhar a imagem. Tente de novo.'));
    img.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Draws the image at the size; null when the browser cannot hold the canvas. */
async function rasterize(img: HTMLImageElement, size: PngSize): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, size.width, size.height);
  g.drawImage(img, 0, 0, size.width, size.height);
  const blob = await canvasBlob(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export interface PngResult {
  file: File;
  size: PngSize;
  layout: SheetLayout;
}

/**
 * High resolution PNG: the self-contained SVG drawn on a white canvas. A canvas that the browser
 * refuses gets a retry at a lower DPI; the result carries the real DPI.
 */
export async function exportPng(
  doc: ProjectDoc,
  opts: ExportOptions,
  dpi: PngDpi,
): Promise<PngResult> {
  const first = sheetLayoutFor(doc, opts);
  let size = pngSize(first.w, first.h, dpi, maxCanvasPixels());
  const { markup, layout } = await sheetSvgMarkup(doc, opts, size);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    try {
      await img.decode();
    } catch {
      // `onload` already fired: the image is usable.
    }
    // Lets the embedded font finish before the first draw (Safari).
    await new Promise((r) => setTimeout(r, 60));
    for (let attempt = 0; attempt < 3; attempt++) {
      const blob = await rasterize(img, size);
      if (blob) {
        const png = await withDpi(blob, size.dpi);
        return {
          file: new File([png], exportFileName(doc, opts, 'png'), { type: 'image/png' }),
          size,
          layout,
        };
      }
      size = pngSize(layout.w, layout.h, Math.floor(size.dpi * 0.7), Number.POSITIVE_INFINITY);
    }
    throw new ExportError(CANVAS_ERROR);
  } finally {
    URL.revokeObjectURL(url);
  }
}
