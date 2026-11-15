import { castDraft } from 'immer';
import { createStore } from 'zustand';
import { GENERIC_PRESET_ID, presetFor } from '../../catalog/roomPresets.ts';
import {
  areasTouch,
  type EdgeRef,
  freeSpotFor,
  insertArea,
  mergeAreas,
  moveEdge,
  nextRoomName,
  translateArea,
} from '../../geometry/areaOps.ts';
import { bboxOf, edges } from '../../geometry/shape.ts';
import { alignmentLines, snapCoord } from '../../geometry/snap.ts';
import type { Guide, Handle, OpResult, Rect, SnapContext } from '../../geometry/types.ts';
import { feedback } from '../../juice/feedback.ts';
import { tuning } from '../../juice/tuning.ts';
import { animateEl } from '../../juice/tween.ts';
import { MIN_ROOM_SIDE } from '../../model/defaults.ts';
import { newId } from '../../model/ids.ts';
import type {
  Area,
  AreaKind,
  Fill,
  Id,
  Mm,
  ProjectDoc,
  RoomPresetId,
  Vec,
} from '../../model/types.ts';
import { formatArea, formatLength, formatLengthShort } from '../../model/units.ts';
import { camera } from '../../store/cameraStore.ts';
import { docStore } from '../../store/docStore.ts';
import { EMPTY_TRANSIENT, uiStore } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import { tolPxFor } from '../toolContext.ts';
import {
  afterPaint,
  areaEl,
  closeRoomPicker,
  dropArea,
  numberedName,
  overlapRects,
  rippleArea,
} from '../tools/build.ts';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';
import { openWallIdAt } from './wall.ts';

/* ------------------------------------------------------------------------------------------------
 * Edits shared by the inspector, the type picker and the handler
 * ---------------------------------------------------------------------------------------------- */

const MAX_NAME = 40;

function editable(): ProjectDoc | null {
  const { doc, readOnly } = docStore.getState();
  return doc && !readOnly ? doc : null;
}

function apply(label: string, res: OpResult): boolean {
  if (!res.valid) {
    if (res.messages.length) toast(res.messages.join(' '), { tone: 'error' });
    return false;
  }
  const before = docStore.getState().doc;
  docStore.getState().commit(label, (d) => {
    Object.assign(d, castDraft(res.patch));
  });
  const changed = docStore.getState().doc !== before;
  if (changed && res.messages.length) toast(res.messages.join(' '), { undo: true });
  return changed;
}

/**
 * Replaces an area with a new version, possibly of another kind. An outdoor area that becomes built
 * goes in again through `insertArea`, so it carves the rooms below it. Open walls need two rooms.
 */
export function replaceArea(doc: ProjectDoc, next: Area): OpResult {
  const prev = doc.areas.find((a) => a.id === next.id);
  if (!prev) return { patch: {}, messages: ['Ambiente não encontrado.'], valid: false };
  if (prev.kind === 'outdoor' && next.kind !== 'outdoor') {
    return insertArea({ ...doc, areas: doc.areas.filter((a) => a.id !== next.id) }, next);
  }
  const areas = doc.areas.map((a) => (a.id === next.id ? next : a));
  const openBoundaries =
    next.kind === 'room'
      ? doc.openBoundaries
      : doc.openBoundaries.filter(([a, b]) => a !== next.id && b !== next.id);
  return { patch: { areas, openBoundaries }, messages: [], valid: true };
}

/** Sets preset, kind, fill and a free name ("Quarto 2" when "Quarto" exists). */
export function applyPreset(areaId: Id, presetId: RoomPresetId): boolean {
  const doc = editable();
  const area = doc?.areas.find((a) => a.id === areaId);
  if (!doc || !area) return false;
  const p = presetFor(presetId);
  const others = doc.areas.filter((a) => a.id !== areaId);
  const name =
    presetId === GENERIC_PRESET_ID
      ? area.preset === GENERIC_PRESET_ID && area.kind === 'room'
        ? area.name
        : nextRoomName(others)
      : area.preset === presetId
        ? area.name
        : numberedName(p.label, doc.areas, areaId);
  const ok = apply(
    'Tipo do cômodo',
    replaceArea(doc, { ...area, preset: presetId, kind: p.kind, name, fill: { ...p.fill } }),
  );
  if (ok) afterPaint(() => rippleArea(areaId));
  return ok;
}

