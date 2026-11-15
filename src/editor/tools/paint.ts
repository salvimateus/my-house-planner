import { materialDef } from '../../catalog/registry.ts';
import { pointInShape } from '../../geometry/shape.ts';
import { emit } from '../../juice/events.ts';
import { tuning } from '../../juice/tuning.ts';
import { reducedMotion } from '../../juice/tween.ts';
import type { Area, Fill, ProjectDoc, Vec } from '../../model/types.ts';
import { fillPaint } from '../../render/PatternDefs.tsx';
import type { RenderContext } from '../../render/RenderContext.ts';
import { SCENE_THEME } from '../../render/theme.ts';
import { toast } from '../../ui/controls/Toast.tsx';
import type { PointerInput, Tool, ToolContext } from './types.ts';

type PaintTarget = { kind: 'area'; area: Area } | { kind: 'lot' };

const SVG_NS = 'http://www.w3.org/2000/svg';

const BUCKET_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
  '<path d="M5 23c0-2.6 3-6 3-6s3 3.4 3 6a3 3 0 0 1-6 0z" fill="#3E7CF0" stroke="#fff" stroke-width="1.6"/>' +
  '<path d="M11 6l10 10-7 7L4 13z" fill="#fff" stroke="#2F3339" stroke-width="1.8" stroke-linejoin="round"/>' +
  '<path d="M7 12h12" stroke="#2F3339" stroke-width="1.6" stroke-linecap="round"/>' +
  '</svg>';

const CURSOR = `url("data:image/svg+xml,${encodeURIComponent(BUCKET_SVG)}") 7 25, crosshair`;

/** Rooms and covered areas first, then outdoor areas (last drawn first), then the lot. */
function targetAt(doc: ProjectDoc, p: Vec): PaintTarget | null {
  for (let i = doc.areas.length - 1; i >= 0; i--) {
    const a = doc.areas[i]!;
    if (a.kind !== 'outdoor' && pointInShape(p, a.shape)) return { kind: 'area', area: a };
  }
  for (let i = doc.areas.length - 1; i >= 0; i--) {
    const a = doc.areas[i]!;
    if (a.kind === 'outdoor' && pointInShape(p, a.shape)) return { kind: 'area', area: a };
  }
  const { width, depth } = doc.lot;
  if (p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= depth) return { kind: 'lot' };
  return null;
}

const sameFill = (a: Fill, b: Fill): boolean =>
  a.material === b.material &&
  a.color.toLowerCase() === b.color.toLowerCase() &&
  a.scale === b.scale &&
  a.angle === b.angle;

const fillOf = (doc: ProjectDoc, t: PaintTarget): Fill =>
  t.kind === 'area' ? t.area.fill : doc.lot.ground;

const targetKey = (t: PaintTarget): string => (t.kind === 'area' ? `area:${t.area.id}` : 'lot');

function screenCtx(ctx: ToolContext): RenderContext {
  const l = ctx.getUi().layers;
  return {
    mode: 'screen',
    theme: SCENE_THEME,
    print: null,
    layers: {
      grid: l.grid.visible,
      context: l.context.visible,
      textures: l.textures.visible,
      items: l.items.visible,
      openings: l.openings.visible,
      measures: l.measures.visible,
    },
    reducedMotion: reducedMotion(),
  };
}

/** The scene element that paints the target fill on the editor canvas. */
function sceneFillEl(t: PaintTarget): SVGGraphicsElement | null {
  const svg = document.querySelector('svg.canvas-svg');
  if (!svg) return null;
  const selector =
    t.kind === 'area'
      ? `g[data-area="${CSS.escape(t.area.id)}"] > path`
      : '.layer-lot > [data-reveal="ground"]';
  return svg.querySelector<SVGGraphicsElement>(selector);
}

const running = new Map<string, () => void>();
let rippleSeq = 0;

/**
 * Snapshots the target as it looks now, so the old fill stays on screen after the commit while
 * a circle of the new fill grows from the tap point. Call `play` after the commit.
 */
