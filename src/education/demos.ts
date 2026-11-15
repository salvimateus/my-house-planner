import type { ToolId } from '../editor/tools/types.ts';
import { bboxOf, pointInRegion, regionPath } from '../geometry/shape.ts';
import type { Rect, Scene, WallSegment } from '../geometry/types.ts';
import type { ProjectDoc, Vec } from '../model/types.ts';
import { formatLength, formatLengthShort } from '../model/units.ts';
import { camera } from '../store/cameraStore.ts';
import { docStore } from '../store/docStore.ts';
import { sceneOf } from '../store/selectors.ts';
import { uiStore } from '../store/uiStore.ts';

export type DemoTool = Exclude<ToolId, 'select'>;

export const DEMO_TOOLS: readonly DemoTool[] = ['build', 'opening', 'item', 'ruler', 'paint'];

/** Page px (the demo layer covers the viewport). */
export interface Pt {
  x: number;
  y: number;
}

/** One hand pose on the loop timeline (offset 0 to 1). */
export interface HandKey {
  offset: number;
  at: Pt;
  down: boolean;
  visible: boolean;
}

export interface DemoPlan {
  caption: string;
  hand: HandKey[];
  /** Adds the demo marks to `layer` and starts their animations with the shared timing. */
  decorate(layer: SVGGElement, timing: KeyframeAnimationOptions): Animation[];
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Stage {
  doc: ProjectDoc;
  scene: Scene;
  zoom: number;
  /** Canvas part not covered by the bottom sheet, in page px. */
  view: Box;
  toPage(v: Vec): Pt;
  /** The same box in world mm. */
  worldView: Rect;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STATE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const MARGIN = 14;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

function stage(): Stage | null {
  const doc = docStore.getState().doc;
  const canvas = document.querySelector('.canvas');
  if (!doc || !canvas) return null;
  const c = canvas.getBoundingClientRect();
  if (c.width < 80 || c.height < 80) return null;
  let bottom = c.bottom;
  const sheet = document.querySelector('.sheet-scroller:not([data-hidden]) .sheet-panel');
  if (sheet) {
    const top = sheet.getBoundingClientRect().top;
    if (top > c.top + 120 && top < bottom) bottom = top;
  }
  const view: Box = {
    left: c.left + MARGIN,
    top: c.top + MARGIN,
    right: c.right - MARGIN,
    bottom: bottom - MARGIN,
  };
  const toPage = (v: Vec): Pt => {
    const s = camera.worldToScreen(v);
    return { x: c.left + s.x, y: c.top + s.y };
  };
  const a = camera.screenToWorld({ x: view.left - c.left, y: view.top - c.top });
  const b = camera.screenToWorld({ x: view.right - c.left, y: view.bottom - c.top });
  return {
    doc,
    scene: sceneOf(doc),
    zoom: camera.get().zoom,
    view,
    toPage,
    worldView: { x0: a.x, y0: a.y, x1: b.x, y1: b.y },
  };
}

const inView = (p: Pt, v: Box) =>
  p.x >= v.left && p.x <= v.right && p.y >= v.top && p.y <= v.bottom;

const intersect = (a: Rect, b: Rect): Rect | null => {
  const r = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
};

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const center = (r: Rect): Vec => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });

/** Keyframes that hold each value until the next offset, with a soft move in between. */
function frames(keys: { offset: number; [prop: string]: string | number }[]): Keyframe[] {
  return keys.map((k) => ({ easing: STATE, ...k }));
}

