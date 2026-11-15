import { defineMaterial } from '../types.ts';
import { blend, blobsD, gridD, highlight, lineW, r1, rng, shade, Tile } from './lib/kit.tsx';
import { slabTones } from './lib/slabs.tsx';

// Polished 60 × 60 slabs. Veins stay inside each slab and stop at the joints, as on a real floor.
const SIZE = 600;
const N = 3;
const W = SIZE * N;
const EDGE = 5;

type P2 = [number, number];

/** Where the line through (cx, cy) at angle a leaves the square [x0, x0 + s] (both ways). */
function chord(x0: number, y0: number, s: number, cx: number, cy: number, a: number): [P2, P2] {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const lo = EDGE;
  const hi = s - EDGE;
  const tFor = (sign: number): number => {
    let t = Number.POSITIVE_INFINITY;
    const ux = dx * sign;
    const uy = dy * sign;
    if (ux > 1e-6) t = Math.min(t, (x0 + hi - cx) / ux);
    if (ux < -1e-6) t = Math.min(t, (x0 + lo - cx) / ux);
    if (uy > 1e-6) t = Math.min(t, (y0 + hi - cy) / uy);
    if (uy < -1e-6) t = Math.min(t, (y0 + lo - cy) / uy);
    return t;
  };
  const t1 = tFor(1);
  const t0 = tFor(-1);
  return [
    [cx - dx * t0, cy - dy * t0],
    [cx + dx * t1, cy + dy * t1],
  ];
}

const clampIn = (v: number, x0: number): number =>
  Math.max(x0 + EDGE, Math.min(x0 + SIZE - EDGE, v));

function veins(): { main: string; fine: string } {
  const rand = rng(71);
  let main = '';
  let fine = '';
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = i * SIZE;
      const y0 = j * SIZE;
      const count = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < count; k++) {
        const a = (20 + rand() * 40) * (Math.PI / 180) * (rand() < 0.3 ? -1 : 1);
        const cx = x0 + SIZE * (0.25 + rand() * 0.5);
        const cy = y0 + SIZE * (0.25 + rand() * 0.5);
        const [s, e] = chord(x0, y0, SIZE, cx, cy, a);
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const b1 = (rand() - 0.5) * SIZE * 0.35;
        const b2 = (rand() - 0.5) * SIZE * 0.35;
        const c1: P2 = [
          clampIn(s[0] + (e[0] - s[0]) / 3 + nx * b1, x0),
          clampIn(s[1] + (e[1] - s[1]) / 3 + ny * b1, y0),
        ];
        const c2: P2 = [
          clampIn(s[0] + ((e[0] - s[0]) * 2) / 3 + nx * b2, x0),
          clampIn(s[1] + ((e[1] - s[1]) * 2) / 3 + ny * b2, y0),
        ];
        const v = `M${r1(s[0])} ${r1(s[1])}C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(e[0])} ${r1(e[1])}`;
        main += v;
        // A thin companion vein a little to the side, and one branch.
        const off = 6 + rand() * 10;
        const sh = (p: P2): P2 => [clampIn(p[0] + nx * off, x0), clampIn(p[1] + ny * off, y0)];
        const [fs, f1, f2, fe] = [sh(s), sh(c1), sh(c2), sh(e)];
        fine += `M${r1(fs[0])} ${r1(fs[1])}C${r1(f1[0])} ${r1(f1[1])} ${r1(f2[0])} ${r1(f2[1])} ${r1(fe[0])} ${r1(fe[1])}`;
        const t = 0.35 + rand() * 0.3;
        const u = 1 - t;
        const bx =
          u * u * u * s[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0];
        const by =
          u * u * u * s[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1];
        const ba = a + (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.5);
        const bl = SIZE * (0.15 + rand() * 0.2);
        const be: P2 = [clampIn(bx + Math.cos(ba) * bl, x0), clampIn(by + Math.sin(ba) * bl, y0)];
        const bc: P2 = [
          clampIn((bx + be[0]) / 2 + nx * bl * 0.2, x0),
          clampIn((by + be[1]) / 2 + ny * bl * 0.2, y0),
        ];
        fine += `M${r1(bx)} ${r1(by)}Q${r1(bc[0])} ${r1(bc[1])} ${r1(be[0])} ${r1(be[1])}`;
      }
    }
  }
  return { main, fine };
}

const v = veins();
const [, toneA, toneB] = slabTones(72, N, SIZE, 3);
const cloudsD = blobsD(73, 18, W, W, [70, 200], { aspect: [0.3, 0.6], points: 8, jitter: 0.3 });
const jointsD = gridD(W, W, SIZE, SIZE);

export default defineMaterial({
  id: 'marble',
  label: 'Mármore',
  group: 'indoor',
  permeable: false,
  defaultColor: '#EEEBE6',
  tile: { w: SIZE, h: SIZE },
  Pattern: (p) => {
    const c = p.color;
    const vein = shade(c, 0.45);
    return (
      <Tile p={p} w={W} h={W}>
        <path d={toneA} fill={highlight(c, 0.02)} />
        <path d={toneB} fill={shade(c, 0.015)} />
        <path d={cloudsD} fill={shade(c, 0.12)} fillOpacity={0.06} />
        <path
          d={v.main}
          fill="none"
          stroke={vein}
          strokeOpacity={0.22}
          strokeWidth={lineW(p.ctx, 7)}
          strokeLinecap="round"
        />
        <path
          d={v.main}
          fill="none"
          stroke={vein}
          strokeOpacity={0.45}
          strokeWidth={lineW(p.ctx, 2)}
          strokeLinecap="round"
        />
        <path
          d={v.fine}
          fill="none"
          stroke={vein}
          strokeOpacity={0.35}
          strokeWidth={lineW(p.ctx, 1.4)}
          strokeLinecap="round"
        />
        <path
          d={jointsD}
          fill="none"
          stroke={shade(c, 0.25)}
          strokeOpacity={0.8}
          strokeWidth={lineW(p.ctx, 2)}
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.45), 0.02],
      [shade(c, 0.25), 0.006],
    ]),
});
