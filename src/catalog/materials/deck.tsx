import { defineMaterial } from '../types.ts';
import { blend, circleD, highlight, lineW, shade, Tile } from './lib/kit.tsx';
import { endJointsD, grainD, type PlankSegment, rowJointsD, segRectD } from './lib/planks.tsx';

// Boards of 140 mm with a 6 mm gap, 3 m long, screwed to joists every 50 cm.
const BOARD = 140;
const GAP = 6;
const PITCH = BOARD + GAP;
const ROWS = 6;
const W = 3000;
const H = PITCH * ROWS;
const JOIST = 500;
const joists = Array.from({ length: W / JOIST }, (_, i) => JOIST / 2 + i * JOIST);
const endJoist = [0, 3, 1, 4, 2, 5];
const tones = [0, 1, 2, 1, 0, 2];

const segs: PlankSegment[] = endJoist.map((j, r) => {
  const x0 = joists[j]!;
  return { x0, x1: x0 + W, y0: r * PITCH, y1: (r + 1) * PITCH, tone: tones[r]! };
});

const toneD = [1, 2].map((t) =>
  segs
    .filter((s) => s.tone === t)
    .map((s) => segRectD(s, W, H))
    .join(''),
);
const gapsD = rowJointsD(ROWS, PITCH, W) + endJointsD(segs, W);
const grain = grainD(121, segs, W, H, 3, 0);

function screws(): string {
  let d = '';
  for (let r = 0; r < ROWS; r++) {
    const ya = r * PITCH + GAP / 2 + 28;
    const yb = (r + 1) * PITCH - GAP / 2 - 28;
    joists.forEach((x, j) => {
      const xs = j === endJoist[r] ? [x - 24, x + 24] : [x];
      for (const sx of xs) d += circleD(sx, ya, 4) + circleD(sx, yb, 4);
    });
  }
  return d;
}
const screwsD = screws();

export default defineMaterial({
  id: 'deck',
  label: 'Deck de madeira',
  group: 'outdoor',
  permeable: false,
  defaultColor: '#A8774E',
  tile: { w: W, h: BOARD },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={H}>
        <path d={toneD[0]} fill={shade(c, 0.08)} />
        <path d={toneD[1]} fill={highlight(c, 0.08)} />
        <path
          d={grain.dark}
          fill="none"
          stroke={shade(c, 0.35)}
          strokeOpacity={0.35}
          strokeWidth={lineW(p.ctx, 2.5)}
          strokeLinecap="round"
        />
        <path
          d={grain.light}
          fill="none"
          stroke={highlight(c, 0.3)}
          strokeOpacity={0.35}
          strokeWidth={lineW(p.ctx, 3)}
          strokeLinecap="round"
        />
        <path
          d={gapsD}
          fill="none"
          stroke={shade(c, 0.65)}
          strokeOpacity={0.85}
          strokeWidth={lineW(p.ctx, GAP)}
        />
        <path d={screwsD} fill={shade(c, 0.55)} fillOpacity={0.8} />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.65), 0.035],
      [shade(c, 0.08), 0.33],
      [highlight(c, 0.08), 0.33],
    ]),
});
