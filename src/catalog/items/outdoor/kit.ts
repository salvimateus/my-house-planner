import { type RenderContext, strokeProps } from '../../../render/RenderContext.ts';

/** Shared drawing helpers for the outdoor, garage and structure symbols. */

type Stroke = ReturnType<typeof strokeProps>;

export interface Pen {
  /** Outline stroke of the main shapes. */
  line: Stroke;
  /** Thinner stroke for inner detail lines. */
  fine: Stroke;
  /** False in thumb mode: draw the outline only. */
  detail: boolean;
  /** Soft shadows exist only on screen. */
  shadow: boolean;
  /** Maps a hex color to the output: gray in mono print, unchanged otherwise. */
  c: (hex: string) => string;
}

export const SHADOW = { dx: 40, dy: 60, fill: '#000000', fillOpacity: 0.08 } as const;

/** Rounds a coordinate to 0.1 mm so path strings stay short. */
export const n = (v: number): number => Math.round(v * 10) / 10;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Corner radius of 30 to 40 mm, smaller on thin shapes. */
export const corner = (w: number, d: number): number => Math.min(35, w / 4, d / 4);

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m?.[1] ? Number.parseInt(m[1], 16) : 0x808080;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const toHex = (rgb: number[]): string =>
  `#${rgb
    .map((x) =>
      Math.round(clamp(x, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/** amount < 0 mixes toward black, amount > 0 toward white (0..1). */
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  return toHex(parseHex(hex).map((c) => c + (target - c) * k));
}

// Fill and stroke pairs of the catalog style guide.
const EDGES: Record<string, string> = {
  '#FFFFFF': '#9AA3B0',
  '#F1F3F6': '#8A93A0',
  '#E7D3B5': '#B08E62',
  '#C9D3E0': '#8D9AAE',
  '#7BB661': '#5E9E48',
};

/** The one-step darker stroke of the same hue. */
export const edge = (hex: string): string => EDGES[hex.toUpperCase()] ?? shade(hex, -0.28);

function gray(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return toHex([y, y, y]);
}

export function pen(ctx: RenderContext): Pen {
  const mono = ctx.print?.mono === true;
  return {
    line: strokeProps(ctx, 1.25, 0.18),
    fine: strokeProps(ctx, 0.75, 0.1),
    detail: ctx.mode !== 'thumb',
    shadow: ctx.mode === 'screen',
    c: mono ? gray : (hex) => hex,
  };
}

/** Rounded rectangle as a path, so several can share one node. */
export function rrect(x: number, y: number, w: number, h: number, r: number): string {
  const k = n(clamp(r, 0, Math.min(w, h) / 2));
  const [x0, y0, x1, y1] = [n(x), n(y), n(x + w), n(y + h)];
  if (k === 0) return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
  const a = `A${k} ${k} 0 0 1`;
  return (
    `M${n(x0 + k)} ${y0}H${n(x1 - k)}${a} ${x1} ${n(y0 + k)}V${n(y1 - k)}` +
    `${a} ${n(x1 - k)} ${y1}H${n(x0 + k)}${a} ${x0} ${n(y1 - k)}V${n(y0 + k)}${a} ${n(x0 + k)} ${y0}Z`
  );
}

/** Ellipse as a path, so several can share one node. */
export function oval(cx: number, cy: number, rx: number, ry: number): string {
  const [a, b] = [n(rx), n(ry)];
  return `M${n(cx - rx)} ${n(cy)}A${a} ${b} 0 1 0 ${n(cx + rx)} ${n(cy)}A${a} ${b} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
}

/** Polygon from [x, y] pairs. */
export const poly = (pts: Array<[number, number]>): string =>
  `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`).join('')}Z`;

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
