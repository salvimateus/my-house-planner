import { defineItem } from '../../types.ts';
import { FABRIC } from '../living/symbolKit.ts';
import { BedSymbol } from './bed-double.tsx';

export default defineItem({
  type: 'bed-single',
  label: 'Cama de solteiro',
  category: 'bedroom',
  keywords: ['cama', 'solteiro', 'quarto', 'dormitório', 'infantil', 'hóspedes'],
  size: { w: 880, d: 1880 },
  min: { w: 700, d: 1500 },
  max: { w: 1200, d: 2100 },
  wallSnap: 'back',
  layer: 'furniture',
  color: FABRIC.fill,
  colorable: true,
  Symbol: BedSymbol,
});
