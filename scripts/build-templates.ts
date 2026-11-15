/**
 * Builds the example plans in `src/templates/*.casinha.json` with the real model factories and
 * geometry operations, then checks each file: zero codec repairs, zero plan health issues, no
 * overlapping furniture and a stable frontage. Run with `npm run templates`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insertArea, setOpenBoundary } from '../src/geometry/areaOps.ts';
import { parkingHinge, syncGateRamps } from '../src/geometry/frontage.ts';
import { clearSpan } from '../src/geometry/raycast.ts';
import { difference } from '../src/geometry/rectilinear.ts';
import { deriveScene } from '../src/geometry/scene.ts';
import { normalizeShape, rectShape, rotatedAabb } from '../src/geometry/shape.ts';
import type { CatalogLookup, OpResult, Rect, Scene } from '../src/geometry/types.ts';
import { parseProject } from '../src/model/codec.ts';
import {
  createArea,
  createFitRuler,
  createItem,
  createOpening,
  createProject,
} from '../src/model/factories.ts';
import type {
  AreaKind,
  Axis,
  Fill,
  Id,
  Item,
  Mm,
  NewProjectInput,
  Opening,
  OpeningType,
  ProjectDoc,
  RoomPresetId,
  Shape,
  Vec,
} from '../src/model/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'src/templates');
/** Fixed dates keep the files stable between runs. */
const STAMP = '2026-11-01T12:00:00.000Z';

// ---------------------------------------------------------------------------
// Catalog facts read from the item and material sources (the registry needs Vite's glob import)

interface ItemFacts {
  size: { w: Mm; d: Mm };
  variants: Map<string, { w: Mm; d: Mm }>;
  layer: 'floor' | 'furniture' | 'structure';
}

const num = (text: string): number => Number(text.replaceAll('_', ''));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : e.name.endsWith('.tsx')
        ? [join(dir, e.name)]
        : [],
  );
}

function readItems(): Map<string, ItemFacts> {
  const out = new Map<string, ItemFacts>();
  const NUM = '(\\d[\\d_]*)';
  for (const file of sourceFiles(join(ROOT, 'src/catalog/items'))) {
    const src = readFileSync(file, 'utf8');
    const body = src.slice(src.indexOf('defineItem({'));
    const type = /type: '([^']+)'/.exec(body)?.[1];
    const layer = /layer: '(floor|furniture|structure)'/.exec(body)?.[1] as ItemFacts['layer'];
    const inline = new RegExp(`size: \\{ w: ${NUM}, d: ${NUM} \\}`).exec(body);
    const constName = /size: ([A-Z_]+),/.exec(body)?.[1];
    const constSize = constName
      ? new RegExp(`const ${constName} = \\{ w: ${NUM}, d: ${NUM} \\}`).exec(src)
      : null;
    const size = inline ?? constSize;
    if (!type || !layer || !size) throw new Error(`Cannot read the item facts of ${file}`);
    const variants = new Map<string, { w: Mm; d: Mm }>();
    const variantRe = new RegExp(`\\{ id: '([^']+)', label: [^}]*?, w: ${NUM}, d: ${NUM} \\}`, 'g');
    for (const m of body.matchAll(variantRe)) {
      variants.set(m[1]!, { w: num(m[2]!), d: num(m[3]!) });
    }
    out.set(type, { size: { w: num(size[1]!), d: num(size[2]!) }, variants, layer });
  }
  return out;
}

function readMaterials(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const file of sourceFiles(join(ROOT, 'src/catalog/materials'))) {
    const src = readFileSync(file, 'utf8');
    const id = /\bid: '([^']+)'/.exec(src)?.[1];
    const permeable = /permeable: (true|false)/.exec(src)?.[1];
    if (id && permeable) out.set(id, permeable === 'true');
  }
  return out;
}

const ITEMS = readItems();
const MATERIALS = readMaterials();

const lookup: CatalogLookup = {
  itemLayer: (type) => ITEMS.get(type)?.layer ?? 'furniture',
  materialPermeable: (id) => MATERIALS.get(id) ?? false,
};

// ---------------------------------------------------------------------------
// Plan builder

type WallSide = 'top' | 'bottom' | 'left' | 'right';

const BACK_ROTATION: Record<WallSide, number> = { top: 0, right: 90, bottom: 180, left: 270 };

