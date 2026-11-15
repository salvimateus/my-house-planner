import { defineMaterial } from '../types.ts';
import { TiledPattern, tiledFlatColor, tiledGeometry } from './lib/slabs.tsx';

const SIZE = 900;
const geo = tiledGeometry({
  size: SIZE,
  n: 3,
  joint: 4,
  jointStrength: 0.3,
  variation: 0.01,
  clouds: 0.6,
  seed: 91,
});

export default defineMaterial({
  id: 'porcelain-90',
  label: 'Porcelanato 90×90',
  group: 'indoor',
  permeable: false,
  defaultColor: '#D9D5CE',
  tile: { w: SIZE, h: SIZE },
  Pattern: (p) => <TiledPattern p={p} g={geo} />,
  flatColor: (c) => tiledFlatColor(geo, c),
});