export function renameArea(areaId: Id, name: string): void {
  const doc = editable();
  const area = doc?.areas.find((a) => a.id === areaId);
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  if (!area || !clean || clean === area.name) return;
  docStore.getState().commit('Renomear', (d) => {
    const a = d.areas.find((x) => x.id === areaId);
    if (a) a.name = clean;
  });
}

export function setAreaFill(areaId: Id, fill: Fill): void {
  const old = editable()?.areas.find((a) => a.id === areaId)?.fill;
  if (!old) return;
  docStore.getState().commit('Piso do cômodo', (d) => {
    const a = d.areas.find((x) => x.id === areaId);
    if (a) a.fill = fill;
  });
  if (old.material !== fill.material || old.color !== fill.color) {
    afterPaint(() => rippleArea(areaId));
  }
}

export function setAreaKind(areaId: Id, kind: AreaKind): void {
  const doc = editable();
  const area = doc?.areas.find((a) => a.id === areaId);
  if (!doc || !area || area.kind === kind) return;
  apply('Tipo de área', replaceArea(doc, { ...area, kind }));
}

/** The single ring of a rectangle area, or null. */
export function rectOf(area: Area): Rect | null {
  if (area.shape.length !== 1 || area.shape[0]!.length !== 4) return null;
  return bboxOf(area.shape);
}

function edgeOn(area: Area, axis: 'h' | 'v', line: Mm): EdgeRef | null {
  for (let ring = 0; ring < area.shape.length; ring++) {
    const list = edges(area.shape[ring]!);
    for (let index = 0; index < list.length; index++) {
      const [p, q] = list[index]!;
      if (axis === 'v' && p.x === q.x && p.x === line) return { ring, index };
      if (axis === 'h' && p.y === q.y && p.y === line) return { ring, index };
    }
  }
  return null;
}

/** Width and depth of a rectangle, anchored at the top-left corner. Neighbors follow the walls. */
export function resizeRect(areaId: Id, width: Mm, depth: Mm): void {
  const doc = editable();
  const area = doc?.areas.find((a) => a.id === areaId);
  const r = area ? rectOf(area) : null;
  if (!doc || !area || !r) return;
  let cur: ProjectDoc = doc;
  const messages: string[] = [];
  const steps: ['h' | 'v', Mm, Mm][] = [
    ['v', r.x1, Math.round(width) - (r.x1 - r.x0)],
    ['h', r.y1, Math.round(depth) - (r.y1 - r.y0)],
  ];
  for (const [axis, line, delta] of steps) {
    if (delta === 0) continue;
    const a = cur.areas.find((x) => x.id === areaId);
    const edge = a ? edgeOn(a, axis, line) : null;
    if (!edge) return;
    const res = moveEdge(cur, areaId, edge, delta);
    if (!res.valid) {
      toast(res.messages.join(' ') || 'Não deu para mudar a medida.', { tone: 'error' });
      return;
    }
    messages.push(...res.messages);
    cur = { ...cur, ...res.patch };
  }
  if (cur === doc) return;
  apply('Medidas do cômodo', {
    patch: { areas: cur.areas, openings: cur.openings, openBoundaries: cur.openBoundaries },
    messages,
    valid: true,
  });
}

export function neighborsOf(doc: ProjectDoc, areaId: Id): Area[] {
  const area = doc.areas.find((a) => a.id === areaId);
  if (!area) return [];
  return doc.areas.filter((a) => a.id !== areaId && areasTouch(area.shape, a.shape));
}

export function areaCenter(area: Area): Vec {
  const b = bboxOf(area.shape);
  return { x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2) };
}

/* ------------------------------------------------------------------------------------------------
 * "Juntar com…" pick mode: neighbors pulse; a tap on one merges it into the kept area.
 * ---------------------------------------------------------------------------------------------- */

export const mergePickStore = createStore<{ keepId: Id | null }>()(() => ({ keepId: null }));

let pulses: Animation[] = [];

function stopPulses(): void {
  for (const a of pulses) a.cancel();
  pulses = [];
}

