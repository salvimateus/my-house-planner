import { defineMaterial } from '../types.ts';
import { blend, blobsD, highlight, lineW, shade, shiftHsl, strokesD, Tile } from './lib/kit.tsx';

// Mown lawn seen from above: short blades in three tones over soft patches.
const W = 500;

const patchDarkD = blobsD(141, 7, W, W, [60, 150], { aspect: [0.5, 0.9], points: 8, jitter: 0.35 });
const patchLightD = blobsD(142, 6, W, W, [50, 130], {
  aspect: [0.5, 0.9],
  points: 8,
  jitter: 0.35,
});
const darkD = strokesD(143, 700, W, W, [12, 26], { bend: 0.35 });
const midD = strokesD(144, 560, W, W, [10, 22], { bend: 0.35 });
const lightD = strokesD(145, 380, W, W, [8, 18], { bend: 0.35 });

const deep = (c: string): string => shiftHsl(shade(c, 0.32), 8, 0.05, 0);
const tip = (c: string): string => shiftHsl(highlight(c, 0.3), -10, 0.05, 0);

export default defineMaterial({
  id: 'grass',
  label: 'Grama',
  group: 'outdoor',
  permeable: true,
  defaultColor: '#8FBF6A',
  tile: { w: W, h: W },
  Pattern: (p) => {
    const c = p.color;
    const blade = lineW(p.ctx, 4, 0.03);
    return (
      <Tile p={p} w={W} h={W}>
        <path d={patchDarkD} fill={deep(c)} fillOpacity={0.16} />
        <path d={patchLightD} fill={tip(c)} fillOpacity={0.18} />
        <path
          d={darkD}
          fill="none"
          stroke={deep(c)}
          strokeOpacity={0.6}
          strokeWidth={blade}
          strokeLinecap="round"
        />
        <path
          d={midD}
          fill="none"
          stroke={shade(c, 0.12)}
          strokeOpacity={0.7}
          strokeWidth={blade}
          strokeLinecap="round"
        />
        <path
          d={lightD}
          fill="none"
          stroke={tip(c)}
          strokeOpacity={0.6}
          strokeWidth={blade}
          strokeLinecap="round"
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [deep(c), 0.2],
      [tip(c), 0.12],
    ]),
});
