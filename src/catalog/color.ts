// Hex color math shared by the item symbols and the material patterns. Output is lowercase `#rrggbb`.

type Rgb = [number, number, number];

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/** Accepts `#rgb` and `#rrggbb`; anything else reads as mid gray. */
function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n) || h.length < 6) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: Rgb): string {
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

/** Relative luminance 0..1 (Rec. 709 coefficients on gamma values, enough for tone decisions). */
export function luma(c: string): number {
  const [r, g, b] = hexToRgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Gray of equal Rec. 709 luma: the mono print of floor fills. */
export function toGray(c: string): string {
  const v = luma(c) * 255;
  return rgbToHex([v, v, v]);
}

/** Gray of equal Rec. 601 luma: the mono print of item symbols. */
export function toGray601(c: string): string {
  const [r, g, b] = hexToRgb(c);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex([y, y, y]);
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
