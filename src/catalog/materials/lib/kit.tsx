import type { ReactElement, ReactNode } from 'react';
import { printSize, type RenderContext } from '../../../render/RenderContext.ts';
import type { MaterialPatternProps } from '../../types.ts';

// Lives in a subfolder so the `./materials/*.tsx` registry glob does not load it as a material.

type Rgb = [number, number, number];

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n) || h.length < 6) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend in sRGB: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export const darken = (c: string, t: number): string => mix(c, '#000000', t);
export const lighten = (c: string, t: number): string => mix(c, '#ffffff', t);

/** Relative luminance 0..1 (sRGB coefficients on gamma values, enough for tone decisions). */
export function luma(c: string): number {
  const [r, g, b] = hexToRgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function toGray(c: string): string {
  const v = luma(c) * 255;
  return rgbToHex([v, v, v]);
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Hue rotation in degrees, saturation and lightness as absolute offsets (0..1 scale). */
export function shiftHsl(c: string, dh: number, ds: number, dl: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(c));
  const nh = (((h + dh) % 360) + 360) % 360;
  const ns = Math.max(0, Math.min(1, s + ds));
  const nl = Math.max(0, Math.min(1, l + dl));
  return rgbToHex(hslToRgb(nh, ns, nl));
}

/**
 * A darker detail tone that stays visible on pale bases and does not go muddy on dark ones.
 * `t` is the strength 0..1.
 */
export const shade = (c: string, t: number): string => darken(c, t * (0.55 + luma(c) * 0.45));
export const highlight = (c: string, t: number): string => lighten(c, t * (1.1 - luma(c) * 0.6));

/** Average of the base and its detail layers: [color, coverage × opacity] pairs over the base. */
export function blend(base: string, layers: Array<[string, number]>): string {
  let out = base;
  for (const [c, w] of layers) out = mix(out, c, w);
  return out;
}

/** Deterministic PRNG (mulberry32), so every render and the PDF get the same tile. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const r1 = (v: number): number => Math.round(v * 10) / 10;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Seamless wrap: the tile offsets (multiples of w, h) at which a shape with this bounding box
 * also shows inside the tile. The shape itself is the [0, 0] offset.
 */
export function wrapOffsets(b: Box, w: number, h: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      if (b.maxX + ox <= 0 || b.minX + ox >= w || b.maxY + oy <= 0 || b.minY + oy >= h) continue;
      out.push([ox, oy]);
    }
  }
  return out;
}

export type Pt = [number, number];

/** Closed smooth loop through the midpoints of the polygon edges, corners as control points. */
export function smoothD(pts: Pt[], ox = 0, oy = 0): string {
  const n = pts.length;
  const mid = (i: number): Pt => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + oy];
  };
  const m0 = mid(0);
  let d = `M${r1(m0[0])} ${r1(m0[1])}`;
  for (let i = 1; i <= n; i++) {
    const c = pts[i % n]!;
    const m = mid(i);
    d += `Q${r1(c[0] + ox)} ${r1(c[1] + oy)} ${r1(m[0])} ${r1(m[1])}`;
  }
  return `${d}Z`;
}

