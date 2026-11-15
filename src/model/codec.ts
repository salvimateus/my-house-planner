import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import { presetFor } from '../catalog/roomPresets.ts';
import { DEFAULT_LOT } from './defaults.ts';
import { DEFAULT_PROJECT_NAME } from './factories.ts';
import { newId } from './ids.ts';
import { CodecError, migrate } from './migrate.ts';
import { projectSchema } from './schema.ts';
import type {
  Area,
  Fill,
  Id,
  Item,
  Lot,
  MaterialId,
  Mm,
  Opening,
  ProjectDoc,
  Ring,
  Ruler,
  Shape,
  Side,
  Structure,
  Vec,
} from './types.ts';

export { CodecError, migrate };

export const MAX_FILE_CHARS = 5_000_000;
export const MAX_NAME_CHARS = 60;

export interface SanitizeOptions {
  /** Material registry lookup from the UI layer. Without it, any well-formed id is kept. */
  isKnownMaterial?: (id: MaterialId) => boolean;
}

export interface ParseOptions extends SanitizeOptions {
  /** Give the doc a new id (import always creates a copy). */
  newId?: boolean;
}

export interface ParseResult {
  doc: ProjectDoc;
  /** pt-BR lines for the toast, one per kind of repair. */
  repairs: string[];
}

export function serializeProject(doc: ProjectDoc): string {
  return JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }, null, 2);
}

export function parseProject(text: string, opts: ParseOptions = {}): ParseResult {
  if (typeof text !== 'string') throw new CodecError('Este arquivo não é uma planta do Casinha.');
  if (text.length > MAX_FILE_CHARS) throw new CodecError('Arquivo grande demais para uma planta.');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new CodecError('Este arquivo não é uma planta do Casinha.');
  }
  const parsed = projectSchema.safeParse(migrate(raw));
  if (!parsed.success) throw new CodecError('A planta tem dados inválidos e não pode ser aberta.');
  const { doc, repairs } = sanitize(parsed.data, opts);
  return { doc: opts.newId ? { ...doc, id: newId() } : doc, repairs };
}

// ---------------------------------------------------------------------------
// Repairs

