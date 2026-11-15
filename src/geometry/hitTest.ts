import type { Id, Mm, ProjectDoc, Vec, ViewPrefs } from '../model/types.ts';
import { formatArea } from '../model/units.ts';
import { labelTextRect } from './labels.ts';
import { distToSegment, pointInRect, pointInRotatedRect, pointInShape } from './shape.ts';
import type { HitTarget, Scene } from './types.ts';
import { boundarySide } from './walls.ts';

const usable = (layers: ViewPrefs['layers'], id: keyof ViewPrefs['layers']) =>
  layers[id].visible && !layers[id].locked;

/**
 * Geometric hit test, in priority order: openings > items (last first) > rulers > label of the selected area >
 * walls > boundary walls > rooms and covered areas > outdoor areas (last first) > lot. Hidden or locked layers
 * are skipped. `tolMm` is the pointer tolerance in world mm.
 */
export function hitTest(
  doc: ProjectDoc,
  scene: Scene,
  p: Vec,
  tolMm: Mm,
  layers: ViewPrefs['layers'],
  selectedAreaId: Id | null,
): HitTarget {
  if (usable(layers, 'openings')) {
    for (let i = doc.openings.length - 1; i >= 0; i--) {
      const o = doc.openings[i]!;
      const d = scene.openings.get(o.id);
      if (d?.gap) {
        if (pointInRect(p, d.gap, tolMm)) return { kind: 'opening', id: o.id };
      } else if (d?.center) {
        const half = o.width / 2;
        const a =
          o.axis === 'h'
            ? { x: d.center.x - half, y: d.center.y }
            : { x: d.center.x, y: d.center.y - half };
        const b =
          o.axis === 'h'
            ? { x: d.center.x + half, y: d.center.y }
            : { x: d.center.x, y: d.center.y + half };
        if (distToSegment(p, a, b) <= tolMm) return { kind: 'opening', id: o.id };
      }
    }
  }

  if (usable(layers, 'items')) {
    for (let i = doc.items.length - 1; i >= 0; i--) {
      const it = doc.items[i]!;
      if (pointInRotatedRect(p, it.x, it.y, it.w, it.d, it.rotation, tolMm / 2)) {
        return { kind: 'item', id: it.id };
      }
    }
  }

  if (usable(layers, 'measures')) {
    for (let i = doc.rulers.length - 1; i >= 0; i--) {
      const r = doc.rulers[i]!;
      const d = scene.rulers.get(r.id);
      if (!d) continue;
      const da = Math.hypot(p.x - d.a.x, p.y - d.a.y);
      const db = Math.hypot(p.x - d.b.x, p.y - d.b.y);
      if (r.mode === 'free' && (da <= tolMm || db <= tolMm)) {
        return { kind: 'ruler', id: r.id, end: da <= db ? 'a' : 'b' };
      }
      if (distToSegment(p, d.a, d.b) <= tolMm) return { kind: 'ruler', id: r.id, end: null };
    }
  }

  if (selectedAreaId) {
    const a = doc.areas.find((x) => x.id === selectedAreaId);
    const d = scene.areas.get(selectedAreaId);
    if (a && d?.label.rect && d.label.fit > 0) {
      const box = labelTextRect(d.label, a.name, formatArea(d.netArea));
      if (pointInRect(p, box, tolMm / 2)) return { kind: 'label', areaId: a.id };
    }
  }

  for (const r of scene.wallRects) {
    if (pointInRect(p, r, tolMm / 2)) return { kind: 'wall', segmentId: r.segId };
  }

  for (let i = 0; i < scene.boundaryRects.length; i++) {
    const r = scene.boundaryRects[i]!;
    if (!pointInRect(p, r, tolMm / 2)) continue;
    const seg = scene.boundary.find((s) => s.id === r.segId);
    const side = seg ? boundarySide(seg, doc.lot) : null;
    if (side) return { kind: 'boundary', side };
  }

  for (let i = doc.areas.length - 1; i >= 0; i--) {
    const a = doc.areas[i]!;
    if (a.kind !== 'outdoor' && pointInShape(p, a.shape)) return { kind: 'area', id: a.id };
  }
  for (let i = doc.areas.length - 1; i >= 0; i--) {
    const a = doc.areas[i]!;
    if (a.kind === 'outdoor' && pointInShape(p, a.shape)) return { kind: 'area', id: a.id };
  }

  if (p.x >= 0 && p.y >= 0 && p.x <= doc.lot.width && p.y <= doc.lot.depth) return { kind: 'lot' };
  return null;
}