export function boxOf(pts: Pt[]): Box {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Same subpath at every wrap offset, so a shape that crosses a tile edge stays seamless. */
export function wrapped(
  b: Box,
  w: number,
  h: number,
  draw: (ox: number, oy: number) => string,
): string {
  return wrapOffsets(b, w, h)
    .map(([ox, oy]) => draw(ox, oy))
    .join('');
}

/** Irregular blob: a smooth loop with a random radius at each of `n` angles. */
export function blobPts(
  rand: () => number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  n: number,
  jitter: number,
): Pt[] {
  const pts: Pt[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 - jitter + rand() * jitter * 2;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

/** Many seamless blobs in one path `d`. */
export function blobsD(
  seed: number,
  count: number,
  w: number,
  h: number,
  size: [number, number],
  opts: { aspect?: [number, number]; points?: number; jitter?: number } = {},
): string {
  const rand = rng(seed);
  const [aMin, aMax] = opts.aspect ?? [0.6, 1];
  let d = '';
  for (let i = 0; i < count; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const rx = size[0] + rand() * (size[1] - size[0]);
    const ry = rx * (aMin + rand() * (aMax - aMin));
    const pts = blobPts(
      rand,
      cx,
      cy,
      rx,
      ry,
      rand() * Math.PI,
      opts.points ?? 7,
      opts.jitter ?? 0.25,
    );
    d += wrapped(boxOf(pts), w, h, (ox, oy) => smoothD(pts, ox, oy));
  }
  return d;
}

/** Many seamless short strokes (blades, fibers, grain) in one path `d`. */
export function strokesD(
  seed: number,
  count: number,
  w: number,
  h: number,
  len: [number, number],
  opts: { angle?: [number, number]; bend?: number } = {},
): string {
  const rand = rng(seed);
  const [aMin, aMax] = opts.angle ?? [0, Math.PI * 2];
  const bend = opts.bend ?? 0.25;
  let d = '';
  for (let i = 0; i < count; i++) {
    const x0 = rand() * w;
    const y0 = rand() * h;
    const l = len[0] + rand() * (len[1] - len[0]);
    const a = aMin + rand() * (aMax - aMin);
    const x1 = x0 + Math.cos(a) * l;
    const y1 = y0 + Math.sin(a) * l;
    const b = (rand() - 0.5) * 2 * bend * l;
    const cx = (x0 + x1) / 2 - Math.sin(a) * b;
    const cy = (y0 + y1) / 2 + Math.cos(a) * b;
    d += wrapped(
      boxOf([
        [x0, y0],
        [x1, y1],
        [cx, cy],
      ]),
      w,
      h,
      (ox, oy) => {
        return `M${r1(x0 + ox)} ${r1(y0 + oy)}Q${r1(cx + ox)} ${r1(cy + oy)} ${r1(x1 + ox)} ${r1(y1 + oy)}`;
      },
    );
  }
  return d;
}

/** Many seamless dots in one path `d` (each dot is a closed two-arc circle). */
export function dotsD(
  seed: number,
  count: number,
  w: number,
  h: number,
  r: [number, number],
): string {
  const rand = rng(seed);
  let d = '';
  for (let i = 0; i < count; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const rr = r[0] + rand() * (r[1] - r[0]);
    const box = { minX: cx - rr, minY: cy - rr, maxX: cx + rr, maxY: cy + rr };
    d += wrapped(box, w, h, (ox, oy) => circleD(cx + ox, cy + oy, rr));
  }
  return d;
}

export function circleD(cx: number, cy: number, r: number): string {
  const rr = r1(r);
  return `M${r1(cx - r)} ${r1(cy)}a${rr} ${rr} 0 1 0 ${r1(r * 2)} 0a${rr} ${rr} 0 1 0 ${r1(-r * 2)} 0Z`;
}

/** Grid joints: lines on both edges of the tile, half a joint each, and on every inner line. */
export function gridD(w: number, h: number, stepX: number, stepY: number): string {
  let d = '';
  for (let x = 0; x <= w + 0.01; x += stepX) d += `M${r1(x)} 0V${h}`;
  for (let y = 0; y <= h + 0.01; y += stepY) d += `M0 ${r1(y)}H${w}`;
  return d;
}

/**
 * Joint and fine-line width in world mm. Print keeps a minimum width on paper, so lines
 * stay visible at 1:100 and 1:50.
 */
export function lineW(ctx: RenderContext, mm: number, paperMinMm = 0.05): number {
  if (ctx.mode === 'print') return Math.max(mm, printSize(ctx, paperMinMm));
  return mm;
}

export function patternTransform(scale: number, angle: number): string | undefined {
  const parts: string[] = [];
  if (angle % 360 !== 0) parts.push(`rotate(${angle})`);
  if (scale !== 1) parts.push(`scale(${scale})`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** The `<pattern>` frame every material uses: true-size tile, base color background rect. */
export function Tile({
  p,
  w,
  h,
  extraAngle = 0,
  children,
}: {
  p: MaterialPatternProps;
  w: number;
  h: number;
  extraAngle?: number;
  children?: ReactNode;
}): ReactElement {
  return (
    <pattern
      id={p.id}
      patternUnits="userSpaceOnUse"
      x={0}
      y={0}
      width={w}
      height={h}
      patternTransform={patternTransform(p.scale, p.angle + extraAngle)}
    >
      <rect x={0} y={0} width={w} height={h} fill={p.color} />
      {children}
    </pattern>
  );
}

/** Rect subpath, repeated at the wrap offsets when it crosses a tile edge. */
export function rectD(x: number, y: number, rw: number, rh: number, w: number, h: number): string {
  return wrapped({ minX: x, minY: y, maxX: x + rw, maxY: y + rh }, w, h, (ox, oy) => {
    return `M${r1(x + ox)} ${r1(y + oy)}h${r1(rw)}v${r1(rh)}h${r1(-rw)}Z`;
  });
}
