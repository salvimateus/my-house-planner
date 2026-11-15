import { defineMaterial } from '../types.ts';
import { blend, blobsD, dotsD, gridD, highlight, lineW, shade, Tile } from './lib/kit.tsx';

// Brushed slab with saw-cut joints every 2 m and exposed aggregate.
const PANEL = 2000;
const W = PANEL * 2;

const stainD = blobsD(91, 26, W, W, [180, 480], { aspect: [0.55, 0.95], points: 9, jitter: 0.2 });
const lightD = blobsD(92, 22, W, W, [160, 420], { aspect: [0.55, 0.95], points: 9, jitter: 0.2 });
const aggregateDarkD = dotsD(93, 280, W, W, [4, 9]);
const aggregateLightD = dotsD(94, 220, W, W, [3, 7]);
const poresD = dotsD(95, 180, W, W, [1.5, 3]);
const jointsD = gridD(W, W, PANEL, PANEL);

export default defineMaterial({
  id: 'concrete',
  label: 'Concreto',
  group: 'outdoor',
  permeable: false,
  defaultColor: '#C8C8C4',
  tile: { w: PANEL, h: PANEL },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={W}>
        <path d={stainD} fill={shade(c, 0.22)} fillOpacity={0.04} />
        <path d={lightD} fill={highlight(c, 0.3)} fillOpacity={0.05} />
        <path d={aggregateDarkD} fill={shade(c, 0.3)} fillOpacity={0.45} />
        <path d={aggregateLightD} fill={highlight(c, 0.4)} fillOpacity={0.55} />
        <path d={poresD} fill={shade(c, 0.55)} fillOpacity={0.5} />
        <path
          d={jointsD}
          fill="none"
          stroke={shade(c, 0.5)}
          strokeOpacity={0.7}
          strokeWidth={lineW(p.ctx, 8)}
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.22), 0.03],
      [shade(c, 0.5), 0.006],
    ]),
});
