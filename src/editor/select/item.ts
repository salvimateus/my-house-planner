import { itemDef } from '../../catalog/registry.ts';
import type { ItemDef } from '../../catalog/types.ts';
import { type ItemSnapContext, snapItem } from '../../geometry/snap.ts';
import type { Face, Guide, Handle } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import { FINE_STEP } from '../../model/defaults.ts';
import type { Id, Item, Lot, Mm, Vec } from '../../model/types.ts';
import { formatCm } from '../../model/units.ts';
import { dropItems, liftItems } from '../../render/layers/ItemsLayer.tsx';
import { docStore } from '../../store/docStore.ts';
import { EMPTY_TRANSIENT } from '../../store/uiStore.ts';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';

// ---- Shared item math ---------------------------------------------------------------------------

export const normalizeRotation = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, step: Mm) => Math.round(v / step) * step;

export function itemSize(def: ItemDef, variant: string | null): { w: Mm; d: Mm } {
  const v = variant ? def.variants?.find((x) => x.id === variant) : undefined;
  return v ? { w: v.w, d: v.d } : def.size;
}

/** The variant whose size matches, so a manual resize to a catalog size shows that chip again. */
export function variantFor(def: ItemDef, w: Mm, d: Mm): string | null {
  return def.variants?.find((v) => v.w === w && v.d === d)?.id ?? null;
}

export function itemSnapContext(ctx: ToolContext, exclude: ReadonlySet<Id>): ItemSnapContext {
  const items = ctx.getDoc()?.items ?? [];
  return { ...ctx.snapContext(), otherItems: items.filter((i) => !exclude.has(i.id)) };
}

