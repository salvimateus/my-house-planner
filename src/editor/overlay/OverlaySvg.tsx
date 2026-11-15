import type { ReactElement } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { regionPath } from '../../geometry/shape.ts';
import { WalkwaySelection } from '../../render/layers/WalkwaysLayer.tsx';
import { type RenderContext, RenderContextProvider } from '../../render/RenderContext.ts';
import { camera } from '../../store/cameraStore.ts';
import { useDoc } from '../../store/docStore.ts';
import { useScene } from '../../store/selectors.ts';
import { useUi } from '../../store/uiStore.ts';
import { marqueeStore } from '../tools/select.ts';
import { FrontageOutline } from './FrontageOutline.tsx';
import { Ghost } from './Ghost.tsx';
import { Guides } from './Guides.tsx';
import { Handles } from './Handles.tsx';
import { Readout } from './Readout.tsx';
import './Overlay.css';
import './FrontageOutline.css';

/** Stripe pitch of the carve hatch, in screen px. */
const HATCH_PX = 9;

/**
 * Editor marks above the scene: selection outline and ghost in a world group that follows the
 * live camera, then guides, marquee and handles in screen px, then the readout chip. The
 * overlay never takes pointer events; the input router owns them.
 */
export function OverlaySvg({ ctx }: { ctx: RenderContext }): ReactElement {
  const worldRef = useRef<SVGGElement>(null);
  const hatchRef = useRef<SVGPatternElement>(null);

  useLayoutEffect(() => {
    const g = worldRef.current;
    const hatch = hatchRef.current;
    if (!g) return;
    let hatchZoom = 0;
    const apply = () => {
      const { cx, cy, zoom, vw, vh } = camera.get();
      g.setAttribute(
        'transform',
        `matrix(${zoom} 0 0 ${zoom} ${vw / 2 - cx * zoom} ${vh / 2 - cy * zoom})`,
      );
      // The hatch is used in world mm; this scale keeps its stripes a constant size on screen.
      if (hatch && zoom !== hatchZoom) {
        hatchZoom = zoom;
        hatch.setAttribute('patternTransform', `scale(${1 / zoom}) rotate(45)`);
      }
    };
    apply();
    return camera.subscribe(apply);
  }, []);

  return (
    <div className="overlay" aria-hidden="true">
      <svg className="overlay-svg" focusable="false" aria-hidden="true">
        <defs>
          <pattern
            ref={hatchRef}
            id="casinha-carve-hatch"
            patternUnits="userSpaceOnUse"
            width={HATCH_PX}
            height={HATCH_PX}
          >
            <rect className="overlay-hatch-bg" width={HATCH_PX} height={HATCH_PX} />
            <rect className="overlay-hatch-line" width={HATCH_PX} height={2.5} />
          </pattern>
        </defs>
        <RenderContextProvider value={ctx}>
          <g ref={worldRef}>
            <SelectionOutline />
            <Ghost />
          </g>
          <Guides />
          <Marquee />
          <Handles />
        </RenderContextProvider>
      </svg>
      <Readout />
    </div>
  );
}

/** Outline of the selected thing, in world mm with a non-scaling stroke. */
function SelectionOutline(): ReactElement | null {
  const sel = useUi((s) => s.selection);
  const doc = useDoc((s) => s.doc);
  const scene = useScene();
  if (!sel || !doc) return null;
  const ns = 'non-scaling-stroke';

  switch (sel.kind) {
    case 'area': {
      const a = doc.areas.find((x) => x.id === sel.id);
      if (!a) return null;
      return (
        <path
          key={sel.id}
          className="overlay-sel overlay-sel-area"
          d={regionPath(a.shape)}
          fillRule="evenodd"
          vectorEffect={ns}
        />
      );
    }
    case 'wall': {
      const rects = [...scene.wallRects, ...scene.boundaryRects].filter(
        (r) => r.segId === sel.segmentId,
      );
      return (
        <g key={sel.segmentId} className="overlay-sel overlay-sel-wall">
          {rects.map((r) => (
            <rect
              key={`${r.x0},${r.y0}`}
              x={r.x0}
              y={r.y0}
              width={r.x1 - r.x0}
              height={r.y1 - r.y0}
              vectorEffect={ns}
            />
          ))}
        </g>
      );
    }
    case 'lot':
      return (
        <rect
          className="overlay-sel overlay-sel-lot"
          x={0}
          y={0}
          width={doc.lot.width}
          height={doc.lot.depth}
          vectorEffect={ns}
        />
      );
    case 'item': {
      const ids = new Set(sel.ids);
      return (
        <g className="overlay-sel overlay-sel-item">
          {doc.items
            .filter((i) => ids.has(i.id))
            .map((i) => (
              <rect
                key={i.id}
                x={-i.w / 2}
                y={-i.d / 2}
                width={i.w}
                height={i.d}
                transform={`translate(${i.x} ${i.y}) rotate(${i.rotation})`}
                vectorEffect={ns}
              />
            ))}
        </g>
      );
    }
    case 'opening': {
      return (
        <g className="overlay-sel overlay-sel-item">
          {sel.ids.map((id) => {
            const g = scene.openings.get(id)?.gap;
            return g ? (
              <rect
                key={id}
                x={g.x0}
                y={g.y0}
                width={g.x1 - g.x0}
                height={g.y1 - g.y0}
                vectorEffect={ns}
              />
            ) : null;
          })}
        </g>
      );
    }
    case 'street-tree':
    case 'sidewalk-ramp':
      return <FrontageOutline sel={sel} lot={doc.lot} />;
    case 'walkway': {
      const w = doc.walkways.find((x) => x.id === sel.id);
      return w ? <WalkwaySelection key={w.id} walkway={w} /> : null;
    }
    case 'ruler':
      return (
        <g className="overlay-sel overlay-sel-ruler">
          {sel.ids.map((id) => {
            const r = scene.rulers.get(id);
            return r ? (
              <line key={id} x1={r.a.x} y1={r.a.y} x2={r.b.x} y2={r.b.y} vectorEffect={ns} />
            ) : null;
          })}
        </g>
      );
  }
}

function Marquee(): ReactElement | null {
  const box = useStore(marqueeStore, (s) => s.box);
  if (!box) return null;
  const x = Math.min(box.x0, box.x1);
  const y = Math.min(box.y0, box.y1);
  return (
    <rect
      className="overlay-marquee"
      x={x}
      y={y}
      width={Math.abs(box.x1 - box.x0)}
      height={Math.abs(box.y1 - box.y0)}
    />
  );
}
