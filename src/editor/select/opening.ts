import { OPENING_SPECS } from '../../catalog/openingSpecs.ts';
import { openingDef } from '../../catalog/registry.ts';
import { presetFor } from '../../catalog/roomPresets.ts';
import { openDoorSwing } from '../../education/explainers/DoorSwing.tsx';
import {
  nearestFreeSlot,
  type OpeningSnap,
  openingCenter,
  resolveHost,
  snapOpening,
} from '../../geometry/openings.ts';
import type { Handle, Scene, WallRun, WallSegment } from '../../geometry/types.ts';
import { emit } from '../../juice/events.ts';
import { feedback } from '../../juice/feedback.ts';
import { tuning } from '../../juice/tuning.ts';
import { FINE_STEP, MIN_JAMB } from '../../model/defaults.ts';
import type { Axis, Id, Mm, Opening, OpeningType, ProjectDoc, Vec } from '../../model/types.ts';
import { formatCm } from '../../model/units.ts';
import { markSwing, setMagnet } from '../../render/layers/OpeningsLayer.tsx';
import { docStore } from '../../store/docStore.ts';
import { sceneOf } from '../../store/selectors.ts';
import { EMPTY_TRANSIENT } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';

// ---- Shared opening math ------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const GROUP_NOUN: Record<'door' | 'window' | 'gate', string> = {
  door: 'porta',
  window: 'janela',
  gate: 'portão',
};

/** Magnet reach in world mm at the current zoom. */
export const openingRadius = (ctx: ToolContext): Mm =>
  tuning.magnet.openingRadiusPx * ctx.camera.mmPerPx();

/** Snap step along the wall: 50 mm, 10 mm with Alt. */
export const openingStep = (p: Pick<PointerInput, 'alt'>): Mm => (p.alt ? 10 : FINE_STEP);

export const wallKey = (axis: Axis, line: Mm): string => `${axis}:${line}`;

/** The house wall or muro segment under an opening center. */
export function segmentAt(scene: Scene, axis: Axis, line: Mm, at: Mm): WallSegment | null {
  const hit = (s: WallSegment) =>
    s.axis === axis && s.line === line && at >= s.start && at <= s.end;
  return scene.walls.find(hit) ?? scene.boundary.find(hit) ?? null;
}

const areaOf = (doc: ProjectDoc, id: Id | null) =>
  id ? (doc.areas.find((a) => a.id === id) ?? null) : null;

/** Side of a muro that faces the inside of the lot. */
function lotInside(doc: ProjectDoc, axis: Axis, c: Mm): 1 | -1 {
  return (axis === 'h' ? c < doc.lot.depth / 2 : c < doc.lot.width / 2) ? 1 : -1;
}

/** The side of a wall that holds a room, when only one side does. */
function roomSide(doc: ProjectDoc, seg: WallSegment | null): 1 | -1 | null {
  if (!seg) return null;
  const plus = areaOf(doc, seg.plus)?.kind === 'room';
  const minus = areaOf(doc, seg.minus)?.kind === 'room';
  if (plus && !minus) return 1;
  if (minus && !plus) return -1;
  return null;
}

/**
 * Default leaf side: gates open into the lot, tilting windows out of the room, doors into the
 * room on the pointer side (an external wall always into the room).
 */
export function defaultSide(
  type: OpeningType,
  snap: OpeningSnap,
  doc: ProjectDoc,
  scene: Scene,
): 1 | -1 {
  const spec = OPENING_SPECS[type];
  if (spec.group === 'gate') return lotInside(doc, snap.axis, snap.line + snap.run.offset);
  const room = roomSide(doc, segmentAt(scene, snap.axis, snap.line, snap.at));
  if (type === 'window-tilt' || type === 'window-maxim') {
    return room === null ? snap.side : room === 1 ? -1 : 1;
  }
  if (snap.run.kind === 'external' && room !== null) return room;
  return snap.side;
}

/** Hinge at the end nearer to a perpendicular wall on the swing side, so the open leaf rests on it. */
export function defaultHinge(
  snap: Pick<OpeningSnap, 'axis' | 'at' | 'run'>,
  width: Mm,
  side: 1 | -1,
  runs: WallRun[],
): 'start' | 'end' {
  const { run } = snap;
  const c = run.line + run.offset;
  const t = run.thickness;
  const a = snap.at - width / 2;
  const b = snap.at + width / 2;
  const stops: Mm[] = [run.start, run.end];
  for (const r of runs) {
    if (r.axis === snap.axis || r.line < run.start || r.line > run.end) continue;
    const touches =
      side === 1 ? r.start <= c + t && r.end >= c + t / 2 : r.end >= c - t && r.start <= c - t / 2;
    if (touches) stops.push(r.line);
  }
  let left = Number.POSITIVE_INFINITY;
  let right = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (s <= a) left = Math.min(left, a - s);
    if (s >= b) right = Math.min(right, s - b);
  }
  return left <= right ? 'start' : 'end';
}

