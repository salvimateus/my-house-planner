import { createElement as h, type ReactElement } from 'react';
import { cornerRect, edge, n, pen, SHADOW, shade } from '../../symbolKit.ts';
import type { SymbolProps } from '../../types.ts';

/** Body proportions along the length (u: -0.5 rear .. +0.5 front) and width (v: -0.5 .. 0.5). */
export interface CarProfile {
  /** Front corner rounding, fraction of the length. */
  nose: number;
  /** Rear corner rounding, fraction of the length. */
  tail: number;
  /** Half width of the body; mirrors reach 0.5. */
  body: number;
  /** Windshield base, where the hood ends. */
  windshield: number;
  roofFront: number;
  roofRear: number;
  /** Rear window end, where the trunk or the tailgate starts. */
  rearWindow: number;
  /** Wheel centers along the length. */
  axles: [number, number];
}

export const CAR_COLORS = ['#C8352E', '#F4F5F7', '#2A2D33', '#B9BEC5', '#2F5D9E'];

const GLASS = '#6F8499';
const TIRE = '#2B2E33';
const HEADLIGHT = '#FFF6D5';
const TAILLIGHT = '#C8372F';

export function carSymbol(profile: CarProfile, { w, d, color, ctx }: SymbolProps): ReactElement {
  const p = pen(ctx);
  const ux = (u: number): number => n(u * w);
  const vy = (v: number): number => n(v * d);
  const pt = (u: number, v: number): string => `${ux(u)} ${vy(v)}`;
  const { nose, tail, body: b } = profile;

  const bodyPath = (dx: number, dy: number): string => {
    const q = (u: number, v: number): string => `${n(u * w + dx)} ${n(v * d + dy)}`;
    return (
      `M${q(-0.5 + tail, -b)}L${q(0.5 - nose, -b * 0.97)}` +
      `C${q(0.5 - nose * 0.3, -b * 0.95)} ${q(0.5, -b * 0.78)} ${q(0.5, -b * 0.42)}` +
      `L${q(0.5, b * 0.42)}C${q(0.5, b * 0.78)} ${q(0.5 - nose * 0.3, b * 0.95)} ${q(0.5 - nose, b * 0.97)}` +
      `L${q(-0.5 + tail, b)}C${q(-0.5 + tail * 0.35, b)} ${q(-0.5, b * 0.88)} ${q(-0.5, b * 0.6)}` +
      `L${q(-0.5, -b * 0.6)}C${q(-0.5, -b * 0.88)} ${q(-0.5 + tail * 0.35, -b)} ${q(-0.5 + tail, -b)}Z`
    );
  };

  const paint = p.c(color);
  const stroke = p.c(edge(color));
  const shadowEl =
    p.shadow &&
    h('path', {
      d: bodyPath(SHADOW.dx, SHADOW.dy),
      fill: SHADOW.fill,
      fillOpacity: SHADOW.fillOpacity,
    });
  const bodyEl = h('path', {
    d: bodyPath(0, 0),
    fill: paint,
    stroke,
    strokeLinejoin: 'round',
    ...p.line,
  });
  if (!p.detail) return h('g', null, bodyEl);

  const wheelL = 0.17;
  let wheels = '';
  for (const a of profile.axles) {
    for (const s of [-1, 1]) {
      wheels += cornerRect(
        (a - wheelL / 2) * w,
        s < 0 ? -0.495 * d : (b - 0.1) * d,
        wheelL * w,
        (0.595 - b) * d,
        d * 0.03,
      );
    }
  }

  const ws = profile.windshield;
  const mirror = (s: number): string =>
    `M${pt(ws - 0.005, s * (b - 0.01))}L${pt(ws - 0.025, s * 0.5)}L${pt(ws - 0.07, s * 0.5)}L${pt(ws - 0.065, s * (b - 0.01))}Z`;

  const rw = profile.rearWindow;
  const glass =
    `M${pt(ws, -0.36)}Q${pt(ws + 0.035, 0)} ${pt(ws, 0.36)}` +
    `L${pt(profile.roofFront, 0.41)}L${pt(profile.roofRear, 0.41)}L${pt(rw, 0.34)}` +
    `Q${pt(rw - 0.015, 0)} ${pt(rw, -0.34)}L${pt(profile.roofRear, -0.41)}L${pt(profile.roofFront, -0.41)}Z`;

  const roofLen = profile.roofFront - profile.roofRear;
  const roof = cornerRect(profile.roofRear * w, -0.33 * d, roofLen * w, 0.66 * d, d * 0.07);
  const pillar = (profile.roofFront + profile.roofRear) / 2;

  const hood = `M${pt(ws + 0.02, -0.2)}Q${pt(0.38, -0.24)} ${pt(0.46, -0.3)}M${pt(ws + 0.02, 0.2)}Q${pt(0.38, 0.24)} ${pt(0.46, 0.3)}`;

  // Lamps sit inside the rounded corners, so they never cross the outline.
  const lamps = (u0: number, u1: number): string =>
    cornerRect(u0 * w, -0.35 * d, (u1 - u0) * w, 0.13 * d, d * 0.03) +
    cornerRect(u0 * w, 0.22 * d, (u1 - u0) * w, 0.13 * d, d * 0.03);

  return h(
    'g',
    null,
    shadowEl,
    h('path', { d: wheels, fill: p.c(TIRE), stroke: p.c('#16181B'), ...p.fine }),
    h('path', {
      d: mirror(-1) + mirror(1),
      fill: paint,
      stroke,
      strokeLinejoin: 'round',
      ...p.fine,
    }),
    bodyEl,
    h('path', { d: hood, fill: 'none', stroke, strokeOpacity: 0.7, ...p.fine }),
    h('path', {
      d: lamps(0.5 - nose * 0.75, 0.5 - nose * 0.25),
      fill: p.c(HEADLIGHT),
      stroke,
      ...p.fine,
    }),
    h('path', {
      d: lamps(-0.5 + tail * 0.25, -0.5 + tail * 0.85),
      fill: p.c(TAILLIGHT),
      stroke,
      ...p.fine,
    }),
    h('path', {
      d: glass,
      fill: p.c(GLASS),
      stroke: p.c(edge(GLASS)),
      strokeLinejoin: 'round',
      ...p.fine,
    }),
    h('path', {
      d: `M${pt(pillar, -0.42)}V${vy(-0.33)}M${pt(pillar, 0.33)}V${vy(0.42)}`,
      fill: 'none',
      stroke: paint,
      strokeWidth: n(d * 0.025),
    }),
    h('path', { d: roof, fill: p.c(shade(color, 0.12)), stroke, ...p.line }),
  );
}
