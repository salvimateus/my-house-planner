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

// ---- Passenger cars with a real size (hatch, sedan) ---------------------------------------------

/** A point as fractions of the length (u: -0.5 rear .. +0.5 front) and the width (v). */
type UV = readonly [number, number];
/** Cubic segment: two control points and the end point. */
type Seg = readonly [UV, UV, UV];

const straight = (from: UV, to: UV): Seg => [from, to, to];

/** Plan view of a passenger car, in fractions of its length and width. */
export interface PassengerCarSpec {
  kind: 'hatch' | 'sedan';
  /** Body outline on the -v side, from the front center (0.5, 0) to the rear center (-0.5, 0). */
  body: readonly Seg[];
  /** Where the hood ends. */
  windshield: number;
  roofFront: number;
  pillarB: number;
  roofRear: number;
  /** Where the rear window ends: the tailgate (hatch) or the trunk deck (sedan) starts. */
  rearGlass: number;
  /** Half width of the rear window at its lower edge. */
  rearGlassHalf: number;
  /** Where the side glass ends on the beltline. */
  sideGlassEnd: number;
  /** Door gaps along the length: front door, B pillar, rear door. */
  doors: readonly number[];
  /** Wheel centers along the length, at the real wheelbase. */
  axles: readonly [number, number];
  /** Tire diameter, fraction of the length. */
  tire: number;
  /** -v side lamps, as closed outlines from a start point. */
  headlight: readonly [UV, ...Seg[]];
  taillight: readonly [UV, ...Seg[]];
}

const TIRE_EDGE = '#16181B';
const WIPER = '#1E2126';
const SHEEN = '#FFFFFF';
const BELT = 0.435;
const ROOF_HALF = 0.35;

