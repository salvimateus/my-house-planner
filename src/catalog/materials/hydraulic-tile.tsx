import { shiftHsl } from '../color.ts';
import { defineMaterial } from '../types.ts';
import { blend, circleD, gridD, highlight, lineW, r1, shade, Tile } from './lib/kit.tsx';

// Classic 20 × 20 cm cement tile. Corner and edge motifs are cut by the tile edge and close
// into full figures with the neighbours.
const S = 200;
const C = S / 2;
const corners: Array<[number, number]> = [
  [0, 0],
  [S, 0],
  [0, S],
  [S, S],
];
const mids: Array<[number, number]> = [
  [C, 0],
  [S, C],
  [C, S],
  [0, C],
];

const cornerDiscsD = corners.map(([x, y]) => circleD(x, y, 34)).join('');
const cornerRingsD = corners.map(([x, y]) => circleD(x, y, 50)).join('');

function petal(angle: number, len: number, width: number): string {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const tip: [number, number] = [C + ca * len, C + sa * len];
  const side = (k: number): [number, number] => [
    C + ca * len * 0.5 - sa * width * k,
    C + sa * len * 0.5 + ca * width * k,
  ];
  const [lx, ly] = side(1);
  const [rx, ry] = side(-1);
  return `M${C} ${C}Q${r1(lx)} ${r1(ly)} ${r1(tip[0])} ${r1(tip[1])}Q${r1(rx)} ${r1(ry)} ${C} ${C}Z`;
}

const q = Math.PI / 2;
const petalsD = [0, 1, 2, 3].map((i) => petal(i * q - q, 74, 30)).join('');
const leavesD = [0, 1, 2, 3].map((i) => petal(i * q - q / 2, 58, 16)).join('');
const midDiamondsD = mids
  .map(([x, y]) => `M${x} ${y - 18}L${x + 18} ${y}L${x} ${y + 18}L${x - 18} ${y}Z`)
  .join('');
const centerD = circleD(C, C, 12);
const jointsD = gridD(S, S, S, S);

const accentOf = (c: string): string => shiftHsl(c, 180, 0.15, -0.36);
const warmOf = (c: string): string => shiftHsl(c, -8, 0.2, -0.28);

export default defineMaterial({
  id: 'hydraulic-tile',
  label: 'Ladrilho hidráulico',
  group: 'indoor',
  permeable: false,
  defaultColor: '#E6DBC8',
  tile: { w: S, h: S },
  Pattern: (p) => {
    const c = p.color;
    const accent = accentOf(c);
    const warm = warmOf(c);
    return (
      <Tile p={p} w={S} h={S}>
        <path
          d={cornerRingsD}
          fill="none"
          stroke={warm}
          strokeOpacity={0.9}
          strokeWidth={lineW(p.ctx, 7)}
        />
        <path d={cornerDiscsD} fill={accent} />
        <path d={midDiamondsD} fill={warm} fillOpacity={0.9} />
        <path d={leavesD} fill={warm} fillOpacity={0.85} />
        <path d={petalsD} fill={accent} />
        <path d={centerD} fill={highlight(c, 0.5)} />
        <path
          d={jointsD}
          fill="none"
          stroke={shade(c, 0.3)}
          strokeOpacity={0.7}
          strokeWidth={lineW(p.ctx, 2)}
        />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [accentOf(c), 0.2],
      [warmOf(c), 0.14],
    ]),
});