type RepairKind =
  | 'color'
  | 'material'
  | 'scale'
  | 'date'
  | 'name'
  | 'id'
  | 'lot'
  | 'structure'
  | 'shape'
  | 'areaClamped'
  | 'areaDropped'
  | 'openBoundary'
  | 'opening'
  | 'item'
  | 'rulerDropped'
  | 'rulerClamped';

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${n} ${many}`;

const REPAIR_TEXT: Record<RepairKind, (n: number) => string> = {
  color: (n) =>
    `${plural(n, 'cor inválida foi trocada', 'cores inválidas foram trocadas')} pela cor padrão.`,
  material: (n) =>
    `${plural(n, 'acabamento desconhecido foi trocado', 'acabamentos desconhecidos foram trocados')} por cor lisa.`,
  scale: (n) =>
    `${plural(n, 'escala de acabamento foi ajustada', 'escalas de acabamento foram ajustadas')} para 0,5× a 2×.`,
  date: (n) =>
    `${plural(n, 'data inválida foi trocada', 'datas inválidas foram trocadas')} pela data de hoje.`,
  name: (n) =>
    `${plural(n, 'nome foi corrigido', 'nomes foram corrigidos')} (máximo de ${MAX_NAME_CHARS} letras).`,
  id: (n) =>
    `${plural(n, 'identificador repetido ou inválido foi renovado', 'identificadores repetidos ou inválidos foram renovados')}.`,
  lot: () => 'As medidas do terreno foram ajustadas aos limites aceitos.',
  structure: () =>
    'As espessuras de parede foram ajustadas para múltiplos de 1 cm, entre 5 cm e 40 cm.',
  shape: (n) =>
    `${plural(n, 'contorno de ambiente foi corrigido', 'contornos de ambiente foram corrigidos')}.`,
  areaClamped: (n) =>
    `${plural(n, 'ambiente foi recortado', 'ambientes foram recortados')} para caber no terreno.`,
  areaDropped: (n) =>
    `${plural(n, 'ambiente inválido foi removido', 'ambientes inválidos foram removidos')}.`,
  openBoundary: (n) =>
    `${plural(n, 'ligação aberta inválida foi removida', 'ligações abertas inválidas foram removidas')}.`,
  opening: (n) =>
    `${plural(n, 'porta ou janela teve as medidas ajustadas', 'portas e janelas tiveram as medidas ajustadas')}.`,
  item: (n) =>
    `${plural(n, 'objeto teve as medidas ajustadas', 'objetos tiveram as medidas ajustadas')}.`,
  rulerDropped: (n) =>
    `${plural(n, 'régua sem comprimento foi removida', 'réguas sem comprimento foram removidas')}.`,
  rulerClamped: (n) =>
    `${plural(n, 'régua foi trazida', 'réguas foram trazidas')} para dentro do terreno.`,
};

class RepairLog {
  private counts = new Map<RepairKind, number>();
  add(kind: RepairKind): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
  }
  lines(): string[] {
    return [...this.counts].map(([kind, n]) => REPAIR_TEXT[kind](n));
  }
}

// ---------------------------------------------------------------------------
// Limits

const LOT_WIDTH = { min: 3_000, max: 100_000 };
const LOT_DEPTH = { min: 3_000, max: 200_000 };
const SIDEWALK = { min: 0, max: 10_000 };
const THICKNESS = { min: 50, max: 400 };
const FILL_SCALE = { min: 0.5, max: 2 };
const OPENING_HEIGHT = { min: 300, max: 3_000 };
const OPENING_SILL = { min: 0, max: 2_500 };
const ITEM_SIZE = { min: 50, max: 20_000 };
/** Items may stand partly outside the lot (the health panel reports it), but not far away. */
const ITEM_MARGIN: Mm = 5_000;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const MATERIAL_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Rounds and clamps; flags the change only when the rounded value was out of range. */
function fitMm(v: number, min: number, max: number, flag: () => void): Mm {
  const r = Math.round(v);
  const c = clamp(r, min, max);
  if (c !== r) flag();
  return c;
}

const ADJACENT: Record<Side, readonly Side[]> = {
  top: ['left', 'right'],
  bottom: ['left', 'right'],
  left: ['top', 'bottom'],
  right: ['top', 'bottom'],
};

function cleanText(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 && code !== 0x7f) out += ch;
  }
  return out.trim();
}

function cleanName(text: string, fallback: string, log: RepairLog): string {
  const clean = cleanText(text);
  const cut = [...clean].slice(0, MAX_NAME_CHARS).join('').trim();
  if (cut !== text.trim()) log.add('name');
  return cut || fallback;
}

function cleanDate(text: string, now: string, log: RepairLog): string {
  if (Number.isNaN(Date.parse(text))) {
    log.add('date');
    return now;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Fills

function cleanFill(fill: Fill, fallbackColor: string, opts: SanitizeOptions, log: RepairLog): Fill {
  let color = fill.color;
  if (!HEX_COLOR.test(color)) {
    color = fallbackColor;
    log.add('color');
  }
  let material = fill.material;
  const known = opts.isKnownMaterial ? opts.isKnownMaterial(material) : MATERIAL_ID.test(material);
  if (material !== 'solid' && !known) {
    material = 'solid';
    log.add('material');
  }
  let scale = fill.scale;
  if (scale < FILL_SCALE.min || scale > FILL_SCALE.max) {
    scale = clamp(scale, FILL_SCALE.min, FILL_SCALE.max);
    log.add('scale');
  }
  return { color, material, scale, angle: fill.angle };
}

// ---------------------------------------------------------------------------
// Shapes

const roundVec = (p: Vec): Vec => ({ x: Math.round(p.x), y: Math.round(p.y) });

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** Drops repeated points, collinear points and zero-width spikes, until stable. */
function simplifyRing(ring: Ring): Ring {
  let pts = ring.slice();
  let changed = true;
  while (changed && pts.length >= 3) {
    changed = false;
    const out: Ring = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = out.length > 0 ? out[out.length - 1]! : pts[pts.length - 1]!;
      const cur = pts[i]!;
      const next = pts[(i + 1) % pts.length]!;
      const repeated = cur.x === prev.x && cur.y === prev.y;
      const collinear =
        (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y);
      if (repeated || collinear) changed = true;
      else out.push(cur);
    }
    pts = out;
  }
  return pts;
}

function isRectilinearRing(ring: Ring): boolean {
  if (ring.length < 4 || ring.length % 2 !== 0) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const vertical = a.x === b.x;
    const horizontal = a.y === b.y;
    if (vertical === horizontal) return false;
  }
  return true;
}

interface Bbox {
  x0: Mm;
  y0: Mm;
  x1: Mm;
  y1: Mm;
}

function ringBbox(ring: Ring): Bbox {
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const bboxInside = (inner: Bbox, outer: Bbox): boolean =>
  inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1;

/** Rounded, simplified and rectilinear ring with the requested orientation, or null. */
function cleanRing(ring: Ring, lot: Lot, sign: 1 | -1, onClamp: () => void): Ring | null {
  let clamped = false;
  const pts = ring.map((p) => {
    const r = roundVec(p);
    const c = { x: clamp(r.x, 0, lot.width), y: clamp(r.y, 0, lot.depth) };
    if (c.x !== r.x || c.y !== r.y) clamped = true;
    return c;
  });
  if (clamped) onClamp();
  const simple = simplifyRing(pts);
  if (!isRectilinearRing(simple)) return null;
  const area = signedArea(simple);
  if (area === 0) return null;
  return Math.sign(area) === sign ? simple : simple.reverse();
}

function cleanShape(shape: Shape, lot: Lot, log: RepairLog): Shape | null {
  let clamped = false;
  const onClamp = () => {
    clamped = true;
  };
  const [rawOuter, ...rawHoles] = shape;
  const outer = rawOuter ? cleanRing(rawOuter, lot, 1, onClamp) : null;
  if (!outer) {
    log.add('areaDropped');
    return null;
  }
  const box = ringBbox(outer);
  const holes: Ring[] = [];
  let fixed = false;
  for (const raw of rawHoles) {
    const hole = cleanRing(raw, lot, -1, onClamp);
    if (hole && bboxInside(ringBbox(hole), box)) holes.push(hole);
    else fixed = true;
  }
  const result = [outer, ...holes];
  if (clamped) log.add('areaClamped');
  else if (
    fixed ||
    !sameShape(
      result,
      shape.map((r) => r.map(roundVec)),
    )
  )
    log.add('shape');
  return result;
}

function sameShape(a: Shape, b: Shape): boolean {
  if (a.length !== b.length) return false;
  return a.every((ring, i) => {
    const other = b[i]!;
    if (ring.length !== other.length) return false;
    // Orientation fixes and dropped collinear points count as a change; a cyclic shift does not.
    const start = other.findIndex((p) => p.x === ring[0]!.x && p.y === ring[0]!.y);
    if (start < 0) return false;
    return ring.every((p, j) => {
      const q = other[(start + j) % other.length]!;
      return p.x === q.x && p.y === q.y;
    });
  });
}

// ---------------------------------------------------------------------------
// Sanitize

export function sanitize(input: ProjectDoc, opts: SanitizeOptions = {}): ParseResult {
  const log = new RepairLog();
  const now = new Date().toISOString();

  const usedIds = new Set<Id>();
  const uniqueId = (id: Id): Id => {
    if (SAFE_ID.test(id) && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    log.add('id');
    let fresh = newId();
    while (usedIds.has(fresh)) fresh = newId();
    usedIds.add(fresh);
    return fresh;
  };

  const lot = cleanLot(input.lot, opts, log);
  const structure = cleanStructure(input.structure, log);

  const areas: Area[] = [];
  for (const area of input.areas) {
    const shape = cleanShape(area.shape, lot, log);
    if (!shape) continue;
    const preset = presetFor(area.preset);
    areas.push({
      id: uniqueId(area.id),
      kind: area.kind,
      preset: area.preset,
      name: cleanName(area.name, preset.label, log),
      shape,
      fill: cleanFill(area.fill, preset.fill.color, opts, log),
      labelOffset: area.labelOffset ? roundVec(area.labelOffset) : null,
    });
  }

  const areaIds = new Set(areas.map((a) => a.id));
  const pairKeys = new Set<string>();
  const openBoundaries: [Id, Id][] = [];
  for (const [a, b] of input.openBoundaries) {
    const pair: [Id, Id] = a < b ? [a, b] : [b, a];
    const key = `${pair[0]}\u0000${pair[1]}`;
    if (a === b || !areaIds.has(a) || !areaIds.has(b) || pairKeys.has(key)) {
      log.add('openBoundary');
      continue;
    }
    pairKeys.add(key);
    openBoundaries.push(pair);
  }

  const openings = input.openings.map((o) => ({
    ...cleanOpening(o, lot, log),
    id: uniqueId(o.id),
  }));
  const items = input.items.map((it) => ({ ...cleanItem(it, lot, log), id: uniqueId(it.id) }));

  const rulers: Ruler[] = [];
  for (const r of input.rulers) {
    const clean = cleanRuler(r, lot, log);
    if (clean) rulers.push({ ...clean, id: uniqueId(r.id) });
  }

  let projectId = input.id;
  if (!SAFE_ID.test(projectId)) {
    log.add('id');
    projectId = newId();
  }

  const doc: ProjectDoc = {
    format: input.format,
    schemaVersion: input.schemaVersion,
    id: projectId,
    name: cleanName(input.name, DEFAULT_PROJECT_NAME, log),
    createdAt: cleanDate(input.createdAt, now, log),
    updatedAt: cleanDate(input.updatedAt, now, log),
    lot,
    structure,
    areas,
    openBoundaries,
    openings,
    items,
    rulers,
  };
  return { doc, repairs: log.lines() };
}

function cleanLot(lot: Lot, opts: SanitizeOptions, log: RepairLog): Lot {
  let changed = false;
  const flag = () => {
    changed = true;
  };
  const width = fitMm(lot.width, LOT_WIDTH.min, LOT_WIDTH.max, flag);
  const depth = fitMm(lot.depth, LOT_DEPTH.min, LOT_DEPTH.max, flag);
  const sidewalkWidth = fitMm(lot.sidewalkWidth, SIDEWALK.min, SIDEWALK.max, flag);
  let cornerSide = lot.cornerSide;
  if (cornerSide !== null && !ADJACENT[lot.frontSide].includes(cornerSide)) {
    cornerSide = null;
    flag();
  }
  if (changed) log.add('lot');
  const northDeg = ((Math.round(lot.northDeg) % 360) + 360) % 360;
  return {
    width,
    depth,
    frontSide: lot.frontSide,
    cornerSide,
    boundaryWalls: { ...lot.boundaryWalls },
    sidewalkWidth,
    northDeg,
    ground: cleanFill(lot.ground, DEFAULT_LOT.ground.color, opts, log),
  };
}

function cleanStructure(s: Structure, log: RepairLog): Structure {
  let changed = false;
  const fit = (v: number): Mm => {
    const c = clamp(Math.round(v / 10) * 10, THICKNESS.min, THICKNESS.max);
    if (c !== v) changed = true;
    return c;
  };
  const out: Structure = {
    preset: s.preset,
    internal: fit(s.internal),
    external: fit(s.external),
    boundary: fit(s.boundary),
  };
  if (changed) log.add('structure');
  return out;
}

function cleanOpening(o: Opening, lot: Lot, log: RepairLog): Opening {
  const spec = OPENING_SPECS[o.type];
  let changed = false;
  const flag = () => {
    changed = true;
  };
  const lineMax = o.axis === 'h' ? lot.depth : lot.width;
  const atMax = o.axis === 'h' ? lot.width : lot.depth;
  const out: Opening = {
    id: o.id,
    type: o.type,
    axis: o.axis,
    line: fitMm(o.line, 0, lineMax, flag),
    at: fitMm(o.at, 0, atMax, flag),
    width: fitMm(o.width, spec.minWidth, spec.maxWidth, flag),
    height: fitMm(o.height, OPENING_HEIGHT.min, OPENING_HEIGHT.max, flag),
    sill: fitMm(o.sill, OPENING_SILL.min, OPENING_SILL.max, flag),
    hinge: o.hinge,
    side: o.side,
  };
  if (changed) log.add('opening');
  return out;
}

function cleanItem(it: Item, lot: Lot, log: RepairLog): Item {
  let changed = false;
  const flag = () => {
    changed = true;
  };
  let color = it.color;
  if (color !== null && !HEX_COLOR.test(color)) {
    color = null;
    log.add('color');
  }
  let label = it.label === null ? null : cleanText(it.label);
  if (label !== null) {
    const cut = [...label].slice(0, MAX_NAME_CHARS).join('').trim();
    if (cut !== it.label?.trim()) log.add('name');
    label = cut || null;
  }
  const out: Item = {
    id: it.id,
    type: it.type,
    variant: it.variant,
    x: fitMm(it.x, -ITEM_MARGIN, lot.width + ITEM_MARGIN, flag),
    y: fitMm(it.y, -ITEM_MARGIN, lot.depth + ITEM_MARGIN, flag),
    w: fitMm(it.w, ITEM_SIZE.min, ITEM_SIZE.max, flag),
    d: fitMm(it.d, ITEM_SIZE.min, ITEM_SIZE.max, flag),
    rotation: ((Math.round(it.rotation) % 360) + 360) % 360,
    color,
    label,
    mirrored: it.mirrored,
  };
  if (changed) log.add('item');
  return out;
}

function cleanRuler(r: Ruler, lot: Lot, log: RepairLog): Ruler | null {
  if (r.mode === 'free') {
    const a = roundVec(r.a);
    const b = roundVec(r.b);
    if (a.x === b.x && a.y === b.y) {
      log.add('rulerDropped');
      return null;
    }
    return { id: r.id, mode: 'free', a, b };
  }
  const o = roundVec(r.origin);
  const origin = { x: clamp(o.x, 0, lot.width), y: clamp(o.y, 0, lot.depth) };
  if (origin.x !== o.x || origin.y !== o.y) log.add('rulerClamped');
  return { id: r.id, mode: 'fit', origin, axis: r.axis };
}