function prepareRipple(t: PaintTarget): { play(fill: Fill, at: Vec, ctx: ToolContext): void } {
  const key = targetKey(t);
  running.get(key)?.();
  const src = reducedMotion() ? null : sceneFillEl(t);
  if (!src) return { play() {} };

  const n = ++rippleSeq;
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'paint-ripple');
  group.setAttribute('pointer-events', 'none');

  const oldEl = src.cloneNode(false) as SVGGraphicsElement;
  oldEl.removeAttribute('data-reveal');
  const ref = /^url\(#(.+)\)$/.exec(oldEl.getAttribute('fill') ?? '');
  if (ref?.[1]) {
    const pattern = src.ownerSVGElement?.querySelector(`#${CSS.escape(ref[1])}`);
    if (pattern) {
      const copy = pattern.cloneNode(true) as Element;
      const id = `paint-ripple-${n}`;
      copy.setAttribute('id', id);
      const defs = document.createElementNS(SVG_NS, 'defs');
      defs.append(copy);
      group.append(defs);
      oldEl.setAttribute('fill', `url(#${id})`);
    }
  }
  const newEl = oldEl.cloneNode(false) as SVGGraphicsElement;
  group.append(oldEl, newEl);

  return {
    play(fill, at, ctx) {
      if (!src.isConnected) return;
      newEl.setAttribute('fill', fillPaint(fill, screenCtx(ctx), ctx.camera.get().committed.zoom));
      src.after(group);
      // No stroke, so the clip reference box is the fill bbox, in user units (mm).
      const bb = newEl.getBBox();
      const x = at.x - bb.x;
      const y = at.y - bb.y;
      const r = Math.max(
        Math.hypot(x, y),
        Math.hypot(bb.width - x, y),
        Math.hypot(x, bb.height - y),
        Math.hypot(bb.width - x, bb.height - y),
      );
      const anim = newEl.animate(
        [
          { clipPath: `circle(0px at ${x}px ${y}px)` },
          { clipPath: `circle(${r}px at ${x}px ${y}px)` },
        ],
        { duration: tuning.paintRipple.ms, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
      );
      const stop = () => {
        anim.cancel();
        group.remove();
        if (running.get(key) === stop) running.delete(key);
      };
      running.set(key, stop);
      anim.finished.then(stop, stop);
    },
  };
}

function paintAt(p: PointerInput, ctx: ToolContext): void {
  const doc = ctx.getDoc();
  if (!doc) return;
  const t = targetAt(doc, p.world);
  if (!t) return;
  if (ctx.doc.readOnly) {
    ctx.feedback.invalid();
    return;
  }
  const fill: Fill = { ...ctx.getUi().paintFill };
  if (sameFill(fillOf(doc, t), fill)) {
    ctx.feedback.tick();
    return;
  }

  const ripple = prepareRipple(t);
  if (t.kind === 'area') {
    const id = t.area.id;
    ctx.doc.commit('Pintar cômodo', (d) => {
      const a = d.areas.find((x) => x.id === id);
      if (a) a.fill = fill;
    });
  } else {
    ctx.doc.commit('Pintar terreno', (d) => {
      d.lot.ground = fill;
    });
  }
  if (ctx.getDoc() === doc) return;

  ripple.play(fill, p.world, ctx);
  ctx.feedback.place();
  if (t.kind === 'area') emit({ type: 'area-painted', areaId: t.area.id });
}

/** Eyedropper: the tapped fill becomes the paint fill. */
function pickAt(p: PointerInput, ctx: ToolContext): void {
  const doc = ctx.getDoc();
  if (!doc) return;
  const t = targetAt(doc, p.world);
  if (!t) return;
  const fill = fillOf(doc, t);
  ctx.ui.setPaintFill({ ...fill });
  ctx.feedback.tick();
  const def = materialDef(fill.material);
  const what = def.id === 'solid' ? 'cor lisa' : def.label;
  const from = t.kind === 'area' ? `de ${t.area.name}` : 'do terreno';
  toast(`Copiado ${from}: ${what}.`, { tone: 'success', durationMs: 2500 });
}

export const paintTool: Tool = {
  id: 'paint',
  cursor: CURSOR,
  onTap(p, ctx) {
    if (p.alt) pickAt(p, ctx);
    else paintAt(p, ctx);
  },
  onLongPress: pickAt,
  onDeactivate() {
    for (const stop of [...running.values()]) stop();
  },
};
