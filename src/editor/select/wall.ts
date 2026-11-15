import { castDraft } from 'immer';
import {
  type EdgeRef,
  moveEdge,
  setOpenBoundary,
  sharedIntervals,
} from '../../geometry/areaOps.ts';
import { bboxOf, edges } from '../../geometry/shape.ts';
import { snapCoord } from '../../geometry/snap.ts';
import type { Rect, Scene, SnapContext, WallSegment } from '../../geometry/types.ts';
import type { Area, Axis, Id, Mm, ProjectDoc, Vec } from '../../model/types.ts';
import { formatLengthShort } from '../../model/units.ts';
import { camera } from '../../store/cameraStore.ts';
import { docStore } from '../../store/docStore.ts';
import { EMPTY_TRANSIENT, uiStore } from '../../store/uiStore.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import { fxRoot, onFxCamera, svgEl } from '../tools/build.ts';
import type { PointerInput, SelectHandler, ToolContext } from '../tools/types.ts';

/* ------------------------------------------------------------------------------------------------
 * Segment ids and removed walls
 * ---------------------------------------------------------------------------------------------- */

export interface SegmentKey {
  axis: Axis;
  line: Mm;
  start: Mm;
  end: Mm;
}

export const segmentKeyId = (k: SegmentKey): string => `${k.axis}:${k.line}:${k.start}:${k.end}`;

/** Parses `${axis}:${line}:${start}:${end}`, the id format of wall segments. */
export function parseSegmentId(id: string): SegmentKey | null {
  const m = /^([hv]):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)$/.exec(id);
  if (!m) return null;
  return { axis: m[1] as Axis, line: Number(m[2]), start: Number(m[3]), end: Number(m[4]) };
}

export const findSegment = (scene: Scene, id: string): WallSegment | null =>
  scene.walls.find((s) => s.id === id) ?? null;

export interface OpenWall extends SegmentKey {
  a: Id;
  b: Id;
}

/** Every removed wall line: the intervals shared by each open pair of rooms. */
export function openWalls(doc: ProjectDoc): OpenWall[] {
  if (!doc.openBoundaries.length) return [];
  const byId = new Map(doc.areas.map((a) => [a.id, a]));
  const out: OpenWall[] = [];
  for (const [a, b] of doc.openBoundaries) {
    const x = byId.get(a);
    const y = byId.get(b);
    if (!x || !y) continue;
    for (const iv of sharedIntervals(x.shape, y.shape)) {
      out.push({ axis: iv.axis, line: iv.line, start: iv.a, end: iv.b, a, b });
    }
  }
  return out;
}

/** The removed wall whose id is this one, or the open pair that holds the interval. */
export function openWallFor(doc: ProjectDoc, id: string): OpenWall | null {
  const k = parseSegmentId(id);
  if (!k) return null;
  return (
    openWalls(doc).find(
      (w) => w.axis === k.axis && w.line === k.line && w.start < k.end && w.end > k.start,
    ) ?? null
  );
}

/** A removed wall line near a point, as a segment id for the selection. */
export function openWallIdAt(doc: ProjectDoc, p: Vec, tolMm: Mm): string | null {
  let best: string | null = null;
  let bestD = tolMm;
  for (const w of openWalls(doc)) {
    const along = w.axis === 'h' ? p.x : p.y;
    const across = w.axis === 'h' ? p.y : p.x;
    if (along < w.start || along > w.end) continue;
    const d = Math.abs(across - w.line);
    if (d <= bestD) {
      bestD = d;
      best = segmentKeyId(w);
    }
  }
  return best;
}

