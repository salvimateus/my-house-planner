import type { ReactElement } from 'react';
import { memo } from 'react';
import { circleD, rng } from '../catalog/materials/lib/kit.tsx';
import { blob, n, pen } from '../catalog/symbolKit.ts';
import type { Mm, StreetTreeSpecies } from '../model/types.ts';
import type { RenderContext } from './RenderContext.ts';
import { contextPalette } from './theme.ts';

interface SpeciesLook {
  leaf: string;
  leafDark: string;
  leafLight: string;
  bloom: string | null;
  bloomLight: string | null;
  /** Flower density at full bloom; 0 for a tree without flowers. */
  clusters: number;
}

/** Top-view looks of the street tree species, in flower where they flower. */
export const SPECIES_LOOK: Record<StreetTreeSpecies, SpeciesLook> = {
  'ipe-amarelo': {
    leaf: '#93A651',
    leafDark: '#6F873B',
    leafLight: '#BCC86E',
    bloom: '#F1BE2A',
    bloomLight: '#FBE184',
    clusters: 9,
  },
  'ipe-roxo': {
    leaf: '#8C9C56',
    leafDark: '#6B7D40',
    leafLight: '#B2BE74',
    bloom: '#C462B3',
    bloomLight: '#E7A6DA',
    clusters: 9,
  },
  quaresmeira: {
    leaf: '#5F9149',
    leafDark: '#467136',
    leafLight: '#88B26A',
    bloom: '#8454B9',
    bloomLight: '#B592DD',
    clusters: 6,
  },
  oiti: {
    leaf: '#407636',
    leafDark: '#2E5A27',
    leafLight: '#5F9449',
    bloom: null,
    bloomLight: null,
    clusters: 0,
  },
  reseda: {
    leaf: '#7AA85B',
    leafDark: '#5C8944',
    leafLight: '#A5C881',
    bloom: '#EC8DB4',
    bloomLight: '#F8C4D8',
    clusters: 8,
  },
};

/** Stable seed for an id or a key. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

interface CanopyPaths {
  base: string;
  mid: string;
  shadeD: string;
  light: string;
  bloom: string;
  bloomHi: string;
}

const cache = new Map<string, CanopyPaths>();

interface Clump {
  x: number;
  y: number;
  r: number;
}

/** Sub-crowns: one in the middle and a ring around it, so the crown reads as branches seen from above. */
function clumpsOf(R: number, seed: number): Clump[] {
  const rnd = rng(seed * 104729 + 17);
  const ring = 6 + (seed % 2);
  const out: Clump[] = [{ x: 0, y: 0, r: R * 0.5 }];
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
    const r = R * (0.36 + rnd() * 0.1);
    const d = R - r - R * rnd() * 0.06;
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r });
  }
  return out;
}

const clumpsD = (clumps: Clump[], seed: number, k = 1, dx = 0, dy = 0): string =>
  clumps
    .map((c, i) => blob(c.x * k + dx, c.y * k + dy, c.r * k, c.r * k, 7, seed + i * 7, 0.84))
    .join('');

function canopyPaths(species: StreetTreeSpecies, size: Mm, seed: number): CanopyPaths {
  const key = `${species}:${size}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const look = SPECIES_LOOK[species];
  const R = size / 2;
  const rnd = rng(seed * 7919 + size);
  const clumps = clumpsOf(R, seed);
  // Each sub-crown: a dark body, its lit top shifted to the north-west, a highlight on that side.
  const base = clumpsD(clumps, seed);
  const mid = clumpsD(clumps, seed + 1, 0.86, -R * 0.05, -R * 0.06);
  let light = '';
  for (const c of clumps) {
    const r = c.r * 0.42;
    light += blob(c.x - c.r * 0.3, c.y - c.r * 0.34, r, r * 0.9, 6, seed + Math.round(c.r), 0.8);
  }
  // Inner shade where the sub-crowns meet.
  let shadeD = '';
  for (let i = 1; i < clumps.length; i += 2) {
    const c = clumps[i]!;
    const r = R * 0.16;
    shadeD += blob(c.x * 0.5 + R * 0.06, c.y * 0.5 + R * 0.08, r, r * 0.8, 6, seed + 50 + i, 0.8);
  }
  // Flowers spread over the whole crown: many small tufts, a few catching the light.
  let bloom = '';
  let bloomHi = '';
  const tufts = look.clusters * 5;
  for (let i = 0; i < tufts; i++) {
    const a = rnd() * Math.PI * 2;
    const d = R * Math.sqrt(rnd()) * 0.86;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const r = R * (0.035 + rnd() * 0.035);
    bloom += circleD(cx, cy, r);
    if (i % 3 === 0) bloomHi += circleD(cx - r * 0.3, cy - r * 0.3, r * 0.45);
  }
  const out = { base, mid, shadeD, light, bloom, bloomHi };
  if (cache.size > 400) cache.clear();
  cache.set(key, out);
  return out;
}

/** Soft ground shadow of a crown, screen only. Drawn under every crown so canopies never shade each other. */
export function CanopyShadow({
  x,
  y,
  size,
  seed,
  ctx,
}: {
  x: Mm;
  y: Mm;
  size: Mm;
  seed: number;
  ctx: RenderContext;
}): ReactElement | null {
  if (ctx.mode !== 'screen') return null;
  const R = size / 2;
  return (
    <path
      d={clumpsD(clumpsOf(R, seed), seed, 1, x + R * 0.16, y + R * 0.22)}
      fill={contextPalette(ctx).shadow}
      fillOpacity={0.13}
    />
  );
}

/** A detailed top-view street tree crown centered on (x, y). */
export const StreetTreeCrown = memo(function StreetTreeCrown({
  x,
  y,
  size,
  species,
  seed,
  ctx,
}: {
  x: Mm;
  y: Mm;
  size: Mm;
  species: StreetTreeSpecies;
  seed: number;
  ctx: RenderContext;
}): ReactElement {
  const p = pen(ctx);
  const look = SPECIES_LOOK[species];
  const paths = canopyPaths(species, size, seed);
  const transform = `translate(${n(x)} ${n(y)})`;
  if (!p.detail) {
    return <path d={paths.base} transform={transform} fill={p.c(look.leaf)} />;
  }
  const trunk = Math.max(60, Math.min(120, size * 0.025));
  return (
    <g transform={transform}>
      <path d={paths.base} fill={p.c(look.leafDark)} />
      <path d={paths.mid} fill={p.c(look.leaf)} />
      <path d={paths.shadeD} fill={p.c(look.leafDark)} fillOpacity={0.45} />
      <path d={paths.light} fill={p.c(look.leafLight)} fillOpacity={0.75} />
      {look.bloom && paths.bloom ? (
        <>
          <path d={paths.bloom} fill={p.c(look.bloom)} fillOpacity={0.92} />
          <path d={paths.bloomHi} fill={p.c(look.bloomLight ?? look.bloom)} fillOpacity={0.85} />
        </>
      ) : null}
      <circle r={trunk} fill={p.c('#6E5136')} fillOpacity={0.55} />
    </g>
  );
});
