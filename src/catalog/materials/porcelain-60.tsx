import { defineMaterial } from '../types.ts';
import { TiledPattern, tiledFlatColor, tiledGeometry } from './lib/slabs.tsx';

const SIZE = 600;
const geo = tiledGeometry({
  size: SIZE,
  n: 3,
  joint: 4,
  jointStrength: 0.3,
  variation: 0.012,
  clouds: 0.5,
  seed: 61,
});

export default defineMaterial({
  id: 'porcelain-60',
  label: 'Porcelanato 60×60',
  group: 'indoor',
  permeable: false,
  defaultColor: '#E6E1D8',
  tile: { w: SIZE, h: SIZE },
  Pattern: (p) => <TiledPattern p={p} g={geo} />,
  flatColor: (c) => tiledFlatColor(geo, c),
});