/** Free square for the build demo: inside the lot and the view, away from rooms, near the middle. */
function freeSquare(st: Stage, size: number): Rect | null {
  const lot: Rect = { x0: 0, y0: 0, x1: st.doc.lot.width, y1: st.doc.lot.depth };
  const area = intersect(lot, st.worldView);
  if (!area) return null;
  const taken = st.doc.areas.filter((a) => a.kind !== 'outdoor').map((a) => bboxOf(a.shape));
  const mid = center(area);
  const step = 500;
  let best: Rect | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (let x = Math.ceil(area.x0 / step) * step; x + size <= area.x1; x += step) {
    for (let y = Math.ceil(area.y0 / step) * step; y + size <= area.y1; y += step) {
      const r = { x0: x, y0: y, x1: x + size, y1: y + size };
      if (taken.some((t) => overlaps(t, r))) continue;
      const d = Math.hypot(x + size / 2 - mid.x, y + size / 2 - mid.y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
  }
  if (best) return best;
  // A full plan: show the gesture in the middle of the view anyway.
  const x = Math.round((mid.x - size / 2) / step) * step;
  const y = Math.round((mid.y - size / 2) / step) * step;
  return { x0: x, y0: y, x1: x + size, y1: y + size };
}

/* ------------------------------------------- hands -------------------------------------------- */

const offsetFrom = (p: Pt, dx: number, dy: number): Pt => ({ x: p.x + dx, y: p.y + dy });

function pressDragHand(a: Pt, b: Pt): HandKey[] {
  return [
    { offset: 0, at: offsetFrom(a, 26, 34), down: false, visible: false },
    { offset: 0.12, at: a, down: false, visible: true },
    { offset: 0.2, at: a, down: true, visible: true },
    { offset: 0.66, at: b, down: true, visible: true },
    { offset: 0.74, at: b, down: false, visible: true },
    { offset: 0.9, at: b, down: false, visible: true },
    { offset: 1, at: offsetFrom(b, 18, 24), down: false, visible: false },
  ];
}

function tapHand(a: Pt): HandKey[] {
  return [
    { offset: 0, at: offsetFrom(a, 30, 40), down: false, visible: false },
    { offset: 0.16, at: a, down: false, visible: true },
    { offset: 0.28, at: a, down: true, visible: true },
    { offset: 0.38, at: a, down: false, visible: true },
    { offset: 0.88, at: a, down: false, visible: true },
    { offset: 1, at: offsetFrom(a, 18, 24), down: false, visible: false },
  ];
}

/* ------------------------------------------- demos -------------------------------------------- */

function buildDemo(st: Stage): DemoPlan | null {
  const minSide = Math.min(st.view.right - st.view.left, st.view.bottom - st.view.top);
  const size = [3000, 2000, 1500].find((s) => s * st.zoom <= minSide * 0.6) ?? 1500;
  const spot = freeSquare(st, size);
  if (!spot) return null;
  const a = st.toPage({ x: spot.x0, y: spot.y0 });
  const b = st.toPage({ x: spot.x1, y: spot.y1 });
  if (!inView(a, st.view) && !inView(b, st.view)) return null;
  return {
    caption: 'Pressione e arraste para desenhar um cômodo',
    hand: pressDragHand(a, b),
    decorate(layer, timing) {
      const rect = svg('rect', {
        class: 'edu-demo-room',
        x: a.x,
        y: a.y,
        width: b.x - a.x,
        height: b.y - a.y,
      });
      const label = svg(
        'text',
        {
          class: 'edu-demo-label',
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          'text-anchor': 'middle',
        },
        `${formatLengthShort(size)} × ${formatLength(size)}`,
      );
      layer.append(rect, label);
      const closed = 'inset(0% 100% 100% 0%)';
      const open = 'inset(0% 0% 0% 0%)';
      return [
        rect.animate(
          frames([
            { offset: 0, clipPath: closed, opacity: 0 },
            { offset: 0.2, clipPath: closed, opacity: 1 },
            { offset: 0.66, clipPath: open, opacity: 1 },
            { offset: 0.9, clipPath: open, opacity: 1 },
            { offset: 1, clipPath: open, opacity: 0 },
          ]),
          timing,
        ),
        label.animate(
          frames([
            { offset: 0, opacity: 0 },
            { offset: 0.6, opacity: 0 },
            { offset: 0.7, opacity: 1 },
            { offset: 0.9, opacity: 1 },
            { offset: 1, opacity: 0 },
          ]),
          timing,
        ),
      ];
    },
  };
}

function wallMid(s: WallSegment): Vec {
  const along = (s.start + s.end) / 2;
  const across = s.line + s.offset;
  return s.axis === 'h' ? { x: along, y: across } : { x: across, y: along };
}

function openingDemo(st: Stage): DemoPlan | null {
  const view = center(st.worldView);
  let wall: WallSegment | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const s of st.scene.walls) {
    if (s.kind === 'boundary' || s.end - s.start < 1200) continue;
    const m = wallMid(s);
    if (!inView(st.toPage(m), st.view)) continue;
    const d = Math.hypot(m.x - view.x, m.y - view.y);
    if (d < best) {
      best = d;
      wall = s;
    }
  }
  if (!wall) return null;
  const side = wall.plus ? 1 : -1;
  const mid = wallMid(wall);
  const away = 1500;
  const from =
    wall.axis === 'h' ? { x: mid.x, y: mid.y + side * away } : { x: mid.x + side * away, y: mid.y };
  const a = st.toPage(from);
  const b = st.toPage(mid);
  const w = Math.max(18, 800 * st.zoom);
  const t = Math.max(5, wall.thickness * st.zoom);
  const horizontal = wall.axis === 'h';
  const sweep = horizontal ? (side > 0 ? 0 : 1) : side > 0 ? 1 : 0;
  const arc = horizontal
    ? `M${-w / 2} 0L${-w / 2} ${side * w}A${w} ${w} 0 0 ${sweep} ${w / 2} 0`
    : `M0 ${-w / 2}L${side * w} ${-w / 2}A${w} ${w} 0 0 ${sweep} 0 ${w / 2}`;
  return {
    caption: 'Arraste a porta até uma parede: ela gruda sozinha',
    hand: pressDragHand(a, b),
    decorate(layer, timing) {
      const door = svg('g', { class: 'edu-demo-door' });
      door.append(
        svg('rect', {
          x: horizontal ? -w / 2 : -t / 2,
          y: horizontal ? -t / 2 : -w / 2,
          width: horizontal ? w : t,
          height: horizontal ? t : w,
          rx: 2,
        }),
      );
      const swing = svg('path', {
        class: 'edu-demo-swing',
        d: arc,
        transform: `translate(${b.x} ${b.y})`,
      });
      layer.append(swing, door);
      const at = (p: Pt) => `translate(${p.x}px, ${p.y}px)`;
      return [
        door.animate(
          frames([
            { offset: 0, transform: at(a), opacity: 0 },
            { offset: 0.18, transform: at(a), opacity: 0 },
            { offset: 0.22, transform: at(a), opacity: 1 },
            { offset: 0.66, transform: at(b), opacity: 1 },
            { offset: 0.9, transform: at(b), opacity: 1 },
            { offset: 1, transform: at(b), opacity: 0 },
          ]),
          timing,
        ),
        swing.animate(
          frames([
            { offset: 0, opacity: 0 },
            { offset: 0.68, opacity: 0 },
            { offset: 0.76, opacity: 1 },
            { offset: 0.9, opacity: 1 },
            { offset: 1, opacity: 0 },
          ]),
          timing,
        ),
      ];
    },
  };
}

function itemDemo(st: Stage): DemoPlan | null {
  const spot = freeSquare(st, 2500);
  const target = spot ? center(spot) : center(st.worldView);
  const p = st.toPage(target);
  const q = offsetFrom(p, Math.min(70, 1200 * st.zoom), Math.min(40, 700 * st.zoom));
  if (!inView(p, st.view)) return null;
  const card = document.querySelector('.catalog-card');
  const cr = card?.getBoundingClientRect();
  const c: Pt =
    cr && cr.width > 0 && cr.top < window.innerHeight
      ? { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 }
      : { x: (st.view.left + st.view.right) / 2, y: st.view.bottom - 10 };
  const w = Math.max(28, 1800 * st.zoom);
  const h = Math.max(16, 850 * st.zoom);
  const hand: HandKey[] = [
    { offset: 0, at: offsetFrom(c, 24, 30), down: false, visible: false },
    { offset: 0.1, at: c, down: false, visible: true },
    { offset: 0.17, at: c, down: true, visible: true },
    { offset: 0.24, at: c, down: false, visible: true },
    { offset: 0.44, at: p, down: false, visible: true },
    { offset: 0.5, at: p, down: true, visible: true },
    { offset: 0.72, at: q, down: true, visible: true },
    { offset: 0.78, at: q, down: false, visible: true },
    { offset: 0.9, at: q, down: false, visible: true },
    { offset: 1, at: offsetFrom(q, 18, 24), down: false, visible: false },
  ];
  return {
    caption: 'Toque num móvel e depois arraste na planta',
    hand,
    decorate(layer, timing) {
      const item = svg('g', { class: 'edu-demo-item' });
      item.append(
        svg('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4 }),
        svg('rect', {
          class: 'edu-demo-item-back',
          x: -w / 2,
          y: -h / 2,
          width: w,
          height: h * 0.28,
          rx: 3,
        }),
      );
      layer.append(item);
      const at = (pt: Pt) => `translate(${pt.x}px, ${pt.y}px)`;
      return [
        item.animate(
          frames([
            { offset: 0, transform: at(p), opacity: 0 },
            { offset: 0.48, transform: `${at(p)} scale(0.85)`, opacity: 0 },
            { offset: 0.52, transform: `${at(p)} scale(1.06)`, opacity: 0.9 },
            { offset: 0.72, transform: `${at(q)} scale(1.06)`, opacity: 0.9 },
            { offset: 0.78, transform: `${at(q)} scale(1)`, opacity: 1 },
            { offset: 0.9, transform: `${at(q)} scale(1)`, opacity: 1 },
            { offset: 1, transform: `${at(q)} scale(1)`, opacity: 0 },
          ]),
          timing,
        ),
      ];
    },
  };
}

function rulerDemo(st: Stage): DemoPlan | null {
  let pick: { net: Rect; tap: Vec; score: number } | null = null;
  for (const a of st.doc.areas) {
    if (a.kind === 'outdoor') continue;
    const d = st.scene.areas.get(a.id);
    if (!d || d.netArea <= 0) continue;
    const net = bboxOf(d.net);
    const mid = center(net);
    const tap = pointInRegion(mid, d.net) ? mid : { x: d.label.x, y: d.label.y };
    if (!inView(st.toPage(tap), st.view)) continue;
    const narrow = Math.min(net.x1 - net.x0, net.y1 - net.y0);
    // Corridors first, then the narrowest space.
    const score = (a.preset === 'hall' ? 0 : 1_000_000) + narrow;
    if (!pick || score < pick.score) pick = { net, tap, score };
  }
  if (!pick) return null;
  const { net, tap } = pick;
  const across = net.x1 - net.x0 <= net.y1 - net.y0;
  const length = across ? net.x1 - net.x0 : net.y1 - net.y0;
  const a = st.toPage(across ? { x: net.x0, y: tap.y } : { x: tap.x, y: net.y0 });
  const b = st.toPage(across ? { x: net.x1, y: tap.y } : { x: tap.x, y: net.y1 });
  const p = st.toPage(tap);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    caption: 'Toque dentro de um espaço para medir de parede a parede',
    hand: tapHand(p),
    decorate(layer, timing) {
      const group = svg('g', {
        transform: `translate(${mid.x} ${mid.y}) rotate(${across ? 0 : 90})`,
      });
      const line = svg('g', { class: 'edu-demo-ruler' });
      line.append(
        svg('line', { x1: -len / 2, y1: 0, x2: len / 2, y2: 0 }),
        svg('line', { x1: -len / 2, y1: -6, x2: -len / 2, y2: 6 }),
        svg('line', { x1: len / 2, y1: -6, x2: len / 2, y2: 6 }),
      );
      group.append(line);
      const label = svg(
        'text',
        { class: 'edu-demo-label', x: mid.x, y: mid.y - 10, 'text-anchor': 'middle' },
        formatLength(length),
      );
      layer.append(group, label);
      return [
        line.animate(
          frames([
            { offset: 0, transform: 'scaleX(0)', opacity: 0 },
            { offset: 0.3, transform: 'scaleX(0)', opacity: 1 },
            { offset: 0.5, transform: 'scaleX(1)', opacity: 1 },
            { offset: 0.9, transform: 'scaleX(1)', opacity: 1 },
            { offset: 1, transform: 'scaleX(1)', opacity: 0 },
          ]),
          timing,
        ),
        label.animate(
          frames([
            { offset: 0, opacity: 0 },
            { offset: 0.46, opacity: 0 },
            { offset: 0.56, opacity: 1 },
            { offset: 0.9, opacity: 1 },
            { offset: 1, opacity: 0 },
          ]),
          timing,
        ),
      ];
    },
  };
}

let clipSeq = 0;

function paintDemo(st: Stage): DemoPlan | null {
  let pick: { id: string; area: number } | null = null;
  for (const a of st.doc.areas) {
    if (a.kind === 'outdoor') continue;
    const d = st.scene.areas.get(a.id);
    if (!d || !inView(st.toPage({ x: d.label.x, y: d.label.y }), st.view)) continue;
    if (!pick || d.netArea > pick.area) pick = { id: a.id, area: d.netArea };
  }
  if (!pick) return null;
  const d = st.scene.areas.get(pick.id);
  if (!d) return null;
  const tap = { x: d.label.x, y: d.label.y };
  const p = st.toPage(tap);
  const box = bboxOf(d.visible);
  const corners = [
    st.toPage({ x: box.x0, y: box.y0 }),
    st.toPage({ x: box.x1, y: box.y1 }),
    st.toPage({ x: box.x0, y: box.y1 }),
    st.toPage({ x: box.x1, y: box.y0 }),
  ];
  const r = Math.max(...corners.map((c) => Math.hypot(c.x - p.x, c.y - p.y)));
  const o = st.toPage({ x: 0, y: 0 });
  const color = uiStore.getState().paintFill.color;
  return {
    caption: 'Escolha uma cor e toque num cômodo',
    hand: tapHand(p),
    decorate(layer, timing) {
      clipSeq += 1;
      const id = `edu-demo-clip-${clipSeq}`;
      const clip = svg('clipPath', { id });
      clip.append(
        svg('path', {
          d: regionPath(d.visible),
          'fill-rule': 'evenodd',
          transform: `matrix(${st.zoom} 0 0 ${st.zoom} ${o.x} ${o.y})`,
        }),
      );
      const group = svg('g', { 'clip-path': `url(#${id})` });
      const disc = svg('circle', { class: 'edu-demo-paint', cx: p.x, cy: p.y, r, fill: color });
      disc.style.transformBox = 'fill-box';
      disc.style.transformOrigin = 'center';
      group.append(disc);
      layer.append(clip, group);
      return [
        disc.animate(
          frames([
            { offset: 0, transform: 'scale(0)', opacity: 0 },
            { offset: 0.28, transform: 'scale(0)', opacity: 0.75 },
            { offset: 0.6, transform: 'scale(1)', opacity: 0.75 },
            { offset: 0.88, transform: 'scale(1)', opacity: 0.75 },
            { offset: 1, transform: 'scale(1)', opacity: 0 },
          ]),
          timing,
        ),
      ];
    },
  };
}

const BUILDERS: Record<DemoTool, (st: Stage) => DemoPlan | null> = {
  build: buildDemo,
  opening: openingDemo,
  item: itemDemo,
  ruler: rulerDemo,
  paint: paintDemo,
};

/** The demo for a tool on the current plan and view, or null when the plan has no target yet. */
export function planDemo(tool: DemoTool): DemoPlan | null {
  const st = stage();
  return st ? BUILDERS[tool](st) : null;
}
