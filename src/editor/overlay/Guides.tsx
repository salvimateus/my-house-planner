import type { ReactElement } from 'react';
import { useEffect, useReducer } from 'react';
import { camera } from '../../store/cameraStore.ts';
import { useUi } from '../../store/uiStore.ts';

/** Re-render on every camera change, only while `active`: for the few screen-space overlay marks. */
export function useCameraFrame(active: boolean): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => (active ? camera.subscribe(bump) : undefined), [active]);
}

/** Snap and alignment guides from `uiStore.transient.guides`, as dashed lines across the view. */
export function Guides(): ReactElement | null {
  const guides = useUi((s) => s.transient.guides);
  useCameraFrame(guides.length > 0);
  if (guides.length === 0) return null;
  const { vw, vh } = camera.get();
  const unique = [...new Map(guides.map((g) => [`${g.axis}${g.at}`, g])).values()];
  return (
    <g className="overlay-guides">
      {unique.map((g) => {
        const p = camera.worldToScreen(g.axis === 'x' ? { x: g.at, y: 0 } : { x: 0, y: g.at });
        return g.axis === 'x' ? (
          <line key={`x${g.at}`} x1={p.x} y1={0} x2={p.x} y2={vh} />
        ) : (
          <line key={`y${g.at}`} x1={0} y1={p.y} x2={vw} y2={p.y} />
        );
      })}
    </g>
  );
}
