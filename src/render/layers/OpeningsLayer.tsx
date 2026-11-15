import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { memo, useLayoutEffect, useRef, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { OPENING_SPECS } from '../../catalog/openingSpecs.ts';
import { dashedPolyline } from '../../catalog/openings/openingKit.ts';
import { openingDef } from '../../catalog/registry.ts';
import { compatibleRuns } from '../../geometry/openings.ts';
import type { OpeningDerived, Scene } from '../../geometry/types.ts';
import { tuning } from '../../juice/tuning.ts';
import { animateEl, springOut, tween } from '../../juice/tween.ts';
import type { Axis, Id, Mm, Opening, OpeningType } from '../../model/types.ts';
import { formatOpening } from '../../model/units.ts';
import { useUi } from '../../store/uiStore.ts';
import { printSize, type RenderContext, strokeProps, useRenderContext } from '../RenderContext.ts';
import { useSceneData } from '../SceneSvg.tsx';
import './OpeningsLayer.css';

// ---- Editor hooks: magnet glow, placement pop, swing animation ----------------------------------

export interface MagnetTarget {
  axis: Axis;
  line: Mm;
  at: Mm;
  width: Mm;
}

/** Type being placed or dragged, and the wall spot it snapped to. Editor canvas only. */
export const magnetStore = createStore<{ type: OpeningType | null; target: MagnetTarget | null }>()(
  () => ({ type: null, target: null }),
);

export function setMagnet(type: OpeningType | null, target: MagnetTarget | null): void {
  const s = magnetStore.getState();
  const same =
    s.type === type &&
    (s.target === target ||
      (s.target !== null &&
        target !== null &&
        s.target.axis === target.axis &&
        s.target.line === target.line &&
        s.target.at === target.at &&
        s.target.width === target.width));
  if (!same) magnetStore.setState({ type, target });
}

const pendingPop = new Set<Id>();
/** Opening id → time the swing was asked for; the swing progress follows that clock. */
const pendingSwing = new Map<Id, number>();

/** The next mount of this opening plays the drop-in pop. */
export function markPlaced(id: Id): void {
  pendingPop.add(id);
}

/** The next render of this opening swings its leaf open from closed. */
export function markSwing(id: Id): void {
  pendingSwing.set(id, performance.now());
}

// ---- Label and badge sizes ----------------------------------------------------------------------

/** Label units: screen px on the canvas, `PRINT_UNIT_MM` paper mm each in print. */
const LABEL_FONT = 9;
const LABEL_GAP = 7;
const BADGE_R = 8;
const PRINT_UNIT_MM = 0.25;
const linear = (t: number): number => t;
const ENTER = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/** Content in label units at a world point: CSS `--mmpp` on screen, an explicit scale in print. */
function Fixed({
  ctx,
  transform,
  className,
  style,
  children,
}: {
  ctx: RenderContext;
  transform: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}): ReactElement {
  if (ctx.mode === 'screen') {
    return (
      <g transform={transform} className={className} style={style}>
        <g className="opening-fixed">{children}</g>
      </g>
    );
  }
  return <g transform={`${transform} scale(${printSize(ctx, PRINT_UNIT_MM)})`}>{children}</g>;
}

/** Local x along the wall, local +y toward side +1; a vertical wall swaps both axes. */
const frameOf = (axis: Axis, x: Mm, y: Mm) =>
  axis === 'h' ? `translate(${x} ${y})` : `matrix(0 1 1 0 ${x} ${y})`;

const thicknessOf = (d: OpeningDerived | undefined, fallback: Mm) => d?.run?.thickness ?? fallback;

// ---- Nodes --------------------------------------------------------------------------------------

const OpeningNode = memo(function OpeningNode({
  o,
  d,
  thickness,
  live,
  ctx,
}: {
  o: Opening;
  d: OpeningDerived | undefined;
  thickness: Mm;
  live: boolean;
  ctx: RenderContext;
}): ReactElement | null {
  const animated = ctx.mode === 'screen' && !ctx.reducedMotion;
  const bodyRef = useRef<SVGGElement>(null);
  const [swing, setSwing] = useState(() => (animated && pendingSwing.has(o.id) ? 0 : 1));

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !animated || !pendingPop.delete(o.id)) return;
    animateEl(
      el,
      [
        { transform: 'scale(0.55)', opacity: 0 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: tuning.doorSwing.ms * 0.6, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    );
  }, [o.id, animated]);

  // The swing resumes from the mark time, so an effect re-run (Strict Mode, a re-render) never
  // restarts or strands it; any cancel leaves the leaf open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a flip or a model change replays the swing
  useLayoutEffect(() => {
    if (ctx.mode !== 'screen') return;
    const marked = pendingSwing.get(o.id);
    if (marked === undefined) return;
    const ms = tuning.doorSwing.ms;
    const from = Math.min(1, (performance.now() - marked) / ms);
    if (!animated || from >= 1) {
      pendingSwing.delete(o.id);
      setSwing(1);
      return;
    }
    setSwing(springOut(from));
    const handle = tween(
      ms * (1 - from),
      (u) => {
        setSwing(u >= 1 ? 1 : springOut(from + (1 - from) * u));
        if (u >= 1 && pendingSwing.get(o.id) === marked) pendingSwing.delete(o.id);
      },
      linear,
    );
    return () => {
      handle.cancel();
      setSwing(1);
    };
  }, [o.id, o.hinge, o.side, o.type, o.axis, o.line, animated, ctx.mode]);

  if (!d?.center) return null;
  const { x, y } = d.center;
  const def = openingDef(o.type);

  if (!d.valid) {
    const half = o.width / 2;
    const t2 = thickness / 2;
    const outline = dashedPolyline(
      [
        [-half, -t2],
        [half, -t2],
        [half, t2],
        [-half, t2],
        [-half, -t2],
      ],
      Math.max(30, Math.min(80, o.width / 12)),
    );
    return (
      <g data-opening-id={o.id}>
        <g transform={frameOf(o.axis, x, y)}>
          <path
            d={outline}
            fill="none"
            stroke={ctx.theme.invalid}
            strokeLinecap="round"
            {...strokeProps(ctx, 1.5, 0.2)}
          />
        </g>
        <Fixed ctx={ctx} transform={`translate(${x} ${y})`}>
          <circle r={BADGE_R} fill={ctx.theme.invalid} stroke={ctx.theme.halo} strokeWidth={1.5} />
          <text
            y={BADGE_R * 0.45}
            textAnchor="middle"
            fill={ctx.theme.halo}
            fontSize={12}
            fontWeight={800}
            fontFamily="Inter, sans-serif"
          >
            !
          </text>
        </Fixed>
      </g>
    );
  }

  const half = o.width / 2;
  const t2 = thickness / 2;
  return (
    <g data-opening-id={o.id} transform={frameOf(o.axis, x, y)}>
      {live && ctx.mode === 'screen' ? (
        // Live gestures draw raw wall rects without gaps; this keeps the opening readable.
        <rect x={-half} y={-t2} width={o.width} height={thickness} fill={ctx.theme.halo} />
      ) : null}
      <g ref={bodyRef} className="opening-body">
        {def ? (
          <def.Symbol
            width={o.width}
            thickness={thickness}
            hinge={o.hinge}
            side={o.side}
            swing={swing}
            ctx={ctx}
          />
        ) : null}
      </g>
    </g>
  );
});

