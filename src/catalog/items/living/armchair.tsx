import { defineItem } from '../../types.ts';
import { SofaSymbol } from './sofa.tsx';
import { FABRIC } from './symbolKit.ts';

export default defineItem({
  type: 'armchair',
  label: 'Poltrona',
  category: 'living',
  keywords: ['poltrona', 'cadeira', 'assento', 'sala', 'leitura', 'estofado'],
  size: { w: 800, d: 800 },
  min: { w: 500, d: 500 },
  max: { w: 1300, d: 1100 },
  wallSnap: 'none',
  layer: 'furniture',
  color: FABRIC.fill,
  colorable: true,
  Symbol: SofaSymbol,
});
