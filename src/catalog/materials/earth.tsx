import { defineMaterial } from '../types.ts';
import { blend, blobsD, dotsD, highlight, shade, Tile } from './lib/kit.tsx';

// Bare soil, kept calm because it is the default lot ground under the plan: soft patches,
// sparse low-contrast clods, crumbs and a few small stones.
const W = 600;

const shadowD = blobsD(171, 8, W, W, [70, 170], { aspect: [0.55, 0.95], points: 9, jitter: 0.25 });
const clodD = blobsD(172, 35, W, W, [10, 26], { aspect: [0.55, 0.95], points: 7, jitter: 0.3 });
const dryD = blobsD(173, 30, W, W, [7, 18], { aspect: [0.55, 0.95], points: 7, jitter: 0.3 });
const crumbD = dotsD(174, 190, W, W, [1.5, 3.5]);
const stonesD = blobsD(175, 13, W, W, [5, 10], { aspect: [0.6, 0.95], points: 6, jitter: 0.2 });

export default defineMaterial({
  id: 'earth',
  label: 'Terra',
  group: 'outdoor',
  permeable: true,
  defaultColor: '#9C7A57',
  tile: { w: W, h: W },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={W}>
        <path d={shadowD} fill={shade(c, 0.12)} fillOpacity={0.12} />
        <path d={clodD} fill={shade(c, 0.18)} fillOpacity={0.3} />
        <path d={dryD} fill={highlight(c, 0.12)} fillOpacity={0.32} />
        <path d={crumbD} fill={shade(c, 0.25)} fillOpacity={0.25} />
        <path d={stonesD} fill={highlight(c, 0.25)} fillOpacity={0.4} />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.12), 0.02],
      [shade(c, 0.18), 0.02],
      [highlight(c, 0.12), 0.01],
    ]),
});