/** "80×210" outside the swing side, rotated with vertical walls; fades out when the opening is small on screen. */
function OpeningLabel({
  o,
  d,
  thickness,
  ctx,
}: {
  o: Opening;
  d: OpeningDerived | undefined;
  thickness: Mm;
  ctx: RenderContext;
}): ReactElement | null {
  if (!d?.center || !d.valid) return null;
  const away = -o.side;
  const fx = o.axis === 'v' ? d.center.x + (away * thickness) / 2 : d.center.x;
  const fy = o.axis === 'h' ? d.center.y + (away * thickness) / 2 : d.center.y;
  const transform = `translate(${fx} ${fy})${o.axis === 'v' ? ' rotate(-90)' : ''}`;
  const text = formatOpening(o.width, o.height);
  const ty = away > 0 ? LABEL_GAP + LABEL_FONT * 0.72 : -LABEL_GAP;
  const font = {
    y: ty,
    textAnchor: 'middle' as const,
    fontSize: LABEL_FONT,
    fontWeight: 500,
    fontFamily: ctx.mode === 'screen' ? undefined : 'Inter, sans-serif',
  };
  const style =
    ctx.mode === 'screen'
      ? ({ '--w': o.width, '--min': tuning.lod.openingLabelMinPx } as CSSProperties)
      : undefined;
  return (
    <Fixed
      ctx={ctx}
      transform={transform}
      className={ctx.mode === 'screen' ? 'opening-label' : undefined}
      style={style}
    >
      <text
        {...font}
        className={ctx.mode === 'screen' ? 'scene-text' : undefined}
        fill={ctx.theme.halo}
        stroke={ctx.theme.halo}
        strokeWidth={2.5}
        strokeLinejoin="round"
      >
        {text}
      </text>
      <text
        {...font}
        className={ctx.mode === 'screen' ? 'scene-text' : undefined}
        fill={ctx.theme.openingLabel}
      >
        {text}
      </text>
    </Fixed>
  );
}