/** Room preset door width (bathroom 700, powder room 600) for a door on a wall of that room. */
function presetDoorWidth(doc: ProjectDoc, seg: WallSegment | null): Mm | null {
  if (!seg) return null;
  const widths = [areaOf(doc, seg.plus), areaOf(doc, seg.minus)]
    .map((a) => (a ? presetFor(a.preset).doorWidth : undefined))
    .filter((w): w is Mm => typeof w === 'number');
  return widths.length ? Math.min(...widths) : null;
}

export interface OpeningCandidate {
  snap: OpeningSnap;
  width: Mm;
  side: 1 | -1;
  hinge: 'start' | 'end';
}

/** Width candidates for a new opening: the default first, then smaller catalog sizes, then the minimum. */
function widthsToTry(type: OpeningType): Mm[] {
  const spec = OPENING_SPECS[type];
  const smaller = [...spec.widths].filter((w) => w < spec.defaultWidth).sort((x, y) => y - x);
  return [...new Set([spec.defaultWidth, ...smaller, spec.minWidth])];
}

/**
 * Where an opening of `type` lands for a pointer: nearest compatible wall within `radius`, a free
 * slot on it, and the default size, side and hinge. `keep` is the opening being moved: its size
 * stays, and on its own wall its side and hinge stay too.
 */
export function openingCandidate(
  type: OpeningType,
  pointer: Vec,
  radius: Mm,
  step: Mm,
  doc: ProjectDoc,
  scene: Scene,
  keep?: Opening,
): OpeningCandidate | null {
  const others = doc.openings;
  const ignore = keep?.id;
  let snap: OpeningSnap | null = null;
  let width = 0;
  for (const w of keep ? [keep.width] : widthsToTry(type)) {
    snap = snapOpening(pointer, type, w, scene.runs, others, radius, step, ignore);
    if (snap) {
      width = w;
      break;
    }
  }
  if (!snap) return null;
  if (!keep && type === 'door') {
    const preset = presetDoorWidth(doc, segmentAt(scene, snap.axis, snap.line, snap.at));
    if (preset && preset !== width) {
      const again = snapOpening(pointer, type, preset, scene.runs, others, radius, step, ignore);
      if (again && again.axis === snap.axis && again.line === snap.line) {
        snap = again;
        width = preset;
      }
    }
  }
  if (keep && keep.axis === snap.axis && keep.line === snap.line) {
    return { snap, width, side: keep.side, hinge: keep.hinge };
  }
  const side = defaultSide(type, snap, doc, scene);
  return { snap, width, side, hinge: defaultHinge(snap, width, side, scene.runs) };
}

/** Why nothing snaps near the pointer, in words for the user. */
export function placementProblem(
  type: OpeningType,
  pointer: Vec,
  radius: Mm,
  scene: Scene,
  tap = false,
): string {
  const spec = OPENING_SPECS[type];
  let near: WallRun | null = null;
  let best = radius;
  for (const r of scene.runs) {
    const along = r.axis === 'h' ? pointer.x : pointer.y;
    const across = r.axis === 'h' ? pointer.y : pointer.x;
    const dAlong = along < r.start ? r.start - along : along > r.end ? along - r.end : 0;
    const d = Math.hypot(across - (r.line + r.offset), dAlong);
    if (d <= best) {
      best = d;
      near = r;
    }
  }
  if (!near) {
    if (spec.group === 'gate')
      return tap ? 'Toque no muro do terreno.' : 'Leve o portão até o muro.';
    return tap ? 'Toque em cima de uma parede.' : 'Leve até uma parede.';
  }
  if (!spec.hosts.includes(near.kind)) {
    if (spec.group === 'gate') return 'Portão vai só no muro do terreno.';
    if (spec.group === 'window') return 'Janela vai só em parede externa.';
    if (near.kind === 'boundary') return 'No muro, use um portão.';
    return 'Esta porta vai só em parede externa.';
  }
  return 'Não cabe aqui. Afaste dos cantos e de outras aberturas.';
}

