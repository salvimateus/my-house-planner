import type { Area, Id, Item, ProjectDoc, Shape } from '../model/types.ts';
import { formatArea } from '../model/units.ts';
import { deriveIssues } from './checks.ts';
import { edgeDimensions } from './dimensions.ts';
import { placeLabel } from './labels.ts';
import {
  type AreaNet,
  type Coverage,
  coverersOf,
  deriveTotals,
  measureCoverage,
  netOf,
} from './net.ts';
import { deriveOpening } from './openings.ts';
import { resolveRuler } from './raycast.ts';
import { difference, toRings, unionDifferenceMask } from './rectilinear.ts';
import { bboxOf, rectsOverlap, rotatedAabb } from './shape.ts';
import type {
  AreaDerived,
  CatalogLookup,
  Face,
  LabelBox,
  OpeningDerived,
  Rect,
  Region,
  RulerDerived,
  Scene,
  WallRect,
  WallRun,
  WallSegment,
} from './types.ts';
import {
  deriveBoundarySegments,
  deriveWallSegments,
  segmentsByLine,
  wallFaces,
  wallRects,
  wallRuns,
} from './walls.ts';

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

// Stage memo. Docs are immutable (immer), so each stage is keyed by the references it reads.

interface WallStage {
  lot: ProjectDoc['lot'];
  structure: ProjectDoc['structure'];
  open: ProjectDoc['openBoundaries'];
  walls: WallSegment[];
  boundary: WallSegment[];
  runs: WallRun[];
  wallRects: WallRect[];
  boundaryRects: WallRect[];
  solids: Rect[];
  faces: Face[];
  segsByLine: Map<string, WallSegment[]>;
  coverage: Coverage;
}

const wallStageCache = new WeakMap<Area[], WallStage>();

function wallStage(doc: ProjectDoc): WallStage {
  const hit = wallStageCache.get(doc.areas);
  if (
    hit &&
    hit.lot === doc.lot &&
    hit.structure === doc.structure &&
    hit.open === doc.openBoundaries
  ) {
    return hit;
  }
  const walls = deriveWallSegments(doc.areas, doc.lot, doc.structure, doc.openBoundaries);
  const boundary = deriveBoundarySegments(doc.lot, doc.structure, walls);
  const houseRects = wallRects(walls);
  const boundaryRects = wallRects(boundary);
  const solids: Rect[] = [...houseRects, ...boundaryRects];
  const stage: WallStage = {
    lot: doc.lot,
    structure: doc.structure,
    open: doc.openBoundaries,
    walls,
    boundary,
    runs: [...wallRuns(walls), ...wallRuns(boundary)],
    wallRects: houseRects,
    boundaryRects,
    solids,
    faces: wallFaces(solids),
    segsByLine: segmentsByLine([...walls, ...boundary]),
    coverage: measureCoverage(doc, houseRects, boundaryRects),
  };
  wallStageCache.set(doc.areas, stage);
  return stage;
}

interface GeomStage {
  openingsRef: ProjectDoc['openings'];
  openings: Map<Id, OpeningDerived>;
  wallsGeom: Region;
  boundaryGeom: Region;
}

const geomCache = new WeakMap<WallStage, GeomStage>();

function geomStage(s1: WallStage, doc: ProjectDoc): GeomStage {
  const hit = geomCache.get(s1);
  if (hit && hit.openingsRef === doc.openings) return hit;
  const openings = new Map<Id, OpeningDerived>();
  const houseGaps: Rect[] = [];
  const boundaryGaps: Rect[] = [];
  for (const o of doc.openings) {
    const d = deriveOpening(o, s1.runs);
    openings.set(o.id, d);
    if (d.gap && d.run) (d.run.kind === 'boundary' ? boundaryGaps : houseGaps).push(d.gap);
  }
  const stage: GeomStage = {
    openingsRef: doc.openings,
    openings,
    wallsGeom: s1.wallRects.length ? toRings(unionDifferenceMask(s1.wallRects, houseGaps)) : [],
    boundaryGeom: s1.boundaryRects.length
      ? toRings(unionDifferenceMask(s1.boundaryRects, boundaryGaps))
      : [],
  };
  geomCache.set(s1, stage);
  return stage;
}

interface ItemBoxes {
  lookup: CatalogLookup;
  structure: Rect[];
  furniture: Rect[];
}