export function passengerCarSymbol(
  spec: PassengerCarSpec,
  { w, d, color, ctx }: SymbolProps,
): ReactElement {
  const p = pen(ctx);
  const at = (u: number, v: number, dx = 0, dy = 0): string => `${n(u * w + dx)} ${n(v * d + dy)}`;
  const pt = ([u, v]: UV, s = 1): string => at(u, v * s);

  /** Closed outline mirrored across the length axis; `side` runs on the -v side. */
  const symmetric = (start: UV, side: readonly Seg[], dx = 0, dy = 0): string => {
    const q = ([u, v]: UV, s = 1): string => at(u, v * s, dx, dy);
    let path = `M${q(start)}`;
    for (const [c1, c2, e] of side) path += `C${q(c1)} ${q(c2)} ${q(e)}`;
    const ends: UV[] = [start, ...side.map((sg) => sg[2])];
    for (let i = side.length - 1; i >= 0; i--) {
      const [c1, c2] = side[i] as Seg;
      path += `C${q(c2, -1)} ${q(c1, -1)} ${q(ends[i] as UV, -1)}`;
    }
    return `${path}Z`;
  };

  /** The same closed shape on both sides of the car. */
  const pair = ([start, ...segs]: readonly [UV, ...Seg[]]): string => {
    let path = '';
    for (const s of [-1, 1]) {
      path += `M${pt(start, s)}`;
      for (const [c1, c2, e] of segs) path += `C${pt(c1, s)} ${pt(c2, s)} ${pt(e, s)}`;
      path += 'Z';
    }
    return path;
  };

  const FRONT: UV = [0.5, 0];
  const paint = p.c(color);
  const stroke = p.c(edge(color));
  const bodyEl = h('path', {
    d: symmetric(FRONT, spec.body),
    fill: paint,
    stroke,
    strokeLinejoin: 'round',
    ...p.line,
  });
  if (!p.detail) return h('g', null, bodyEl);

  const { windshield: ws, roofFront: rf, roofRear: rr, rearGlass: rg, kind } = spec;

  const shadowEl =
    p.shadow &&
    h('path', {
      d: symmetric(FRONT, spec.body, SHADOW.dx, SHADOW.dy),
      fill: SHADOW.fill,
      fillOpacity: SHADOW.fillOpacity,
    });

  const m0 = ws - 0.012;
  const m1 = ws - 0.068;
  const mirrors = pair([
    [m0, -0.48],
    [
      [m0 - 0.004, -0.53],
      [m0 - 0.012, -0.558],
      [m0 - 0.03, -0.56],
    ],
    straight([m0 - 0.03, -0.56], [m1 + 0.008, -0.553]),
    [
      [m1, -0.54],
      [m1, -0.51],
      [m1, -0.48],
    ],
  ]);

  // Upper panels catch more light than the curved body sides.
  const plate = symmetric(
    [0.474, 0],
    [
      [
        [0.474, -0.2],
        [0.463, -0.33],
        [0.438, -0.378],
      ],
      [
        [0.41, -0.41],
        [0.36, -0.418],
        [0.3, -0.418],
      ],
      straight([0.3, -0.418], [-0.4, -0.418]),
      [
        [-0.448, -0.418],
        [-0.474, -0.4],
        [-0.478, -0.33],
      ],
      [
        [-0.482, -0.25],
        [-0.482, -0.1],
        [-0.482, 0],
      ],
    ],
  );

  let tires = '';
  const tl = spec.tire * w;
  for (const a of spec.axles) {
    tires += cornerRect(a * w - tl / 2, -0.524 * d, tl, 0.12 * d, d * 0.045);
    tires += cornerRect(a * w - tl / 2, 0.404 * d, tl, 0.12 * d, d * 0.045);
  }

  const hoodEnd = kind === 'sedan' ? 0.445 : 0.43;
  let seams =
    `M${at(ws + 0.03, -0.24)}Q${at((ws + hoodEnd) / 2, -0.265)} ${at(hoodEnd, -0.31)}` +
    `M${at(ws + 0.03, 0.24)}Q${at((ws + hoodEnd) / 2, 0.265)} ${at(hoodEnd, 0.31)}` +
    `M${at(0.452, -0.36)}Q${at(0.47, 0)} ${at(0.452, 0.36)}` +
    `M${at(-0.465, -0.39)}Q${at(-0.478, 0)} ${at(-0.465, 0.39)}`;
  // Fender shoulders over the wheels.
  for (const a of spec.axles) {
    const r = spec.tire * 0.62;
    for (const s of [-1, 1]) {
      seams += `M${at(a + r, s * 0.496)}Q${at(a, s * 0.43)} ${at(a - r, s * 0.496)}`;
    }
  }
  for (const u of spec.doors)
    seams += `M${at(u, -0.496)}V${n(-BELT * d)}M${at(u, BELT)}V${n(0.496 * d)}`;

  const glass = symmetric(
    [ws + 0.022, 0],
    [
      [
        [ws + 0.02, -0.22],
        [ws + 0.008, -0.37],
        [ws - 0.012, -0.415],
      ],
      [
        [ws - 0.03, -0.43],
        [ws - 0.05, -BELT],
        [ws - 0.07, -BELT],
      ],
      straight([ws - 0.07, -BELT], [spec.sideGlassEnd, -BELT]),
      [
        [spec.sideGlassEnd - 0.02, -BELT],
        [rr + 0.012, -0.39],
        [rr - 0.004, -0.352],
      ],
      straight([rr - 0.004, -0.352], [rg + 0.012, -spec.rearGlassHalf]),
      [
        [rg, -spec.rearGlassHalf * 0.7],
        [rg - 0.004, -0.2],
        [rg - 0.004, 0],
      ],
    ],
  );

  const pillarW = n(d * 0.03);
  const b = spec.pillarB;
  const pillars =
    `M${at(ws - 0.012, -0.415)}L${at(rf - 0.02, -ROOF_HALF)}M${at(ws - 0.012, 0.415)}L${at(rf - 0.02, ROOF_HALF)}` +
    `M${at(b, -BELT - 0.004)}V${n(-ROOF_HALF * d)}M${at(b, ROOF_HALF)}V${n((BELT + 0.004) * d)}`;

  const rearBow = kind === 'sedan' ? 0.012 : 0.002;
  const roof = symmetric(
    [rf + 0.008, 0],
    [
      [
        [rf + 0.008, -0.2],
        [rf + 0.002, -0.33],
        [rf - 0.02, -ROOF_HALF],
      ],
      straight([rf - 0.02, -ROOF_HALF], [rr + 0.02, -ROOF_HALF]),
      [
        [rr + 0.006, -ROOF_HALF],
        [rr, -0.335],
        [rr, -0.3],
      ],
      [
        [rr - rearBow, -0.2],
        [rr - rearBow, -0.1],
        [rr - rearBow, 0],
      ],
    ],
  );

  const wipers = `M${at(ws + 0.006, -0.34)}L${at(ws + 0.02, -0.07)}M${at(ws + 0.01, 0.0)}L${at(ws + 0.022, 0.27)}`;
  const sheen = `M${at(ws - 0.02, -0.2)}Q${at(ws - 0.045, -0.05)} ${at(rf + 0.03, 0.12)}`;

  // Hatch: a roof spoiler over the short rear window. Sedan: a flat trunk lid behind a long one.
  const rearPart =
    kind === 'hatch'
      ? h('path', {
          d: cornerRect((rr - 0.03) * w, -0.32 * d, 0.036 * w, 0.64 * d, d * 0.03),
          fill: p.c(shade(color, -0.18)),
          stroke,
          ...p.fine,
        })
      : h('path', {
          d: cornerRect(-0.468 * w, -0.385 * d, (rg - 0.01 + 0.468) * w, 0.77 * d, d * 0.07),
          fill: p.c(shade(color, 0.12)),
          stroke,
          strokeOpacity: 0.8,
          ...p.fine,
        });

  return h(
    'g',
    null,
    shadowEl,
    h('path', { d: tires, fill: p.c(TIRE), stroke: p.c(TIRE_EDGE), ...p.fine }),
    h('path', { d: mirrors, fill: paint, stroke, strokeLinejoin: 'round', ...p.fine }),
    bodyEl,
    h('path', { d: plate, fill: p.c(shade(color, 0.07)) }),
    h('path', { d: seams, fill: 'none', stroke, strokeOpacity: 0.6, ...p.fine }),
    h('path', { d: pair(spec.headlight), fill: p.c(HEADLIGHT), stroke, ...p.fine }),
    h('path', { d: pair(spec.taillight), fill: p.c(TAILLIGHT), stroke, ...p.fine }),
    kind === 'sedan' ? rearPart : null,
    h('path', {
      d: glass,
      fill: p.c(GLASS),
      stroke: p.c(edge(GLASS)),
      strokeLinejoin: 'round',
      ...p.fine,
    }),
    h('path', { d: wipers, fill: 'none', stroke: p.c(WIPER), strokeLinecap: 'round', ...p.fine }),
    h('path', { d: sheen, fill: 'none', stroke: p.c(SHEEN), strokeOpacity: 0.35, ...p.fine }),
    h('path', { d: pillars, fill: 'none', stroke: paint, strokeWidth: pillarW }),
    h('path', { d: roof, fill: p.c(shade(color, 0.12)), stroke, ...p.line }),
    kind === 'hatch' ? rearPart : null,
  );
}
