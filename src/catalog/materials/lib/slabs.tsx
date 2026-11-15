import type { ReactElement } from 'react';
import type { MaterialPatternProps } from '../../types.ts';
import { blend, blobsD, gridD, highlight, lineW, rng, shade, Tile } from './kit.tsx';

/** Rect subpaths of the slabs in a `n × n` repeat, grouped by a random tone 0..groups−1. */
export function slabTones(seed: number, n: number, size: number, groups: number): string[] {
  const rand = rng(seed);
  const perm = Array.from({ length: groups }, (_, k) => k).sort(() => rand() - 0.5);
  const shift = Math.floor(rand() * groups);
  const out: string[] = Array.from({ length: groups }, () => '');
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // Latin-square base, randomly permuted: no row or column turns into one stripe of tone.
      const g = perm[(i + 2 * j + shift) % groups]!;
      out[g] += `M${i * size} ${j * size}h${size}v${size}h${-size}Z`;
    }
  }
  return out;
}

export interface TileSpec {
  /** Piece side, mm. */
  size: number;
  /** Pieces per side of the pattern repeat. */
  n: number;
  /** Rendered joint width, mm. */
  joint: number;
  jointStrength: number;
  /** Tone spread between pieces, 0..1. */
  variation: number;
  /** Soft cloudy marks on the pieces, count per piece. */
  clouds: number;
  seed: number;
}

export interface TiledGeometry {
  spec: TileSpec;
  w: number;
  tone1: string;
  tone2: string;
  cloudsLight: string;
  cloudsDark: string;
  joints: string;
}

/** Rectified porcelain and ceramic: square pieces, thin grout, subtle tone shifts and clouds. */
export function tiledGeometry(spec: TileSpec): TiledGeometry {
  const w = spec.size * spec.n;
  const [, tone1 = '', tone2 = ''] = slabTones(spec.seed, spec.n, spec.size, 3);
  const cloudCount = Math.round(spec.clouds * spec.n * spec.n);
  const cloudR: [number, number] = [spec.size * 0.12, spec.size * 0.3];
  return {
    spec,
    w,
    tone1,
    tone2,
    cloudsLight: blobsD(spec.seed + 1, cloudCount, w, w, cloudR, {
      aspect: [0.5, 0.9],
      points: 9,
      jitter: 0.18,
    }),
    cloudsDark: blobsD(spec.seed + 2, Math.ceil(cloudCount * 0.6), w, w, cloudR, {
      aspect: [0.5, 0.9],
      points: 9,
      jitter: 0.18,
    }),
    joints: gridD(w, w, spec.size, spec.size),
  };
}

export function TiledPattern({
  p,
  g,
}: {
  p: MaterialPatternProps;
  g: TiledGeometry;
}): ReactElement {
  const c = p.color;
  const v = g.spec.variation;
  return (
    <Tile p={p} w={g.w} h={g.w}>
      <path d={g.tone1} fill={highlight(c, v)} />
      <path d={g.tone2} fill={shade(c, v * 0.8)} />
      <path d={g.cloudsLight} fill={highlight(c, 0.35)} fillOpacity={0.07} />
      <path d={g.cloudsDark} fill={shade(c, 0.2)} fillOpacity={0.045} />
      <path
        d={g.joints}
        fill="none"
        stroke={shade(c, g.spec.jointStrength)}
        strokeOpacity={0.85}
        strokeWidth={lineW(p.ctx, g.spec.joint)}
      />
    </Tile>
  );
}

export function tiledFlatColor(g: TiledGeometry, c: string): string {
  const coverage = ((g.spec.joint / g.spec.size) * 2 * 0.85 * 1000) / 1000;
  return blend(c, [[shade(c, g.spec.jointStrength), coverage]]);
}