/** Distances from the opening to the ends of its wall run, for the drag readout. */
export function endGaps(at: Mm, width: Mm, run: WallRun): string {
  const left = Math.max(0, at - width / 2 - run.start);
  const right = Math.max(0, run.end - at - width / 2);
  return `${formatCm(left)} cm ← → ${formatCm(right)} cm`;
}

// ---- Captions -----------------------------------------------------------------------------------

const FEMININE = /(a|ã|agem|ade|ção|são|íte|ite)$/;

/** "do Quarto", "da Cozinha": the article follows the first word of the name. */
export function ofName(name: string): string {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return `${FEMININE.test(first) ? 'da' : 'do'} ${name.trim()}`;
}

/** Where the leaf of a swinging opening goes, in words. Null for openings without a leaf. */
export function swingCaption(o: Opening, doc: ProjectDoc, scene: Scene): string | null {
  const spec = OPENING_SPECS[o.type];
  if (!spec.hasSwing) return null;
  const run = scene.openings.get(o.id)?.run ?? null;
  if (!run) return null;
  if (spec.group === 'gate') {
    return o.side === lotInside(doc, o.axis, o.line + run.offset)
      ? 'Abre para dentro do terreno'
      : 'Abre para fora do terreno';
  }
  const seg = segmentAt(scene, o.axis, o.line, o.at);
  const area = areaOf(doc, seg ? (o.side === 1 ? seg.plus : seg.minus) : null);
  return area ? `Abre para dentro ${ofName(area.name)}` : 'Abre para fora da casa';
}

let explained = false;

/** Caption toast after a placement or a flip; the first one offers the door swing explainer. */
export function announceSwing(id: Id): void {
  const doc = docStore.getState().doc;
  const o = doc?.openings.find((x) => x.id === id);
  if (!doc || !o) return;
  const text = swingCaption(o, doc, sceneOf(doc));
  if (!text) return;
  if (!explained && OPENING_SPECS[o.type].group === 'door') {
    explained = true;
    toast(`${text}.`, { action: { label: 'Por quê?', run: openDoorSwing } });
    return;
  }
  toast(`${text}.`, { durationMs: 2600 });
}

// ---- Edits (inspector and handles) --------------------------------------------------------------

export const canFlipHinge = (type: OpeningType): boolean =>
  type === 'door' ||
  type === 'gate-pedestrian' ||
  type === 'door-sliding' ||
  type === 'door-balcony' ||
  type === 'gate-sliding';

export const canFlipSide = (type: OpeningType): boolean =>
  OPENING_SPECS[type].hasSwing ||
  type === 'window-tilt' ||
  type === 'window-maxim' ||
  type === 'gate-tilt';

function editOpening(label: string, id: Id, fn: (o: Opening) => void): boolean {
  const before = docStore.getState().doc;
  docStore.getState().commit(label, (d) => {
    const o = d.openings.find((x) => x.id === id);
    if (o) fn(o);
  });
  return docStore.getState().doc !== before;
}

function flipped(id: Id): void {
  markSwing(id);
  feedback.tick();
  emit({ type: 'opening-flipped', openingId: id });
  announceSwing(id);
}

export function flipHinge(id: Id): void {
  if (editOpening('Trocar dobradiça', id, (o) => (o.hinge = o.hinge === 'start' ? 'end' : 'start')))
    flipped(id);
}

export function flipSide(id: Id): void {
  if (editOpening('Abrir para o outro lado', id, (o) => (o.side = o.side === 1 ? -1 : 1)))
    flipped(id);
}

/** Center for a new width: the same spot, kept inside the wall and away from other openings. */
function fitWidth(doc: ProjectDoc, o: Opening, width: Mm): { at: Mm } | { error: string } {
  const scene = sceneOf(doc);
  const run = scene.openings.get(o.id)?.run ?? resolveHost(o, scene.runs);
  if (!run) return { at: o.at };
  const lo = Math.ceil(run.start + width / 2 + MIN_JAMB);
  const hi = Math.floor(run.end - width / 2 - MIN_JAMB);
  const others = doc.openings.filter(
    (x) => x.id !== o.id && x.axis === o.axis && x.line === o.line,
  );
  const at = nearestFreeSlot(clamp(o.at, lo, hi), width, lo, hi, others, 10);
  return at === null ? { error: `Não cabe ${formatCm(width)} cm nesta parede.` } : { at };
}

/** Why a width does not fit the wall of the opening, or null when it does. */
export function widthProblem(id: Id, width: Mm): string | null {
  const doc = docStore.getState().doc;
  const o = doc?.openings.find((x) => x.id === id);
  if (!doc || !o) return null;
  const r = fitWidth(doc, o, width);
  return 'error' in r ? r.error : null;
}

