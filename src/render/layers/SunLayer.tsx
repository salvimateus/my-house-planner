import { type ReactElement, useId, useLayoutEffect, useMemo, useRef } from 'react';
import {
  deriveSunModel,
  type SunContext,
  type SunModel,
  sunAmbient,
  sunFrame,
} from '../../geometry/sun.ts';
import type { Scene } from '../../geometry/types.ts';
import type { Id, Lot, ProjectDoc } from '../../model/types.ts';
import { catalogLookup } from '../../store/selectors.ts';
import { type SunState, sunStore, useSun } from '../../store/sunStore.ts';
import { useRenderContext } from '../RenderContext.ts';
import { useSceneData } from '../SceneSvg.tsx';
import { type ContextGeom, contextGeometry } from './ContextLayer.tsx';
import { SunPath } from './SunPath.tsx';
import './SunLayer.css';

const SHADOW = '#1C2A4A';
const SHADOW_OPACITY = 0.3;
const LIGHT = '#FFD24D';
const LIGHT_OPACITY = 0.6;

const contextCache = new WeakMap<ContextGeom, SunContext>();

/** Neighbor houses and every street tree drawn around the lot (the user's frontage trees included). */
function sunContextOf(lot: Lot): SunContext {
  const geom = contextGeometry(lot);
  const hit = contextCache.get(geom);
  if (hit) return hit;
  const ctx: SunContext = {
    houses: geom.houses.map((h) => h.body),
    trees: geom.streets.flatMap((g) => g.trees.map((t) => ({ at: t.at, size: t.size }))),
    bounds: geom.bounds,
  };
  contextCache.set(geom, ctx);
  return ctx;
}

const NO_CONTEXT: SunContext = { houses: [], trees: [], bounds: { x0: 0, y0: 0, x1: 0, y1: 0 } };

/** `context` false leaves out the neighborhood casters, as when its layer is hidden. */
export const sunModelOf = (doc: ProjectDoc, scene: Scene, context = true): SunModel =>
  deriveSunModel(doc, scene, catalogLookup, context ? sunContextOf(doc.lot) : NO_CONTEXT);

/** Screen-only sun study: outdoor shadows, sun patches on the floors and the time-of-day tint. */
export function SunLayer(): ReactElement | null {
  const on = useSun((s) => s.on);
  return on ? <SunBody /> : null;
}

function SunBody(): ReactElement {
  const { doc, scene } = useSceneData();
  const context = useRenderContext().layers.context;
  const model = useMemo(() => sunModelOf(doc, scene, context), [doc, scene, context]);
  const northDeg = doc.lot.northDeg;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const shadowGroup = useRef<SVGGElement>(null);
  const shadowPath = useRef<SVGPathElement>(null);
  const tint = useRef<SVGRectElement>(null);
  const patchPaths = useRef(new Map<Id, SVGPathElement>());

  const litRooms = useMemo(() => model.rooms.filter((r) => r.hasGlass), [model]);
  const { x0, y0, x1, y1 } = model.bounds;
  const outsideD = `M${x0} ${y0}H${x1}V${y1}H${x0}Z${model.roofPath}`;

  useLayoutEffect(() => {
    let lastKey = '';
    const apply = (st: SunState) => {
      const key = `${st.date.month}/${st.date.day}/${st.minutes}`;
      if (key === lastKey) return;
      lastKey = key;
      const frame = sunFrame(model, st.date, st.minutes, northDeg);
      const amb = sunAmbient(frame.position.elevation);
      shadowPath.current?.setAttribute('d', frame.shadowD);
      shadowGroup.current?.setAttribute('opacity', String(SHADOW_OPACITY * amb.shadow));
      for (const [id, el] of patchPaths.current) el.setAttribute('d', frame.patches.get(id) ?? '');
      if (tint.current) {
        tint.current.setAttribute('fill', amb.color);
        tint.current.setAttribute('opacity', amb.opacity.toFixed(3));
      }
    };
    apply(sunStore.getState());
    return sunStore.subscribe(apply);
  }, [model, northDeg]);

  return (
    <g className="sun-layer" pointerEvents="none">
      <defs>
        <clipPath id={`${uid}-out`}>
          <path d={outsideD} clipRule="evenodd" />
        </clipPath>
        {litRooms.map((r) => (
          <clipPath key={r.id} id={`${uid}-r-${r.id}`}>
            <path d={r.path} clipRule="evenodd" />
          </clipPath>
        ))}
      </defs>
      <g ref={shadowGroup} clipPath={`url(#${uid}-out)`} opacity={0}>
        <path
          ref={shadowPath}
          className="sun-shadow"
          fill={SHADOW}
          stroke={SHADOW}
          fillRule="nonzero"
        />
      </g>
      {litRooms.map((r) => (
        <g key={r.id} clipPath={`url(#${uid}-r-${r.id})`} opacity={LIGHT_OPACITY}>
          <path
            ref={(el) => {
              if (el) patchPaths.current.set(r.id, el);
              else patchPaths.current.delete(r.id);
            }}
            className="sun-patch"
            fill={LIGHT}
            stroke={LIGHT}
            fillRule="nonzero"
          />
        </g>
      ))}
      <rect ref={tint} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="none" opacity={0} />
      <SunPath lot={doc.lot} />
    </g>
  );
}
