import { castDraft } from 'immer';
import { createStore } from 'zustand';
import { GENERIC_PRESET_ID, presetFor } from '../../catalog/roomPresets.ts';
import { insertArea, nextRoomName, type SplitLine, splitArea } from '../../geometry/areaOps.ts';
import { intersectionMask } from '../../geometry/rectilinear.ts';
import { deriveScene } from '../../geometry/scene.ts';
import { bboxOf, pointInShape, rectShape, rectsOverlap, regionPath } from '../../geometry/shape.ts';
import { snapCoord, snapRoomRect } from '../../geometry/snap.ts';
import type { Guide, Rect, SnapContext } from '../../geometry/types.ts';
import { emit } from '../../juice/events.ts';
import { tuning } from '../../juice/tuning.ts';
import { animateEl, easeOut, reducedMotion, type TweenHandle, tween } from '../../juice/tween.ts';
import { MIN_ROOM_SIDE } from '../../model/defaults.ts';
import { createArea } from '../../model/factories.ts';
import type { Area, AreaKind, Id, ProjectDoc, RoomPresetId, Shape } from '../../model/types.ts';
import { formatArea, formatLength, formatLengthShort } from '../../model/units.ts';
import { camera } from '../../store/cameraStore.ts';
import { docStore } from '../../store/docStore.ts';
import { catalogLookup, sceneOf } from '../../store/selectors.ts';
import { type BuildMode, EMPTY_TRANSIENT } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import type { PointerInput, Tool, ToolContext } from './types.ts';
import './build.css';

/* ------------------------------------------------------------------------------------------------
 * Names
 * ---------------------------------------------------------------------------------------------- */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * "Quarto", then "Quarto 2", "Quarto 3". With `always`, the first one is "Cômodo 1" too.
 * `selfId` is left out of the count, so a rename keeps its own number free.
 */
export function numberedName(
  base: string,
  areas: Area[],
  selfId: Id | null = null,
  always = false,
): string {
  const re = new RegExp(`^${escapeRe(base)}(?: (\\d+))?$`);
  let max = 0;
  for (const a of areas) {
    if (a.id === selfId) continue;
    const m = re.exec(a.name);
    if (m) max = Math.max(max, m[1] ? Number(m[1]) : 1);
  }
  if (always) return `${base} ${max + 1}`;
  return max === 0 ? base : `${base} ${max + 1}`;
}

const COVERED_BASE = 'Área coberta';

function initialName(kind: AreaKind, preset: RoomPresetId, areas: Area[]): string {
  if (kind === 'room') return nextRoomName(areas);
  if (kind === 'covered') return numberedName(COVERED_BASE, areas, null, true);
  return numberedName(presetFor(preset).label, areas);
}

/* ------------------------------------------------------------------------------------------------
 * Room type picker state (the popover lives in BuildPanel)
 * ---------------------------------------------------------------------------------------------- */

export const roomPickerStore = createStore<{ areaId: Id | null }>()(() => ({ areaId: null }));

export const openRoomPicker = (areaId: Id): void => roomPickerStore.setState({ areaId });
export const closeRoomPicker = (): void => {
  if (roomPickerStore.getState().areaId !== null) roomPickerStore.setState({ areaId: null });
};

/* ------------------------------------------------------------------------------------------------
 * Effects layer: one SVG above the scene and below the overlay, for wall traces, removed-wall lines
 * and the selected removed-wall highlight.
 * ---------------------------------------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface FxRoot {
  svg: SVGSVGElement;
  /** World mm, follows the live camera. */
  world: SVGGElement;
  /** Screen px, redrawn by its owner on camera changes. */
  screen: SVGGElement;
  unsubscribe(): void;
}

let fx: FxRoot | null = null;
const screenListeners = new Set<() => void>();

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export const sceneSvg = (): SVGSVGElement | null =>
  typeof document === 'undefined' ? null : document.querySelector<SVGSVGElement>('.canvas-svg');

