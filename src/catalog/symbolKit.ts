// Drawing helpers shared by every item symbol. Kept outside `items/`, so the item registry glob skips it.
import { type RenderContext, strokeProps } from '../render/RenderContext.ts';
import { darken as darkenHex, lighten as lightenHex, mix as mixHex, toGray601 } from './color.ts';

// ---- Colors -------------------------------------------------------------------------------------

export interface Swatch {
  fill: string;
  stroke: string;
}

// Fill and stroke pairs of the catalog style rules.
export const CERAMIC: Swatch = { fill: '#FFFFFF', stroke: '#9AA3B0' };
export const APPLIANCE: Swatch = { fill: '#F1F3F6', stroke: '#8A93A0' };
export const WOOD: Swatch = { fill: '#E7D3B5', stroke: '#B08E62' };
export const FABRIC: Swatch = { fill: '#C9D3E0', stroke: '#8D9AAE' };
export const PLANT: Swatch = { fill: '#7BB661', stroke: '#5E9E48' };
export const STEEL: Swatch = { fill: '#DCE1E7', stroke: '#8A93A0' };
export const STONE: Swatch = { fill: '#E6E2DA', stroke: '#A59D90' };
export const GLASS_TOP: Swatch = { fill: '#2F343B', stroke: '#1C2026' };
export const SCREEN: Swatch = { fill: '#3D434C', stroke: '#272B31' };
export const METAL: Swatch = { fill: '#6A717C', stroke: '#474D55' };

export const DARK = '#3A3F47';
export const WATER = '#E3EFF6';
export const FLAME = '#E8834A';
export const FROST = '#7FA9C9';

export const CERAMIC_COLORS = ['#FFFFFF', '#F2EEE6', '#2E3035'];
export const APPLIANCE_COLORS = ['#F1F3F6', '#C9CED6', '#2E3238'];
export const WOOD_COLORS = ['#E7D3B5', '#C89F74', '#8B6446', '#FFFFFF', '#3B3B3D'];
export const STONE_COLORS = ['#E6E2DA', '#FFFFFF', '#CDBFA8', '#3A3B3E'];

const HEX6 = /^#[0-9a-f]{6}$/i;

/** Linear mix of two `#RRGGBB` colors; t = 0 gives `a`. A non-hex input returns `a`. */
export function mix(a: string, b: string, t: number): string {
  if (!HEX6.test(a) || !HEX6.test(b)) return a;
  return mixHex(a, b, t).toUpperCase();
}

export const darken = (c: string, t = 0.3): string => mix(c, '#000000', t);
export const lighten = (c: string, t = 0.3): string => mix(c, '#FFFFFF', t);

/** Signed tone step: amount < 0 mixes toward black, amount > 0 toward white (0..1). */
export const shade = (hex: string, amount: number): string =>
  (amount < 0 ? darkenHex(hex, -amount) : lightenHex(hex, amount)).toUpperCase();

/** Mono print turns every color into its gray of equal luminance. */
export function mono(ctx: RenderContext, color: string): string {
  if (!ctx.print?.mono || !HEX6.test(color)) return color;
  return toGray601(color).toUpperCase();
}

/** The swatch stroke for the default fill, otherwise one step darker of the chosen color. */
export const strokeFor = (color: string, swatch: Swatch): string =>
  color.toUpperCase() === swatch.fill.toUpperCase() ? swatch.stroke : darken(color, 0.32);

/** Lighter line color for inner details, between the fill and the outline. */
export const detailColor = (fill: string, stroke: string, t = 0.35): string => mix(stroke, fill, t);

const EDGE_SWATCHES = [CERAMIC, APPLIANCE, WOOD, FABRIC, PLANT];

/** The style rule stroke of a known fill, otherwise a darker stroke of the same hue. */
export const edge = (hex: string): string =>
  EDGE_SWATCHES.find((s) => s.fill === hex.toUpperCase())?.stroke ?? shade(hex, -0.28);

export interface Paint {
  fill: string;
  stroke: string;
  detail: string;
}

const toPaint = (ctx: RenderContext, fill: string, stroke: string): Paint => ({
  fill: mono(ctx, fill),
  stroke: mono(ctx, stroke),
  detail: mono(ctx, detailColor(fill, stroke, 0.4)),
});

export const fixed = (ctx: RenderContext, tone: Swatch): Paint =>
  toPaint(ctx, tone.fill, tone.stroke);

