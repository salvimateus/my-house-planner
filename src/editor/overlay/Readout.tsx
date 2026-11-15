import type { ReactElement } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { camera } from '../../store/cameraStore.ts';
import { useUi } from '../../store/uiStore.ts';

const OFFSET_X = 16;
const OFFSET_Y = 12;
const MARGIN = 8;

/**
 * Live measure chip from `uiStore.transient.readout`, near the pointer and always inside the view.
 * The chip wraps on narrow screens; its measured size places it after each render.
 */
export function Readout(): ReactElement | null {
  const readout = useUi((s) => s.transient.readout);
  const ref = useRef<HTMLOutputElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !readout) return;
    const { vw, vh } = camera.get();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Above and right of the finger, so the finger does not cover it; flip near the edges.
    let x = readout.x + OFFSET_X;
    if (x + w > vw - MARGIN) x = readout.x - OFFSET_X - w;
    let y = readout.y - OFFSET_Y - h;
    if (y < MARGIN) y = readout.y + OFFSET_Y * 2;
    x = Math.max(MARGIN, Math.min(vw - MARGIN - w, x));
    y = Math.max(MARGIN, Math.min(vh - MARGIN - h, y));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, [readout]);

  if (!readout) return null;
  return (
    <output
      ref={ref}
      className="overlay-readout"
      data-invalid={readout.invalid ? 'true' : undefined}
      style={{ maxWidth: `calc(100% - ${2 * MARGIN}px)` }}
    >
      <span className="overlay-readout-text">{readout.text}</span>
      {readout.sub ? <span className="overlay-readout-sub">{readout.sub}</span> : null}
    </output>
  );
}
