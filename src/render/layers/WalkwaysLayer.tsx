import { Check, Undo2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { memo, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { darken, lighten, mono, rrect } from '../../catalog/symbolKit.ts';
import { insertMarkers } from '../../editor/select/walkway.ts';
import {
  cancelWalkwayDraft,
  finishWalkwayDraft,
  nextWalkwayLook,
  undoWalkwayPoint,
  walkwayDraftStore,
} from '../../editor/tools/walkway.ts';
import {
  type Pt,
  STONE_LENGTH,
  stationsAtPitch,
  stoneStations,
  walkwayCurve,
  walkwayLength,
  walkwayOutline,
  walkwayPathD,
} from '../../geometry/walkway.ts';
import { createWalkway } from '../../model/factories.ts';
import type { Vec, Walkway } from '../../model/types.ts';
import { formatLength } from '../../model/units.ts';
import { camera } from '../../store/cameraStore.ts';
import { useDoc } from '../../store/docStore.ts';
import { useUi } from '../../store/uiStore.ts';
import { Button } from '../../ui/controls/Button.tsx';
import type { RenderContext } from '../RenderContext.ts';
import { useRenderContext } from '../RenderContext.ts';
import { useSceneData } from '../SceneSvg.tsx';
import { SCENE_THEME } from '../theme.ts';
import './WalkwaysLayer.css';

const SHADOW = { dx: 30, dy: 45, fill: '#000000', opacity: 0.12 } as const;
const STONE_RADIUS = 70;
const JOINT_PITCH = 1200;
const GRAVEL_STEP = 110;

/** Small deterministic PRNG (mulberry32), seeded per walkway so the texture never flickers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const n1 = (v: number): number => Math.round(v * 10) / 10;

/** Rotated ellipse as a path, so many pebbles share one `<path>`. */
function ellipseD(cx: number, cy: number, rx: number, ry: number, angle: number): string {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const deg = n1((angle * 180) / Math.PI);
  const a = `${n1(cx + rx * c)} ${n1(cy + rx * s)}`;
  const b = `${n1(cx - rx * c)} ${n1(cy - rx * s)}`;
  const arc = `A${n1(rx)} ${n1(ry)} ${deg} 1 1`;
  return `M${a}${arc} ${b}${arc} ${a}Z`;
}

function pointsD(pts: Pt[]): string {
  if (pts.length === 0) return '';
  return `M${pts.map((p) => `${n1(p.x)} ${n1(p.y)}`).join('L')}Z`;
}

function SteppingStones({ w, ctx }: { w: Walkway; ctx: RenderContext }): ReactElement {
  const detailed = ctx.mode !== 'thumb';
  const art = useMemo(() => {
    const rand = rng(hash(w.id));
    const stations = stoneStations(w.points);
    const tones = ['', '', ''];
    let shadow = '';
    let light = '';
    let pores = '';
    stations.forEach((st, i) => {
      // A small twist per stone: laid by hand, not by machine.
      const twist = (rand() - 0.5) * 0.12;
      const angle = st.angle + twist;
      const body = rrect(st.x, st.y, STONE_LENGTH, w.width, STONE_RADIUS, angle);
      tones[(i * 7 + Math.floor(rand() * 3)) % 3] += body;
      shadow += rrect(
        st.x + SHADOW.dx,
        st.y + SHADOW.dy,
        STONE_LENGTH,
        w.width,
        STONE_RADIUS,
        angle,
      );
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      light += rrect(
        st.x - 14 * ux + 18 * uy,
        st.y - 14 * uy - 18 * ux,
        STONE_LENGTH - 110,
        w.width - 110,
        STONE_RADIUS * 0.7,
        angle,
      );
      for (let k = 0; k < 6; k++) {
        const a = (rand() - 0.5) * (STONE_LENGTH - 90);
        const b = (rand() - 0.5) * (w.width - 90);
        const r = 5 + rand() * 6;
        pores += ellipseD(st.x + a * ux - b * uy, st.y + a * uy + b * ux, r, r * 0.8, rand() * 3);
      }
    });
    return { tones, shadow, light, pores };
  }, [w.id, w.points, w.width]);

  const base = w.color;
  const fills = [base, darken(base, 0.06), lighten(base, 0.06)].map((c) => mono(ctx, c));
  const edge = mono(ctx, darken(base, 0.3));
  return (
    <>
      {ctx.mode === 'screen' ? (
        <path d={art.shadow} fill={SHADOW.fill} fillOpacity={SHADOW.opacity} />
      ) : null}
      {art.tones.map((d, i) =>
        d ? (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: three fixed tone slots
            key={i}
            d={d}
            fill={fills[i]}
            stroke={edge}
            strokeWidth={detailed ? 12 : 20}
            strokeLinejoin="round"
          />
        ) : null,
      )}
      {detailed ? (
        <>
          <path d={art.light} fill={mono(ctx, lighten(base, 0.14))} fillOpacity={0.5} />
          <path d={art.pores} fill={mono(ctx, darken(base, 0.24))} fillOpacity={0.45} />
        </>
      ) : null}
    </>
  );
}

function SolidPath({ w, ctx }: { w: Walkway; ctx: RenderContext }): ReactElement {
  const detailed = ctx.mode !== 'thumb';
  const d = walkwayPathD(w.points);
  const joints = useMemo(() => {
    let out = '';
    const half = w.width / 2 - 6;
    for (const st of stationsAtPitch(walkwayCurve(w.points), JOINT_PITCH, JOINT_PITCH)) {
      const nx = -Math.sin(st.angle) * half;
      const ny = Math.cos(st.angle) * half;
      out += `M${n1(st.x + nx)} ${n1(st.y + ny)}L${n1(st.x - nx)} ${n1(st.y - ny)}`;
    }
    return out;
  }, [w.points, w.width]);
  const base = w.color;
  const round = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <>
      {ctx.mode === 'screen' ? (
        <path
          d={d}
          {...round}
          stroke={SHADOW.fill}
          strokeOpacity={SHADOW.opacity}
          strokeWidth={w.width + 20}
          transform={`translate(${SHADOW.dx} ${SHADOW.dy})`}
        />
      ) : null}
      <path d={d} {...round} stroke={mono(ctx, darken(base, 0.24))} strokeWidth={w.width + 44} />
      <path d={d} {...round} stroke={mono(ctx, base)} strokeWidth={w.width} />
      {detailed ? (
        <>
          <path
            d={d}
            {...round}
            stroke={mono(ctx, lighten(base, 0.1))}
            strokeOpacity={0.55}
            strokeWidth={w.width * 0.55}
          />
          {joints ? (
            <path
              d={joints}
              fill="none"
              stroke={mono(ctx, darken(base, 0.2))}
              strokeWidth={10}
              strokeLinecap="round"
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function GravelPath({ w, ctx }: { w: Walkway; ctx: RenderContext }): ReactElement {
  const detailed = ctx.mode !== 'thumb';
  const d = walkwayPathD(w.points);
  const pebbles = useMemo(() => {
    const rand = rng(hash(w.id) ^ 0x9e3779b9);
    const tones = ['', '', ''];
    const curve = walkwayCurve(w.points);
    const reach = w.width / 2 - 30;
    for (const st of stationsAtPitch(curve, GRAVEL_STEP)) {
      const ux = Math.cos(st.angle);
      const uy = Math.sin(st.angle);
      for (let k = 0; k < 5; k++) {
        const a = (rand() - 0.5) * GRAVEL_STEP;
        const b = (rand() * 2 - 1) * reach;
        const rx = 9 + rand() * 10;
        tones[Math.floor(rand() * 3)] += ellipseD(
          st.x + a * ux - b * uy,
          st.y + a * uy + b * ux,
          rx,
          rx * (0.6 + rand() * 0.35),
          rand() * Math.PI,
        );
      }
    }
    return tones;
  }, [w.id, w.points, w.width]);
  const base = w.color;
  const round = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const pebbleFills = [darken(base, 0.2), lighten(base, 0.22), darken(base, 0.38)];
  return (
    <>
      <path d={d} {...round} stroke={mono(ctx, darken(base, 0.42))} strokeWidth={w.width + 36} />
      <path d={d} {...round} stroke={mono(ctx, base)} strokeWidth={w.width} />
      {detailed
        ? pebbles.map((p, i) =>
            p ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: three fixed tone slots
              <path key={i} d={p} fill={mono(ctx, pebbleFills[i]!)} fillOpacity={0.8} />
            ) : null,
          )
        : null}
    </>
  );
}

/** One walkway in its style. Print-safe: hex colors, explicit numbers, leaf opacities only. */
export const WalkwayShape = memo(function WalkwayShape({
  walkway,
  ctx,
}: {
  walkway: Walkway;
  ctx: RenderContext;
}): ReactElement | null {
  if (walkway.points.length < 2) return null;
  return (
    <g data-walkway-id={walkway.id}>
      {walkway.style === 'stepping' ? (
        <SteppingStones w={walkway} ctx={ctx} />
      ) : walkway.style === 'solid' ? (
        <SolidPath w={walkway} ctx={ctx} />
      ) : (
        <GravelPath w={walkway} ctx={ctx} />
      )}
    </g>
  );
});

/** Garden walkways above the areas and the grid, below walls and items. */
export function WalkwaysLayer(): ReactElement | null {
  const { doc } = useSceneData();
  const ctx = useRenderContext();
  const screen = ctx.mode === 'screen';
  const shown = ctx.layers.items && doc.walkways.length > 0;
  if (!shown && !screen) return null;
  return (
    <g className="scene-layer layer-walkways">
      {shown ? doc.walkways.map((w) => <WalkwayShape key={w.id} walkway={w} ctx={ctx} />) : null}
      {screen ? <WalkwayDraftLayer ctx={ctx} /> : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Drawing: ghost and the floating pill (editor canvas only)

const DRAFT_ID = 'walkway-draft';

function WalkwayDraftLayer({ ctx }: { ctx: RenderContext }): ReactElement | null {
  const draft = useStore(walkwayDraftStore, (s) => s.draft);
  const anchor = useRef<SVGGElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    setHost(anchor.current?.closest<HTMLElement>('.canvas') ?? null);
  }, []);

  const ghost = useMemo<Walkway | null>(() => {
    if (!draft) return null;
    const pts = draft.hover ? [...draft.points, draft.hover] : draft.points;
    if (pts.length < 2) return null;
    return { ...createWalkway(pts, nextWalkwayLook()), id: DRAFT_ID };
  }, [draft]);

  return (
    <g ref={anchor} className="walkway-draft" pointerEvents="none">
      {ghost ? (
        <>
          <g className="walkway-draft-body">
            <WalkwayShape walkway={ghost} ctx={ctx} />
          </g>
          <path className="walkway-draft-line" d={walkwayPathD(ghost.points)} />
        </>
      ) : null}
      {draft?.points.map((p, i) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: points only append or pop at the end
          key={`${p.x},${p.y},${i}`}
          className="walkway-draft-dot"
          data-last={i === draft.points.length - 1 && draft.points.length > 1 ? 'true' : undefined}
          cx={p.x}
          cy={p.y}
        />
      ))}
      {draft && host ? createPortal(<WalkwayDrawPill points={draft.points} />, host) : null}
    </g>
  );
}

function WalkwayDrawPill({ points }: { points: Vec[] }): ReactElement {
  const count = points.length;
  const length = count >= 2 ? walkwayLength(points) : 0;
  const status =
    count === 0
      ? 'Nenhum ponto ainda'
      : `${count} ${count === 1 ? 'ponto' : 'pontos'}${count >= 2 ? ` · ${formatLength(length)}` : ''}`;
  return (
    <div className="walkway-pill" role="toolbar" aria-label="Desenhar caminho no jardim">
      <div className="walkway-pill-text">
        <p className="walkway-pill-hint">
          Toque para marcar o caminho. Toque duas vezes para terminar.
        </p>
        <p className="walkway-pill-status num" aria-live="polite">
          {status}
        </p>
      </div>
      <div className="walkway-pill-actions">
        <Button
          variant="ghost"
          className="walkway-pill-undo"
          icon={<Undo2 />}
          aria-label="Apagar o último ponto"
          title="Apagar o último ponto"
          disabled={count === 0}
          onClick={() => undoWalkwayPoint()}
        />
        <Button variant="secondary" icon={<X />} onClick={() => cancelWalkwayDraft()}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          icon={<Check />}
          disabled={count < 2}
          onClick={() => finishWalkwayDraft()}
        >
          Concluir
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selection outline (overlay, screen px sizes)

const subscribeCamera = (fn: () => void) => camera.subscribe(fn);
const cameraZoom = () => camera.get().zoom;

/** Outline of the selected walkway and the "+" markers that add a point in each segment. */
export function WalkwaySelection({ walkway }: { walkway: Walkway }): ReactElement {
  const zoom = useSyncExternalStore(subscribeCamera, cameraZoom);
  const tool = useUi((s) => s.tool);
  const readOnly = useDoc((s) => s.readOnly);
  const items = useUi((s) => s.layers.items);
  const editable = tool === 'select' && !readOnly && items.visible && !items.locked;
  const outline = useMemo(
    () => pointsD(walkwayOutline(walkway.points, walkway.width + 60)),
    [walkway.points, walkway.width],
  );
  const markers = editable ? insertMarkers(walkway.points, zoom) : [];
  const r = 9 / zoom;
  const arm = 4.5 / zoom;
  return (
    <g className="overlay-sel-walkway">
      <path className="overlay-sel" d={outline} vectorEffect="non-scaling-stroke" />
      <path
        className="walkway-sel-line"
        d={walkwayPathD(walkway.points)}
        vectorEffect="non-scaling-stroke"
      />
      {markers.map((m) => (
        <g key={m.index} className="walkway-sel-insert">
          <circle cx={m.at.x} cy={m.at.y} r={r} vectorEffect="non-scaling-stroke" />
          <path
            d={`M${m.at.x - arm} ${m.at.y}H${m.at.x + arm}M${m.at.x} ${m.at.y - arm}V${m.at.y + arm}`}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Catalog card preview

const PREVIEW_W = 3000;
const PREVIEW_H = 2250;
const PREVIEW_PATH: Walkway = {
  ...createWalkway(
    [
      { x: 250, y: 1700 },
      { x: 1100, y: 1750 },
      { x: 1900, y: 900 },
      { x: 2750, y: 600 },
    ],
    { width: 560, style: 'stepping' },
  ),
  id: 'catalog-preview',
};
const PREVIEW_CTX: RenderContext = {
  mode: 'screen',
  theme: SCENE_THEME,
  print: null,
  layers: {
    grid: false,
    context: false,
    textures: true,
    items: true,
    openings: false,
    measures: false,
  },
  reducedMotion: true,
};

/** A curved stepping path on grass, for the "Caminho no jardim" catalog card. */
export const WalkwayPreview = memo(function WalkwayPreview({
  className,
}: {
  className?: string;
}): ReactElement {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={PREVIEW_W} height={PREVIEW_H} rx={220} fill="#9BC67A" />
      <path
        d="M250 420c420-130 760 100 1100-30M1750 1950c360-100 700 50 1100-50M2150 1080c260-70 440 20 640-25"
        fill="none"
        stroke="#86B566"
        strokeWidth={50}
        strokeLinecap="round"
      />
      <SteppingStones w={PREVIEW_PATH} ctx={PREVIEW_CTX} />
    </svg>
  );
});
