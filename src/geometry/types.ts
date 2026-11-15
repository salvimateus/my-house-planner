import type {
  Axis,
  Id,
  Item,
  ItemTypeId,
  MaterialId,
  Mm,
  OpeningType,
  ProjectDoc,
  Shape,
  Side,
  Vec,
} from '../model/types.ts';

/** Axis-aligned rectangle, x0 < x1 and y0 < y1. */
export interface Rect {
  x0: Mm;
  y0: Mm;
  x1: Mm;
  y1: Mm;
}
/** Disjoint rectilinear shapes (each [outer, ...holes]). */
export type Region = Shape[];
/** Coordinate-compressed cell grid; cells[(row * (xs.length - 1)) + col] = 1 when filled. */
export interface CellMask {
  xs: Mm[];
  ys: Mm[];
  cells: Uint8Array;
}
export type Operand = Region | Rect;

export type WallKind = 'internal' | 'external' | 'boundary';
export interface WallSegment {
  /** `${axis}:${line}:${start}:${end}` */
  id: string;
  axis: Axis;
  /** Axis coordinate, unshifted. */
  line: Mm;
  start: Mm;
  /** start < end */
  end: Mm;
  thickness: Mm;
  kind: WallKind;
  /** 0, or ±thickness/2 to keep a lot-line wall inside the lot. */
  offset: Mm;
  /** Area on the +normal side (+y for 'h', +x for 'v'). */
  plus: Id | null;
  minus: Id | null;
}
export interface WallRun {
  axis: Axis;
  line: Mm;
  start: Mm;
  end: Mm;
  thickness: Mm;
  offset: Mm;
  kind: WallKind;
  segmentIds: string[];
}
export interface WallRect extends Rect {
  segId: string;
}
export interface Face {
  axis: Axis;
  at: Mm;
  from: Mm;
  to: Mm;
  /** Points to the free side. */
  normal: 1 | -1;
}

export interface EdgeDim {
  axis: Axis;
  x: Mm;
  y: Mm;
  length: Mm;
  inward: 1 | -1;
  angle: 0 | -90;
}
export interface LabelBox {
  x: Mm;
  y: Mm;
  /** Font size in world mm. */
  fit: Mm;
  rect: Rect | null;
}
export interface AreaDerived {
  visible: Region;
  net: Region;
  netArea: number;
  grossArea: number;
  edges: EdgeDim[];
  label: LabelBox;
}
export interface OpeningDerived {
  run: WallRun | null;
  gap: Rect | null;
  center: Vec | null;
  valid: boolean;
}
export interface RulerDerived {
  a: Vec;
  b: Vec;
  length: Mm;
  valid: boolean;
}
export interface Totals {
  lotArea: number;
  builtArea: number;
  netArea: number;
  permeableArea: number;
  occupancy: number;
  permeability: number;
}

export type HitTarget =
  | { kind: 'opening'; id: Id }
  | { kind: 'item'; id: Id }
  | { kind: 'ruler'; id: Id; end: 'a' | 'b' | null }
  | { kind: 'label'; areaId: Id }
  | { kind: 'wall'; segmentId: string }
  | { kind: 'boundary'; side: Side }
  | { kind: 'area'; id: Id }
  | { kind: 'street-tree'; id: Id }
  | { kind: 'sidewalk-ramp'; id: Id }
  | { kind: 'lot' }
  | null;

export type IssueCode =
  | 'room-without-door'
  | 'bathroom-without-window'
  | 'small-bedroom'
  | 'door-swing-blocked'
  | 'orphan-opening'
  | 'item-outside'
  | 'narrow-ruler'
  | 'high-occupancy'
  | 'low-permeability';
export interface Issue {
  code: IssueCode;
  severity: 'info' | 'warning';
  message: string;
  target: HitTarget;
  at: Vec;
}

export interface Scene {
  walls: WallSegment[];
  boundary: WallSegment[];
  runs: WallRun[];
  wallRects: WallRect[];
  boundaryRects: WallRect[];
  /** Unions minus opening gaps. */
  wallsGeom: Region;
  boundaryGeom: Region;
  faces: Face[];
  areas: Map<Id, AreaDerived>;
  openings: Map<Id, OpeningDerived>;
  rulers: Map<Id, RulerDerived>;
  totals: Totals;
  issues: Issue[];
}

/** Catalog facts that geometry needs, passed in so geometry never imports the Vite registry. */
export interface CatalogLookup {
  itemLayer(type: ItemTypeId): 'floor' | 'furniture' | 'structure';
  materialPermeable(id: MaterialId): boolean;
}

export interface Guide {
  axis: 'x' | 'y';
  at: Mm;
}
/** Screen px. */
export interface Handle {
  id: string;
  x: number;
  y: number;
  shape: 'square' | 'circle' | 'icon';
  icon?: 'rotate' | 'flip-hinge' | 'flip-side';
  cursor?: string;
}
/** Screen px. */
export interface Readout {
  x: number;
  y: number;
  text: string;
  sub?: string;
  invalid?: boolean;
}
export type Ghost =
  | { kind: 'area'; rect: Rect; valid: boolean; carve: Rect[] }
  | {
      kind: 'opening';
      type: OpeningType;
      axis: Axis;
      line: Mm;
      at: Mm;
      width: Mm;
      side: 1 | -1;
      hinge: 'start' | 'end';
      world: Vec;
      snapped: boolean;
    }
  | { kind: 'item'; item: Item; valid: boolean };

export interface SnapContext {
  /** 500 with magnet on, 50 with magnet off. */
  step: Mm;
  /** tuning.magnet.alignRadiusPx * mmPerPx */
  tolMm: Mm;
  lot: ProjectDoc['lot'];
  alignX: Mm[];
  alignY: Mm[];
  faces: Face[];
  runs: WallRun[];
}
export interface Span {
  a: Vec;
  b: Vec;
  length: Mm;
  axis: Axis;
}
export interface OpResult {
  patch: Partial<Pick<ProjectDoc, 'areas' | 'openings' | 'openBoundaries' | 'items'>>;
  messages: string[];
  valid: boolean;
}