const rect = (x0: Mm, y0: Mm, x1: Mm, y1: Mm): Shape => rectShape({ x0, y0, x1, y1 });

const fill = (color: string, material: string): Fill => ({ color, material, scale: 1, angle: 0 });

interface AreaOptions {
  name?: string;
  fill?: Fill;
}

interface OpeningOptions {
  width?: Mm;
  hinge?: 'start' | 'end';
  side?: 1 | -1;
}

interface ItemOptions {
  variant?: string;
  size?: { w: Mm; d: Mm };
  color?: string;
  mirrored?: boolean;
}

class Plan {
  doc: ProjectDoc;
  private cache: Scene | null = null;

  constructor(input: NewProjectInput) {
    this.doc = createProject(input);
    this.doc.createdAt = STAMP;
    this.doc.updatedAt = STAMP;
    this.doc.structure = {
      preset: 'masonry',
      internal: 150,
      external: 200,
      boundary: 150,
      wallPresets: {
        internal: 'tijolo-em-pe',
        external: 'bloco-14-externo',
        boundary: 'tijolo-em-pe',
      },
    };
  }

  private apply(res: OpResult, what: string): void {
    if (!res.valid) throw new Error(`${what}: ${res.messages.join(' ')}`);
    if (res.messages.length)
      throw new Error(`${what}: unexpected change: ${res.messages.join(' ')}`);
    Object.assign(this.doc, res.patch);
    this.cache = null;
  }

  /** Adds an area through `insertArea`, so rooms carve the rooms below them as in the editor. */
  area(kind: AreaKind, preset: RoomPresetId, shape: Shape, opts: AreaOptions = {}): Id {
    const a = createArea(kind, preset, normalizeShape(shape));
    if (opts.name) a.name = opts.name;
    if (opts.fill) a.fill = opts.fill;
    this.apply(insertArea(this.doc, a), `area ${a.name}`);
    return a.id;
  }

  /** Every free piece of `bounds` (no other area over it) as areas of one preset. */
  rest(kind: AreaKind, preset: RoomPresetId, bounds: Rect, opts: AreaOptions = {}): void {
    const pieces = difference(
      bounds,
      ...this.doc.areas.flatMap((a) => (a.kind === kind ? [[a.shape]] : [])),
    );
    for (const shape of pieces) this.area(kind, preset, shape, opts);
  }

  integrate(a: Id, b: Id): void {
    this.apply(setOpenBoundary(this.doc, a, b, true), 'integrate');
  }

  /** `line` is the wall axis coordinate (y for 'h', x for 'v'); `at` is the center along the wall. */
  opening(type: OpeningType, axis: Axis, line: Mm, at: Mm, opts: OpeningOptions = {}): Opening {
    const o = createOpening(type, { axis, line, at });
    if (opts.width) o.width = opts.width;
    if (opts.hinge) o.hinge = opts.hinge;
    if (opts.side) o.side = opts.side;
    this.doc.openings.push(o);
    this.cache = null;
    return o;
  }

  private scene(): Scene {
    this.cache ??= deriveScene(this.doc, lookup);
    return this.cache;
  }

  /** Clear span between wall faces through `p` (walls and lot walls only). */
  span(p: Vec, axis: Axis): { a: Vec; b: Vec } {
    const scene = this.scene();
    const solids = [...scene.wallRects, ...scene.boundaryRects];
    const bounds = { x0: 0, y0: 0, x1: this.doc.lot.width, y1: this.doc.lot.depth };
    const s = clearSpan(p, axis, solids, bounds);
    if (!s) throw new Error(`Point ${p.x},${p.y} is inside a wall`);
    return s;
  }

  private size(type: string, opts: ItemOptions): { w: Mm; d: Mm } {
    const facts = ITEMS.get(type);
    if (!facts) throw new Error(`Unknown item type ${type}`);
    if (opts.size) return opts.size;
    if (opts.variant) {
      const v = facts.variants.get(opts.variant);
      if (!v) throw new Error(`Unknown variant ${opts.variant} of ${type}`);
      return v;
    }
    return facts.size;
  }

  /** An item at a free position and rotation. */
  item(type: string, x: Mm, y: Mm, rotation = 0, opts: ItemOptions = {}): Item {
    const it = createItem(type, { x, y }, this.size(type, opts));
    it.rotation = rotation;
    it.variant = opts.variant ?? null;
    if (opts.color) it.color = opts.color;
    if (opts.mirrored) it.mirrored = true;
    this.doc.items.push(it);
    return it;
  }

