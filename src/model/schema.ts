import { z } from 'zod';
import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import type { OpeningType } from './types.ts';
import { FORMAT, SCHEMA_VERSION } from './types.ts';

// Structural validation only. Ranges, rounding, colors and references are repaired by sanitize().

const id = z.string().min(1).max(40);
const num = z.number();
const vec = z.object({ x: num, y: num });
const side = z.enum(['top', 'right', 'bottom', 'left']);
const axis = z.enum(['h', 'v']);

const fill = z.object({
  color: z.string().max(16),
  material: z.string().max(40),
  scale: z.number().min(0.25).max(4),
  angle: z.union([z.literal(0), z.literal(45), z.literal(90)]),
});

const lot = z.object({
  width: num,
  depth: num,
  frontSide: side,
  cornerSide: side.nullable(),
  boundaryWalls: z.object({
    top: z.boolean(),
    right: z.boolean(),
    bottom: z.boolean(),
    left: z.boolean(),
  }),
  sidewalkWidth: num,
  northDeg: num,
  ground: fill,
});

const structure = z.object({
  preset: z.enum(['masonry', 'slim-masonry', 'drywall', 'custom']),
  internal: num,
  external: num,
  boundary: num,
});

const ring = z.array(vec).min(4).max(2000);

const area = z.object({
  id,
  kind: z.enum(['room', 'covered', 'outdoor']),
  preset: z.string().max(40),
  name: z.string().max(200),
  shape: z.array(ring).min(1).max(200),
  fill,
  labelOffset: vec.nullable(),
});

const openingTypes = Object.keys(OPENING_SPECS) as [OpeningType, ...OpeningType[]];

const opening = z.object({
  id,
  type: z.enum(openingTypes),
  axis,
  line: num,
  at: num,
  width: num,
  height: num,
  sill: num,
  hinge: z.enum(['start', 'end']),
  side: z.union([z.literal(1), z.literal(-1)]),
});

const item = z.object({
  id,
  type: z.string().min(1).max(80),
  variant: z.string().max(80).nullable(),
  x: num,
  y: num,
  w: num,
  d: num,
  rotation: num,
  color: z.string().max(16).nullable(),
  label: z.string().max(200).nullable(),
  mirrored: z.boolean(),
});

const ruler = z.discriminatedUnion('mode', [
  z.object({ id, mode: z.literal('free'), a: vec, b: vec }),
  z.object({ id, mode: z.literal('fit'), origin: vec, axis }),
]);

export const projectSchema = z.object({
  format: z.literal(FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  name: z.string().max(200),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  lot,
  structure,
  areas: z.array(area).max(500),
  openBoundaries: z.array(z.tuple([id, id])).max(1000),
  openings: z.array(opening).max(500),
  items: z.array(item).max(2000),
  rulers: z.array(ruler).max(500),
});

export type ProjectSchemaOutput = z.infer<typeof projectSchema>;