/** Body paint. A custom color keeps its hue and gets a one-step darker stroke. */
export function paint(ctx: RenderContext, color: string, base: Swatch): Paint {
  const custom = HEX6.test(color) && color.toUpperCase() !== base.fill.toUpperCase();
  return custom ? toPaint(ctx, color, darken(color, 0.32)) : fixed(ctx, base);
}

// ---- Strokes and modes --------------------------------------------------------------------------

export const outline = (ctx: RenderContext) => strokeProps(ctx, 1.25, 0.18);
export const detail = (ctx: RenderContext) => strokeProps(ctx, 0.75, 0.1);
export const softDetail = (ctx: RenderContext) => strokeProps(ctx, 0.8, 0.1);

export function outlinePen(ctx: RenderContext, stroke: string) {
  return { stroke, strokeLinejoin: 'round' as const, ...outline(ctx) };
}

export function detailPen(ctx: RenderContext, stroke: string) {
  return {
    stroke,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    ...detail(ctx),
  };
}

/** Thumbnails draw the outline only. */
export const hasDetails = (ctx: RenderContext): boolean => ctx.mode !== 'thumb';
/** Soft shadows exist only on screen. */
export const hasShadow = (ctx: RenderContext): boolean => ctx.mode === 'screen';

export const SHADOW = { dx: 40, dy: 60, fill: '#000000', fillOpacity: 0.08 } as const;
export const SHADOW_FILL = { fill: SHADOW.fill, fillOpacity: SHADOW.fillOpacity } as const;

/** Screen only: the shadow props of a shape drawn at the shadow offset. */
export function shadow(ctx: RenderContext) {
  if (!hasShadow(ctx)) return null;
  return { ...SHADOW_FILL, transform: `translate(${SHADOW.dx} ${SHADOW.dy})` };
}

type Stroke = ReturnType<typeof strokeProps>;

export interface Pen {
  /** Outline stroke of the main shapes. */
  line: Stroke;
  /** Thinner stroke for inner detail lines. */
  fine: Stroke;
  detail: boolean;
  shadow: boolean;
  /** Maps a hex color to the output: gray in mono print, unchanged otherwise. */
  c: (hex: string) => string;
}

export function pen(ctx: RenderContext): Pen {
  return {
    line: outline(ctx),
    fine: detail(ctx),
    detail: hasDetails(ctx),
    shadow: hasShadow(ctx),
    c: ctx.print?.mono ? (hex) => toGray601(hex).toUpperCase() : (hex) => hex,
  };
}

// ---- Geometry -----------------------------------------------------------------------------------

/** Rounds a coordinate to 0.1 mm so path strings stay short. */
export const n = (v: number): number => Math.round(v * 10) / 10;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Corner radius in the 30 to 40 mm range, smaller on thin shapes. */
export const corner = (w: number, d: number, r = 35): number =>
  Math.max(0, Math.min(r, w / 4, d / 4));

export const mirror = (mirrored: boolean): string | undefined =>
  mirrored ? 'scale(-1 1)' : undefined;

/** Splits the span [a, b] into `count` equal parts separated by `gap`. */
export function splitSpan(
  a: number,
  b: number,
  count: number,
  gap: number,
): Array<[number, number]> {
  const size = (b - a - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => {
    const s = a + i * (size + gap);
    return [s, s + size];
  });
}

// ---- Paths (sub-paths, so many shapes can share one node) ---------------------------------------

