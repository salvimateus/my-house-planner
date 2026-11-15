import { defineMaterial } from '../types.ts';
import { blend, blobsD, highlight, lineW, shade, strokesD, Tile } from './lib/kit.tsx';

// Cut-pile carpet: dense short fibers over a soft mottle.
const W = 400;

const mottleD = blobsD(101, 10, W, W, [40, 110], { aspect: [0.5, 1], points: 7, jitter: 0.3 });
const darkD = strokesD(102, 520, W, W, [4, 9], { bend: 0.4 });
const lightD = strokesD(103, 420, W, W, [4, 8], { bend: 0.4 });
const deepD = strokesD(104, 160, W, W, [3, 6], { bend: 0.3 });

export default defineMaterial({
  id: 'carpet',
  label: 'Carpete',
  group: 'indoor',
  permeable: false,
  defaultColor: '#B5ADA2',
  tile: { w: W, h: W },
  Pattern: (p) => {
    const c = p.color;
    const fiber = lineW(p.ctx, 2.6, 0.03);
    return (
      <Tile p={p} w={W} h={W}>
        <path d={mottleD} fill={shade(c, 0.15)} fillOpacity={0.12} />
        <path
          d={darkD}
          fill="none"
          stroke={shade(c, 0.22)}
          strokeOpacity={0.45}
          strokeWidth={fiber}
          strokeLinecap="round"
        />
        <path
          d={lightD}
          fill="none"
          stroke={highlight(c, 0.28)}
          strokeOpacity={0.5}
          strokeWidth={fiber}
          strokeLinecap="round"
        />
        <path
          d={deepD}
          fill="none"
          stroke={shade(c, 0.4)}
          strokeOpacity={0.4}
          strokeWidth={fiber}
          strokeLinecap="round"
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.22), 0.1],
      [highlight(c, 0.28), 0.09],
      [shade(c, 0.4), 0.02],
    ]),
});
