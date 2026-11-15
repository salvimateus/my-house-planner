import { defineMaterial } from '../types.ts';
import { blend, blobsD, dotsD, highlight, shade, Tile } from './lib/kit.tsx';

// Bare soil: dark clods, dry light crumbs and a few small stones.
const W = 600;

const shadowD = blobsD(171, 10, W, W, [60, 160], { aspect: [0.5, 0.9], points: 8, jitter: 0.4 });
const clodD = blobsD(172, 70, W, W, [10, 28], { aspect: [0.55, 0.95], points: 6, jitter: 0.35 });
const dryD = blobsD(173, 60, W, W, [7, 20], { aspect: [0.55, 0.95], points: 6, jitter: 0.35 });
const crumbD = dotsD(174, 380, W, W, [1.5, 4]);
const stonesD = blobsD(175, 26, W, W, [5, 11], { aspect: [0.6, 0.95], points: 6, jitter: 0.2 });

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
        <path d={shadowD} fill={shade(c, 0.2)} fillOpacity={0.2} />
        <path d={clodD} fill={shade(c, 0.32)} fillOpacity={0.55} />
        <path d={dryD} fill={highlight(c, 0.22)} fillOpacity={0.6} />
        <path d={crumbD} fill={shade(c, 0.45)} fillOpacity={0.5} />
        <path d={stonesD} fill={highlight(c, 0.45)} fillOpacity={0.8} />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.2), 0.05],
      [shade(c, 0.32), 0.1],
      [highlight(c, 0.22), 0.06],
    ]),
});