/** New width around the same center. Returns a message when it does not fit. */
export function setOpeningWidth(id: Id, width: Mm): string | null {
  const doc = docStore.getState().doc;
  const o = doc?.openings.find((x) => x.id === id);
  if (!doc || !o) return null;
  const spec = OPENING_SPECS[o.type];
  const w = clamp(Math.round(width), spec.minWidth, spec.maxWidth);
  const r = fitWidth(doc, o, w);
  if ('error' in r) return r.error;
  editOpening('Mudar largura', id, (x) => {
    x.width = w;
    x.at = r.at;
  });
  return null;
}

export function setOpeningHeight(id: Id, height: Mm): void {
  editOpening('Mudar altura', id, (o) => (o.height = Math.round(height)));
}

export function setOpeningSill(id: Id, sill: Mm): void {
  editOpening('Mudar peitoril', id, (o) => (o.sill = Math.round(sill)));
}

/** Same group, other model in one undo step: width stays when the model allows it; height and sill reset. */
export function setOpeningType(id: Id, type: OpeningType): string | null {
  const doc = docStore.getState().doc;
  const o = doc?.openings.find((x) => x.id === id);
  if (!doc || !o || o.type === type) return null;
  const spec = OPENING_SPECS[type];
  const run = sceneOf(doc).openings.get(o.id)?.run ?? null;
  if (run && !spec.hosts.includes(run.kind)) return 'Este modelo não vai nesta parede.';
  const width = o.width >= spec.minWidth && o.width <= spec.maxWidth ? o.width : spec.defaultWidth;
  const fit = width === o.width ? { at: o.at } : fitWidth(doc, { ...o, type }, width);
  if ('error' in fit) return fit.error;
  const changed = editOpening(
    `Trocar para ${openingDef(type)?.label ?? 'outro modelo'}`,
    id,
    (x) => {
      x.type = type;
      x.width = width;
      x.at = fit.at;
      x.height = spec.height;
      x.sill = spec.sill;
    },
  );
  if (changed) markSwing(id);
  return null;
}

// ---- Select handler -----------------------------------------------------------------------------

interface MoveGesture {
  id: Id;
  base: Opening;
  /** Pointer minus opening center at the press, so the grab point stays under the finger. */
  grab: Vec;
  /** False while the pointer is away from every compatible wall. */
  onWall: boolean;
  wall: string;
  at: Mm;
}

let move: MoveGesture | null = null;

const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

function openingsUsable(ctx: ToolContext): boolean {
  const l = ctx.getUi().layers.openings;
  return l.visible && !l.locked && !ctx.doc.readOnly;
}

function singleSelected(ctx: ToolContext): Opening | null {
  const sel = ctx.getUi().selection;
  if (sel?.kind !== 'opening' || sel.ids.length !== 1) return null;
  return ctx.getDoc()?.openings.find((o) => o.id === sel.ids[0]) ?? null;
}

function endMove(ctx: ToolContext): void {
  move = null;
  setMagnet(null, null);
  ctx.ui.setTransient(EMPTY_TRANSIENT);
}

function dragMove(p: PointerInput, ctx: ToolContext): void {
  const g = move;
  const doc = docStore.getState().gesture?.base;
  if (!g || !doc) return;
  const scene = sceneOf(doc);
  const target = { x: p.world.x - g.grab.x, y: p.world.y - g.grab.y };
  const cand = openingCandidate(
    g.base.type,
    target,
    openingRadius(ctx),
    openingStep(p),
    doc,
    scene,
    g.base,
  );
  if (!cand) {
    if (g.onWall) ctx.doc.updateGesture(() => {});
    g.onWall = false;
    g.wall = '';
    setMagnet(g.base.type, null);
    ctx.ui.setTransient({
      ghost: {
        kind: 'opening',
        type: g.base.type,
        axis: g.base.axis,
        line: g.base.line,
        at: g.base.at,
        width: g.base.width,
        side: g.base.side,
        hinge: g.base.hinge,
        world: target,
        snapped: false,
      },
      readout: { x: p.screen.x, y: p.screen.y, text: 'Solte sobre uma parede', invalid: true },
    });
    return;
  }
  const { snap, side, hinge } = cand;
  const key = wallKey(snap.axis, snap.line);
  if (key !== g.wall) ctx.feedback.thunk();
  else if (snap.at !== g.at) ctx.feedback.tick();
  g.wall = key;
  g.at = snap.at;
  g.onWall = true;
  ctx.doc.updateGesture((d) => {
    const o = d.openings.find((x) => x.id === g.id);
    if (!o) return;
    o.axis = snap.axis;
    o.line = snap.line;
    o.at = snap.at;
    o.side = side;
    o.hinge = hinge;
  });
  setMagnet(g.base.type, { axis: snap.axis, line: snap.line, at: snap.at, width: g.base.width });
  ctx.ui.setTransient({
    ghost: null,
    readout: {
      x: p.screen.x,
      y: p.screen.y,
      text: endGaps(snap.at, g.base.width, snap.run),
      sub: 'até as pontas da parede',
    },
  });
}