export function startMergePick(keepId: Id): boolean {
  const doc = editable();
  if (!doc) return false;
  const list = neighborsOf(doc, keepId);
  if (!list.length) {
    toast('Nenhum ambiente encosta neste. Para juntar, eles precisam dividir uma parede.');
    return false;
  }
  stopPulses();
  mergePickStore.setState({ keepId });
  for (const n of list) {
    const el = areaEl(n.id);
    const a = el
      ? animateEl(el, [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }], {
          duration: 900,
          iterations: Number.POSITIVE_INFINITY,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        })
      : null;
    if (a) pulses.push(a);
  }
  return true;
}

export function stopMergePick(): void {
  stopPulses();
  if (mergePickStore.getState().keepId !== null) mergePickStore.setState({ keepId: null });
}

function mergeInto(keepId: Id, otherId: Id, ctx: ToolContext): void {
  const doc = editable();
  const other = doc?.areas.find((a) => a.id === otherId);
  const keep = doc?.areas.find((a) => a.id === keepId);
  stopMergePick();
  if (!doc || !other || !keep) return;
  const res = mergeAreas(doc, keepId, otherId);
  if (!res.valid) {
    ctx.feedback.invalid();
    toast(res.messages.join(' '), { tone: 'error' });
    return;
  }
  if (apply('Juntar ambientes', res)) {
    ctx.feedback.success();
    toast(`“${other.name}” agora faz parte de “${keep.name}”.`, { undo: true });
    ctx.ui.select({ kind: 'area', id: keepId });
    afterPaint(() => rippleArea(keepId));
  }
}

/* ------------------------------------------------------------------------------------------------
 * Copy and paste of areas: shape, kind, preset, fill and name only
 * ---------------------------------------------------------------------------------------------- */

let areaClipboard: Area | null = null;

export function copyArea(areaId: Id): boolean {
  const area = docStore.getState().doc?.areas.find((a) => a.id === areaId);
  if (!area) return false;
  areaClipboard = { ...area, labelOffset: null };
  toast('Cômodo copiado.');
  return true;
}

export const hasAreaClipboard = (): boolean => areaClipboard !== null;

/** Places a copy next to the source without carving anything, names it and selects it. */
function placeCopy(source: Area, label: string): boolean {
  const doc = editable();
  if (!doc) return false;
  const { vw, vh } = camera.get();
  const shape = freeSpotFor(doc, source.shape, camera.screenToWorld({ x: vw / 2, y: vh / 2 }));
  if (!shape) {
    feedback.invalid();
    toast('Não achei espaço livre para colar o cômodo.');
    return true;
  }
  const copy: Area = {
    id: newId(),
    kind: source.kind,
    preset: source.preset,
    name: numberedName(source.name.replace(/ \d+$/, ''), doc.areas),
    shape,
    fill: { ...source.fill },
    labelOffset: null,
  };
  docStore.getState().commit(label, (d) => {
    d.areas.push(castDraft(copy));
  });
  if (docStore.getState().doc === doc) return true;
  uiStore.getState().select({ kind: 'area', id: copy.id });
  feedback.place();
  afterPaint(() => dropArea(copy.id));
  return true;
}

export function pasteArea(): boolean {
  return areaClipboard ? placeCopy(areaClipboard, 'Colar cômodo') : false;
}

export function duplicateArea(areaId: Id): boolean {
  const area = docStore.getState().doc?.areas.find((a) => a.id === areaId);
  return area ? placeCopy(area, 'Duplicar cômodo') : false;
}

/* ------------------------------------------------------------------------------------------------
 * Transform handles: corners and edge midpoints of a rectangle, one midpoint per outer edge else
 * ---------------------------------------------------------------------------------------------- */

type Side = 'n' | 'e' | 's' | 'w';
const RECT_HANDLES: Record<string, Side[]> = {
  nw: ['w', 'n'],
  n: ['n'],
  ne: ['e', 'n'],
  e: ['e'],
  se: ['e', 's'],
  s: ['s'],
  sw: ['w', 's'],
  w: ['w'],
};
const CURSOR: Record<string, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};
const EDGE_PREFIX = 'edge:';

interface ResizeEdge {
  axis: 'h' | 'v';
  line: Mm;
  /** Fixed point along the edge for a free shape; null for a rectangle (its current center). */
  mid: Mm | null;
  min: Mm;
  max: Mm;
}

interface Resize {
  id: Id;
  edges: ResizeEdge[];
  snap: SnapContext;
  key: string;
  valid: boolean;
  changed: boolean;
  message: string | null;
}

