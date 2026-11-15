import type { Lot, Mm, Structure } from './types.ts';

export const STRUCTURE_PRESETS = {
  // 9 cm block + plaster / 14 cm block + plaster
  masonry: { internal: 150, external: 200 },
  'slim-masonry': { internal: 120, external: 150 },
  drywall: { internal: 100, external: 200 },
} as const;

export const DEFAULT_STRUCTURE: Structure = {
  preset: 'masonry',
  internal: 150,
  external: 200,
  boundary: 150,
};

export const DEFAULT_LOT: Omit<Lot, 'width' | 'depth'> = {
  frontSide: 'bottom',
  cornerSide: null,
  boundaryWalls: { top: true, right: true, bottom: true, left: true },
  sidewalkWidth: 2500,
  northDeg: 0,
  ground: { color: '#EFE7D2', material: 'earth', scale: 1, angle: 0 },
  frontage: { ramps: [], trees: [] },
};

export const SNAP_STEP: Mm = 500;
export const FINE_STEP: Mm = 50;
export const MIN_ROOM_SIDE: Mm = 500;
export const MIN_JAMB: Mm = 100;
export const SLIVER_MIN_SIDE: Mm = 200;
/** mm² (0,25 m²) */
export const SLIVER_MIN_AREA = 250_000;
