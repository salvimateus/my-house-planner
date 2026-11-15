export type Id = string;
/** Integer millimeters. World origin = lot top-left corner, x right, y down. */
export type Mm = number;
export interface Vec {
  x: Mm;
  y: Mm;
}
/** Implicitly closed, no repeated last point, axis-aligned edges only. */
export type Ring = Vec[];
/** [outer (positive signed area), ...holes (negative signed area)] */
export type Shape = Ring[];
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Axis = 'h' | 'v';

export const FORMAT = 'casinha.project' as const;
export const SCHEMA_VERSION = 1 as const;

export interface ProjectDoc {
  format: typeof FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  id: Id;
  name: string;
  createdAt: string;
  updatedAt: string;
  lot: Lot;
  structure: Structure;
  areas: Area[];
  /** Sorted pairs of room ids with no wall between them. */
  openBoundaries: [Id, Id][];
  openings: Opening[];
  items: Item[];
  rulers: Ruler[];
  walkways: Walkway[];
}

export interface Lot {
  width: Mm;
  depth: Mm;
  frontSide: Side;
  /** Adjacent to frontSide. */
  cornerSide: Side | null;
  boundaryWalls: Record<Side, boolean>;
  sidewalkWidth: Mm;
  northDeg: number;
  ground: Fill;
  frontage: Frontage;
}

/** Sidewalk items on the street sides of the lot. */
export interface Frontage {
  ramps: SidewalkRamp[];
  trees: StreetTree[];
}

/** Curb cut with a ramp across the service strip. `at` is the center along the lot side, in lot coordinates. */
export interface SidewalkRamp {
  id: Id;
  side: Side;
  at: Mm;
  /** Width at the curb, flares included. */
  width: Mm;
  /** Vehicle gate the ramp follows; null after a manual edit. */
  gateId: Id | null;
}

export type StreetTreeSpecies = 'ipe-amarelo' | 'ipe-roxo' | 'quaresmeira' | 'oiti' | 'reseda';

/** Tree in the service strip. `at` is the trunk position along the lot side; `size` is the canopy diameter. */
export interface StreetTree {
  id: Id;
  side: Side;
  at: Mm;
  size: Mm;
  species: StreetTreeSpecies;
}

export interface Structure {
  preset: 'masonry' | 'slim-masonry' | 'drywall' | 'custom';
  internal: Mm;
  external: Mm;
  boundary: Mm;
  /** Chosen wall preset id (or 'custom') per wall kind; null derives it from the thickness. */
  wallPresets?: WallPresetIds | undefined;
}

export interface WallPresetIds {
  internal: string | null;
  external: string | null;
  boundary: string | null;
}

export type AreaKind = 'room' | 'covered' | 'outdoor';
export type RoomPresetId = string;
export type MaterialId = string;
export type ItemTypeId = string;

export interface Area {
  id: Id;
  kind: AreaKind;
  preset: RoomPresetId;
  name: string;
  shape: Shape;
  fill: Fill;
  labelOffset: Vec | null;
}

export interface Fill {
  /** #rrggbb */
  color: string;
  /** 'solid' = flat color. */
  material: MaterialId;
  /** 0.5..2 */
  scale: number;
  angle: 0 | 45 | 90;
}

export type OpeningType =
  | 'door'
  | 'door-double'
  | 'door-sliding'
  | 'door-balcony'
  | 'passage'
  | 'window-sliding'
  | 'window-tilt'
  | 'window-maxim'
  | 'window-fixed'
  | 'gate-pedestrian'
  | 'gate-sliding'
  | 'gate-tilt';

export interface Opening {
  id: Id;
  type: OpeningType;
  /** 'h' = host wall runs along x. */
  axis: Axis;
  /** Host axis coordinate without boundary offset (y for 'h', x for 'v'). */
  line: Mm;
  /** Center along the wall. */
  at: Mm;
  width: Mm;
  height: Mm;
  sill: Mm;
  /** start = lower coordinate. */
  hinge: 'start' | 'end';
  /** Leaf side: +1 = +y for 'h', +x for 'v'. */
  side: 1 | -1;
}

export interface Item {
  id: Id;
  type: ItemTypeId;
  variant: string | null;
  x: Mm;
  y: Mm;
  w: Mm;
  d: Mm;
  /** Integer degrees clockwise, 0..359. */
  rotation: number;
  color: string | null;
  label: string | null;
  mirrored: boolean;
}

/** 'free': two fixed points. 'fit': re-resolved wall face to wall face on every derive. */
export type Ruler =
  | { id: Id; mode: 'free'; a: Vec; b: Vec }
  | { id: Id; mode: 'fit'; origin: Vec; axis: Axis };

export type WalkwayStyle = 'stepping' | 'solid' | 'gravel';

/** Garden path: a smooth curve through `points` (centripetal Catmull-Rom), `width` across it. */
export interface Walkway {
  id: Id;
  /** Control points, 2..40. */
  points: Vec[];
  width: Mm;
  style: WalkwayStyle;
  /** #rrggbb */
  color: string;
}

export interface NewProjectInput {
  name: string;
  width: Mm;
  depth: Mm;
  frontSide: Side;
  cornerSide: Side | null;
  walled: boolean;
}

export type LayerId = 'grid' | 'context' | 'textures' | 'items' | 'openings' | 'measures';
export interface ViewPrefs {
  layers: Record<LayerId, { visible: boolean; locked: boolean }>;
}
export interface ProjectMeta {
  id: Id;
  name: string;
  updatedAt: string;
  thumbSvg: string;
  lotLabel: string;
  view: ViewPrefs;
}
