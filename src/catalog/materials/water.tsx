import { defineMaterial } from '../types.ts';
import {
  blend,
  blobsD,
  boxOf,
  circleD,
  highlight,
  lineW,
  type Pt,
  r1,
  rng,
  shade,
  Tile,
  wrapped,
} from './lib/kit.tsx';

// Pool water: a caustic web drawn along the edges of a periodic Voronoi diagram. Edges bend a
// little and meet at brighter nodes, like the light that the waves focus on the pool floor.
const W = 1000;
const GRID = 5;

function sites(): Pt[] {
  const rand = rng(161);
  const cell = W / GRID;
  const out: Pt[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      out.push([(i + 0.15 + rand() * 0.7) * cell, (j + 0.15 + rand() * 0.7) * cell]);
    }
  }
  return out;
}

/** Keeps the part of the polygon nearer to `a` than to `b` (Sutherland–Hodgman half-plane). */
function clipNearer(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const k = (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) / 2;
  const side = (p: Pt): number => p[0] * nx + p[1] * ny - k;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function caustics(): { thin: string; bold: string; nodes: string } {
  const s = sites();
  const copies: Pt[] = [];
  for (const ox of [-W, 0, W])
    for (const oy of [-W, 0, W]) for (const [x, y] of s) copies.push([x + ox, y + oy]);
  const r = W / GRID;
  const seen = new Set<string>();
  const nodeSeen = new Set<string>();
  const key = (x: number, y: number): string =>
    `${Math.round(((x % W) + W) % W)}:${Math.round(((y % W) + W) % W)}`;
  let thin = '';
  let bold = '';
  let nodes = '';
  for (const a of s) {
    let poly: Pt[] = [
      [a[0] - r * 2, a[1] - r * 2],
      [a[0] + r * 2, a[1] - r * 2],
      [a[0] + r * 2, a[1] + r * 2],
      [a[0] - r * 2, a[1] + r * 2],
    ];
    for (const b of copies) {
      if (b[0] === a[0] && b[1] === a[1]) continue;
      if (Math.abs(b[0] - a[0]) > r * 3 || Math.abs(b[1] - a[1]) > r * 3) continue;
      poly = clipNearer(poly, a, b);
    }
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 4) continue;
      const k = key((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      if (seen.has(k)) continue;
      seen.add(k);
      // Same bend for both cells that share the edge: the random source is the edge key.
      const rand = rng(Number.parseInt(k.replace(':', ''), 10) || 1);
      const bend = (rand() - 0.5) * 0.5 * len;
      const nx = -(q[1] - p[1]) / len;
      const ny = (q[0] - p[0]) / len;
      const c: Pt = [(p[0] + q[0]) / 2 + nx * bend, (p[1] + q[1]) / 2 + ny * bend];
      const edge = wrapped(boxOf([p, q, c]), W, W, (ox, oy) => {
        return `M${r1(p[0] + ox)} ${r1(p[1] + oy)}Q${r1(c[0] + ox)} ${r1(c[1] + oy)} ${r1(q[0] + ox)} ${r1(q[1] + oy)}`;
      });
      if (rand() < 0.45) bold += edge;
      else thin += edge;
      const nk = key(p[0], p[1]);
      if (!nodeSeen.has(nk)) {
        nodeSeen.add(nk);
        const nr = 7 + rand() * 6;
        nodes += wrapped(
          { minX: p[0] - nr, minY: p[1] - nr, maxX: p[0] + nr, maxY: p[1] + nr },
          W,
          W,
          (ox, oy) => circleD(p[0] + ox, p[1] + oy, nr),
        );
      }
    }
  }
  return { thin, bold, nodes };
}

const web = caustics();
const deepD = blobsD(163, 6, W, W, [140, 320], { aspect: [0.5, 0.9], points: 8, jitter: 0.3 });
const glowD = blobsD(164, 5, W, W, [120, 260], { aspect: [0.5, 0.9], points: 8, jitter: 0.3 });

export default defineMaterial({
  id: 'water',
  label: 'Água',
  group: 'outdoor',
  permeable: false,
  defaultColor: '#7CC3E6',
  tile: { w: W / GRID, h: W / GRID },
  Pattern: (p) => {
    const c = p.color;
    const light = highlight(c, 0.75);
    return (
      <Tile p={p} w={W} h={W}>
        <path d={deepD} fill={shade(c, 0.2)} fillOpacity={0.18} />
        <path d={glowD} fill={highlight(c, 0.3)} fillOpacity={0.16} />
        <path
          d={web.thin + web.bold}
          fill="none"
          stroke={light}
          strokeOpacity={0.16}
          strokeWidth={lineW(p.ctx, 34)}
          strokeLinecap="round"
        />
        <path
          d={web.thin}
          fill="none"
          stroke={light}
          strokeOpacity={0.5}
          strokeWidth={lineW(p.ctx, 4)}
          strokeLinecap="round"
        />
        <path
          d={web.bold}
          fill="none"
          stroke={light}
          strokeOpacity={0.62}
          strokeWidth={lineW(p.ctx, 9)}
          strokeLinecap="round"
        />
        <path d={web.nodes} fill={light} fillOpacity={0.5} />
      </Tile>
    );
  },
  flatColor: (c) => blend(c, [[highlight(c, 0.75), 0.12]]),
});
