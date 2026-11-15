import type { ReactElement } from 'react';
import { camera } from '../../store/cameraStore.ts';
import { useUi } from '../../store/uiStore.ts';

const OFFSET_X = 16;
const OFFSET_Y = 52;
const MARGIN = 8;
const EST_WIDTH = 132;

/** Live measure chip from `uiStore.transient.readout`, kept near the pointer and inside the view. */
export function Readout(): ReactElement | null {
  const readout = useUi((s) => s.transient.readout);
  if (!readout) return null;
  const { vw, vh } = camera.get();
  // Above and right of the finger, so the finger does not cover it; flip near the edges.
  let x = readout.x + OFFSET_X;
  if (x + EST_WIDTH > vw - MARGIN) x = readout.x - OFFSET_X - EST_WIDTH;
  let y = readout.y - OFFSET_Y;
  if (y < MARGIN) y = readout.y + OFFSET_Y / 2;
  x = Math.max(MARGIN, Math.min(vw - MARGIN - EST_WIDTH, x));
  y = Math.max(MARGIN, Math.min(vh - MARGIN - 40, y));
  return (
    <output
      className="overlay-readout"
      data-invalid={readout.invalid ? 'true' : undefined}
      style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }}
    >
      <span className="overlay-readout-text">{readout.text}</span>
      {readout.sub ? <span className="overlay-readout-sub">{readout.sub}</span> : null}
    </output>
  );
}