const itemBoxCache = new WeakMap<Item[], ItemBoxes>();

function itemBoxes(items: Item[], lookup: CatalogLookup): ItemBoxes {
  const hit = itemBoxCache.get(items);
  if (hit && hit.lookup === lookup) return hit;
  const out: ItemBoxes = { lookup, structure: [], furniture: [] };
  for (const it of items) {
    const layer = lookup.itemLayer(it.type);
    if (layer === 'floor') continue;
    (layer === 'structure' ? out.structure : out.furniture).push(
      rotatedAabb(it.x, it.y, it.w, it.d, it.rotation),
    );
  }
  itemBoxCache.set(items, out);
  return out;
}

const rectKey = (list: Rect[]) => list.map((r) => `${r.x0},${r.y0},${r.x1},${r.y1}`).join(';');
const sameRefs = (a: Shape[], b: Shape[]) => a.length === b.length && a.every((x, i) => x === b[i]);

interface NetEntry {
  cutKey: string;
  covers: Shape[];
  value: AreaNet;
}

const netCache = new WeakMap<Area, NetEntry>();

function areaNet(a: Area, all: Area[], s1: WallStage, boxes: ItemBoxes): AreaNet {
  const box = bboxOf(a.shape);
  const cutters = [...s1.solids, ...boxes.structure].filter((r) => rectsOverlap(box, r));
  const cutKey = rectKey(cutters);
  const covers = a.kind === 'outdoor' ? coverersOf(a, all).map((c) => c.shape) : [];
  const hit = netCache.get(a);
  if (hit && hit.cutKey === cutKey && sameRefs(hit.covers, covers)) return hit.value;
  const own: Region = a.shape.length ? [a.shape] : [];
  const visible = covers.length ? difference(own, ...covers.map((s) => [s] as Region)) : own;
  const value = netOf(visible, cutters, []);
  netCache.set(a, { cutKey, covers, value });
  return value;
}

interface LabelEntry {
  net: Region;
  furnKey: string;
  text: string;
  value: LabelBox;
}

const labelCache = new WeakMap<Area, LabelEntry>();

function areaLabel(a: Area, net: AreaNet, boxes: ItemBoxes): LabelBox {
  const box = bboxOf(net.net);
  const furniture = boxes.furniture.filter((r) => rectsOverlap(box, r));
  const furnKey = rectKey(furniture);
  const areaText = formatArea(net.netArea);
  const text = `${a.name}\n${areaText}`;
  const hit = labelCache.get(a);
  if (hit && hit.net === net.net && hit.furnKey === furnKey && hit.text === text) return hit.value;
  const value = placeLabel(net.net, furniture, a.name, areaText, a.labelOffset);
  labelCache.set(a, { net: net.net, furnKey, text, value });
  return value;
}

export function deriveScene(doc: ProjectDoc, lookup: CatalogLookup): Scene {
  const s1 = wallStage(doc);
  const s2 = geomStage(s1, doc);
  const boxes = itemBoxes(doc.items, lookup);

  const nets = new Map<Id, AreaNet>();
  const areas = new Map<Id, AreaDerived>();
  for (const a of doc.areas) {
    const net = areaNet(a, doc.areas, s1, boxes);
    nets.set(a.id, net);
    areas.set(a.id, {
      ...net,
      edges: edgeDimensions(a, s1.segsByLine),
      label: areaLabel(a, net, boxes),
    });
  }

  const bounds: Rect = { x0: 0, y0: 0, x1: doc.lot.width, y1: doc.lot.depth };
  const rulers = new Map<Id, RulerDerived>();
  for (const r of doc.rulers) rulers.set(r.id, resolveRuler(r, s1.solids, bounds));

  const scene: Scene = {
    walls: s1.walls,
    boundary: s1.boundary,
    runs: s1.runs,
    wallRects: s1.wallRects,
    boundaryRects: s1.boundaryRects,
    wallsGeom: s2.wallsGeom,
    boundaryGeom: s2.boundaryGeom,
    faces: s1.faces,
    areas,
    openings: s2.openings,
    rulers,
    totals: deriveTotals(doc, s1.coverage, nets, lookup),
    issues: [],
  };
  scene.issues = deriveIssues(doc, scene, lookup);
  return scene;
}
