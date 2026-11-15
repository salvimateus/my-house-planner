import { defineMaterial } from '../types.ts';
import { blend, highlight, lineW, shade, Tile } from './lib/kit.tsx';
import { endJointsD, grainD, plankRows, rowJointsD, segRectD } from './lib/planks.tsx';

const PLANK_W = 200;
const ROWS = 5;
const W = 3600;
const H = PLANK_W * ROWS;

const segs = plankRows(11, W, ROWS, PLANK_W, [700, 1600], 4);
const toneD = [1, 2, 3].map((t) =>
  segs
    .filter((s) => s.tone === t)
    .map((s) => segRectD(s, W, H))
    .join(''),
);
const jointsD = rowJointsD(ROWS, PLANK_W, W) + endJointsD(segs, W);
const grain = grainD(12, segs, W, H, 7, 0.35);

export default defineMaterial({
  id: 'wood-planks',
  label: 'Piso de madeira',
  group: 'indoor',
  permeable: false,
  defaultColor: '#C8A27C',
  tile: { w: 1200, h: PLANK_W },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={H}>
        <path d={toneD[0]} fill={shade(c, 0.065)} />
        <path d={toneD[1]} fill={highlight(c, 0.06)} />
        <path d={toneD[2]} fill={shade(c, 0.03)} />
        <path
          d={grain.dark}
          fill="none"
          stroke={shade(c, 0.35)}
          strokeOpacity={0.38}
          strokeWidth={lineW(p.ctx, 2.5)}
          strokeLinecap="round"
        />
        <path
          d={grain.light}
          fill="none"
          stroke={highlight(c, 0.35)}
          strokeOpacity={0.4}
          strokeWidth={lineW(p.ctx, 3)}
          strokeLinecap="round"
        />
        <path
          d={jointsD}
          fill="none"
          stroke={shade(c, 0.5)}
          strokeOpacity={0.6}
          strokeWidth={lineW(p.ctx, 3)}
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.07), 0.5],
      [highlight(c, 0.1), 0.2],
    ]),
});
