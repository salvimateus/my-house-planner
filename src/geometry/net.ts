import type { Area, ProjectDoc } from '../model/types.ts';
import { area, difference, maskArea, unionDifferenceMask } from './rectilinear.ts';
import { bboxOf, rectsOverlap } from './shape.ts';
import type { CatalogLookup, Operand, Rect, Region, Totals } from './types.ts';

export interface AreaNet {
  visible: Region;
  net: Region;
  netArea: number;
  grossArea: number;
}

/** Areas drawn above an outdoor area: every room and covered area, plus outdoor areas later in the list. */
export function coverersOf(a: Area, allAreas: Area[]): Area[] {
  const box = bboxOf(a.shape);
  const idx = allAreas.indexOf(a);
  return allAreas.filter(
    (x, i) =>
      x !== a &&
      (x.kind !== 'outdoor' || (idx >= 0 && i > idx)) &&
      rectsOverlap(box, bboxOf(x.shape)),
  );
}

/**
 * Visible and net region of one area. `solids` are house and boundary wall bodies without opening gaps;
 * `structure` are the boxes of structure items (pillars).
 */
export function deriveAreaNet(
  a: Area,
  allAreas: Area[],
  solids: Rect[],
  structure: Rect[],
): AreaNet {
  const own: Region = a.shape.length ? [a.shape] : [];
  const covers = a.kind === 'outdoor' ? coverersOf(a, allAreas) : [];
  const visible = covers.length ? difference(own, ...covers.map((c) => [c.shape] as Region)) : own;
  return netOf(visible, solids, structure);
}

export function netOf(visible: Region, solids: Rect[], structure: Rect[]): AreaNet {
  const box = bboxOf(visible);
  const cutters: Rect[] = [];
  for (const r of solids) if (rectsOverlap(box, r)) cutters.push(r);
  for (const r of structure) if (rectsOverlap(box, r)) cutters.push(r);
  const net = cutters.length && visible.length ? difference(visible, ...cutters) : visible;
  return { visible, net, netArea: area(net), grossArea: area(visible) };
}

export interface Coverage {
  /** Rooms and covered areas plus house wall bodies, mm². */
  builtArea: number;
  /** Lot ground not covered by any area or wall, mm². */
  bareGround: number;
}

export function measureCoverage(
  doc: ProjectDoc,
  houseRects: Rect[],
  boundaryRects: Rect[],
): Coverage {
  const builtOps: Operand[] = [
    ...doc.areas
      .filter((x) => x.kind !== 'outdoor' && x.shape.length)
      .map((x) => [x.shape] as Region),
    ...houseRects,
  ];
  const builtArea = builtOps.length ? maskArea(unionDifferenceMask(builtOps, [])) : 0;
  const lotRect: Rect = { x0: 0, y0: 0, x1: doc.lot.width, y1: doc.lot.depth };
  const covered: Operand[] = [
    ...doc.areas.filter((x) => x.shape.length).map((x) => [x.shape] as Region),
    ...houseRects,
    ...boundaryRects,
  ];
  const bareGround =
    doc.lot.width > 0 && doc.lot.depth > 0 ? maskArea(unionDifferenceMask([lotRect], covered)) : 0;
  return { builtArea, bareGround };
}

/**
 * Plan totals. Built area = rooms and covered areas plus house wall bodies. Permeable area = net of permeable
 * outdoor areas, plus the bare lot ground when its material is permeable.
 */
export function deriveTotals(
  doc: ProjectDoc,
  coverage: Coverage,
  nets: Map<string, AreaNet>,
  lookup: CatalogLookup,
): Totals {
  const lotArea = doc.lot.width * doc.lot.depth;
  const { builtArea } = coverage;
  let netArea = 0;
  let permeableArea = 0;
  for (const x of doc.areas) {
    const n = nets.get(x.id)?.netArea ?? 0;
    if (x.kind !== 'outdoor') netArea += n;
    else if (lookup.materialPermeable(x.fill.material)) permeableArea += n;
  }
  if (lookup.materialPermeable(doc.lot.ground.material)) permeableArea += coverage.bareGround;
  return {
    lotArea,
    builtArea,
    netArea,
    permeableArea,
    occupancy: lotArea ? builtArea / lotArea : 0,
    permeability: lotArea ? permeableArea / lotArea : 0,
  };
}