let resize: Resize | null = null;

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function selectedArea(ctx: ToolContext): Area | null {
  const sel = ctx.getUi().selection;
  if (sel?.kind !== 'area') return null;
  return ctx.getDoc()?.areas.find((a) => a.id === sel.id) ?? null;
}

function edgeAt(area: Area, axis: 'h' | 'v', line: Mm, mid: Mm | null): EdgeRef | null {
  const b = bboxOf(area.shape);
  const along = mid ?? (axis === 'h' ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2);
  for (let ring = 0; ring < area.shape.length; ring++) {
    const list = edges(area.shape[ring]!);
    for (let index = 0; index < list.length; index++) {
      const [p, q] = list[index]!;
      if (axis === 'h' && p.y === q.y && p.y === line) {
        if (along > Math.min(p.x, q.x) && along < Math.max(p.x, q.x)) return { ring, index };
      } else if (axis === 'v' && p.x === q.x && p.x === line) {
        if (along > Math.min(p.y, q.y) && along < Math.max(p.y, q.y)) return { ring, index };
      }
    }
  }
  return null;
}

function rectEdge(side: Side, r: Rect, lot: ProjectDoc['lot']): ResizeEdge {
  switch (side) {
    case 'n':
      return { axis: 'h', line: r.y0, mid: null, min: 0, max: r.y1 - MIN_ROOM_SIDE };
    case 's':
      return { axis: 'h', line: r.y1, mid: null, min: r.y0 + MIN_ROOM_SIDE, max: lot.depth };
    case 'w':
      return { axis: 'v', line: r.x0, mid: null, min: 0, max: r.x1 - MIN_ROOM_SIDE };
    case 'e':
      return { axis: 'v', line: r.x1, mid: null, min: r.x0 + MIN_ROOM_SIDE, max: lot.width };
  }
}

function resizeEdges(area: Area, handleId: string, lot: ProjectDoc['lot']): ResizeEdge[] {
  const r = rectOf(area);
  if (r) return (RECT_HANDLES[handleId] ?? []).map((side) => rectEdge(side, r, lot));
  if (!handleId.startsWith(EDGE_PREFIX)) return [];
  const pair = edges(area.shape[0] ?? [])[Number(handleId.slice(EDGE_PREFIX.length))];
  if (!pair) return [];
  const [p, q] = pair;
  return p.y === q.y
    ? [{ axis: 'h', line: p.y, mid: (p.x + q.x) / 2, min: 0, max: lot.depth }]
    : [{ axis: 'v', line: p.x, mid: (p.y + q.y) / 2, min: 0, max: lot.width }];
}

function areaHandles(ctx: ToolContext): Handle[] {
  const area = selectedArea(ctx);
  if (!area || ctx.doc.readOnly || drag) return [];
  const size = coarse() ? tuning.touch.handlePx : tuning.touch.mouseHandlePx;
  const at = (x: Mm, y: Mm) => ctx.camera.worldToScreen({ x, y });
  const r = rectOf(area);
  const out: Handle[] = [];
  if (r) {
    const zoom = ctx.camera.get().zoom;
    const sw = (r.x1 - r.x0) * zoom;
    const sh = (r.y1 - r.y0) * zoom;
    const mx = (r.x0 + r.x1) / 2;
    const my = (r.y0 + r.y1) / 2;
    const pos: Record<string, Vec> = {
      nw: { x: r.x0, y: r.y0 },
      n: { x: mx, y: r.y0 },
      ne: { x: r.x1, y: r.y0 },
      e: { x: r.x1, y: my },
      se: { x: r.x1, y: r.y1 },
      s: { x: mx, y: r.y1 },
      sw: { x: r.x0, y: r.y1 },
      w: { x: r.x0, y: my },
    };
    // Edge handles would crowd the corners on a small room; the corners stay.
    const showNS = sw >= size * 3.5;
    const showEW = sh >= size * 3.5;
    for (const id of Object.keys(RECT_HANDLES)) {
      if ((id === 'n' || id === 's') && !showNS) continue;
      if ((id === 'e' || id === 'w') && !showEW) continue;
      const s = at(pos[id]!.x, pos[id]!.y);
      out.push({
        id,
        x: s.x,
        y: s.y,
        shape: id.length === 2 ? 'square' : 'circle',
        cursor: CURSOR[id],
      });
    }
    return out;
  }
  edges(area.shape[0] ?? []).forEach(([p, q], index) => {
    const a = at(p.x, p.y);
    const b = at(q.x, q.y);
    if (Math.hypot(b.x - a.x, b.y - a.y) < size * 2) return;
    out.push({
      id: `${EDGE_PREFIX}${index}`,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      shape: 'circle',
      cursor: p.y === q.y ? 'ns-resize' : 'ew-resize',
    });
  });
  return out;
}

