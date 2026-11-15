import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { CAR_COLORS, type CarProfile, carSymbol } from './car.ts';

const PROFILE: CarProfile = {
  nose: 0.09,
  tail: 0.07,
  body: 0.45,
  windshield: 0.17,
  roofFront: 0.03,
  roofRear: -0.2,
  rearWindow: -0.31,
  axles: [0.31, -0.3],
};

function CarSedanSymbol(props: SymbolProps): ReactElement {
  return carSymbol(PROFILE, props);
}

export default defineItem({
  type: 'car-sedan',
  label: 'Carro sedã',
  category: 'garage',
  keywords: [
    'carro',
    'sedã',
    'seda',
    'sedan',
    'automóvel',
    'automovel',
    'veículo',
    'garagem',
    'vaga',
  ],
  size: { w: 4600, d: 1800 },
  min: { w: 4100, d: 1604 },
  max: { w: 5100, d: 1996 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#B9BEC5',
  colors: CAR_COLORS,
  colorable: true,
  keepAspect: true,
  Symbol: CarSedanSymbol,
});
