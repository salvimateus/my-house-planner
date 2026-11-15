// Shared drawing helpers for the living, bedroom and office symbols.
// A `.ts` file on purpose: the item registry globs only `*.tsx`.
import { type RenderContext, strokeProps } from '../../../render/RenderContext.ts';

export interface Swatch {
  fill: string;
  stroke: string;
}

export const WOOD: Swatch = { fill: '#E7D3B5', stroke: '#B08E62' };
export const FABRIC: Swatch = { fill: '#C9D3E0', stroke: '#8D9AAE' };
export const CERAMIC: Swatch = { fill: '#FFFFFF', stroke: '#9AA3B0' };
export const APPLIANCE: Swatch = { fill: '#F1F3F6', stroke: '#8A93A0' };
export const PLANT: Swatch = { fill: '#7BB661', stroke: '#5E9E48' };
export const SCREEN: Swatch = { fill: '#3D434C', stroke: '#272B31' };
export const METAL: Swatch = { fill: '#6A717C', stroke: '#474D55' };

export const SHADOW_DX = 40;
export const SHADOW_DY = 60;
export const SHADOW_FILL = { fill: '#000000', fillOpacity: 0.08 } as const;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

const round1 = (n: number): number => Math.round(n * 10) / 10;

const HEX = /^#([0-9a-f]{6})$/i;

/** Linear mix of two `#rrggbb` colors; `t = 0` returns `a`. */
export function mix(a: string, b: string, t: number): string {
  const ma = HEX.exec(a);
  const mb = HEX.exec(b);
  if (!ma || !mb) return a;
  const na = Number.parseInt(ma[1]!, 16);
  const nb = Number.parseInt(mb[1]!, 16);
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const ca = (na >> shift) & 0xff;
    const cb = (nb >> shift) & 0xff;
    out |= Math.round(ca + (cb - ca) * t) << shift;
  }
  return `#${out.toString(16).padStart(6, '0').toUpperCase()}`;
}

export const darken = (c: string, t = 0.3): string => mix(c, '#000000', t);
export const lighten = (c: string, t = 0.3): string => mix(c, '#FFFFFF', t);

/** The swatch stroke for the default fill, otherwise one step darker of the chosen color. */
export const strokeFor = (color: string, swatch: Swatch): string =>
  color.toUpperCase() === swatch.fill.toUpperCase() ? swatch.stroke : darken(color, 0.32);

/** Lighter line color for inner details, between the fill and the outline. */
export const detailColor = (fill: string, stroke: string): string => mix(stroke, fill, 0.35);

export const outline = (ctx: RenderContext) => strokeProps(ctx, 1.25, 0.18);
export const detail = (ctx: RenderContext) => strokeProps(ctx, 0.8, 0.1);

export const hasDetails = (ctx: RenderContext): boolean => ctx.mode !== 'thumb';
export const hasShadow = (ctx: RenderContext): boolean => ctx.mode === 'screen';

/** Corner radius in the 30 to 40 mm range, smaller for small parts. */
export const corner = (w: number, d: number, r = 35): number => Math.min(r, w / 4, d / 4);

export type Point = readonly [number, number];

/** Closed path through axis-aligned vertices, with each corner rounded by up to `r`. */
export function roundedPolygon(points: readonly Point[], r: number, dx = 0, dy = 0): string {
  const n = points.length;
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[(i + 1) % n]!;
    const lin = Math.hypot(cx - px, cy - py);
    const lout = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, lin / 2, lout / 2);
    const ax = cx + ((px - cx) / lin) * rr + dx;
    const ay = cy + ((py - cy) / lin) * rr + dy;
    const bx = cx + ((nx - cx) / lout) * rr + dx;
    const by = cy + ((ny - cy) / lout) * rr + dy;
    parts.push(
      `${i === 0 ? 'M' : 'L'}${round1(ax)} ${round1(ay)}Q${round1(cx + dx)} ${round1(cy + dy)} ${round1(bx)} ${round1(by)}`,
    );
  }
  return `${parts.join('')}Z`;
}

/** Sub-path of a plain rectangle, to merge many small rectangles into one node. */
export const rectPath = (x: number, y: number, w: number, h: number): string =>
  `M${round1(x)} ${round1(y)}h${round1(w)}v${round1(h)}h${round1(-w)}Z`;

/** Sub-path of a straight segment. */
export const segPath = (x1: number, y1: number, x2: number, y2: number): string =>
  `M${round1(x1)} ${round1(y1)}L${round1(x2)} ${round1(y2)}`;

/** Sub-path of a full circle. */
export const circlePath = (cx: number, cy: number, r: number): string =>
  `M${round1(cx - r)} ${round1(cy)}a${round1(r)} ${round1(r)} 0 1 0 ${round1(2 * r)} 0a${round1(r)} ${round1(r)} 0 1 0 ${round1(-2 * r)} 0Z`;

/** Splits the span [a, b] into `n` equal parts separated by `gap`. */
export function splitSpan(a: number, b: number, n: number, gap: number): Array<[number, number]> {
  const size = (b - a - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const s = a + i * (size + gap);
    return [s, s + size];
  });
}
