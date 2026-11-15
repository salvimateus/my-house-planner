import type { ReactElement } from 'react';
import { defineItem, type SymbolProps } from '../../types.ts';
import { CAR_COLORS, type PassengerCarSpec, passengerCarSymbol } from './car.ts';

// HB20 class: 2530 mm wheelbase, short hood, long roof, steep tailgate with a roof spoiler.
const SPEC: PassengerCarSpec = {
  kind: 'hatch',
  body: [
    [
      [0.5, -0.17],
      [0.494, -0.31],
      [0.474, -0.4],
    ],
    [
      [0.455, -0.475],
      [0.41, -0.497],
      [0.33, -0.497],
    ],
    [
      [0.33, -0.497],
      [-0.36, -0.497],
      [-0.36, -0.497],
    ],
    [
      [-0.43, -0.497],
      [-0.478, -0.48],
      [-0.49, -0.4],
    ],
    [
      [-0.498, -0.32],
      [-0.5, -0.18],
      [-0.5, 0],
    ],
  ],
  windshield: 0.25,
  roofFront: 0.12,
  pillarB: -0.08,
  roofRear: -0.33,
  rearGlass: -0.415,
  rearGlassHalf: 0.36,
  sideGlassEnd: -0.28,
  doors: [0.19, -0.08, -0.262],
  axles: [0.311, -0.319],
  tire: 0.15,
  headlight: [
    [0.487, -0.24],
    [
      [0.483, -0.33],
      [0.468, -0.4],
      [0.44, -0.448],
    ],
    [
      [0.44, -0.448],
      [0.418, -0.432],
      [0.418, -0.432],
    ],
    [
      [0.44, -0.39],
      [0.456, -0.32],
      [0.461, -0.24],
    ],
  ],
  taillight: [
    [-0.488, -0.33],
    [
      [-0.486, -0.4],
      [-0.47, -0.455],
      [-0.435, -0.478],
    ],
    [
      [-0.435, -0.478],
      [-0.425, -0.455],
      [-0.425, -0.455],
    ],
    [
      [-0.455, -0.435],
      [-0.466, -0.39],
      [-0.468, -0.33],
    ],
  ],
};

function CarHatchSymbol(props: SymbolProps): ReactElement {
  return passengerCarSymbol(SPEC, props);
}

const SIZE = { w: 4015, d: 1720 };

export default defineItem({
  type: 'car-hatch',
  label: 'Carro hatch (porte HB20)',
  category: 'garage',
  keywords: [
    'carro',
    'hatch',
    'hb20',
    'automóvel',
    'automovel',
    'veículo',
    'veiculo',
    'garagem',
    'vaga',
    'compacto',
  ],
  size: SIZE,
  min: SIZE,
  max: SIZE,
  wallSnap: 'none',
  layer: 'furniture',
  color: '#B9BEC5',
  colors: CAR_COLORS,
  colorable: true,
  Symbol: CarHatchSymbol,
});
