import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { CAR_COLORS, type PassengerCarSpec, passengerCarSymbol } from './car.ts';

// Corolla class: 2700 mm wheelbase, long low hood, raked glass, flat trunk deck, long rear overhang.
const SPEC: PassengerCarSpec = {
  kind: 'sedan',
  body: [
    [
      [0.5, -0.15],
      [0.492, -0.3],
      [0.468, -0.39],
    ],
    [
      [0.44, -0.47],
      [0.39, -0.497],
      [0.3, -0.497],
    ],
    [
      [0.3, -0.497],
      [-0.38, -0.497],
      [-0.38, -0.497],
    ],
    [
      [-0.45, -0.497],
      [-0.485, -0.475],
      [-0.494, -0.39],
    ],
    [
      [-0.5, -0.31],
      [-0.5, -0.16],
      [-0.5, 0],
    ],
  ],
  windshield: 0.215,
  roofFront: 0.03,
  pillarB: -0.06,
  roofRear: -0.175,
  rearGlass: -0.3,
  rearGlassHalf: 0.32,
  sideGlassEnd: -0.155,
  doors: [0.155, -0.06, -0.215],
  axles: [0.299, -0.284],
  tire: 0.136,
  headlight: [
    [0.484, -0.2],
    [
      [0.478, -0.32],
      [0.46, -0.4],
      [0.425, -0.452],
    ],
    [
      [0.425, -0.452],
      [0.405, -0.44],
      [0.405, -0.44],
    ],
    [
      [0.437, -0.395],
      [0.458, -0.31],
      [0.468, -0.2],
    ],
  ],
  taillight: [
    [-0.492, -0.18],
    [
      [-0.493, -0.3],
      [-0.488, -0.39],
      [-0.47, -0.44],
    ],
    [
      [-0.47, -0.44],
      [-0.458, -0.43],
      [-0.458, -0.43],
    ],
    [
      [-0.474, -0.385],
      [-0.479, -0.3],
      [-0.479, -0.18],
    ],
  ],
};

function CarSedanSymbol(props: SymbolProps): ReactElement {
  return passengerCarSymbol(SPEC, props);
}

const SIZE = { w: 4630, d: 1780 };

export default defineItem({
  type: 'car-sedan',
  label: 'Carro sedã (porte Corolla)',
  category: 'garage',
  keywords: [
    'carro',
    'sedã',
    'seda',
    'sedan',
    'corolla',
    'automóvel',
    'automovel',
    'veículo',
    'veiculo',
    'garagem',
    'vaga',
  ],
  size: SIZE,
  min: SIZE,
  max: SIZE,
  wallSnap: 'none',
  layer: 'furniture',
  color: '#B9BEC5',
  colors: CAR_COLORS,
  colorable: true,
  Symbol: CarSedanSymbol,
});
