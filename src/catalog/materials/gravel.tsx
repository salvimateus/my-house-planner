import { shiftHsl } from '../color.ts';
import { defineMaterial } from '../types.ts';
import {
  blend,
  blobPts,
  boxOf,
  highlight,
  type Pt,
  rng,
  shade,
  smoothD,
  Tile,
  wrapped,
} from './lib/kit.tsx';

// Crushed stone of 15–40 mm: each pebble has a drop shadow, one of three tones and a glint.
const W = 300;

function pebbles(): { shadow: string; tones: string[]; glint: string } {
  const rand = rng(151);
  let shadow = '';
  let glint = '';
  const tones = ['', '', ''];
  for (let i = 0; i < 170; i++) {
    const cx = rand() * W;
    const cy = rand() * W;
    const rx = 8 + rand() * 12;
    const ry = rx * (0.55 + rand() * 0.4);
    const rot = rand() * Math.PI;
    const pts = blobPts(rand, cx, cy, rx, ry, rot, 6, 0.22);
    const box = boxOf(pts);
    const shadowBox = { minX: box.minX, minY: box.minY, maxX: box.maxX + 3, maxY: box.maxY + 4 };
    shadow += wrapped(shadowBox, W, W, (ox, oy) => smoothD(pts, ox + 2.5, oy + 3.5));
    tones[Math.floor(rand() * 3)] += wrapped(box, W, W, (ox, oy) => smoothD(pts, ox, oy));
    if (rand() < 0.7) {
      const g: Pt[] = pts.map(([x, y]) => [
        cx - rx * 0.3 + (x - cx) * 0.35,
        cy - ry * 0.3 + (y - cy) * 0.35,
      ]);
      glint += wrapped(boxOf(g), W, W, (ox, oy) => smoothD(g, ox, oy));
    }
  }
  return { shadow, tones, glint };
}

const peb = pebbles();

export default defineMaterial({
  id: 'gravel',
  label: 'Brita',
  group: 'outdoor',
  permeable: true,
  defaultColor: '#BDB7AC',
  tile: { w: W, h: W },
  Pattern: (p) => {
    const c = p.color;
    return (
      <Tile p={p} w={W} h={W}>
        <path d={peb.shadow} fill={shade(c, 0.55)} fillOpacity={0.45} />
        <path d={peb.tones[0]} fill={shade(c, 0.12)} />
        <path d={peb.tones[1]} fill={highlight(c, 0.1)} />
        <path d={peb.tones[2]} fill={shiftHsl(c, 10, 0.05, -0.05)} />
        <path d={peb.glint} fill={highlight(c, 0.55)} fillOpacity={0.45} />
      </Tile>
    );
  },
  flatColor: (c) =>
    blend(c, [
      [shade(c, 0.55), 0.12],
      [shade(c, 0.12), 0.25],
      [highlight(c, 0.1), 0.25],
    ]),
});
