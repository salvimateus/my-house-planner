import type { KeyboardEvent, PointerEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import './PanelResizer.css';

const KEY = 'casinha:panelWidth';
export const PANEL_MIN = 280;
export const PANEL_MAX = 560;
export const PANEL_DEFAULT = 320;
const KEY_STEP = 16;
/** Width of the tool rail between the canvas and the panel. */
const RAIL_W = 72;

const clamp = (w: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));

function readWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? clamp(v) : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

function writeWidth(w: number): void {
  try {
    localStorage.setItem(KEY, String(w));
  } catch {
    // Storage blocked: the width lasts for this session only.
  }
}

/**
 * Width lives in CSS variables on :root, so the shell grid and floating UI (toasts, banners)
 * follow it without a React render. The canvas adapts through its own ResizeObserver; the camera
 * keeps its world center, so the plan stays put while the panel changes.
 */
function applyWidth(w: number): void {
  const root = document.documentElement.style;
  root.setProperty('--panel-w', `${w}px`);
  root.setProperty('--shell-side-w', `${w + RAIL_W}px`);
}

export function PanelResizer(): ReactElement {
  const [width, setWidth] = useState(readWidth);
  const drag = useRef<{ x: number; w: number; next: number; raf: number } | null>(null);

  useEffect(() => {
    applyWidth(width);
  }, [width]);

  useEffect(
    () => () => {
      const root = document.documentElement.style;
      root.removeProperty('--panel-w');
      root.removeProperty('--shell-side-w');
      root.removeProperty('cursor');
      if (drag.current) cancelAnimationFrame(drag.current.raf);
    },
    [],
  );

  const commit = (w: number) => {
    const next = clamp(w);
    applyWidth(next);
    setWidth(next);
    writeWidth(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: width, next: width, raf: 0 };
    e.currentTarget.dataset.dragging = 'true';
    document.documentElement.style.setProperty('cursor', 'col-resize');
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // The panel is on the right: moving left widens it.
    d.next = clamp(d.w + (d.x - e.clientX));
    if (d.raf) return;
    d.raf = requestAnimationFrame(() => {
      d.raf = 0;
      applyWidth(d.next);
    });
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    drag.current = null;
    delete e.currentTarget.dataset.dragging;
    document.documentElement.style.removeProperty('cursor');
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    commit(d.next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = width + KEY_STEP;
    else if (e.key === 'ArrowRight') next = width - KEY_STEP;
    else if (e.key === 'Home') next = PANEL_MIN;
    else if (e.key === 'End') next = PANEL_MAX;
    else if (e.key === 'Enter') next = PANEL_DEFAULT;
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot take focus or pointer drags; a focusable separator is the ARIA window splitter pattern.
    <div
      className="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura do painel"
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuetext={`${width} pixels`}
      title="Arraste para mudar a largura do painel. Clique duas vezes para voltar ao padrão."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => commit(PANEL_DEFAULT)}
      onKeyDown={onKeyDown}
    >
      <span className="panel-resizer-grip" aria-hidden="true" />
    </div>
  );
}