/** Half extents of the rotated box. */
function halfExtents(item: Pick<Item, 'w' | 'd' | 'rotation'>): { hx: Mm; hy: Mm } {
  const rad = (item.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { hx: (c * item.w + s * item.d) / 2, hy: (s * item.w + c * item.d) / 2 };
}

/** Keeps the whole box inside the lot when it fits, else only the center. */
export function clampToLotBox(item: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'rotation'>, lot: Lot): Vec {
  const { hx, hy } = halfExtents(item);
  return {
    x: Math.round(
      lot.width >= 2 * hx ? clamp(item.x, hx, lot.width - hx) : clamp(item.x, 0, lot.width),
    ),
    y: Math.round(
      lot.depth >= 2 * hy ? clamp(item.y, hy, lot.depth - hy) : clamp(item.y, 0, lot.depth),
    ),
  };
}

/** Rotation that turns the item back (local -y) toward the wall behind a face. */
export function backRotation(face: Face): number {
  if (face.axis === 'h') return face.normal === 1 ? 0 : 180;
  return face.normal === 1 ? 270 : 90;
}

/** The nearest wall face that looks at the point, within `reach`. */
export function nearestFace(p: Vec, faces: Face[], reach: Mm): Face | null {
  let best: Face | null = null;
  let bestD = reach;
  for (const f of faces) {
    const across = f.axis === 'v' ? p.x : p.y;
    const along = f.axis === 'v' ? p.y : p.x;
    const dist = (across - f.at) * f.normal;
    if (dist <= 0 || along < f.from || along > f.to || dist >= bestD) continue;
    best = f;
    bestD = dist;
  }
  return best;
}

/** True when the back edge of the item lies on a wall face. */
export function backOnWall(item: Pick<Item, 'x' | 'y' | 'd' | 'rotation'>, faces: Face[]): boolean {
  const rot = normalizeRotation(item.rotation);
  if (rot % 90 !== 0) return false;
  const rad = (rot * Math.PI) / 180;
  const bx = item.x + (item.d / 2) * Math.sin(rad);
  const by = item.y - (item.d / 2) * Math.cos(rad);
  return faces.some((f) => {
    if (backRotation(f) !== rot) return false;
    const across = f.axis === 'v' ? bx : by;
    const along = f.axis === 'v' ? by : bx;
    return Math.abs(across - f.at) <= 1 && along >= f.from && along <= f.to;
  });
}

/** Local item frame (back at -y) to world. */
function toWorld(item: Pick<Item, 'x' | 'y' | 'rotation'>, lx: Mm, ly: Mm): Vec {
  const rad = (item.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: item.x + lx * c - ly * s, y: item.y + lx * s + ly * c };
}

function toLocal(item: Pick<Item, 'x' | 'y' | 'rotation'>, p: Vec): Vec {
  const rad = (item.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = p.x - item.x;
  const dy = p.y - item.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

const sameGuides = (a: Guide[], b: Guide[]) =>
  a.length === b.length && a.every((g, i) => g.axis === b[i]?.axis && g.at === b[i]?.at);

// ---- Inspector actions --------------------------------------------------------------------------

function editItems(label: string, ids: Iterable<Id>, fn: (item: Item, def: ItemDef) => void): void {
  const set = new Set(ids);
  docStore.getState().commit(label, (d) => {
    for (const i of d.items) if (set.has(i.id)) fn(i, itemDef(i.type));
  });
}

/** New size around the same center; `keepAspect` items scale the other side along. */
export function setItemSize(id: Id, w: Mm, d: Mm): void {
  editItems('Mudar tamanho', [id], (i, def) => {
    let nw = clamp(Math.round(w), def.min.w, def.max.w);
    let nd = clamp(Math.round(d), def.min.d, def.max.d);
    if (def.keepAspect) {
      const k = nw !== i.w ? nw / i.w : nd / i.d;
      nw = clamp(Math.round(i.w * k), def.min.w, def.max.w);
      nd = clamp(Math.round(i.d * k), def.min.d, def.max.d);
    }
    i.w = nw;
    i.d = nd;
    i.variant = variantFor(def, nw, nd);
  });
}

export function setItemVariant(id: Id, variant: string): void {
  editItems('Mudar modelo', [id], (i, def) => {
    const size = itemSize(def, variant);
    i.variant = variant;
    i.w = size.w;
    i.d = size.d;
  });
}

export function setItemRotation(ids: Iterable<Id>, deg: number): void {
  editItems('Girar', ids, (i) => {
    i.rotation = normalizeRotation(deg);
  });
}

export function rotateItemsBy(ids: Iterable<Id>, deg: number): void {
  editItems('Girar', ids, (i) => {
    i.rotation = normalizeRotation(i.rotation + deg);
  });
}

export function toggleMirror(ids: Iterable<Id>): void {
  editItems('Espelhar', ids, (i) => {
    i.mirrored = !i.mirrored;
  });
}

export function setItemColor(ids: Iterable<Id>, color: string | null): void {
  editItems('Cor do objeto', ids, (i, def) => {
    i.color = color === null || color.toUpperCase() === def.color.toUpperCase() ? null : color;
  });
}

export function setItemLabel(id: Id, label: string): void {
  editItems('Nome do objeto', [id], (i, def) => {
    const t = label.trim();
    i.label = t === '' || t === def.label ? null : t.slice(0, 60);
  });
}

/** Moves the items to the end (front) or the start (back) of the paint order. */
export function restackItems(ids: Iterable<Id>, where: 'front' | 'back'): void {
  const set = new Set(ids);
  docStore.getState().commit(where === 'front' ? 'Trazer para frente' : 'Enviar para trás', (d) => {
    const moved = d.items.filter((i) => set.has(i.id));
    const rest = d.items.filter((i) => !set.has(i.id));
    d.items = where === 'front' ? [...rest, ...moved] : [...moved, ...rest];
  });
}

// ---- Select handler -----------------------------------------------------------------------------

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

const HANDLE_DIR: Record<Exclude<HandleId, 'rotate'>, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};
const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

interface MoveGesture {
  ids: ReadonlySet<Id>;
  primary: Item;
  base: ReadonlyMap<Id, Item>;
  rotation: number;
  attached: boolean;
  guides: Guide[];
}

interface HandleGesture {
  id: HandleId;
  base: Item;
  last: string;
}

let move: MoveGesture | null = null;
let handle: HandleGesture | null = null;

const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function itemsUsable(ctx: ToolContext): boolean {
  const l = ctx.getUi().layers.items;
  return l.visible && !l.locked && !ctx.doc.readOnly;
}

function singleSelected(ctx: ToolContext): Item | null {
  const sel = ctx.getUi().selection;
  if (sel?.kind !== 'item' || sel.ids.length !== 1) return null;
  return ctx.getDoc()?.items.find((i) => i.id === sel.ids[0]) ?? null;
}

function endAll(ctx: ToolContext): void {
  move = null;
  handle = null;
  dropItems();
  ctx.ui.setTransient(EMPTY_TRANSIENT);
}

function dragMove(p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const g = move;
  const doc = ctx.getDoc();
  if (!g || !doc) return;
  const b = g.primary;
  const single = g.ids.size === 1;
  const def = itemDef(b.type);
  const moved: Item = {
    ...b,
    rotation: g.rotation,
    x: clamp(b.x + p.world.x - start.world.x, 0, doc.lot.width),
    y: clamp(b.y + p.world.y - start.world.y, 0, doc.lot.depth),
  };
  let value = { x: Math.round(moved.x), y: Math.round(moved.y), rotation: moved.rotation };
  let guides: Guide[] = [];
  const snapCtx = itemSnapContext(ctx, g.ids);
  if (!p.alt) {
    const res = snapItem(moved, single ? def : { wallSnap: 'none' }, snapCtx);
    value = res.value;
    guides = res.guides;
  }
  if (single) g.rotation = value.rotation;
  const attached =
    single && def.wallSnap === 'back' && backOnWall({ ...moved, ...value }, snapCtx.faces);
  if (attached && !g.attached) ctx.feedback.thunk();
  else if (guides.length > 0 && !sameGuides(guides, g.guides)) ctx.feedback.tick();
  g.attached = attached;
  g.guides = guides;
  const dx = value.x - b.x;
  const dy = value.y - b.y;
  ctx.doc.updateGesture((d) => {
    for (const i of d.items) {
      const from = g.base.get(i.id);
      if (!from) continue;
      i.x = from.x + dx;
      i.y = from.y + dy;
      if (single) i.rotation = value.rotation;
    }
  });
  ctx.ui.setTransient({ guides });
}

function dragRotate(g: HandleGesture, p: PointerInput, ctx: ToolContext): void {
  const b = g.base;
  const def = itemDef(b.type);
  const raw = (Math.atan2(p.world.x - b.x, -(p.world.y - b.y)) * 180) / Math.PI;
  const step = p.alt ? 1 : (def.rotationStep ?? 15);
  const rotation = normalizeRotation(roundTo(raw, step));
  const key = String(rotation);
  if (key !== g.last) {
    if (!p.alt) ctx.feedback.tick();
    g.last = key;
    ctx.doc.updateGesture((d) => {
      const i = d.items.find((x) => x.id === b.id);
      if (i) i.rotation = rotation;
    });
  }
  ctx.ui.setTransient({ readout: { x: p.screen.x, y: p.screen.y, text: `${rotation}°` } });
}

function dragResize(
  g: HandleGesture,
  p: PointerInput,
  start: PointerInput,
  ctx: ToolContext,
): void {
  if (g.id === 'rotate') return;
  const b = g.base;
  const def = itemDef(b.type);
  const [sx, sy] = HANDLE_DIR[g.id];
  // The grabbed handle follows the pointer delta, so a press beside it does not jump the size.
  const grip = toWorld(b, (sx * b.w) / 2, (sy * b.d) / 2);
  const local = toLocal(b, {
    x: grip.x + p.world.x - start.world.x,
    y: grip.y + p.world.y - start.world.y,
  });
  const fx = -sx * (b.w / 2);
  const fy = -sy * (b.d / 2);
  const step = p.alt ? 10 : FINE_STEP;
  let w = b.w;
  let d = b.d;
  if (def.keepAspect) {
    const k = clamp(
      ((local.x - fx) * sx * b.w + (local.y - fy) * sy * b.d) / (b.w * b.w + b.d * b.d),
      Math.max(def.min.w / b.w, def.min.d / b.d),
      Math.min(def.max.w / b.w, def.max.d / b.d),
    );
    w = clamp(roundTo(b.w * k, step), def.min.w, def.max.w);
    d = clamp(Math.round((w * b.d) / b.w), def.min.d, def.max.d);
  } else {
    if (sx !== 0) w = clamp(roundTo((local.x - fx) * sx, step), def.min.w, def.max.w);
    if (sy !== 0) d = clamp(roundTo((local.y - fy) * sy, step), def.min.d, def.max.d);
  }
  const center = toWorld(b, sx !== 0 ? fx + (sx * w) / 2 : 0, sy !== 0 ? fy + (sy * d) / 2 : 0);
  const key = `${w}x${d}`;
  if (key !== g.last) {
    ctx.feedback.tick();
    g.last = key;
    const variant = variantFor(def, w, d);
    ctx.doc.updateGesture((draft) => {
      const i = draft.items.find((x) => x.id === b.id);
      if (!i) return;
      i.w = w;
      i.d = d;
      i.x = Math.round(center.x);
      i.y = Math.round(center.y);
      i.variant = variant;
    });
  }
  ctx.ui.setTransient({
    readout: {
      x: p.screen.x,
      y: p.screen.y,
      text: `${formatCm(w)} × ${formatCm(d)} cm`,
      sub: b.label ?? def.label,
    },
  });
}

/**
 * Items: a drag on any item selects and moves it (with the whole selection when it belongs to
 * one), with the wall magnet, alignment guides and the 50 mm grid; Alt moves freely. One selected
 * item gets corner and edge resize handles in its own frame and a rotation handle behind its back.
 */
export const itemHandler: SelectHandler = {
  kind: 'item',

  onDragStart(hit, p, ctx) {
    const doc = ctx.getDoc();
    if (hit?.kind !== 'item' || !doc || !itemsUsable(ctx)) return false;
    const sel = ctx.getUi().selection;
    const current = sel?.kind === 'item' ? sel.ids : [];
    let ids: Id[];
    if (current.includes(hit.id)) ids = current;
    else if (p.shift) ids = [...current, hit.id];
    else ids = [hit.id];
    const set = new Set(ids);
    const items = doc.items.filter((i) => set.has(i.id));
    const primary = items.find((i) => i.id === hit.id);
    if (!primary) return false;
    if (!current.includes(hit.id)) ctx.ui.select({ kind: 'item', ids });
    ctx.doc.beginGesture(set.size > 1 ? 'Mover objetos' : 'Mover objeto');
    move = {
      ids: set,
      primary,
      base: new Map(items.map((i) => [i.id, i])),
      rotation: primary.rotation,
      attached: backOnWall(primary, ctx.snapContext().faces),
      guides: [],
    };
    liftItems(set);
    return true;
  },

  onDrag(_hit, p, start, ctx) {
    dragMove(p, start, ctx);
  },

  onDragEnd(_hit, _p, _start, ctx) {
    const changed = docStore.getState().gesture?.base !== ctx.getDoc();
    ctx.doc.endGesture();
    endAll(ctx);
    if (changed) ctx.feedback.place();
  },

  onCancel(ctx) {
    endAll(ctx);
  },

  getHandles(ctx) {
    const item = singleSelected(ctx);
    if (!item || !itemsUsable(ctx)) return [];
    const def = itemDef(item.type);
    const size = isCoarse() ? tuning.touch.handlePx : tuning.touch.mouseHandlePx;
    const zoom = ctx.camera.get().zoom;
    const sw = item.w * zoom;
    const sd = item.d * zoom;
    const center = ctx.camera.worldToScreen(item);
    const handles: Handle[] = [];
    const at = (lx: Mm, ly: Mm) => ctx.camera.worldToScreen(toWorld(item, lx, ly));
    const add = (id: Exclude<HandleId, 'rotate'>) => {
      const [sx, sy] = HANDLE_DIR[id];
      const s = at((sx * item.w) / 2, (sy * item.d) / 2);
      const a = (Math.atan2(s.y - center.y, s.x - center.x) * 180) / Math.PI;
      const cursor = RESIZE_CURSORS[Math.round((((a % 180) + 180) % 180) / 45) % 4];
      handles.push({ id, x: s.x, y: s.y, shape: 'square', cursor });
    };
    // Handles must leave room to grab the item itself.
    if (sw >= size * 1.6 && sd >= size * 1.6) for (const id of CORNERS) add(id);
    if (!def.keepAspect) {
      if (sw >= size * 3.5) {
        add('n');
        add('s');
      }
      if (sd >= size * 3.5) {
        add('e');
        add('w');
      }
    }
    const back = at(0, -item.d / 2);
    const rad = (item.rotation * Math.PI) / 180;
    const offset = size + (isCoarse() ? 16 : 12);
    handles.push({
      id: 'rotate',
      x: back.x + Math.sin(rad) * offset,
      y: back.y - Math.cos(rad) * offset,
      shape: 'icon',
      icon: 'rotate',
      cursor: 'grab',
    });
    return handles;
  },

  onHandleDrag(id, p, start, ctx, phase) {
    if (phase === 'start') {
      const item = singleSelected(ctx);
      if (!item || !itemsUsable(ctx)) return;
      handle = { id: id as HandleId, base: item, last: '' };
      ctx.doc.beginGesture(id === 'rotate' ? 'Girar objeto' : 'Mudar tamanho');
      return;
    }
    const g = handle;
    if (!g) return;
    if (phase === 'move') {
      if (g.id === 'rotate') dragRotate(g, p, ctx);
      else dragResize(g, p, start, ctx);
      return;
    }
    ctx.doc.endGesture();
    endAll(ctx);
  },

  onHandleTap(id, ctx) {
    if (id !== 'rotate' || ctx.doc.readOnly) return;
    const item = singleSelected(ctx);
    if (!item) return;
    rotateItemsBy([item.id], 90);
    ctx.feedback.tick();
  },
};
