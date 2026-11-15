import { defineMaterial } from '../types.ts';
import { TiledPattern, tiledFlatColor, tiledGeometry } from './lib/slabs.tsx';

const SIZE = 450;
const geo = tiledGeometry({
  size: SIZE,
  n: 4,
  joint: 6,
  jointStrength: 0.35,
  variation: 0.018,
  clouds: 0.35,
  seed: 45,
});

export default defineMaterial({
  id: 'ceramic-45',
  label: 'Cerâmica 45×45',
  group: 'indoor',
  permeable: false,
  defaultColor: '#E9EDEE',
  tile: { w: SIZE, h: SIZE },
  Pattern: (p) => <TiledPattern p={p} g={geo} />,
  flatColor: (c) => tiledFlatColor(geo, c),
});
