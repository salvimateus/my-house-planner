// Shared drawing kit for the WP6A symbols. A `.ts` file, so the `items/**/*.tsx` registry glob skips it.
import { type RenderContext, strokeProps } from '../../../render/RenderContext.ts';

export interface Tone {
  fill: string;
  stroke: string;
}

export const CERAMIC: Tone = { fill: '#FFFFFF', stroke: '#9AA3B0' };
export const APPLIANCE: Tone = { fill: '#F1F3F6', stroke: '#8A93A0' };
export const WOOD: Tone = { fill: '#E7D3B5', stroke: '#B08E62' };
export const FABRIC: Tone = { fill: '#C9D3E0', stroke: '#8D9AAE' };
export const STEEL: Tone = { fill: '#DCE1E7', stroke: '#8A93A0' };
export const STONE: Tone = { fill: '#E6E2DA', stroke: '#A59D90' };
export const GLASS_TOP: Tone = { fill: '#2F343B', stroke: '#1C2026' };

export const DARK = '#3A3F47';
export const WATER = '#E3EFF6';
export const FLAME = '#E8834A';
export const FROST = '#7FA9C9';

export const CERAMIC_COLORS = ['#FFFFFF', '#F2EEE6', '#2E3035'];
export const APPLIANCE_COLORS = ['#F1F3F6', '#C9CED6', '#2E3238'];
export const WOOD_COLORS = ['#E7D3B5', '#C89F74', '#8B6446', '#FFFFFF', '#3B3B3D'];
export const STONE_COLORS = ['#E6E2DA', '#FFFFFF', '#CDBFA8', '#3A3B3E'];

const HEX6 = /^#[0-9a-f]{6}$/i;

function channels(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Linear mix of two `#rrggbb` colors; t = 0 gives `a`. */
export function mix(a: string, b: string, t: number): string {
  if (!HEX6.test(a) || !HEX6.test(b)) return a;
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Mono print turns every color into its gray of equal luminance. */
export function ink(ctx: RenderContext, color: string): string {
  if (!ctx.print?.mono || !HEX6.test(color)) return color;
  const [r, g, b] = channels(color);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return toHex(y, y, y);
}

export interface Paint {
  fill: string;
  stroke: string;
  detail: string;
}

/** Body paint. A custom color keeps its hue and gets a one-step darker stroke. */
export function paint(ctx: RenderContext, color: string, base: Tone): Paint {
  const custom = HEX6.test(color) && color.toUpperCase() !== base.fill.toUpperCase();
  const fill = custom ? color : base.fill;
  const stroke = custom ? mix(color, '#000000', 0.32) : base.stroke;
  return {
    fill: ink(ctx, fill),
    stroke: ink(ctx, stroke),
    detail: ink(ctx, mix(stroke, fill, 0.4)),
  };
}

export const fixed = (ctx: RenderContext, tone: Tone): Paint => ({
  fill: ink(ctx, tone.fill),
  stroke: ink(ctx, tone.stroke),
  detail: ink(ctx, mix(tone.stroke, tone.fill, 0.4)),
});

/** Thumbnails draw the outline only. */
export const hasDetails = (ctx: RenderContext): boolean => ctx.mode !== 'thumb';

export function outline(ctx: RenderContext, stroke: string) {
  return { stroke, strokeLinejoin: 'round' as const, ...strokeProps(ctx, 1.25, 0.18) };
}

export function detail(ctx: RenderContext, stroke: string) {
  return {
    stroke,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    ...strokeProps(ctx, 0.75, 0.1),
  };
}

/** Screen only: a leaf shape offset by (40, 60) mm. */
export function shadow(ctx: RenderContext) {
  if (ctx.mode !== 'screen') return null;
  return { fill: '#000000', fillOpacity: 0.08, transform: 'translate(40 60)' };
}

export const corner = (w: number, d: number, r = 35): number =>
  Math.max(0, Math.min(r, w / 4, d / 4));

const n = (v: number): number => Math.round(v * 10) / 10;

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

/** Clockwise ellipse, so it unions with `rrect` under the nonzero fill rule. */
export function ellipse(cx: number, cy: number, rx: number, ry = rx): string {
  const a = `A${n(rx)} ${n(ry)} 0 1 1 `;
  return `M${n(cx - rx)} ${n(cy)}${a}${n(cx + rx)} ${n(cy)}${a}${n(cx - rx)} ${n(cy)}Z`;
}

export const line = (x1: number, y1: number, x2: number, y2: number): string =>
  `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;

/** Teardrop flame of height ~1.6·s, centered at (cx, cy). */
export function flame(cx: number, cy: number, s: number): string {
  const p = (x: number, y: number) => `${n(cx + x * s)} ${n(cy + y * s)}`;
  return `M${p(0, -1)}C${p(0.55, -0.4)} ${p(0.62, 0.15)} ${p(0, 0.6)}C${p(-0.62, 0.15)} ${p(-0.55, -0.4)} ${p(0, -1)}Z`;
}

export const mirror = (mirrored: boolean): string | undefined =>
  mirrored ? 'scale(-1 1)' : undefined;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
