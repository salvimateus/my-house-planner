import { defineMaterial } from '../types.ts';
import { Tile } from './lib/kit.tsx';

export default defineMaterial({
  id: 'solid',
  label: 'Cor lisa',
  group: 'indoor',
  permeable: false,
  defaultColor: '#F2F0EB',
  tile: { w: 1000, h: 1000 },
  // fillPaint paints `solid` with the plain color; this pattern exists only for completeness.
  Pattern: (p) => <Tile p={p} w={1000} h={1000} />,
  flatColor: (c) => c,
});
