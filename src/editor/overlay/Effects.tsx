import type { ReactElement } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { setEffectsHost } from '../../juice/effects.ts';
import { camera } from '../../store/cameraStore.ts';
import './Effects.css';

/**
 * Screen effects above the overlay: delete bursts in screen px and highlight pulses in world mm.
 * Effects add and remove their own nodes, so this component renders once.
 */
export function Effects(): ReactElement {
  const worldRef = useRef<SVGGElement>(null);
  const screenRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    const world = worldRef.current;
    const screen = screenRef.current;
    if (!world || !screen) return;
    const apply = () => {
      const { cx, cy, zoom, vw, vh } = camera.get();
      world.setAttribute(
        'transform',
        `matrix(${zoom} 0 0 ${zoom} ${vw / 2 - cx * zoom} ${vh / 2 - cy * zoom})`,
      );
    };
    apply();
    const unsubscribe = camera.subscribe(apply);
    setEffectsHost({ world, screen });
    return () => {
      unsubscribe();
      setEffectsHost(null);
      world.replaceChildren();
      screen.replaceChildren();
    };
  }, []);

  return (
    <svg className="fx-layer" aria-hidden="true" focusable="false">
      <g ref={worldRef} />
      <g ref={screenRef} />
    </svg>
  );
}
