// Text widths for the print layout, in paper mm. The app loads Inter for its UI, so the canvas
// measures with the same metrics that the PDF (Inter TTF) and the SVG (Inter woff2) draw with.

const FAMILY = '"Inter Variable", Inter, Arial, sans-serif';
const PROBE = 100;
const cache = new Map<string, number>();
let ctx2d: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (ctx2d === undefined) {
    try {
      ctx2d = document.createElement('canvas').getContext('2d');
    } catch {
      ctx2d = null;
    }
  }
  return ctx2d;
}

/** Waits for the UI copy of Inter, so the first export measures with the right metrics. */
export async function ensureMeasureFont(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`400 ${PROBE}px "Inter Variable"`),
      document.fonts.load(`700 ${PROBE}px "Inter Variable"`),
    ]);
  } catch {
    // The fallback widths below are wider than Inter, so the layout stays safe.
  }
}

/** Width of `text` at `size` mm. Bold measures at weight 700, the widest face that prints. */
export function textWidth(text: string, size: number, bold = false): number {
  const key = `${bold ? 'b' : 'n'}|${text}`;
  let w = cache.get(key);
  if (w === undefined) {
    const g = context();
    if (g) {
      g.font = `${bold ? 700 : 400} ${PROBE}px ${FAMILY}`;
      w = g.measureText(text).width / PROBE;
    } else {
      w = [...text].length * (bold ? 0.64 : 0.6);
    }
    // A small margin covers the gap between the measure font and the printed face.
    w *= 1.04;
    cache.set(key, w);
  }
  return w * size;
}

/** Greedy word wrap that never drops a word; a word wider than the line gets a line of its own. */
export function wrapLines(text: string, width: number, size: number, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Cuts the text with an ellipsis to fit `width` mm. */
export function fitText(text: string, width: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= width) return text;
  const chars = [...text];
  let n = chars.length;
  while (n > 1 && textWidth(`${chars.slice(0, n).join('').trimEnd()}…`, size, bold) > width) n--;
  return `${chars.slice(0, n).join('').trimEnd()}…`;
}