  /**
   * An item with its back on the wall face of `side`, as the wall magnet of the editor leaves it.
   * `along` is the center along that wall; `probe` is a coordinate across it, inside the room.
   */
  onWall(type: string, side: WallSide, along: Mm, probe: Mm, opts: ItemOptions = {}): Item {
    const { d } = this.size(type, opts);
    const vertical = side === 'top' || side === 'bottom';
    const p = vertical ? { x: along, y: probe } : { x: probe, y: along };
    const s = this.span(p, vertical ? 'v' : 'h');
    const half = d / 2;
    const across = {
      top: s.a.y + half,
      bottom: s.b.y - half,
      left: s.a.x + half,
      right: s.b.x - half,
    }[side];
    return vertical
      ? this.item(type, along, across, BACK_ROTATION[side], opts)
      : this.item(type, across, along, BACK_ROTATION[side], opts);
  }

  ruler(origin: Vec, axis: Axis): void {
    this.doc.rulers.push(createFitRuler(origin, axis));
  }

  /** Ramps for the vehicle gates and trees out of their way, as the editor does after each change. */
  finish(): ProjectDoc {
    Object.assign(this.doc, syncGateRamps(this.doc, null));
    return this.doc;
  }
}

const GRASS = fill('#9BC87A', 'grass');
const base = { frontSide: 'bottom', cornerSide: null, walled: true } as const;

// ---------------------------------------------------------------------------
// Casa térrea 10×25: front at the bottom (south), north at the top, bedrooms face the backyard.

