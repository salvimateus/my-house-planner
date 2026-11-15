// placeholder: WP1b
import type { ProjectDoc } from '../model/types.ts';
import type { CatalogLookup, Scene } from './types.ts';

export const EMPTY_SCENE: Scene = {
  walls: [],
  boundary: [],
  runs: [],
  wallRects: [],
  boundaryRects: [],
  wallsGeom: [],
  boundaryGeom: [],
  faces: [],
  areas: new Map(),
  openings: new Map(),
  rulers: new Map(),
  totals: {
    lotArea: 0,
    builtArea: 0,
    netArea: 0,
    permeableArea: 0,
    occupancy: 0,
    permeability: 0,
  },
  issues: [],
};

export function deriveScene(_doc: ProjectDoc, _lookup: CatalogLookup): Scene {
  return EMPTY_SCENE;
}