/** The effects root, created next to the scene SVG on first use (and again after a remount). */
export function fxRoot(): FxRoot | null {
  if (fx?.svg.isConnected) return fx;
  fx?.unsubscribe();
  fx = null;
  const scene = sceneSvg();
  if (!scene?.parentElement) return null;

  const svg = svgEl('svg', { class: 'build-fx', 'aria-hidden': 'true', focusable: 'false' });
  const world = svgEl('g');
  const screen = svgEl('g');
  svg.append(world, screen);
  scene.after(svg);

  const apply = () => {
    const { cx, cy, zoom, vw, vh } = camera.get();
    world.setAttribute(
      'transform',
      `matrix(${zoom} 0 0 ${zoom} ${vw / 2 - cx * zoom} ${vh / 2 - cy * zoom})`,
    );
    for (const fn of screenListeners) fn();
  };
  apply();
  const unsubscribe = camera.subscribe(apply);
  fx = { svg, world, screen, unsubscribe };
  return fx;
}

/** Registers a redraw of screen-space marks on every camera change. */
export function onFxCamera(fn: () => void): () => void {
  screenListeners.add(fn);
  return () => screenListeners.delete(fn);
}

/** Two frames: React has committed the new doc and the browser has laid it out. */
export function afterPaint(fn: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

export function areaEl(id: Id): SVGGElement | null {
  return sceneSvg()?.querySelector<SVGGElement>(`[data-area="${CSS.escape(id)}"]`) ?? null;
}

function centered(el: SVGGraphicsElement): void {
  el.style.transformBox = 'fill-box';
  el.style.transformOrigin = 'center';
}

const ENTER = 'cubic-bezier(0, 0, 0.2, 1)';
const STATE = 'cubic-bezier(0.4, 0, 0.2, 1)';

const removeLater = (a: Animation, el: Element) => {
  a.finished.then(
    () => el.remove(),
    () => el.remove(),
  );
};

/** A bright stroke that runs along a path, then fades: walls being built. */
export function traceWorldPath(d: string, widthPx: number, ms: number): void {
  if (reducedMotion()) return;
  const root = fxRoot();
  if (!root) return;
  const path = svgEl('path', {
    d,
    class: 'build-fx-trace',
    pathLength: 1,
    'stroke-dasharray': '1 1',
    'stroke-dashoffset': 1,
    'stroke-width': widthPx * camera.mmPerPx(),
  });
  root.world.append(path);
  const a = path.animate(
    [
      { strokeDashoffset: 1, opacity: 1 },
      { strokeDashoffset: 0, opacity: 1, offset: 0.75 },
      { strokeDashoffset: 0, opacity: 0 },
    ],
    { duration: ms * 1.35, easing: STATE, fill: 'forwards' },
  );
  removeLater(a, path);
}

/** Scale overshoot of a freshly dropped area. */
export function dropArea(id: Id): void {
  const el = areaEl(id);
  if (!el) return;
  centered(el);
  animateEl(
    el,
    [
      { transform: 'scale(0.94)', opacity: 0.5 },
      { transform: `scale(${tuning.roomDrop.overshoot})`, opacity: 1, offset: 0.6 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: tuning.roomDrop.ms, easing: ENTER },
  );
}

/** Paint ripple: the new fill opens as a circle from the center of the area. */
export function rippleArea(id: Id): void {
  const el = areaEl(id);
  if (!el) return;
  animateEl(el, [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }], {
    duration: tuning.paintRipple.ms,
    easing: ENTER,
  });
}

/** Area label counts up from zero. React keeps the text node, so only its value changes. */
export function countUpLabel(id: Id): void {
  const doc = docStore.getState().doc;
  const d = sceneOf(doc).areas.get(id);
  const svg = sceneSvg();
  if (!doc || !d?.label.rect || !svg) return;
  const transform = `translate(${d.label.x} ${d.label.y})`;
  const group = [...svg.querySelectorAll('.area-label')].find(
    (g) => g.getAttribute('transform') === transform,
  );
  if (!group) return;
  const nodes = [...group.querySelectorAll('.area-label-area')]
    .map((t) => t.firstChild)
    .filter((n): n is Text => n instanceof Text);
  if (!nodes.length) return;
  const net = d.netArea;
  const write = (s: string) => {
    for (const n of nodes) n.nodeValue = s;
  };
  let handle: TweenHandle | null = null;
  handle = tween(
    tuning.countUp.ms,
    (t) => {
      const now = docStore.getState().doc;
      if (now !== doc) {
        // The plan changed under the tween: show what React rendered for the new plan.
        const cur = sceneOf(now).areas.get(id);
        if (cur) write(formatArea(cur.netArea));
        handle?.cancel();
        return;
      }
      write(t >= 1 ? formatArea(net) : formatArea(Math.round(net * t)));
    },
    easeOut,
  );
}

/** Snap step pulse on the live readout chip. */
function pulseReadout(): void {
  requestAnimationFrame(() => {
    const el = document.querySelector('.overlay-readout');
    if (!el) return;
    animateEl(el, [{ scale: 1 }, { scale: tuning.snapTick.scale }, { scale: 1 }], {
      duration: tuning.snapTick.ms,
      easing: STATE,
    });
  });
}

/* ------------------------------------------------------------------------------------------------
 * Geometry helpers
 * ---------------------------------------------------------------------------------------------- */

/** Row runs of a cell mask, as rects. */
function maskRects(region: Shape, cut: Rect): Rect[] {
  const { xs, ys, cells } = intersectionMask([region], [cut]);
  const cols = xs.length - 1;
  const out: Rect[] = [];
  for (let r = 0; r < ys.length - 1; r++) {
    let c = 0;
    while (c < cols) {
      if (!cells[r * cols + c]) {
        c++;
        continue;
      }
      const c0 = c;
      while (c < cols && cells[r * cols + c]) c++;
      out.push({ x0: xs[c0]!, x1: xs[c]!, y0: ys[r]!, y1: ys[r + 1]! });
    }
  }
  return out;
}

/** The parts of rooms and covered areas that a new built rect would take. */
export function overlapRects(areas: Area[], rect: Rect, skipId: Id | null = null): Rect[] {
  const out: Rect[] = [];
  for (const a of areas) {
    if (a.kind === 'outdoor' || a.id === skipId) continue;
    if (!rectsOverlap(rect, bboxOf(a.shape))) continue;
    out.push(...maskRects(a.shape, rect));
  }
  return out;
}

const PREVIEW_ID = '__build-preview';

/** Exact net area of a candidate area, as the plan would derive it after the insert. */
function previewNet(doc: ProjectDoc, candidate: Area): number | null {
  const res = insertArea(doc, candidate);
  if (!res.valid) return null;
  const next: ProjectDoc = { ...doc, ...res.patch };
  return deriveScene(next, catalogLookup).areas.get(candidate.id)?.netArea ?? null;
}

const topAreaAt = (doc: ProjectDoc, p: { x: number; y: number }): Area | null => {
  for (let i = doc.areas.length - 1; i >= 0; i--) {
    const a = doc.areas[i]!;
    if (a.kind !== 'outdoor' && pointInShape(p, a.shape)) return a;
  }
  for (let i = doc.areas.length - 1; i >= 0; i--) {
    const a = doc.areas[i]!;
    if (a.kind === 'outdoor' && pointInShape(p, a.shape)) return a;
  }
  return null;
};

const insideLot = (doc: ProjectDoc, p: { x: number; y: number }) =>
  p.x >= 0 && p.y >= 0 && p.x <= doc.lot.width && p.y <= doc.lot.depth;

/* ------------------------------------------------------------------------------------------------
 * Tool state
 * ---------------------------------------------------------------------------------------------- */

type DrawMode = Exclude<BuildMode, 'split'>;

interface RectDraft {
  kind: 'rect';
  mode: DrawMode;
  snap: SnapContext;
  rect: Rect | null;
  valid: boolean;
  carve: Rect[];
  net: number | null;
  netKey: string;
}

interface SplitDraft {
  kind: 'split';
  areaId: Id;
  snap: SnapContext;
  line: SplitLine | null;
  key: string;
  valid: boolean;
  message: string | null;
}

let draft: RectDraft | SplitDraft | null = null;
let tapHintShown = false;

const COMMIT_LABEL: Record<DrawMode, string> = {
  room: 'Desenhar cômodo',
  covered: 'Desenhar área coberta',
  outdoor: 'Desenhar área externa',
};

const presetOf = (mode: DrawMode, ctx: ToolContext): RoomPresetId =>
  mode === 'outdoor' ? ctx.getUi().outdoorPreset : GENERIC_PRESET_ID;

function clearTransient(ctx: ToolContext): void {
  ctx.ui.setTransient(EMPTY_TRANSIENT);
}

function readoutAt(p: PointerInput) {
  return { x: p.screen.x, y: p.screen.y };
}

/* ---------------------------------------- rect drawing ---------------------------------------- */

function dragRect(d: RectDraft, p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const doc = ctx.getDoc();
  if (!doc) return;
  const res = snapRoomRect(start.world, p.world, d.snap);
  const prev = d.rect;
  const r = res.rect;
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const changed =
    !prev || prev.x0 !== r.x0 || prev.x1 !== r.x1 || prev.y0 !== r.y0 || prev.y1 !== r.y1;
  const sizeChanged = !prev || prev.x1 - prev.x0 !== w || prev.y1 - prev.y0 !== h;
  d.rect = r;
  d.valid = res.valid;

  if (changed) {
    d.carve = d.mode === 'outdoor' ? [] : overlapRects(doc.areas, r);
    const key = `${r.x0},${r.y0},${r.x1},${r.y1}`;
    if (res.valid && key !== d.netKey) {
      d.netKey = key;
      const candidate: Area = {
        ...createArea(d.mode, presetOf(d.mode, ctx), rectShape(r)),
        id: PREVIEW_ID,
      };
      d.net = d.mode === 'outdoor' ? w * h : previewNet(doc, candidate);
    }
  }
  if (sizeChanged && prev && w > 0 && h > 0) {
    ctx.feedback.tick();
    pulseReadout();
  }

  const size = `${formatLengthShort(w)} × ${formatLengthShort(h)} m`;
  let sub: string | undefined;
  if (!res.valid) sub = `Mínimo de ${formatLength(MIN_ROOM_SIDE)} em cada lado`;
  else if (d.carve.length) sub = 'vai virar parte do novo cômodo';
  else if (d.net !== null)
    sub = d.mode === 'outdoor' ? formatArea(d.net) : `${formatArea(d.net)} úteis`;

  ctx.ui.setTransient({
    ghost: { kind: 'area', rect: r, valid: res.valid, carve: d.carve },
    guides: res.guides,
    invalid: !res.valid,
    readout: { ...readoutAt(p), text: size, sub, invalid: !res.valid },
  });
}

function finishRect(d: RectDraft, ctx: ToolContext): void {
  clearTransient(ctx);
  const doc = ctx.getDoc();
  if (!doc || ctx.doc.readOnly || !d.rect) return;
  if (!d.valid) {
    ctx.feedback.invalid();
    toast(`O cômodo precisa ter pelo menos ${formatLength(MIN_ROOM_SIDE)} de cada lado.`, {
      tone: 'error',
    });
    return;
  }
  const presetId = presetOf(d.mode, ctx);
  const base = createArea(d.mode, presetId, rectShape(d.rect));
  const area: Area = { ...base, name: initialName(d.mode, presetId, doc.areas) };
  const res = insertArea(doc, area);
  if (!res.valid) {
    ctx.feedback.invalid();
    toast(res.messages.join(' ') || 'Não deu para desenhar aqui.', { tone: 'error' });
    return;
  }
  ctx.doc.commit(COMMIT_LABEL[d.mode], (draftDoc) => {
    Object.assign(draftDoc, castDraft(res.patch));
  });
  const next = ctx.getDoc();
  if (!next || next === doc) return;
  if (res.messages.length) toast(res.messages.join(' '), { undo: true });
  ctx.feedback.place();

  const derived = sceneOf(next).areas.get(area.id);
  if (derived) {
    emit({
      type: 'room-created',
      areaId: area.id,
      grossArea: derived.grossArea,
      netArea: derived.netArea,
    });
  }
  playCreated(area.id, area.shape, area.kind !== 'outdoor');
  if (area.kind !== 'outdoor') openRoomPicker(area.id);
}

/** Drop, wall trace and label count-up after a new area lands. */
function playCreated(id: Id, shape: Shape, walls: boolean): void {
  afterPaint(() => {
    dropArea(id);
    if (walls) traceWorldPath(regionPath(shape), 3, tuning.wallBuild.ms);
    countUpLabel(id);
  });
}

/* ------------------------------------------ divider ------------------------------------------- */

function dragSplit(d: SplitDraft, p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const doc = ctx.getDoc();
  const target = doc?.areas.find((a) => a.id === d.areaId);
  if (!doc || !target) return;
  const dx = p.world.x - start.world.x;
  const dy = p.world.y - start.world.y;
  // A horizontal drag draws a wall along x, at the snapped start y.
  const axis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
  const at =
    axis === 'h' ? snapCoord(start.world.y, 'y', d.snap) : snapCoord(start.world.x, 'x', d.snap);
  const a = axis === 'h' ? start.world.x : start.world.y;
  const b = axis === 'h' ? p.world.x : p.world.y;
  const from = Math.round(Math.min(a, b));
  const to = Math.round(Math.max(a, b));
  const line: SplitLine = { axis, at: at.v, from, to };
  const key = `${axis}:${at.v}:${from}:${to}`;
  const prevAt = d.line ? `${d.line.axis}:${d.line.at}` : null;

  if (key !== d.key) {
    d.key = key;
    const res = splitArea(doc, d.areaId, line);
    const becameValid = res.valid && !d.valid;
    d.valid = res.valid;
    d.message = res.valid ? null : (res.messages[0] ?? null);
    if (becameValid) ctx.feedback.thunk();
    else if (prevAt !== null && prevAt !== `${axis}:${at.v}`) ctx.feedback.tick();
  }
  d.line = line;

  const box = bboxOf(target.shape);
  const t = doc.structure.internal;
  const rect: Rect =
    axis === 'h'
      ? { x0: from, x1: Math.max(to, from + 1), y0: at.v - t / 2, y1: at.v + t / 2 }
      : { x0: at.v - t / 2, x1: at.v + t / 2, y0: from, y1: Math.max(to, from + 1) };
  const lo = axis === 'h' ? box.y0 : box.x0;
  const hi = axis === 'h' ? box.y1 : box.x1;
  const text = d.valid
    ? `${formatLength(at.v - lo)} | ${formatLength(hi - at.v)}`
    : 'Arraste de parede a parede';
  const guides: Guide[] = at.guide ? [at.guide] : [];
  ctx.ui.setTransient({
    ghost: { kind: 'area', rect, valid: d.valid, carve: [] },
    guides,
    invalid: !d.valid,
    readout: { ...readoutAt(p), text, sub: d.valid ? target.name : undefined, invalid: !d.valid },
  });
}

function finishSplit(d: SplitDraft, ctx: ToolContext): void {
  clearTransient(ctx);
  const doc = ctx.getDoc();
  if (!doc || ctx.doc.readOnly || !d.line) return;
  const res = splitArea(doc, d.areaId, d.line);
  if (!res.valid) {
    ctx.feedback.invalid();
    toast(res.messages[0] ?? 'A divisão precisa cruzar o ambiente de parede a parede.', {
      tone: 'error',
    });
    return;
  }
  ctx.doc.commit('Dividir cômodo', (draftDoc) => {
    Object.assign(draftDoc, castDraft(res.patch));
  });
  const next = ctx.getDoc();
  if (!next || next === doc) return;
  ctx.feedback.place();
  const before = new Set(doc.areas.map((a) => a.id));
  const created = (res.patch.areas ?? []).filter((a) => !before.has(a.id));
  const target = doc.areas.find((a) => a.id === d.areaId);
  const { axis, at } = d.line;
  if (target) {
    const box = bboxOf(target.shape);
    const path = axis === 'h' ? `M${box.x0} ${at}H${box.x1}` : `M${at} ${box.y0}V${box.y1}`;
    afterPaint(() => traceWorldPath(path, 4, tuning.wallBuild.ms));
  }
  const piece = created[0];
  if (piece && piece.kind !== 'outdoor') openRoomPicker(piece.id);
}

/* ------------------------------------------- tool --------------------------------------------- */

function cancelDraft(ctx: ToolContext): void {
  draft = null;
  clearTransient(ctx);
}

/**
 * Build tool. Room, covered and outdoor modes draw a rectangle on the 0,5 m magnet; release inserts
 * it (rooms carve the rooms below). Divider mode drags a wall across one area and splits it.
 */
export const buildTool: Tool = {
  id: 'build',
  cursor: 'crosshair',

  onActivate(ctx) {
    draft = null;
    tapHintShown = false;
    if (ctx.getUi().selection) ctx.ui.select(null);
    fxRoot();
  },

  onDeactivate(ctx) {
    cancelDraft(ctx);
    closeRoomPicker();
  },

  onDragStart(p, ctx) {
    const doc = ctx.getDoc();
    if (!doc || ctx.doc.readOnly) return false;
    closeRoomPicker();
    fxRoot();
    const mode = ctx.getUi().buildMode;
    const snap = ctx.snapContext();
    if (mode === 'split') {
      const target = topAreaAt(doc, p.world);
      if (!target) return false;
      draft = {
        kind: 'split',
        areaId: target.id,
        snap,
        line: null,
        key: '',
        valid: false,
        message: null,
      };
      return true;
    }
    if (!insideLot(doc, p.world)) return false;
    draft = {
      kind: 'rect',
      mode,
      snap,
      rect: null,
      valid: false,
      carve: [],
      net: null,
      netKey: '',
    };
    return true;
  },

  onDrag(p, start, ctx) {
    if (!draft) return;
    if (draft.kind === 'rect') dragRect(draft, p, start, ctx);
    else dragSplit(draft, p, start, ctx);
  },

  onDragEnd(p, start, ctx) {
    const d = draft;
    draft = null;
    if (!d) return;
    if (d.kind === 'rect') {
      dragRect(d, p, start, ctx);
      finishRect(d, ctx);
    } else {
      dragSplit(d, p, start, ctx);
      finishSplit(d, ctx);
    }
  },

  onTap(_p, ctx) {
    if (roomPickerStore.getState().areaId !== null) {
      closeRoomPicker();
      return;
    }
    if (tapHintShown || ctx.doc.readOnly) return;
    tapHintShown = true;
    const mode = ctx.getUi().buildMode;
    toast(
      mode === 'split'
        ? 'Arraste uma linha dentro do cômodo, de parede a parede.'
        : `Arraste para desenhar. O ímã prende a cada ${formatLength(ctx.getUi().snapStep)}.`,
    );
  },

  onCancel(ctx) {
    cancelDraft(ctx);
    ctx.doc.cancelGesture();
  },

  onKey(e, ctx) {
    if (e.key !== 'Escape') return false;
    if (draft) {
      cancelDraft(ctx);
      return true;
    }
    if (roomPickerStore.getState().areaId !== null) {
      closeRoomPicker();
      return true;
    }
    return false;
  },
};