function sizeReadout(area: Area, ctx: ToolContext): string {
  const b = bboxOf(area.shape);
  const size = `${formatLengthShort(b.x1 - b.x0)} × ${formatLengthShort(b.y1 - b.y0)} m`;
  const net = ctx.getScene().areas.get(area.id)?.netArea;
  if (net === undefined) return size;
  return `${size} · ${formatArea(net)}${area.kind === 'outdoor' ? '' : ' úteis'}`;
}

function resizeMove(r: Resize, p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const base = docStore.getState().gesture?.base;
  if (!base) return;
  const targets = r.edges.map((e) => {
    const raw = e.axis === 'h' ? p.world.y - start.world.y : p.world.x - start.world.x;
    const s = snapCoord(e.line + raw, e.axis === 'h' ? 'y' : 'x', r.snap);
    return { e, v: Math.min(e.max, Math.max(e.min, s.v)), guide: s.guide };
  });
  const guides = targets.map((t) => t.guide).filter((g): g is Guide => g !== null);
  const readout = { x: p.screen.x, y: p.screen.y };
  const key = targets.map((t) => t.v).join(',');
  if (key !== r.key) {
    r.key = key;
    let cur: ProjectDoc = base;
    let message: string | null = null;
    for (const { e, v } of targets) {
      const delta = v - e.line;
      if (delta === 0) continue;
      const area = cur.areas.find((a) => a.id === r.id);
      const ref = area ? edgeAt(area, e.axis, e.line, e.mid) : null;
      const res = ref ? moveEdge(cur, r.id, ref, delta) : null;
      if (!res?.valid) {
        message = res?.messages[0] ?? 'Não dá para mudar o tamanho assim.';
        break;
      }
      cur = { ...cur, ...res.patch };
    }
    r.valid = message === null;
    r.message = message;
    if (r.valid) {
      r.changed = cur !== base;
      const next = cur;
      ctx.doc.updateGesture((draft) => {
        Object.assign(
          draft,
          castDraft({
            areas: next.areas,
            openings: next.openings,
            openBoundaries: next.openBoundaries,
          }),
        );
      });
      ctx.feedback.tick();
    }
  }
  const area = ctx.getDoc()?.areas.find((a) => a.id === r.id);
  if (!area) return;
  if (r.valid) {
    ctx.ui.setTransient({
      guides,
      ghost: null,
      invalid: false,
      readout: { ...readout, text: sizeReadout(area, ctx) },
    });
    return;
  }
  const box = bboxOf(base.areas.find((a) => a.id === r.id)?.shape ?? area.shape);
  for (const { e, v } of targets) {
    if (e.axis === 'h') {
      if (e.line === box.y0) box.y0 = Math.min(v, box.y1 - 1);
      else box.y1 = Math.max(v, box.y0 + 1);
    } else if (e.line === box.x0) box.x0 = Math.min(v, box.x1 - 1);
    else box.x1 = Math.max(v, box.x0 + 1);
  }
  ctx.ui.setTransient({
    guides,
    ghost: { kind: 'area', rect: box, valid: false, carve: [] },
    invalid: true,
    readout: { ...readout, text: 'Não dá assim', sub: r.message ?? undefined, invalid: true },
  });
}

/* ------------------------------------------------------------------------------------------------
 * Select handler
 * ---------------------------------------------------------------------------------------------- */

type Drag =
  | {
      kind: 'move';
      id: Id;
      box: Rect;
      snap: SnapContext;
      dx: Mm;
      dy: Mm;
      valid: boolean;
      message: string | null;
    }
  | { kind: 'label'; id: Id; base: Vec };

let drag: Drag | null = null;

const hitAreaId = (hit: Parameters<NonNullable<SelectHandler['onTap']>>[0]): Id | null =>
  hit?.kind === 'area' ? hit.id : hit?.kind === 'label' ? hit.areaId : null;

