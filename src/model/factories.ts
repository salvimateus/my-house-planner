// placeholder: WP1a
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

export type OpeningHost = Pick<Opening, 'axis' | 'line' | 'at'>;

export function createProject(_input: NewProjectInput): ProjectDoc {
  throw new Error('placeholder: WP1a');
}

export function createArea(_kind: AreaKind, _preset: RoomPresetId, _shape: Shape): Area {
  throw new Error('placeholder: WP1a');
}

export function createOpening(_type: OpeningType, _host: OpeningHost): Opening {
  throw new Error('placeholder: WP1a');
}

export function createItem(_type: ItemTypeId, _at: Vec, _size: { w: Mm; d: Mm }): Item {
  throw new Error('placeholder: WP1a');
}

export function createFreeRuler(_a: Vec, _b: Vec): Ruler {
  throw new Error('placeholder: WP1a');
}

export function createFitRuler(_origin: Vec, _axis: Axis): Ruler {
  throw new Error('placeholder: WP1a');
}
