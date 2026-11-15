import { type Box, r1, rng, wrapped } from './kit.tsx';

export interface PlankSegment {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  tone: number;
}

/**
 * Rows of planks with random lengths. Each row repeats every `w`; a segment may cross the
 * right tile edge and wraps to the left one.
 */
export function plankRows(
  seed: number,
  w: number,
  rows: number,
  pitch: number,
  len: [number, number],
  tones: number,
): PlankSegment[] {
  const rand = rng(seed);
  const out: PlankSegment[] = [];
  for (let r = 0; r < rows; r++) {
    const start = Math.round((rand() * w) / 10) * 10;
    let x = start;
    while (x < start + w) {
      const remain = start + w - x;
      let l = Math.round((len[0] + rand() * (len[1] - len[0])) / 10) * 10;
      if (remain - l < len[0]) l = remain;
      out.push({
        x0: x,
        x1: x + l,
        y0: r * pitch,
        y1: (r + 1) * pitch,
        tone: Math.floor(rand() * tones),
      });
      x += l;
    }
  }
  return out;
}

const boxOfSeg = (s: PlankSegment): Box => ({ minX: s.x0, minY: s.y0, maxX: s.x1, maxY: s.y1 });

export function segRectD(s: PlankSegment, w: number, h: number, inset = 0): string {
  return wrapped(boxOfSeg(s), w, h, (ox) => {
    const x = s.x0 + ox + inset;
    return `M${r1(x)} ${r1(s.y0 + inset)}h${r1(s.x1 - s.x0 - inset * 2)}v${r1(s.y1 - s.y0 - inset * 2)}h${r1(-(s.x1 - s.x0 - inset * 2))}Z`;
  });
}

/** The end joint at the start of each segment, both copies when it sits on the tile edge. */
export function endJointsD(segs: PlankSegment[], w: number): string {
  let d = '';
  for (const s of segs) {
    const x = ((s.x0 % w) + w) % w;
    d += `M${r1(x)} ${r1(s.y0)}V${r1(s.y1)}`;
    if (x === 0) d += `M${w} ${r1(s.y0)}V${r1(s.y1)}`;
  }
  return d;
}

/** Long joints between rows, on both tile edges. */
export function rowJointsD(rows: number, pitch: number, w: number): string {
  let d = '';
  for (let r = 0; r <= rows; r++) d += `M0 ${r * pitch}H${w}`;
  return d;
}

/**
 * Wood grain inside each segment: gentle lines along the length that stop short of the ends,
 * plus a few knots as small closed loops.
 */
export function grainD(
  seed: number,
  segs: PlankSegment[],
  w: number,
  h: number,
  perPlank: number,
  knotChance: number,
): { dark: string; light: string } {
  const rand = rng(seed);
  let dark = '';
  let light = '';
  for (const s of segs) {
    const ph = s.y1 - s.y0;
    const pl = s.x1 - s.x0;
    for (let i = 0; i < perPlank; i++) {
      const y = s.y0 + ph * (0.15 + rand() * 0.7);
      const a = s.x0 + 20 + rand() * pl * 0.35;
      const b = s.x1 - 20 - rand() * pl * 0.35;
      if (b - a < 60) continue;
      const amp = (rand() - 0.5) * ph * 0.18;
      const m1 = a + (b - a) / 3;
      const m2 = a + ((b - a) * 2) / 3;
      const box: Box = { minX: a, minY: s.y0, maxX: b, maxY: s.y1 };
      const d = wrapped(
        box,
        w,
        h,
        (ox) =>
          `M${r1(a + ox)} ${r1(y)}C${r1(m1 + ox)} ${r1(y + amp)} ${r1(m2 + ox)} ${r1(y - amp)} ${r1(b + ox)} ${r1(y + amp * 0.3)}`,
      );
      if (i % 2 === 0) dark += d;
      else light += d;
    }
    if (rand() < knotChance && pl > 300) {
      const kx = s.x0 + pl * (0.2 + rand() * 0.6);
      const ky = s.y0 + ph * (0.35 + rand() * 0.3);
      const rx = ph * 0.12;
      const ry = ph * 0.07;
      const box: Box = { minX: kx - rx, minY: s.y0, maxX: kx + rx, maxY: s.y1 };
      dark += wrapped(
        box,
        w,
        h,
        (ox) =>
          `M${r1(kx - rx + ox)} ${r1(ky)}a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(rx * 2)} 0a${r1(rx)} ${r1(ry)} 0 1 0 ${r1(-rx * 2)} 0Z`,
      );
    }
  }
  return { dark, light };
}
