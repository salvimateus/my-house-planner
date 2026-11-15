import { ChevronDown, ChevronUp, SlidersHorizontal, Sofa, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../juice/tween.ts';
import { type SheetSnap, uiStore, useUi } from '../store/uiStore.ts';
import { IconButton } from './controls/IconButton.tsx';
import { PanelBody, panelHint, panelTitle } from './SidePanel.tsx';
import './BottomSheet.css';

const SNAPS: SheetSnap[] = ['peek', 'half', 'full'];

/**
 * Phone sheet built on CSS scroll snap. One full-height scroller sits over the canvas with
 * `pointer-events: none`; only the sheet panel takes touches, so the empty part above it lets
 * gestures reach the canvas. Dragging the sheet scrolls the whole scroller between snap markers.
 */
export function BottomSheet(): ReactElement {
  const sheet = useUi((s) => s.sheet);
  const selection = useUi((s) => s.selection);
  const tool = useUi((s) => s.tool);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Record<SheetSnap, HTMLDivElement | null>>({
    peek: null,
    half: null,
    full: null,
  });
  const hidden = sheet.id === null;
  // Keeps the last content during the exit slide.
  const [shownId, setShownId] = useState(sheet.id);
  if (sheet.id !== null && sheet.id !== shownId) setShownId(sheet.id);

  const offsetOf = (snap: SheetSnap) => markerRefs.current[snap]?.offsetTop ?? 0;

  const nearestSnap = (): SheetSnap => {
    const top = scrollerRef.current?.scrollTop ?? 0;
    if (top >= offsetOf('full') - 1) return 'full';
    let best: SheetSnap = 'peek';
    let dist = Number.POSITIVE_INFINITY;
    for (const s of SNAPS) {
      const d = Math.abs(offsetOf(s) - top);
      if (d < dist) {
        dist = d;
        best = s;
      }
    }
    return best;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the snap helpers only read refs.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || hidden) return;
    if (nearestSnap() === sheet.snap) return;
    el.scrollTo({ top: offsetOf(sheet.snap), behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [sheet.snap, sheet.id, hidden]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the snap helpers only read refs.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onEnd = () => {
      const ui = uiStore.getState();
      if (ui.sheet.id === null) return;
      const snap = nearestSnap();
      if (snap !== ui.sheet.snap) ui.setSheet(ui.sheet.id, snap);
    };
    el.addEventListener('scrollend', onEnd);
    return () => el.removeEventListener('scrollend', onEnd);
  }, []);

  useEffect(() => {
    if (hidden) scrollerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [hidden]);

  const expanded = sheet.snap !== 'peek';
  const title = panelTitle(shownId, selection);
  const hint = panelHint(shownId);

  return (
    <div
      ref={scrollerRef}
      className="sheet-scroller"
      data-hidden={hidden ? 'true' : undefined}
      aria-hidden={hidden ? true : undefined}
    >
      <div className="sheet-track">
        <div
          className="sheet-snap sheet-snap-peek"
          ref={(el) => {
            markerRefs.current.peek = el;
          }}
        />
        <div
          className="sheet-snap sheet-snap-half"
          ref={(el) => {
            markerRefs.current.half = el;
          }}
        />
        <div
          className="sheet-snap sheet-snap-full"
          ref={(el) => {
            markerRefs.current.full = el;
          }}
        />
        <section className="sheet-panel" aria-label={title} inert={hidden}>
          <div className="sheet-handle" aria-hidden="true" />
          <header className="sheet-head">
            <button
              type="button"
              className="sheet-toggle"
              aria-expanded={expanded}
              onClick={() => {
                const ui = uiStore.getState();
                ui.setSheet(ui.sheet.id, expanded ? 'peek' : 'half');
              }}
            >
              <span className="sheet-title">{title}</span>
              {expanded ? (
                <ChevronDown className="sheet-chevron" aria-hidden="true" />
              ) : (
                <ChevronUp className="sheet-chevron" aria-hidden="true" />
              )}
              <span className="sr-only">{expanded ? 'Recolher painel' : 'Abrir painel'}</span>
            </button>
            {shownId === 'catalog' && selection?.kind === 'item' ? (
              <button
                type="button"
                className="sheet-switch"
                onClick={() => uiStore.getState().setSheet('inspector', 'half')}
              >
                <SlidersHorizontal aria-hidden="true" />
                Ajustar
              </button>
            ) : null}
            {shownId === 'inspector' && tool === 'item' ? (
              <button
                type="button"
                className="sheet-switch"
                onClick={() => {
                  const ui = uiStore.getState();
                  ui.setSheet('catalog', ui.sheet.snap);
                }}
              >
                <Sofa aria-hidden="true" />
                Objetos
              </button>
            ) : null}
            <IconButton
              label="Fechar painel"
              icon={<X />}
              onClick={() => {
                const ui = uiStore.getState();
                if (ui.sheet.id === 'inspector') ui.select(null);
                ui.setSheet(null);
              }}
            />
          </header>
          <div className="sheet-body">
            {hint ? <p className="sheet-hint">{hint}</p> : null}
            {shownId === null ? null : <PanelBody key={shownId} id={shownId} />}
          </div>
        </section>
      </div>
    </div>
  );
}
