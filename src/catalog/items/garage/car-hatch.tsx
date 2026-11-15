import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { CAR_COLORS, type CarProfile, carSymbol } from './car.ts';

const PROFILE: CarProfile = {
  nose: 0.09,
  tail: 0.06,
  body: 0.45,
  windshield: 0.2,
  roofFront: 0.05,
  roofRear: -0.3,
  rearWindow: -0.42,
  axles: [0.33, -0.32],
};

function CarHatchSymbol(props: SymbolProps): ReactElement {
  return carSymbol(PROFILE, props);
}

export default defineItem({
  type: 'car-hatch',
  label: 'Carro hatch',
  category: 'garage',
  keywords: ['carro', 'hatch', 'automóvel', 'automovel', 'veículo', 'garagem', 'vaga', 'compacto'],
  size: { w: 3900, d: 1750 },
  min: { w: 3500, d: 1570 },
  max: { w: 4300, d: 1930 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#B9BEC5',
  colors: CAR_COLORS,
  colorable: true,
  keepAspect: true,
  Symbol: CarHatchSymbol,
});