function terrea(): ProjectDoc {
  const p = new Plan({ ...base, name: 'Casa térrea 10×25', width: 10_000, depth: 25_000 });

  // Backyard: laundry building and barbecue porch on the back wall, lawn around them.
  p.area('room', 'laundry', rect(6500, 0, 10_000, 2500), { name: 'Lavanderia' });
  p.area('covered', 'porch', rect(3000, 0, 6500, 2500), { name: 'Churrasqueira' });

  // House: bedrooms on the north side, hall, then the integrated living room and kitchen.
  p.area('room', 'bedroom', rect(0, 5000, 2500, 9000), { name: 'Quarto 1' });
  p.area('room', 'bedroom', rect(2500, 5000, 5000, 9000), { name: 'Quarto 2' });
  p.area('room', 'suite', rect(5000, 5000, 8500, 9000));
  p.area('room', 'bathroom', rect(7000, 7000, 8500, 9000), { name: 'Banho da suíte' });
  p.area('room', 'hall', rect(0, 9000, 7000, 10_000));
  const living = p.area('room', 'living', rect(0, 10_000, 8500, 17_500), { name: 'Sala' });
  const kitchen = p.area('room', 'kitchen', rect(4500, 10_000, 8500, 15_000));
  p.area('room', 'bathroom', rect(7000, 9000, 8500, 11_500));
  p.integrate(living, kitchen);

  // Outside: side passage, covered garage with grass and wheel strips, front garden.
  p.area('outdoor', 'patio', rect(8500, 5000, 10_000, 17_500), { name: 'Corredor lateral' });
  p.area('covered', 'garage', rect(4000, 17_500, 10_000, 25_000), { fill: GRASS });
  p.area('outdoor', 'garden', rect(0, 17_500, 4000, 25_000));
  p.rest('outdoor', 'lawn', { x0: 0, y0: 0, x1: 10_000, y1: 5000 }, { name: 'Quintal' });

  // Doors and passages.
  p.opening('door', 'h', 9000, 1950, { hinge: 'end', side: -1 });
  p.opening('door', 'h', 9000, 4450, { hinge: 'end', side: -1 });
  p.opening('door', 'h', 9000, 5550, { hinge: 'start', side: -1 });
  p.opening('door-sliding', 'v', 7000, 7700, { width: 700 });
  p.opening('door', 'v', 7000, 9500, { width: 700, hinge: 'start', side: 1 });
  p.opening('passage', 'h', 10_000, 3000);
  p.opening('door', 'v', 8500, 14_450, { hinge: 'end', side: -1 });
  p.opening('door', 'h', 17_500, 4950, { width: 900, hinge: 'start', side: -1 });
  p.opening('door', 'h', 2500, 9150, { hinge: 'end', side: -1 });

  // Windows: bedrooms to the north, wet rooms and kitchen to the side passage, living to the garden.
  p.opening('window-sliding', 'h', 5000, 1250);
  p.opening('window-sliding', 'h', 5000, 3750);
  p.opening('window-sliding', 'h', 5000, 6400, { width: 1500 });
  p.opening('window-maxim', 'v', 8500, 8000, { width: 600 });
  p.opening('window-maxim', 'v', 8500, 10_000, { width: 600 });
  p.opening('window-sliding', 'v', 8500, 12_800);
  p.opening('window-sliding', 'v', 8500, 16_250, { width: 1500 });
  p.opening('window-sliding', 'h', 17_500, 2000, { width: 2000 });
  p.opening('window-sliding', 'h', 2500, 7500, { width: 1000 });

  // Front wall: electric sliding gate parked over the garden, pedestrian gate at the right.
  p.opening('gate-sliding', 'h', 25_000, 6950, { width: 4000, hinge: 'start' });
  p.opening('gate-pedestrian', 'h', 25_000, 9450, { width: 900, hinge: 'end', side: -1 });

  // Quarto 1
  p.onWall('bed-single', 'left', 6100, 1000);
  p.onWall('nightstand', 'left', 6765, 1000);
  p.onWall('wardrobe', 'bottom', 800, 8000, { variant: '120' });
  p.onWall('office-desk', 'right', 7300, 1500);
  p.item('office-chair', 1500, 7300, 270);
  // Quarto 2
  p.onWall('bed-single', 'left', 6100, 3500);
  p.onWall('nightstand', 'left', 6765, 3500);
  p.onWall('wardrobe', 'bottom', 3175, 8000, { variant: '120' });
  p.onWall('dresser', 'right', 7100, 4000);
  // Suíte
  p.onWall('bed-double', 'left', 6250, 6000);
  p.onWall('nightstand', 'left', 5335, 6000);
  p.onWall('nightstand', 'left', 7165, 6000);
  p.onWall('wardrobe', 'right', 6000, 7500);
  p.item('rug', 5950, 7900, 0, { size: { w: 1400, d: 800 } });
  // Banho da suíte
  p.onWall('shower-box', 'top', 8000, 7500, { variant: 's80' });
  p.onWall('toilet', 'right', 8500, 7800);
  p.onWall('sink-cabinet', 'bottom', 7400, 8500, { variant: 'w50' });
  // Banheiro
  p.onWall('sink-cabinet', 'right', 9400, 7800, { variant: 'w50' });
  p.onWall('toilet', 'right', 10_150, 7800);
  p.onWall('shower-box', 'bottom', 8000, 11_000, { variant: 's80' });
  // Cozinha
  p.onWall('fridge', 'top', 4950, 10_500);
  p.onWall('kitchen-sink', 'top', 6050, 10_500, { variant: 'w150' });
  p.onWall('stove', 'right', 12_300, 8000);
  p.onWall('counter', 'right', 13_200, 8000);
  p.item('dining-table', 6400, 16_250, 0, { variant: 'seats6' });
  // Sala
  p.onWall('tv-rack', 'left', 13_200, 1000);
  p.item('rug', 1900, 13_200, 90, { size: { w: 2400, d: 1700 } });
  p.item('sofa', 3200, 13_200, 90);
  p.item('coffee-table', 1950, 13_200, 90);
  p.onWall('armchair', 'left', 11_150, 1000);
  p.onWall('plant', 'bottom', 450, 16_000);
  p.onWall('bookshelf', 'left', 16_000, 1000);
  // Lavanderia
  p.onWall('laundry-tank', 'top', 7100, 1000);
  p.onWall('washing-machine', 'top', 7800, 1000);
  p.onWall('water-heater', 'top', 8500, 1000);
  p.onWall('clothesline', 'right', 1000, 9000, { variant: 'w100' });
  // Churrasqueira
  p.onWall('bbq', 'top', 5800, 1000);
  p.onWall('gourmet-counter', 'top', 4300, 1000, { size: { w: 2000, d: 600 } });
  p.item('outdoor-table', 4700, 1800);
  p.item('pillar', 3100, 2400, 0);
  // Backyard and side passage
  p.item('tree', 1400, 1600, 0, { size: { w: 2400, d: 2400 } });
  p.item('shrub', 9300, 3600, 0, { size: { w: 900, d: 900 } });
  p.item('plant', 9250, 6000);
  p.item('plant', 9250, 16_800);
  // Garage
  p.item('wheel-strips', 5850, 21_400, 0);
  p.item('wheel-strips', 8050, 21_400, 0);
  p.item('car-hatch', 5850, 21_400, 90, { color: '#C8352E' });
  p.item('car-sedan', 8050, 21_300, 90, { color: '#B9BEC5' });
  p.item('pillar', 4100, 24_750, 0);
  // Front garden
  p.item('tree', 2200, 20_800, 0, { size: { w: 2600, d: 2600 } });
  p.onWall('planter', 'left', 23_600, 1000);
  p.item('shrub', 3200, 18_400, 0, { size: { w: 800, d: 800 } });

  p.ruler({ x: 3500, y: 9500 }, 'v');
  p.ruler({ x: 9250, y: 12_000 }, 'h');
  return p.finish();
}