/** Snap context without the moving area, so it aligns with the others only. */
function moveSnapContext(doc: ProjectDoc, id: Id, ctx: ToolContext): SnapContext {
  const base = ctx.snapContext();
  const others = doc.areas.filter((a) => a.id !== id);
  return { ...base, ...alignmentLines(others, doc.lot) };
}

/** Offset that puts the box on an alignment line (either side), else on the grid. */
function snapOffset(
  lo: Mm,
  hi: Mm,
  raw: number,
  axis: 'x' | 'y',
  max: Mm,
  snap: SnapContext,
): { d: Mm; guide: Guide | null } {
  const a = snapCoord(lo + raw, axis, snap);
  const b = snapCoord(hi + raw, axis, snap);
  let d: Mm;
  let guide: Guide | null = null;
  if (a.guide) {
    d = a.v - lo;
    guide = a.guide;
  } else if (b.guide) {
    d = b.v - hi;
    guide = b.guide;
  } else {
    d = Math.round(raw / snap.step) * snap.step;
  }
  return { d: Math.min(max - hi, Math.max(-lo, d)), guide };
}

function arrows(dx: Mm, dy: Mm): string {
  const parts: string[] = [];
  if (dx) parts.push(`${dx > 0 ? '→' : '←'} ${formatLength(Math.abs(dx))}`);
  if (dy) parts.push(`${dy > 0 ? '↓' : '↑'} ${formatLength(Math.abs(dy))}`);
  return parts.join(' · ') || 'Sem mudança';
}

function moveDrag(
  d: Extract<Drag, { kind: 'move' }>,
  p: PointerInput,
  start: PointerInput,
  ctx: ToolContext,
): void {
  const base = docStore.getState().gesture?.base;
  const area = base?.areas.find((a) => a.id === d.id);
  if (!base || !area) return;
  const sx = snapOffset(d.box.x0, d.box.x1, p.world.x - start.world.x, 'x', base.lot.width, d.snap);
  const sy = snapOffset(d.box.y0, d.box.y1, p.world.y - start.world.y, 'y', base.lot.depth, d.snap);
  const guides = [sx.guide, sy.guide].filter((g): g is Guide => g !== null);
  const readout = { x: p.screen.x, y: p.screen.y };
  if (sx.d === d.dx && sy.d === d.dy) {
    ctx.ui.setTransient({ guides, readout: { ...readout, ...readoutText(d) } });
    return;
  }
  d.dx = sx.d;
  d.dy = sy.d;
  ctx.feedback.tick();
  const res = translateArea(base, d.id, d.dx, d.dy);
  d.valid = res.valid;
  d.message = res.valid ? null : (res.messages[0] ?? null);
  ctx.doc.updateGesture((draft) => {
    Object.assign(draft, castDraft(res.patch));
  });
  const moved: Rect = {
    x0: d.box.x0 + d.dx,
    x1: d.box.x1 + d.dx,
    y0: d.box.y0 + d.dy,
    y1: d.box.y1 + d.dy,
  };
  ctx.ui.setTransient({
    guides,
    ghost: d.valid
      ? null
      : {
          kind: 'area',
          rect: moved,
          valid: false,
          carve: area.kind === 'outdoor' ? [] : overlapRects(base.areas, moved, d.id),
        },
    invalid: !d.valid,
    readout: { ...readout, ...readoutText(d) },
  });
}

function readoutText(d: Extract<Drag, { kind: 'move' }>) {
  return d.valid
    ? { text: arrows(d.dx, d.dy), invalid: false }
    : { text: 'Não cabe aqui', sub: d.message ?? 'Solte para voltar', invalid: true };
}

/** The area returns from where it was dropped to its old place. */
function snapBack(id: Id, dx: Mm, dy: Mm): void {
  afterPaint(() => {
    const el = areaEl(id);
    if (!el) return;
    animateEl(
      el,
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      {
        duration: tuning.itemLift.dropMs,
        easing: 'cubic-bezier(0, 0, 0.2, 1)',
      },
    );
  });
}

/**
 * Rooms, covered and outdoor areas, and their labels. Tap selects (or picks a merge neighbor, or a
 * removed wall line). Drag on the selected area moves it with its items and openings; drag on its
 * label moves the label.
 */
