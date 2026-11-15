import { defineMaterial } from '../types.ts';
import { blend, highlight, lineW, r1, rng, shade, Tile } from './lib/kit.tsx';

// Tacos of 70 × 420 mm. The lattice (W, W), (L, −L) tiles a horizontal plank [0, L] × [0, W]
// and a vertical one [0, W] × [W, W + L] with no gap; its axis-aligned period is 2L × 2L.
const PW = 70;
const PL = 420;
const P = PL * 2;

interface Plank {
  x: number;
  y: number;
  w: number;
  h: number;
  horizontal: boolean;
  tone: number;
}

function planks(): Plank[] {
  const out: Plank[] = [];
  const span = Math.ceil(P / PW) + 4;
  for (let m = -span * 2; m <= span * 2; m++) {
    for (let n = -4; n <= 4; n++) {
      const ox = m * PW + n * PL;
      const oy = m * PW - n * PL;
      for (const [x0, y0, w, h, horizontal] of [
        [0, 0, PL, PW, true],
        [0, PW, PW, PL, false],
      ] as const) {
        const x = x0 + ox;
        const y = y0 + oy;
        if (x >= P || y >= P || x + w <= 0 || y + h <= 0) continue;
        // Canonical position, so every partial copy of one plank gets the same tone.
        const cx = (((x + w / 2) % P) + P) % P;
        const cy = (((y + h / 2) % P) + P) % P;
        const tone = Math.floor(
          rng(Math.round(cx * 7919 + cy * 104729 + (horizontal ? 1 : 0)))() * 5,
        );
        out.push({ x, y, w, h, horizontal, tone });
      }
    }
  }
  return out;
}

const all = planks();
const rectD = (k: Plank): string => `M${k.x} ${k.y}h${k.w}v${k.h}h${-k.w}Z`;
const horizontalD = all
  .filter((k) => k.horizontal)
  .map(rectD)
  .join('');
const lightD = all
  .filter((k) => k.tone === 0)
  .map(rectD)
  .join('');
const darkD = all
  .filter((k) => k.tone === 1)
  .map(rectD)
  .join('');
const jointsD = all.map(rectD).join('');

function grain(): string {
  const rand = rng(31);
  let d = '';
  for (const k of all) {
    const along = k.horizontal ? k.w : k.h;
    const across = k.horizontal ? k.h : k.w;
    const off = across * (0.3 + rand() * 0.4);
    const a = 30 + rand() * along * 0.2;
    const b = along - 30 - rand() * along * 0.2;
    const wave = (rand() - 0.5) * across * 0.3;
    if (k.horizontal) {
      d += `M${r1(k.x + a)} ${r1(k.y + off)}Q${r1(k.x + (a + b) / 2)} ${r1(k.y + off + wave)} ${r1(k.x + b)} ${r1(k.y + off)}`;
    } else {
      d += `M${r1(k.x + off)} ${r1(k.y + a)}Q${r1(k.x + off + wave)} ${r1(k.y + (a + b) / 2)} ${r1(k.x + off)} ${r1(k.y + b)}`;
    }
  }
  return d;
}
const grainD = grain();

export default defineMaterial({
  id: 'wood-herringbone',
  label: 'Madeira espinha de peixe',
  group: 'indoor',
  permeable: false,
  defaultColor: '#B98A5E',
  tile: { w: PW, h: PL },
  Pattern: (p) => {
    const c = p.color;
    return (
      // The extra 45° turns the staircase lattice into the classic herringbone across the room.
      <Tile p={p} w={P} h={P} extraAngle={45}>
        <path d={horizontalD} fill={shade(c, 0.07)} />
        <path d={lightD} fill={highlight(c, 0.12)} fillOpacity={0.8} />
        <path d={darkD} fill={shade(c, 0.12)} fillOpacity={0.8} />
        <path
          d={grainD}
          fill="none"
          stroke={shade(c, 0.35)}
          strokeOpacity={0.3}
          strokeWidth={lineW(p.ctx, 2.5)}
          strokeLinecap="round"
        />
        <path
          d={jointsD}
          fill="none"
          stroke={shade(c, 0.5)}
          strokeOpacity={0.6}
          strokeWidth={lineW(p.ctx, 2.5)}
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.07), 0.5],
      [shade(c, 0.5), 0.04],
    ]),
});