// ---------------------------------------------------------------------------
// Casa geminada 5×25: walls on both side lot lines, outdoor side passage beside the bedrooms.

function geminada(): ProjectDoc {
  const p = new Plan({ ...base, name: 'Casa geminada 5×25', width: 5000, depth: 25_000 });

  p.area('room', 'laundry', rect(0, 0, 2000, 2500), { name: 'Lavanderia' });

  p.area('room', 'bedroom', rect(0, 4000, 3800, 7500), { name: 'Quarto 1' });
  p.area('room', 'hall', [
    [
      { x: 0, y: 7500 },
      { x: 2300, y: 7500 },
      { x: 2300, y: 9500 },
      { x: 1000, y: 9500 },
      { x: 1000, y: 12_500 },
      { x: 0, y: 12_500 },
    ],
  ]);
  p.area('room', 'bathroom', rect(2300, 7500, 3800, 9500));
  p.area('room', 'bedroom', rect(1000, 9500, 3800, 12_500), { name: 'Quarto 2' });
  const kitchen = p.area('room', 'kitchen', rect(0, 12_500, 5000, 15_500));
  const living = p.area('room', 'living', rect(0, 15_500, 5000, 20_000), { name: 'Sala' });
  p.integrate(living, kitchen);

  p.area('outdoor', 'patio', rect(3800, 4000, 5000, 12_500), { name: 'Corredor lateral' });
  p.area('outdoor', 'parking', rect(0, 20_000, 5000, 25_000), { name: 'Garagem', fill: GRASS });
  p.rest('outdoor', 'lawn', { x0: 0, y0: 0, x1: 5000, y1: 4000 }, { name: 'Quintal' });

  p.opening('door', 'h', 7500, 1300, { hinge: 'start', side: -1 });
  p.opening('door-sliding', 'v', 2300, 8500, { width: 700 });
  p.opening('door', 'v', 1000, 10_100, { hinge: 'start', side: 1 });
  p.opening('passage', 'h', 12_500, 500, { width: 800 });
  p.opening('door', 'h', 12_500, 4400, { hinge: 'end', side: -1 });
  p.opening('door', 'h', 20_000, 900, { hinge: 'start', side: -1 });
  p.opening('door', 'v', 2000, 1500, { width: 700, hinge: 'start', side: -1 });

  p.opening('window-sliding', 'h', 4000, 1900, { width: 1500 });
  p.opening('window-sliding', 'v', 3800, 4700, { width: 1000 });
  p.opening('window-maxim', 'v', 3800, 8500, { width: 600 });
  p.opening('window-sliding', 'v', 3800, 10_100, { width: 1000 });
  p.opening('window-sliding', 'h', 20_000, 3000, { width: 1500 });
  p.opening('window-sliding', 'h', 2500, 1000, { width: 1000 });

  p.opening('gate-tilt', 'h', 25_000, 3300, { width: 3000 });
  p.opening('gate-pedestrian', 'h', 25_000, 850, { width: 900, hinge: 'start', side: -1 });

  // Quarto 1
  p.onWall('bed-double', 'left', 5900, 1500);
  p.onWall('nightstand', 'left', 4900, 1500);
  p.onWall('nightstand', 'left', 6890, 1500);
  p.onWall('wardrobe', 'right', 6200, 3000, { variant: '120' });
  // Banheiro
  p.onWall('shower-box', 'top', 3300, 8500, { variant: 's80' });
  p.onWall('toilet', 'bottom', 3400, 8800);
  p.onWall('sink-cabinet', 'bottom', 2700, 8800, { variant: 'w50' });
  // Quarto 2
  p.onWall('bed-single', 'right', 11_000, 2500);
  p.onWall('wardrobe', 'bottom', 2600, 11_000, { variant: '160' });
  p.onWall('office-desk', 'top', 3100, 10_500, { variant: '120x60' });
  // Cozinha
  p.onWall('fridge', 'left', 13_100, 2000);
  p.onWall('kitchen-sink', 'right', 13_600, 4000, { variant: 'w150' });
  p.onWall('stove', 'left', 14_000, 2000);
  p.onWall('counter', 'left', 14_900, 2000, { size: { w: 600, d: 600 } });
  p.item('dining-table', 2500, 16_300, 0);
  // Sala
  p.onWall('sofa', 'left', 18_000, 2000);
  p.onWall('tv-rack', 'right', 18_000, 3000);
  p.item('coffee-table', 2300, 18_000, 90);
  // Lavanderia
  p.onWall('laundry-tank', 'top', 550, 1000);
  p.onWall('washing-machine', 'top', 1250, 1000);
  // Backyard and passage
  p.item('clothesline', 3500, 1300, 0, { variant: 'w150' });
  p.item('tree', 3900, 3000, 0, { size: { w: 1800, d: 1800 } });
  p.item('plant', 4400, 7000);
  // Garage
  p.item('wheel-strips', 3300, 22_475, 0, { size: { w: 1950, d: 4600 } });
  p.item('car-hatch', 3300, 22_450, 90, { color: '#2F5D9E' });
  p.item('bicycle', 600, 22_500, 90);

  p.ruler({ x: 4400, y: 9000 }, 'h');
  return p.finish();
}