export const areaHandler: SelectHandler = {
  kind: 'area',

  onTap(hit, p, ctx) {
    const id = hitAreaId(hit);
    const keep = mergePickStore.getState().keepId;
    if (keep) {
      if (id && id !== keep) mergeInto(keep, id, ctx);
      else stopMergePick();
      return;
    }
    const doc = ctx.getDoc();
    if (doc) {
      const wallId = openWallIdAt(doc, p.world, ctx.tolMm(tolPxFor(p.pointerType)));
      if (wallId) {
        ctx.ui.select({ kind: 'wall', segmentId: wallId });
        return;
      }
    }
    closeRoomPicker();
    ctx.ui.select(id ? { kind: 'area', id } : null);
  },

  onDragStart(hit, p, ctx) {
    const doc = ctx.getDoc();
    const id = hitAreaId(hit);
    const area = id ? doc?.areas.find((a) => a.id === id) : null;
    if (!doc || !area || ctx.doc.readOnly) return false;
    stopMergePick();
    if (hit?.kind === 'label') {
      drag = { kind: 'label', id: area.id, base: area.labelOffset ?? { x: 0, y: 0 } };
      ctx.doc.beginGesture('Mover nome');
      return true;
    }
    drag = {
      kind: 'move',
      id: area.id,
      box: bboxOf(area.shape),
      snap: moveSnapContext(doc, area.id, ctx),
      dx: 0,
      dy: 0,
      valid: true,
      message: null,
    };
    ctx.doc.beginGesture(area.kind === 'room' ? 'Mover cômodo' : 'Mover área');
    ctx.ui.setTransient({ readout: { x: p.screen.x, y: p.screen.y, text: area.name } });
    return true;
  },

  onDrag(_hit, p, start, ctx) {
    const d = drag;
    if (!d) return;
    if (d.kind === 'move') {
      moveDrag(d, p, start, ctx);
      return;
    }
    const x = Math.round((d.base.x + p.world.x - start.world.x) / 10) * 10;
    const y = Math.round((d.base.y + p.world.y - start.world.y) / 10) * 10;
    ctx.doc.updateGesture((draft) => {
      const a = draft.areas.find((v) => v.id === d.id);
      if (a) a.labelOffset = { x, y };
    });
  },

  onDragEnd(_hit, p, start, ctx) {
    const d = drag;
    if (d?.kind === 'move') moveDrag(d, p, start, ctx);
    drag = null;
    ctx.ui.setTransient(EMPTY_TRANSIENT);
    if (!d) return;
    if (d.kind === 'move' && !d.valid) {
      ctx.doc.cancelGesture();
      ctx.feedback.invalid();
      snapBack(d.id, d.dx, d.dy);
      if (d.message) toast(d.message, { tone: 'error' });
      return;
    }
    ctx.doc.endGesture();
    if (d.kind === 'move' && (d.dx || d.dy)) ctx.feedback.place();
  },

  getHandles: areaHandles,

  onHandleDrag(handleId, p, start, ctx, phase) {
    if (phase === 'start') {
      const doc = ctx.getDoc();
      const area = selectedArea(ctx);
      if (!doc || !area || ctx.doc.readOnly) return;
      const edgesToMove = resizeEdges(area, handleId, doc.lot);
      if (!edgesToMove.length) return;
      resize = {
        id: area.id,
        edges: edgesToMove,
        snap: moveSnapContext(doc, area.id, ctx),
        key: '',
        valid: true,
        changed: false,
        message: null,
      };
      ctx.doc.beginGesture(area.kind === 'room' ? 'Redimensionar cômodo' : 'Redimensionar área');
      ctx.ui.setTransient({
        readout: { x: p.screen.x, y: p.screen.y, text: sizeReadout(area, ctx) },
      });
      return;
    }
    const r = resize;
    if (!r) return;
    resizeMove(r, p, start, ctx);
    if (phase !== 'end') return;
    resize = null;
    ctx.ui.setTransient(EMPTY_TRANSIENT);
    if (!r.valid) {
      ctx.doc.cancelGesture();
      ctx.feedback.invalid();
      if (r.message) toast(r.message, { tone: 'error' });
      return;
    }
    ctx.doc.endGesture();
    if (r.changed) ctx.feedback.place();
  },

  onCancel(ctx) {
    drag = null;
    resize = null;
    ctx.ui.setTransient(EMPTY_TRANSIENT);
  },
};
