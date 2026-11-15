import { defineMaterial } from '../types.ts';
import {
  blend,
  blobsD,
  dotsD,
  gridD,
  highlight,
  lineW,
  shade,
  strokesD,
  Tile,
} from './lib/kit.tsx';

// Polished screed with plastic expansion joints every 1,5 m; the repeat holds 2 × 2 panels.
const PANEL = 1500;
const W = PANEL * 2;

const lightD = blobsD(81, 30, W, W, [160, 460], { aspect: [0.55, 0.95], points: 9, jitter: 0.18 });
const lightSoftD = blobsD(85, 40, W, W, [90, 260], {
  aspect: [0.55, 0.95],
  points: 9,
  jitter: 0.18,
});
const darkD = blobsD(82, 24, W, W, [140, 400], { aspect: [0.55, 0.95], points: 9, jitter: 0.18 });
const darkSoftD = blobsD(86, 30, W, W, [80, 220], {
  aspect: [0.55, 0.95],
  points: 9,
  jitter: 0.18,
});
const sheenD = strokesD(83, 26, W, W, [260, 700], { bend: 0.35 });
const speckD = dotsD(84, 140, W, W, [2.5, 5]);
const jointsD = gridD(W, W, PANEL, PANEL);

export default defineMaterial({
  id: 'burnt-cement',
  label: 'Cimento queimado',
  group: 'indoor',
  permeable: false,
  defaultColor: '#B8B7B1',
  tile: { w: PANEL, h: PANEL },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={W}>
        <path d={lightD} fill={highlight(c, 0.3)} fillOpacity={0.09} />
        <path d={lightSoftD} fill={highlight(c, 0.3)} fillOpacity={0.09} />
        <path d={darkD} fill={shade(c, 0.25)} fillOpacity={0.06} />
        <path d={darkSoftD} fill={shade(c, 0.25)} fillOpacity={0.06} />
        <path
          d={sheenD}
          fill="none"
          stroke={highlight(c, 0.45)}
          strokeOpacity={0.08}
          strokeWidth={lineW(p.ctx, 28)}
          strokeLinecap="round"
        />
        <path d={speckD} fill={shade(c, 0.4)} fillOpacity={0.35} />
        <path
          d={jointsD}
          fill="none"
          stroke={shade(c, 0.45)}
          strokeOpacity={0.55}
          strokeWidth={lineW(p.ctx, 4)}
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [highlight(c, 0.3), 0.04],
      [shade(c, 0.25), 0.02],
    ]),
});