// ---------------------------------------------------------------------------
// Casa de esquina 12×30: street at the bottom and at the right, leisure area at the back.

function esquina(): ProjectDoc {
  const p = new Plan({
    ...base,
    cornerSide: 'right',
    name: 'Casa de esquina 12×30',
    width: 12_000,
    depth: 30_000,
  });

  // Leisure at the back: laundry, covered gourmet area, pool with a deck.
  p.area('room', 'laundry', rect(0, 0, 3000, 2500), { name: 'Lavanderia' });
  p.area('covered', 'gourmet', rect(0, 8000, 5500, 12_000));
  p.area('outdoor', 'deck', [...rect(6000, 1000, 11_500, 9000), ...rect(7000, 2000, 10_500, 8000)]);
  p.area('outdoor', 'pool', rect(7000, 2000, 10_500, 8000));

  // House.
  const kitchen = p.area('room', 'kitchen', rect(0, 12_000, 5500, 16_500));
  p.area('room', 'suite', rect(5500, 12_000, 10_000, 16_500));
  p.area('room', 'bathroom', rect(8000, 14_500, 10_000, 16_500), { name: 'Banho da suíte' });
  const living = p.area('room', 'living', rect(0, 16_500, 5800, 25_000), { name: 'Sala' });
  p.area('room', 'powder', rect(4300, 16_500, 5800, 18_000));
  p.area('room', 'hall', rect(5800, 16_500, 7000, 22_500));
  p.area('room', 'bathroom', rect(5800, 22_500, 7000, 25_000));
  p.area('room', 'bedroom', rect(7000, 16_500, 10_000, 20_500), { name: 'Quarto 1' });
  p.area('room', 'bedroom', rect(7000, 20_500, 10_000, 25_000), { name: 'Quarto 2' });
  p.integrate(living, kitchen);

  // Front: open parking, then garden on the front and on the corner side.
  p.area('outdoor', 'parking', rect(0, 25_000, 3500, 30_000));
  p.area('outdoor', 'patio', rect(3500, 25_000, 7500, 30_000), { name: 'Entrada' });
  p.rest('outdoor', 'garden', { x0: 0, y0: 12_000, x1: 12_000, y1: 30_000 });
  p.rest('outdoor', 'lawn', { x0: 0, y0: 0, x1: 12_000, y1: 12_000 }, { name: 'Gramado' });

  // Doors.
  p.opening('door-balcony', 'h', 12_000, 3000, { width: 2500, hinge: 'end' });
  p.opening('door', 'h', 16_500, 6400, { hinge: 'end', side: -1 });
  p.opening('door-sliding', 'h', 14_500, 8450, { width: 700 });
  p.opening('door', 'v', 4300, 17_250, { width: 600, hinge: 'start', side: 1 });
  p.opening('passage', 'v', 5800, 20_000, { width: 900 });
  p.opening('door', 'v', 7000, 17_200, { hinge: 'start', side: 1 });
  p.opening('door', 'v', 7000, 21_200, { hinge: 'start', side: 1 });
  p.opening('door', 'h', 22_500, 6400, { width: 700, hinge: 'end', side: -1 });
  p.opening('door', 'h', 25_000, 4800, { width: 900, hinge: 'end', side: -1 });
  p.opening('door', 'v', 3000, 1500, { width: 700, hinge: 'start', side: -1 });

  // Windows: the suite to the north, the bedrooms to the east, the living room to the south.
  p.opening('window-sliding', 'h', 12_000, 7300, { width: 2000 });
  p.opening('window-sliding', 'h', 12_000, 4600, { width: 1200 });
  p.opening('window-maxim', 'v', 10_000, 15_500, { width: 600 });
  p.opening('window-sliding', 'v', 10_000, 18_500, { width: 1500 });
  p.opening('window-sliding', 'v', 10_000, 22_700, { width: 1500 });
  p.opening('window-sliding', 'h', 25_000, 8500, { width: 1500 });
  p.opening('window-maxim', 'h', 25_000, 6400, { width: 600 });
  p.opening('window-sliding', 'h', 25_000, 2200, { width: 2500 });
  p.opening('window-sliding', 'h', 2500, 1500, { width: 1000 });

  // Gates on the front wall: sliding gate parked toward the entrance, pedestrian gate beside it.
  p.opening('gate-sliding', 'h', 30_000, 1750, { width: 3000, hinge: 'end' });
  p.opening('gate-pedestrian', 'h', 30_000, 7000, { width: 1000, hinge: 'start', side: -1 });

  // Suíte
  p.onWall('bed-double', 'left', 14_000, 6000, { variant: 'queen' });
  p.onWall('nightstand', 'left', 12_675, 6000);
  p.onWall('nightstand', 'left', 15_325, 6000);
  p.onWall('wardrobe', 'right', 13_300, 9000, { variant: '200' });
  p.onWall('dresser', 'bottom', 7400, 15_500);
  // Banho da suíte
  p.onWall('shower-box', 'right', 15_100, 9000, { variant: 's90x120' });
  p.onWall('toilet', 'bottom', 8300, 16_000);
  p.onWall('sink-cabinet', 'bottom', 9300, 16_000, { variant: 'w80' });
  // Cozinha
  p.onWall('fridge', 'left', 12_600, 1000, { variant: 'duplex' });
  p.onWall('kitchen-sink', 'left', 13_900, 1000, { variant: 'w180' });
  p.onWall('stove', 'left', 15_150, 1000);
  p.onWall('counter', 'left', 15_850, 1000, { size: { w: 800, d: 600 } });
  p.item('island', 3200, 14_300, 90, { variant: 'stools' });
  p.onWall('tall-cabinet', 'top', 5000, 13_000);
  // Sala
  p.item('dining-table', 2900, 18_200, 0, { variant: 'seats6' });
  p.onWall('sofa-l', 'left', 22_300, 2000, { mirrored: true });
  p.onWall('tv-rack', 'right', 22_300, 4000);
  p.item('rug', 2700, 22_300, 90, { size: { w: 2400, d: 1700 } });
  p.item('coffee-table', 2900, 22_300, 90);
  p.onWall('plant', 'right', 23_500, 4000);
  // Lavabo
  p.onWall('toilet', 'top', 5300, 17_250);
  p.onWall('sink-pedestal', 'right', 17_600, 5000);
  // Banheiro
  p.onWall('toilet', 'bottom', 6200, 24_000);
  p.onWall('sink-cabinet', 'right', 23_900, 6400, { variant: 'w50' });
  p.onWall('shower-box', 'top', 6400, 23_500, { size: { w: 900, d: 900 } });
  // Quarto 1
  p.onWall('bed-single', 'top', 8500, 18_500);
  p.onWall('nightstand', 'top', 9200, 18_500);
  p.onWall('wardrobe', 'bottom', 8650, 18_500, { variant: '160' });
  p.onWall('office-desk', 'left', 19_000, 7500);
  // Quarto 2
  p.onWall('bed-double', 'bottom', 8600, 23_000);
  p.onWall('nightstand', 'bottom', 7600, 23_000);
  p.onWall('wardrobe', 'top', 8875, 22_000, { variant: '200' });
  // Lavanderia
  p.onWall('laundry-tank', 'top', 500, 1000);
  p.onWall('washing-machine', 'top', 1250, 1000);
  p.onWall('tall-cabinet', 'top', 2200, 1000, { variant: 'w90' });
  // Área gourmet
  p.onWall('bbq', 'left', 9500, 2000);
  p.onWall('gourmet-counter', 'left', 10_700, 2000, { size: { w: 1500, d: 600 } });
  p.item('dining-table', 3200, 10_000, 0, { variant: 'seats6' });
  p.item('pillar', 5400, 8100);
  // Pool deck and garden
  for (const y of [3500, 5500]) p.item('lounge-chair', 6500, y, 90);
  p.item('tree', 2000, 5000, 0, { size: { w: 3200, d: 3200 } });
  p.item('shrub', 11_300, 10_800, 0, { size: { w: 1000, d: 1000 } });
  p.item('tree', 11_000, 14_000, 0, { size: { w: 1600, d: 1600 } });
  p.item('tree', 11_000, 21_000, 0, { size: { w: 1600, d: 1600 } });
  p.item('tree', 9000, 27_300, 0, { size: { w: 2600, d: 2600 } });
  p.item('shrub', 11_200, 29_000, 0);
  // Parking
  p.item('car-sedan', 1750, 27_450, 90, { color: '#2A2D33' });

  p.ruler({ x: 6400, y: 19_000 }, 'h');
  return p.finish();
}

