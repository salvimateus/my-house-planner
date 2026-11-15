import interLatinUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import { ExportError } from './types.ts';

const FONT_ERROR =
  'Não foi possível carregar a fonte do desenho. Confira a internet e tente de novo.';

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function fetchBase64(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ExportError(FONT_ERROR, { cause: err });
  }
  if (!res.ok) throw new ExportError(FONT_ERROR);
  return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
}

/** Caches the promise, and drops it on failure so a retry fetches again. */
function cached(load: () => Promise<string>): () => Promise<string> {
  let p: Promise<string> | null = null;
  return () => {
    if (!p) {
      p = load().catch((err: unknown) => {
        p = null;
        throw err;
      });
    }
    return p;
  };
}

const base = import.meta.env.BASE_URL;

/** Inter TTF faces for jsPDF: the standard PDF fonts have no accents, "ç" or "²". */
export const PDF_FONTS = [
  { file: 'Inter-Regular.ttf', style: 'normal' },
  { file: 'Inter-SemiBold.ttf', style: 'bold' },
] as const;

const pdfLoaders = new Map(
  PDF_FONTS.map((f) => [f.file, cached(() => fetchBase64(`${base}fonts/pdf/${f.file}`))]),
);

export function pdfFontBase64(file: (typeof PDF_FONTS)[number]['file']): Promise<string> {
  const load = pdfLoaders.get(file);
  if (!load) throw new ExportError(FONT_ERROR);
  return load();
}

/** Inter latin variable woff2, for the `@font-face` embedded in SVG and PNG output. */
export const interWoff2Base64 = cached(() => fetchBase64(interLatinUrl));