/** Removes the wall between the two rooms of a segment, or puts it back. */
export function setWallOpen(a: Id, b: Id, open: boolean): boolean {
  const { doc, readOnly } = docStore.getState();
  if (!doc || readOnly) return false;
  const res = setOpenBoundary(doc, a, b, open);
  if (!res.valid) {
    toast(res.messages.join(' '), { tone: 'error' });
    return false;
  }
  docStore.getState().commit(open ? 'Remover parede' : 'Recolocar parede', (d) => {
    Object.assign(d, castDraft(res.patch));
  });
  if (res.messages.length) toast(res.messages.join(' '), { undo: true });
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Highlight of the selected removed wall and of the walls an inspector row points at (screen px,
 * effects layer); the scene draws the walls and the dashed lines
 * ---------------------------------------------------------------------------------------------- */

let openGroup: SVGGElement | null = null;
let hovered: SegmentKey[] = [];
let frame = 0;
let retries = 0;
let listening = false;

function drawOpenWalls(): void {
  frame = 0;
  const doc = docStore.getState().doc;
  const sel = uiStore.getState().selection;
  const selected =
    doc && sel?.kind === 'wall' && uiStore.getState().screen === 'editor'
      ? openWallFor(doc, sel.segmentId)
      : null;
  const list: SegmentKey[] = [...(selected ? [selected] : []), ...(doc ? hovered : [])];
  if (!list.length && !openGroup?.isConnected) return;
  const root = fxRoot();
  if (!root) {
    // The canvas mounts right after the doc loads: try again on the next frames.
    if (list.length && retries++ < 60) frame = requestAnimationFrame(drawOpenWalls);
    return;
  }
  retries = 0;
  if (!openGroup || openGroup.parentNode !== root.screen) {
    openGroup = svgEl('g');
    root.screen.append(openGroup);
  }
  if (!listening) {
    listening = true;
    onFxCamera(() => {
      if (!frame) frame = requestAnimationFrame(drawOpenWalls);
    });
  }
  const lines = list.map((w) => {
    const p = camera.worldToScreen(
      w.axis === 'h' ? { x: w.start, y: w.line } : { x: w.line, y: w.start },
    );
    const q = camera.worldToScreen(
      w.axis === 'h' ? { x: w.end, y: w.line } : { x: w.line, y: w.end },
    );
    return svgEl('line', { class: 'build-fx-open-selected', x1: p.x, y1: p.y, x2: q.x, y2: q.y });
  });
  openGroup.replaceChildren(...lines);
}

const scheduleOpenWalls = () => {
  if (!frame) frame = requestAnimationFrame(drawOpenWalls);
};

/** Highlights wall lines on the canvas, for example while an inspector row is hovered. */
export function highlightWalls(keys: SegmentKey[]): void {
  if (!keys.length && !hovered.length) return;
  hovered = keys;
  scheduleOpenWalls();
}

if (typeof window !== 'undefined') {
  docStore.subscribe((s, prev) => {
    if (s.doc?.openBoundaries !== prev.doc?.openBoundaries || s.doc?.areas !== prev.doc?.areas) {
      scheduleOpenWalls();
    }
  });
  uiStore.subscribe((s, prev) => {
    if (s.selection !== prev.selection || s.screen !== prev.screen) scheduleOpenWalls();
  });
}

/* ------------------------------------------------------------------------------------------------
 * Wall drag
 * ---------------------------------------------------------------------------------------------- */

interface Owner {
  areaId: Id;
  edge: EdgeRef;
}

/** The area edge that holds the segment; the shortest such edge, so a drag moves the least. */
export function wallOwner(doc: ProjectDoc, seg: WallSegment): Owner | null {
  let best: (Owner & { len: Mm }) | null = null;
  for (const id of [seg.plus, seg.minus]) {
    const area = id ? doc.areas.find((a) => a.id === id) : null;
    if (!area || area.kind === 'outdoor') continue;
    area.shape.forEach((ring, ringIndex) => {
      edges(ring).forEach(([p, q], index) => {
        const axis: Axis = p.y === q.y ? 'h' : 'v';
        if (axis !== seg.axis) return;
        const line = axis === 'h' ? p.y : p.x;
        const a = axis === 'h' ? Math.min(p.x, q.x) : Math.min(p.y, q.y);
        const b = axis === 'h' ? Math.max(p.x, q.x) : Math.max(p.y, q.y);
        if (line !== seg.line || a > seg.start || b < seg.end) return;
        if (!best || b - a < best.len) {
          best = { areaId: area.id, edge: { ring: ringIndex, index }, len: b - a };
        }
      });
    });
  }
  const found = best as (Owner & { len: Mm }) | null;
  return found ? { areaId: found.areaId, edge: found.edge } : null;
}

interface WallDrag {
  seg: WallSegment;
  owner: Owner;
  snap: SnapContext;
  delta: Mm;
  /** Last delta that produced a valid plan. */
  applied: Mm;
  message: string | null;
  /** The segment was the selection when the drag started. */
  selected: boolean;
}

/** The wall body of a segment moved to another line, for the drag highlight. */
function wallRectAt(seg: WallSegment, line: Mm): Rect {
  const c = line + (line === seg.line ? seg.offset : 0);
  const half = seg.thickness / 2;
  return seg.axis === 'h'
    ? { x0: seg.start, x1: seg.end, y0: c - half, y1: c + half }
    : { x0: c - half, x1: c + half, y0: seg.start, y1: seg.end };
}

let drag: WallDrag | null = null;
let lastTap: Vec | null = null;

/** Where the user last tapped a wall, for "+ Porta" and "+ Janela". */
export const lastWallTap = (): Vec | null => lastTap;

const sizeText = (a: Area) => {
  const b = bboxOf(a.shape);
  return `${a.name}: ${formatLengthShort(b.x1 - b.x0)} × ${formatLengthShort(b.y1 - b.y0)} m`;
};

function wallDrag(d: WallDrag, p: PointerInput, start: PointerInput, ctx: ToolContext): void {
  const base = docStore.getState().gesture?.base;
  if (!base) return;
  const raw = d.seg.axis === 'h' ? p.world.y - start.world.y : p.world.x - start.world.x;
  const s = snapCoord(d.seg.line + raw, d.seg.axis === 'h' ? 'y' : 'x', d.snap);
  const delta = s.v - d.seg.line;
  const readout = { x: p.screen.x, y: p.screen.y };
  const guides = s.guide ? [s.guide] : [];
  if (delta !== d.delta) {
    d.delta = delta;
    const res = moveEdge(base, d.owner.areaId, d.owner.edge, delta);
    if (res.valid) {
      d.applied = delta;
      d.message = null;
      ctx.doc.updateGesture((draft) => {
        Object.assign(draft, castDraft(res.patch));
      });
      ctx.feedback.tick();
      if (d.selected) {
        const next = followSegment(ctx.getScene(), d.seg, d.seg.line + delta);
        if (next) ctx.ui.select({ kind: 'wall', segmentId: next });
      }
    } else {
      d.message = res.messages[0] ?? 'Não dá para mover a parede até aqui.';
    }
  }
  const doc = ctx.getDoc();
  if (d.message || !doc) {
    ctx.ui.setTransient({
      guides,
      invalid: true,
      ghost: {
        kind: 'area',
        rect: wallRectAt(d.seg, d.seg.line + d.delta),
        valid: false,
        carve: [],
      },
      readout: {
        ...readout,
        text: 'Não dá para ir além',
        sub: d.message ?? undefined,
        invalid: true,
      },
    });
    return;
  }
  const changed = doc.areas.filter((a) => {
    const before = base.areas.find((x) => x.id === a.id);
    return before !== a && a.kind !== 'outdoor';
  });
  const owner = doc.areas.find((a) => a.id === d.owner.areaId);
  const list = owner ? [owner, ...changed.filter((a) => a.id !== owner.id)] : changed;
  ctx.ui.setTransient({
    guides,
    invalid: false,
    ghost: {
      kind: 'area',
      rect: wallRectAt(d.seg, d.seg.line + d.applied),
      valid: true,
      carve: [],
    },
    readout: {
      ...readout,
      text: list[0] ? sizeText(list[0]) : formatLengthShort(Math.abs(delta)),
      sub: list[1] ? sizeText(list[1]) : undefined,
    },
  });
}

/** The segment at the new line that overlaps the old interval the most. */
function followSegment(scene: Scene, old: WallSegment, line: Mm): string | null {
  let best: string | null = null;
  let bestLen = 0;
  for (const s of scene.walls) {
    if (s.axis !== old.axis || s.line !== line) continue;
    const len = Math.min(s.end, old.end) - Math.max(s.start, old.start);
    if (len > bestLen) {
      bestLen = len;
      best = s.id;
    }
  }
  return best;
}

/**
 * House walls. Tap selects the segment. Drag moves the edge along its normal on the 0,5 m magnet;
 * the shared edge of both rooms moves, with a live readout of their sizes.
 */
export const wallHandler: SelectHandler = {
  kind: 'wall',

  onTap(hit, p, ctx) {
    if (hit?.kind !== 'wall') return;
    lastTap = p.world;
    ctx.ui.select({ kind: 'wall', segmentId: hit.segmentId });
  },

  onDragStart(hit, p, ctx) {
    const doc = ctx.getDoc();
    if (!doc || hit?.kind !== 'wall' || ctx.doc.readOnly) return false;
    const seg = findSegment(ctx.getScene(), hit.segmentId);
    const owner = seg ? wallOwner(doc, seg) : null;
    if (!seg || !owner) return false;
    lastTap = p.world;
    // Selecting only at the end keeps the phone sheet closed during the drag.
    const sel = ctx.getUi().selection;
    drag = {
      seg,
      owner,
      snap: ctx.snapContext(),
      delta: 0,
      applied: 0,
      message: null,
      selected: sel?.kind === 'wall' && sel.segmentId === seg.id,
    };
    ctx.doc.beginGesture('Mover parede');
    return true;
  },

  onDrag(_hit, p, start, ctx) {
    if (drag) wallDrag(drag, p, start, ctx);
  },

  onDragEnd(_hit, p, start, ctx) {
    const d = drag;
    if (d) wallDrag(d, p, start, ctx);
    drag = null;
    ctx.ui.setTransient(EMPTY_TRANSIENT);
    if (!d) return;
    if (d.applied === 0) {
      ctx.doc.cancelGesture();
      if (d.message) {
        ctx.feedback.invalid();
        toast(d.message, { tone: 'error' });
      }
      return;
    }
    ctx.doc.endGesture();
    ctx.feedback.place();
    if (d.selected) {
      const next = followSegment(ctx.getScene(), d.seg, d.seg.line + d.applied);
      ctx.ui.select(next ? { kind: 'wall', segmentId: next } : null);
    }
  },

  onCancel(ctx) {
    drag = null;
    ctx.ui.setTransient(EMPTY_TRANSIENT);
  },
};