// ---------------------------------------------------------------------------
// Checks and output

/** Pairs of furniture items whose boxes overlap (floor items such as rugs and strips may sit below). */
function overlaps(doc: ProjectDoc): string[] {
  const solid = doc.items.filter((it) => lookup.itemLayer(it.type) === 'furniture');
  const out: string[] = [];
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i]!;
      const b = solid[j]!;
      const ra = rotatedAabb(a.x, a.y, a.w, a.d, a.rotation);
      const rb = rotatedAabb(b.x, b.y, b.w, b.d, b.rotation);
      const w = Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0);
      const h = Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0);
      if (w > 20 && h > 20) out.push(`${a.type}@${a.x},${a.y} × ${b.type}@${b.x},${b.y}`);
    }
  }
  return out;
}

function check(file: string, built: ProjectDoc): string[] {
  const problems: string[] = [];
  const text = readFileSync(file, 'utf8');
  const { doc, repairs } = parseProject(text, { isKnownMaterial: (id) => MATERIALS.has(id) });
  for (const r of repairs) problems.push(`repair: ${r}`);
  if (JSON.stringify(doc.areas) !== JSON.stringify(built.areas)) problems.push('areas changed');
  if (Object.keys(syncGateRamps(doc, null)).length) problems.push('frontage is not stable');
  const scene = deriveScene(doc, lookup);
  for (const issue of scene.issues) {
    problems.push(`issue ${issue.code}: ${issue.message} @${issue.at.x},${issue.at.y}`);
  }
  for (const o of doc.openings) {
    if (o.type !== 'gate-sliding') continue;
    if (parkingHinge(doc, scene.runs, o) !== o.hinge) problems.push('sliding gate cannot park');
  }
  for (const pair of overlaps(doc)) problems.push(`overlap: ${pair}`);
  const t = scene.totals;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  console.log(
    `${doc.name}: ${repairs.length} repairs, ${doc.areas.length} areas, ${doc.openings.length} openings, ` +
      `${doc.items.length} items, ${doc.lot.frontage.ramps.length} ramps, ` +
      `built ${Math.round(t.builtArea / 1e6)} m², net ${Math.round(t.netArea / 1e6)} m², ` +
      `occupancy ${pct(t.occupancy)}, permeable ${pct(t.permeability)}`,
  );
  return problems;
}

const TEMPLATES: [string, () => ProjectDoc][] = [
  ['casa-terrea-10x25', terrea],
  ['casa-geminada-5x25', geminada],
  ['casa-esquina-12x30', esquina],
];

let failed = false;
for (const [slug, build] of TEMPLATES) {
  const doc = build();
  const file = join(OUT_DIR, `${slug}.casinha.json`);
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  const problems = check(file, doc);
  for (const line of problems) console.log(`  ${line}`);
  if (problems.length) failed = true;
}
if (failed) process.exitCode = 1;