/**
 * Doors, windows and gates: a drag slides the opening along its wall and jumps to other compatible
 * walls by magnet; a release away from any wall puts it back. One selected opening gets flip
 * handles on the side away from its leaf.
 */
export const openingHandler: SelectHandler = {
  kind: 'opening',

  onDragStart(hit, p, ctx) {
    const doc = ctx.getDoc();
    if (hit?.kind !== 'opening' || !doc || !openingsUsable(ctx)) return false;
    const o = doc.openings.find((x) => x.id === hit.id);
    if (!o) return false;
    const sel = ctx.getUi().selection;
    if (!(sel?.kind === 'opening' && sel.ids.length === 1 && sel.ids[0] === o.id)) {
      ctx.ui.select({ kind: 'opening', ids: [o.id] });
    }
    const center = ctx.getScene().openings.get(o.id)?.center ?? openingCenter(o, null);
    ctx.doc.beginGesture(`Mover ${GROUP_NOUN[OPENING_SPECS[o.type].group]}`);
    move = {
      id: o.id,
      base: o,
      grab: { x: p.world.x - center.x, y: p.world.y - center.y },
      onWall: true,
      wall: wallKey(o.axis, o.line),
      at: o.at,
    };
    setMagnet(o.type, { axis: o.axis, line: o.line, at: o.at, width: o.width });
    return true;
  },

  onDrag(_hit, p, _start, ctx) {
    dragMove(p, ctx);
  },

  onDragEnd(_hit, _p, _start, ctx) {
    const g = move;
    if (!g) return;
    if (!g.onWall) {
      ctx.doc.cancelGesture();
      endMove(ctx);
      ctx.feedback.invalid();
      return;
    }
    const changed = docStore.getState().gesture?.base !== ctx.getDoc();
    const now = ctx.getDoc()?.openings.find((o) => o.id === g.id);
    const swapped =
      !!now && (now.axis !== g.base.axis || now.line !== g.base.line || now.side !== g.base.side);
    ctx.doc.endGesture();
    endMove(ctx);
    if (!changed) return;
    ctx.feedback.place();
    if (swapped && OPENING_SPECS[g.base.type].hasSwing) {
      markSwing(g.id);
      announceSwing(g.id);
    }
  },

  onCancel(ctx) {
    endMove(ctx);
  },

  getHandles(ctx) {
    const o = singleSelected(ctx);
    if (!o || !openingsUsable(ctx)) return [];
    const d = ctx.getScene().openings.get(o.id);
    if (!d?.valid || !d.center || !d.run) return [];
    const ids: ('flip-hinge' | 'flip-side')[] = [];
    if (canFlipHinge(o.type)) ids.push('flip-hinge');
    if (canFlipSide(o.type)) ids.push('flip-side');
    if (ids.length === 0) return [];
    const zoom = ctx.camera.get().zoom;
    const c = ctx.camera.worldToScreen(d.center);
    const coarse = isCoarse();
    const along = o.axis === 'h' ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const away = o.axis === 'h' ? { x: 0, y: -o.side } : { x: -o.side, y: 0 };
    const off = (d.run.thickness / 2) * zoom + (coarse ? 40 : 32);
    const spread = ids.length > 1 ? (coarse ? 26 : 20) : 0;
    return ids.map((id, i): Handle => {
      const k = ids.length > 1 ? (i === 0 ? -spread : spread) : 0;
      return {
        id,
        x: c.x + along.x * k + away.x * off,
        y: c.y + along.y * k + away.y * off,
        shape: 'icon',
        icon: id,
        cursor: 'pointer',
      };
    });
  },

  onHandleTap(id, ctx) {
    if (ctx.doc.readOnly) return;
    const o = singleSelected(ctx);
    if (!o) return;
    if (id === 'flip-hinge') flipHinge(o.id);
    else if (id === 'flip-side') flipSide(o.id);
  },
};