export const line = (x1: number, y1: number, x2: number, y2: number): string =>
  `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;

/** Clockwise rounded rectangle centered at (cx, cy), rotated by `angle` radians. */
export function rrect(cx: number, cy: number, w: number, h: number, r: number, angle = 0): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const p = (x: number, y: number) => `${n(cx + x * cos - y * sin)} ${n(cy + x * sin + y * cos)}`;
  const hw = w / 2;
  const hh = h / 2;
  if (rr === 0) return `M${p(-hw, -hh)}L${p(hw, -hh)}L${p(hw, hh)}L${p(-hw, hh)}Z`;
  const a = `A${n(rr)} ${n(rr)} 0 0 1 `;
  return (
    `M${p(-hw + rr, -hh)}L${p(hw - rr, -hh)}${a}${p(hw, -hh + rr)}` +
    `L${p(hw, hh - rr)}${a}${p(hw - rr, hh)}L${p(-hw + rr, hh)}${a}${p(-hw, hh - rr)}` +
    `L${p(-hw, -hh + rr)}${a}${p(-hw + rr, -hh)}Z`
  );
}

/** Axis-aligned rounded rectangle from its top-left corner, drawn with H and V commands. */
export function cornerRect(x: number, y: number, w: number, h: number, r: number): string {
  const k = n(clamp(r, 0, Math.min(w, h) / 2));
  const [x0, y0, x1, y1] = [n(x), n(y), n(x + w), n(y + h)];
  if (k === 0) return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
  const a = `A${k} ${k} 0 0 1`;
  return (
    `M${n(x0 + k)} ${y0}H${n(x1 - k)}${a} ${x1} ${n(y0 + k)}V${n(y1 - k)}` +
    `${a} ${n(x1 - k)} ${y1}H${n(x0 + k)}${a} ${x0} ${n(y1 - k)}V${n(y0 + k)}${a} ${n(x0 + k)} ${y0}Z`
  );
}

/** Clockwise ellipse, so it unions with `rrect` under the nonzero fill rule. */
export function ellipse(cx: number, cy: number, rx: number, ry = rx, sweep: 0 | 1 = 1): string {
  const a = `A${n(rx)} ${n(ry)} 0 1 ${sweep} `;
  return `M${n(cx - rx)} ${n(cy)}${a}${n(cx + rx)} ${n(cy)}${a}${n(cx - rx)} ${n(cy)}Z`;
}

/** Counter-clockwise ellipse. */
export const oval = (cx: number, cy: number, rx: number, ry: number): string =>
  ellipse(cx, cy, rx, ry, 0);

export type Point = readonly [number, number];

/** Closed path through axis-aligned vertices, with each corner rounded by up to `r`. */
export function roundedPolygon(points: readonly Point[], r: number, dx = 0, dy = 0): string {
  const count = points.length;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const [px, py] = points[(i - 1 + count) % count]!;
    const [cx, cy] = points[i]!;
    const [nx, ny] = points[(i + 1) % count]!;
    const lin = Math.hypot(cx - px, cy - py);
    const lout = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, lin / 2, lout / 2);
    const ax = cx + ((px - cx) / lin) * rr + dx;
    const ay = cy + ((py - cy) / lin) * rr + dy;
    const bx = cx + ((nx - cx) / lout) * rr + dx;
    const by = cy + ((ny - cy) / lout) * rr + dy;
    parts.push(
      `${i === 0 ? 'M' : 'L'}${n(ax)} ${n(ay)}Q${n(cx + dx)} ${n(cy + dy)} ${n(bx)} ${n(by)}`,
    );
  }
  return `${parts.join('')}Z`;
}

const hash = (i: number, seed: number): number => {
  const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * Organic canopy outline: cubic lobes around an ellipse. Lobe peaks touch the
 * ellipse (rx, ry), valleys sit at `valley` of the radius. Deterministic per seed.
 */
export function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  lobes: number,
  seed: number,
  valley = 0.8,
): string {
  const step = (Math.PI * 2) / lobes;
  const angles: number[] = [];
  const radii: number[] = [];
  for (let i = 0; i < lobes; i++) {
    angles.push(i * step + (hash(i, seed) - 0.5) * step * 0.3 - Math.PI / 2);
    radii.push(valley * (0.96 + hash(i + 31, seed) * 0.08));
  }
  const pt = (a: number, r: number): string =>
    `${n(cx + Math.cos(a) * r * rx)} ${n(cy + Math.sin(a) * r * ry)}`;
  let path = `M${pt(angles[0] ?? 0, radii[0] ?? valley)}`;
  for (let i = 0; i < lobes; i++) {
    const a0 = angles[i] ?? 0;
    const a1 = i + 1 < lobes ? (angles[i + 1] ?? 0) : (angles[0] ?? 0) + Math.PI * 2;
    const r0 = radii[i] ?? valley;
    const r1 = i + 1 < lobes ? (radii[i + 1] ?? valley) : (radii[0] ?? valley);
    const span = a1 - a0;
    const peak = 0.98 - hash(i + 67, seed) * 0.06;
    // Cubic midpoint: 0.25 of the end points plus 0.75 of the controls, along the mid angle.
    const cr = (peak - 0.125 * (r0 + r1) * Math.cos(span / 2)) / (0.75 * Math.cos(span * 0.3) || 1);
    path += `C${pt(a0 + span * 0.2, cr)} ${pt(a1 - span * 0.2, cr)} ${pt(a1, r1)}`;
  }
  return `${path}Z`;
}