/** Compatible walls glow while an opening is placed or dragged; the snapped spot pops. */
function MagnetGlow({ scene }: { scene: Scene }): ReactElement | null {
  const magnet = useStore(magnetStore);
  const tool = useUi((s) => s.tool);
  const pending = useUi((s) => s.pendingOpening);
  const type = magnet.type ?? (tool === 'opening' ? pending : null);
  const targetRef = useRef<SVGRectElement>(null);
  const t = magnet.target;
  const wall = t ? `${t.axis}:${t.line}` : null;
  const lastWall = useRef<string | null>(null);

  useLayoutEffect(() => {
    const prev = lastWall.current;
    lastWall.current = wall;
    const el = targetRef.current;
    if (!el || !wall || wall === prev) return;
    animateEl(
      el,
      [
        { transform: `scale(${tuning.snapTick.scale * 1.2})`, opacity: 0.2 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: tuning.snapTick.ms * 3, easing: ENTER },
    );
  }, [wall]);

  if (!type) return null;
  const runs = compatibleRuns(type, scene.runs).filter(
    (r) => r.end - r.start >= OPENING_SPECS[type].minWidth,
  );
  const host = t ? runs.find((r) => r.axis === t.axis && r.line === t.line) : undefined;
  let target: ReactElement | null = null;
  if (t && host) {
    const c = host.line + host.offset;
    const h = host.thickness / 2 + 20;
    const a = t.at - t.width / 2;
    target = (
      <rect
        ref={targetRef}
        className="magnet-target"
        x={t.axis === 'h' ? a : c - h}
        y={t.axis === 'h' ? c - h : a}
        width={t.axis === 'h' ? t.width : 2 * h}
        height={t.axis === 'h' ? 2 * h : t.width}
        rx={20}
      />
    );
  }
  return (
    <g className="magnet-glow">
      {runs.map((r) => {
        const c = r.line + r.offset;
        const h = r.thickness / 2;
        const on = host === r;
        return (
          <rect
            key={`${r.axis}:${r.line}:${r.start}`}
            className="magnet-run"
            data-on={on ? 'true' : undefined}
            x={r.axis === 'h' ? r.start : c - h}
            y={r.axis === 'h' ? c - h : r.start}
            width={r.axis === 'h' ? r.end - r.start : 2 * h}
            height={r.axis === 'h' ? 2 * h : r.end - r.start}
          />
        );
      })}
      {target}
    </g>
  );
}

/** Door, window and gate symbols on their wall gaps, their size labels and the magnet glow. */
export function OpeningsLayer(): ReactElement | null {
  const { doc, scene, live } = useSceneData();
  const ctx = useRenderContext();
  const screen = ctx.mode === 'screen';
  if (!ctx.layers.openings) return null;
  const fallback = doc.structure.external;
  return (
    <g className="scene-layer layer-openings" pointerEvents="none">
      {screen ? <MagnetGlow scene={scene} /> : null}
      {doc.openings.map((o) => {
        const d = scene.openings.get(o.id);
        return (
          <OpeningNode
            key={o.id}
            o={o}
            d={d}
            thickness={thicknessOf(d, fallback)}
            live={live}
            ctx={ctx}
          />
        );
      })}
      {ctx.mode === 'thumb'
        ? null
        : doc.openings.map((o) => {
            const d = scene.openings.get(o.id);
            return (
              <OpeningLabel
                key={`label:${o.id}`}
                o={o}
                d={d}
                thickness={thicknessOf(d, fallback)}
                ctx={ctx}
              />
            );
          })}
    </g>
  );
}
