import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import { presetFor } from '../catalog/roomPresets.ts';
import { defaultFrontage } from '../geometry/frontage.ts';
import { DEFAULT_LOT, DEFAULT_STRUCTURE } from './defaults.ts';
import { newId } from './ids.ts';
import type {
  Area,
  AreaKind,
  Axis,
  Item,
  ItemTypeId,
  Mm,
  NewProjectInput,
  Opening,
  OpeningType,
  ProjectDoc,
  RoomPresetId,
  Ruler,
  Shape,
  Vec,
} from './types.ts';
import { FORMAT, SCHEMA_VERSION } from './types.ts';

export type OpeningHost = Pick<Opening, 'axis' | 'line' | 'at'>;

export const DEFAULT_PROJECT_NAME = 'Minha casa';

const roundVec = (p: Vec): Vec => ({ x: Math.round(p.x), y: Math.round(p.y) });

export function createProject(input: NewProjectInput): ProjectDoc {
  const now = new Date().toISOString();
  const walled = input.walled;
  const width = Math.round(input.width);
  const depth = Math.round(input.depth);
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name: input.name.trim() || DEFAULT_PROJECT_NAME,
    createdAt: now,
    updatedAt: now,
    lot: {
      width,
      depth,
      frontSide: input.frontSide,
      cornerSide: input.cornerSide,
      boundaryWalls: { top: walled, right: walled, bottom: walled, left: walled },
      sidewalkWidth: DEFAULT_LOT.sidewalkWidth,
      northDeg: DEFAULT_LOT.northDeg,
      ground: { ...DEFAULT_LOT.ground },
      frontage: defaultFrontage({
        width,
        depth,
        frontSide: input.frontSide,
        cornerSide: input.cornerSide,
        sidewalkWidth: DEFAULT_LOT.sidewalkWidth,
      }),
    },
    structure: { ...DEFAULT_STRUCTURE },
    areas: [],
    openBoundaries: [],
    openings: [],
    items: [],
    rulers: [],
  };
}

/** The caller passes a normalized shape. */
export function createArea(kind: AreaKind, preset: RoomPresetId, shape: Shape): Area {
  const p = presetFor(preset);
  return {
    id: newId(),
    kind,
    preset,
    name: p.label,
    shape: shape.map((ring) => ring.map(roundVec)),
    fill: { ...p.fill },
    labelOffset: null,
  };
}

export function createOpening(type: OpeningType, host: OpeningHost): Opening {
  const spec = OPENING_SPECS[type];
  return {
    id: newId(),
    type,
    axis: host.axis,
    line: Math.round(host.line),
    at: Math.round(host.at),
    width: spec.defaultWidth,
    height: spec.height,
    sill: spec.sill,
    hinge: 'start',
    side: 1,
  };
}

/** `size` comes from the catalog in the UI layer; the model never imports the Vite registry. */
export function createItem(type: ItemTypeId, at: Vec, size: { w: Mm; d: Mm }): Item {
  return {
    id: newId(),
    type,
    variant: null,
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: Math.round(size.w),
    d: Math.round(size.d),
    rotation: 0,
    color: null,
    label: null,
    mirrored: false,
  };
}

export function createFreeRuler(a: Vec, b: Vec): Ruler {
  return { id: newId(), mode: 'free', a: roundVec(a), b: roundVec(b) };
}

export function createFitRuler(origin: Vec, axis: Axis): Ruler {
  return { id: newId(), mode: 'fit', origin: roundVec(origin), axis };
}
