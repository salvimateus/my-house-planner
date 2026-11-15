import { defineMaterial } from '../types.ts';
import {
  blend,
  dotsD,
  highlight,
  lineW,
  rectD,
  rng,
  shade,
  shiftHsl,
  strokesD,
  Tile,
} from './lib/kit.tsx';

// São Tomé-style ashlar in two staggered rows of 40 cm; module 20 cm. No joint crosses
// another, also across the wrap from the bottom row to the top one.
const U = 200;
const W = U * 6;
const H = U * 4;
const pieces: Array<[number, number, number, number]> = [
  [0, 0, 2, 2],
  [2, 0, 3, 2],
  [5, 0, 1, 1],
  [5, 1, 1, 1],
  [1, 2, 2, 2],
  [3, 2, 1, 2],
  [4, 2, 3, 2],
];

const rand = rng(131);
const tonesD = ['', '', '', ''];
let outlineD = '';
for (const [x, y, w, h] of pieces) {
  const d = rectD(x * U, y * U, w * U, h * U, W, H);
  tonesD[Math.floor(rand() * 4)] += d;
  outlineD += d;
}
const strataD = strokesD(132, 46, W, H, [60, 220], { angle: [-0.25, 0.25], bend: 0.15 });
const darkSpeckD = dotsD(133, 300, W, H, [1.5, 3.5]);
const lightSpeckD = dotsD(134, 220, W, H, [2, 4.5]);

export default defineMaterial({
  id: 'stone',
  label: 'Pedra',
  group: 'outdoor',
  permeable: false,
  defaultColor: '#D8D2C6',
  tile: { w: U * 2, h: U * 2 },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={H}>
        <path d={tonesD[1]} fill={shade(c, 0.08)} />
        <path d={tonesD[2]} fill={highlight(c, 0.12)} />
        <path d={tonesD[3]} fill={shiftHsl(c, 6, 0.06, -0.03)} />
        <path
          d={strataD}
          fill="none"
          stroke={highlight(c, 0.4)}
          strokeOpacity={0.3}
          strokeWidth={lineW(p.ctx, 6)}
          strokeLinecap="round"
        />
        <path d={darkSpeckD} fill={shade(c, 0.35)} fillOpacity={0.4} />
        <path d={lightSpeckD} fill={highlight(c, 0.5)} fillOpacity={0.5} />
        <path
          d={outlineD}
          fill="none"
          stroke={shade(c, 0.4)}
          strokeOpacity={0.85}
          strokeWidth={lineW(p.ctx, 10)}
          strokeLinejoin="round"
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.4), 0.04],
      [shade(c, 0.08), 0.2],
      [highlight(c, 0.12), 0.2],
    ]),
});
