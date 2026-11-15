import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import { presetFor } from '../catalog/roomPresets.ts';
import type { Area, Mm, Opening, ProjectDoc, Vec } from '../model/types.ts';
import { formatArea, formatLength } from '../model/units.ts';
import { swingRects } from './openings.ts';
import { bboxOf, pointInRect, pointInShape, rectIntersection, rotatedAabb } from './shape.ts';
import type { CatalogLookup, Issue, Rect, Scene } from './types.ts';

export const NARROW_RULER: Mm = 800;
export const MAX_OCCUPANCY = 0.7;
export const MIN_PERMEABILITY = 0.15;
/** Overlap depth that counts as an item over a wall (a flush item only touches the face). */
const WALL_OVERLAP: Mm = 20;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const meters2 = (m2: number) => `${String(m2).replace('.', ',')} m²`;

function areaAnchor(a: Area, scene: Scene): Vec {
  const d = scene.areas.get(a.id);
  if (d?.label.rect) return { x: d.label.x, y: d.label.y };
  const b = bboxOf(a.shape);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
}

/** Openings on the walls of an area: valid host and a segment at the opening center that touches the area. */
function openingsOf(a: Area, doc: ProjectDoc, scene: Scene): Opening[] {
  const own = scene.walls.filter((s) => s.plus === a.id || s.minus === a.id);
  return doc.openings.filter((o) => {
    if (!scene.openings.get(o.id)?.valid) return false;
    return own.some(
      (s) => s.axis === o.axis && s.line === o.line && o.at >= s.start && o.at <= s.end,
    );
  });
}

/** Quarter disc (center `hinge`, `radius`, inside `quad`) against a rect. */
function swingHits(hinge: Vec, radius: Mm, quad: Rect, r: Rect): boolean {
  const inter = rectIntersection(quad, r);
  if (!inter) return false;
  const nx = Math.max(inter.x0, Math.min(hinge.x, inter.x1));
  const ny = Math.max(inter.y0, Math.min(hinge.y, inter.y1));
  return Math.hypot(nx - hinge.x, ny - hinge.y) < radius - 1;
}

