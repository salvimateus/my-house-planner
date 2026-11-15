import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { CAR_COLORS, type CarProfile, carSymbol } from './car.ts';

const PROFILE: CarProfile = {
  nose: 0.07,
  tail: 0.05,
  body: 0.46,
  windshield: 0.22,
  roofFront: 0.09,
  roofRear: -0.38,
  rearWindow: -0.45,
  axles: [0.32, -0.32],
};

function CarSuvSymbol(props: SymbolProps): ReactElement {
  return carSymbol(PROFILE, props);
}

export default defineItem({
  type: 'car-suv',
  label: 'Carro SUV',
  category: 'garage',
  keywords: [
    'carro',
    'suv',
    'utilitário',
    'utilitario',
    'caminhonete',
    'automóvel',
    'veículo',
    'garagem',
    'vaga',
  ],
  size: { w: 4700, d: 1900 },
  min: { w: 4200, d: 1698 },
  max: { w: 5200, d: 2102 },
  wallSnap: 'none',
  layer: 'furniture',
  color: '#B9BEC5',
  colors: CAR_COLORS,
  colorable: true,
  keepAspect: true,
  Symbol: CarSuvSymbol,
});