/** Friendly plan checks (pt-BR, soft wording). */
export function deriveIssues(doc: ProjectDoc, scene: Scene, lookup: CatalogLookup): Issue[] {
  const issues: Issue[] = [];
  const pairs = new Set(doc.openBoundaries.flat());

  for (const a of doc.areas) {
    if (a.kind !== 'room') continue;
    const own = openingsOf(a, doc, scene);
    const at = areaAnchor(a, scene);
    const target = { kind: 'area', id: a.id } as const;
    const preset = presetFor(a.preset);
    if (!pairs.has(a.id) && !own.some((o) => OPENING_SPECS[o.type].group === 'door')) {
      issues.push({
        code: 'room-without-door',
        severity: 'warning',
        message: `${a.name} ainda não tem porta.`,
        target,
        at,
      });
    }
    if (preset.needsWindow && !own.some((o) => OPENING_SPECS[o.type].group === 'window')) {
      issues.push({
        code: 'bathroom-without-window',
        severity: 'info',
        message: `${a.name} sem janela: banheiros costumam precisar de ventilação.`,
        target,
        at,
      });
    }
    const net = scene.areas.get(a.id)?.netArea ?? 0;
    if ((a.preset === 'bedroom' || a.preset === 'suite') && preset.minArea) {
      if (net > 0 && net < preset.minArea * 1_000_000) {
        issues.push({
          code: 'small-bedroom',
          severity: 'info',
          message: `${a.name} tem ${formatArea(net)}: quartos costumam ter ${meters2(preset.minArea)} ou mais.`,
          target,
          at,
        });
      }
    }
  }

  const blockers = doc.items
    .filter((it) => lookup.itemLayer(it.type) !== 'floor')
    .map((it) => ({ it, box: rotatedAabb(it.x, it.y, it.w, it.d, it.rotation) }));
  const swings = doc.openings.map((o) => ({
    o,
    leaves: swingRects(o, scene.openings.get(o.id)?.run ?? null),
  }));
  swings.forEach(({ o, leaves }, i) => {
    if (!leaves.length) return;
    let hit: 'item' | 'door' | null = null;
    for (const leaf of leaves) {
      if (blockers.some((b) => swingHits(leaf.hinge, leaf.radius, leaf.rect, b.box))) hit = 'item';
      if (hit) break;
      for (let j = 0; j < swings.length && !hit; j++) {
        if (j === i) continue;
        for (const other of swings[j]!.leaves) {
          const inter = rectIntersection(leaf.rect, other.rect);
          if (
            inter &&
            swingHits(leaf.hinge, leaf.radius, leaf.rect, inter) &&
            swingHits(other.hinge, other.radius, other.rect, inter)
          ) {
            hit = 'door';
            break;
          }
        }
      }
      if (hit) break;
    }
    if (hit) {
      issues.push({
        code: 'door-swing-blocked',
        severity: 'warning',
        message:
          hit === 'item'
            ? 'A folha da porta esbarra em um móvel ao abrir.'
            : 'Duas portas esbarram uma na outra ao abrir.',
        target: { kind: 'opening', id: o.id },
        at: scene.openings.get(o.id)?.center ?? { x: o.at, y: o.line },
      });
    }
  });

  for (const o of doc.openings) {
    const d = scene.openings.get(o.id);
    if (d?.valid) continue;
    const group = OPENING_SPECS[o.type].group;
    issues.push({
      code: 'orphan-opening',
      severity: 'warning',
      message:
        group === 'gate'
          ? 'Este portão está fora do muro.'
          : group === 'window'
            ? 'Esta janela está fora de uma parede externa.'
            : 'Esta porta está fora de uma parede.',
      target: { kind: 'opening', id: o.id },
      at: d?.center ?? (o.axis === 'h' ? { x: o.at, y: o.line } : { x: o.line, y: o.at }),
    });
  }

  const lot: Rect = { x0: 0, y0: 0, x1: doc.lot.width, y1: doc.lot.depth };
  const solids = [...scene.wallRects, ...scene.boundaryRects];
  for (const it of doc.items) {
    const layer = lookup.itemLayer(it.type);
    const center = { x: it.x, y: it.y };
    const target = { kind: 'item', id: it.id } as const;
    const name = it.label ?? 'Um item';
    if (!pointInRect(center, lot)) {
      issues.push({
        code: 'item-outside',
        severity: 'warning',
        message: `${name} está fora do terreno.`,
        target,
        at: center,
      });
      continue;
    }
    if (layer === 'furniture' && !doc.areas.some((a) => pointInShape(center, a.shape))) {
      issues.push({
        code: 'item-outside',
        severity: 'info',
        message: `${name} está fora de qualquer ambiente.`,
        target,
        at: center,
      });
      continue;
    }
    if (layer === 'structure') continue;
    const box = rotatedAabb(it.x, it.y, it.w, it.d, it.rotation);
    const over = solids.some((r) => {
      const inter = rectIntersection(box, r);
      return (
        inter !== null && inter.x1 - inter.x0 > WALL_OVERLAP && inter.y1 - inter.y0 > WALL_OVERLAP
      );
    });
    if (over) {
      issues.push({
        code: 'item-outside',
        severity: 'warning',
        message: `${name} está sobre uma parede.`,
        target,
        at: center,
      });
    }
  }

  for (const r of doc.rulers) {
    if (r.mode !== 'fit') continue;
    const d = scene.rulers.get(r.id);
    if (!d?.valid || d.length <= 0 || d.length >= NARROW_RULER) continue;
    issues.push({
      code: 'narrow-ruler',
      severity: 'info',
      message: `Passagem de ${formatLength(d.length)}: abaixo de 0,80 m costuma ficar apertada.`,
      target: { kind: 'ruler', id: r.id, end: null },
      at: { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 },
    });
  }

  const center = { x: doc.lot.width / 2, y: doc.lot.depth / 2 };
  const t = scene.totals;
  if (t.lotArea > 0 && t.occupancy > MAX_OCCUPANCY) {
    issues.push({
      code: 'high-occupancy',
      severity: 'warning',
      message: `A construção ocupa ${pct(t.occupancy)} do terreno: acima de 70% costuma passar do limite da prefeitura.`,
      target: { kind: 'lot' },
      at: center,
    });
  }
  const hasHouse = doc.areas.some((a) => a.kind !== 'outdoor');
  if (hasHouse && t.lotArea > 0 && t.permeability < MIN_PERMEABILITY) {
    issues.push({
      code: 'low-permeability',
      severity: 'warning',
      message: `A área permeável é ${pct(t.permeability)} do terreno: o mínimo costuma ser 15%.`,
      target: { kind: 'lot' },
      at: center,
    });
  }
  return issues;
}
