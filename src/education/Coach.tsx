import { X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OPENING_SPECS } from '../catalog/openingSpecs.ts';
import type { ToolId } from '../editor/tools/types.ts';
import { on } from '../juice/events.ts';
import { tuning } from '../juice/tuning.ts';
import { docStore } from '../store/docStore.ts';
import { uiStore } from '../store/uiStore.ts';
import { lessonActiveMs } from './NetAreaLesson.tsx';
import { markSeen, seen } from './storage.ts';

type CoachId = 'first-room' | 'first-door' | 'first-export' | 'pinch';

interface Mark {
  id: CoachId;
  title: string;
  text: string;
  /** CSS selector of the control the bubble points at; null centers it over the canvas. */
  anchor: string | null;
}

const PINCH_USED = 'pinch-used';
const coachKey = (id: CoachId) => `coach:${id}`;
const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const toolButton = (key: string) => `.tool-btn[aria-keyshortcuts="${key}"]`;
const EXPORT_BUTTON =
  '.topbar-actions .btn-primary, .topbar-actions [aria-label="Exportar PDF ou imagem"]';

function markFor(id: CoachId, tool: ToolId): Mark {
  switch (id) {
    case 'first-room':
      return tool === 'build'
        ? {
            id,
            title: 'Primeiro cômodo',
            text: 'Pressione e arraste no terreno. Solte para criar o cômodo e as paredes.',
            anchor: null,
          }
        : {
            id,
            title: 'Primeiro cômodo',
            text: 'Toque em Cômodo e arraste no terreno para desenhar.',
            anchor: toolButton('R'),
          };
    case 'first-door':
      return tool === 'opening'
        ? {
            id,
            title: 'Agora, uma porta',
            text: 'Escolha um modelo e arraste até uma parede do cômodo.',
            anchor: null,
          }
        : {
            id,
            title: 'Que tal uma porta?',
            text: 'Toque em Portas para colocar portas e janelas nas paredes.',
            anchor: toolButton('O'),
          };
    case 'first-export':
      return {
        id,
        title: 'Pronto para mostrar?',
        text: 'Exporte em PDF para enviar a alguém ou levar a um profissional.',
        anchor: EXPORT_BUTTON,
      };
    case 'pinch':
      return {
        id,
        title: 'Dica',
        text: 'Use dois dedos para mover e aproximar a tela.',
        anchor: null,
      };
  }
}

const GAP = 12;
const GUTTER = 12;

/** Places the bubble next to its anchor: beside a vertical tool rail (on the canvas side), else above or below. */
function place(el: HTMLElement, anchor: string | null): void {
  const vw = document.documentElement.clientWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const target = anchor ? document.querySelector(anchor) : null;
  const r = target?.getBoundingClientRect();
  let left: number;
  let top: number;
  let side: 'top' | 'bottom' | 'right' | 'left' | 'none';
  if (target && r && r.width > 0 && r.height > 0) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const inRail = target.closest('.toolbar[data-orientation="vertical"]') !== null;
    if (inRail && cx > vw / 2) {
      side = 'left';
      left = r.left - GAP - w;
      top = cy - h / 2;
    } else if (inRail || (r.right < vw * 0.25 && r.height < vh * 0.5)) {
      side = 'right';
      left = r.right + GAP;
      top = cy - h / 2;
    } else if (cy > vh / 2) {
      side = 'top';
      left = cx - w / 2;
      top = r.top - GAP - h;
    } else {
      side = 'bottom';
      left = cx - w / 2;
      top = r.bottom + GAP;
    }
    left = Math.max(GUTTER, Math.min(vw - w - GUTTER, left));
    top = Math.max(GUTTER, Math.min(vh - h - GUTTER, top));
    // The arrow keeps pointing at the anchor when the bubble is clamped to the screen.
    el.style.setProperty('--arrow-x', `${Math.round(cx - left)}px`);
    el.style.setProperty('--arrow-y', `${Math.round(Math.min(h - 14, Math.max(14, cy - top)))}px`);
  } else {
    side = 'none';
    const canvas = document.querySelector('.canvas')?.getBoundingClientRect();
    const midX = canvas ? canvas.left + canvas.width / 2 : vw / 2;
    left = Math.max(GUTTER, Math.min(vw - w - GUTTER, midX - w / 2));
    top = Math.max(GUTTER, Math.min(vh - h - GUTTER, (canvas?.top ?? 0) + 64));
  }
  el.dataset.side = side;
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function counts() {
  const doc = docStore.getState().doc;
  if (!doc) return null;
  return {
    rooms: doc.areas.filter((a) => a.kind === 'room').length,
    doors: doc.openings.filter((o) => OPENING_SPECS[o.type].group === 'door').length,
    openings: doc.openings.length,
  };
}

/**
 * Coach marks: the first room, the first door, the first export, and on touch screens a
 * two-finger hint on the first use of the build tool. One bubble at a time; it never blocks the
 * canvas and it goes away once its step is done.
 */
export function Coach(): ReactElement | null {
  const [mark, setMark] = useState<Mark | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = () => performance.now();
    let pinchUntil = 0;
    let doorAt = 0;
    let exportReady = false;
    let startAt = now() + tuning.coach.firstRoomDelayMs;
    const timers = new Set<number>();
    const after = (ms: number, fn: () => void) => {
      const t = window.setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
    };
    const later = (ms: number) => after(ms, evaluate);

    const pick = (): CoachId | null => {
      const c = counts();
      const ui = uiStore.getState();
      if (!c || ui.screen !== 'editor' || docStore.getState().readOnly) return null;
      const t = now();
      if (t < pinchUntil && !seen(PINCH_USED)) return 'pinch';
      if (t < startAt) return null;
      if (!seen(coachKey('first-room'))) return c.rooms === 0 ? 'first-room' : null;
      if (!seen(coachKey('first-door'))) {
        return c.rooms > 0 && c.doors === 0 && t >= doorAt ? 'first-door' : null;
      }
      if (!seen(coachKey('first-export'))) {
        return exportReady && c.rooms >= 2 && c.openings > 0 ? 'first-export' : null;
      }
      return null;
    };

    let shown: string | null = null;
    function evaluate(): void {
      const id = pick();
      const next = id ? markFor(id, uiStore.getState().tool) : null;
      const key = next ? `${next.id}:${next.anchor ?? ''}` : null;
      if (key === shown) return;
      shown = key;
      setMark(next);
    }

    const done = (id: CoachId) => {
      markSeen(coachKey(id));
      evaluate();
    };

    later(tuning.coach.firstRoomDelayMs);
    const offs = [
      on('project-opened', () => {
        startAt = now() + tuning.coach.firstRoomDelayMs;
        later(tuning.coach.firstRoomDelayMs);
      }),
      on('room-created', () => {
        markSeen(coachKey('first-room'));
        const wait = lessonActiveMs() + tuning.coach.nextDelayMs;
        doorAt = now() + wait;
        evaluate();
        later(wait);
      }),
      on('opening-placed', () => {
        if (counts()?.doors) markSeen(coachKey('first-door'));
        if (!exportReady) {
          exportReady = true;
          later(tuning.coach.nextDelayMs);
        }
        evaluate();
      }),
      on('item-placed', () => {
        if (!exportReady) {
          exportReady = true;
          later(tuning.coach.nextDelayMs);
        }
      }),
      on('export-done', () => done('first-export')),
      on('pinch-used', () => {
        markSeen(PINCH_USED);
        evaluate();
      }),
      on('tool-activated', (e) => {
        if (e.tool === 'build' && isCoarse() && !seen(PINCH_USED) && !seen(coachKey('pinch'))) {
          markSeen(coachKey('pinch'));
          const lead = seen('demo:build')
            ? tuning.coach.nextDelayMs
            : tuning.ghostHand.startDelayMs + tuning.ghostHand.loops * tuning.ghostHand.loopMs;
          after(lead, () => {
            pinchUntil = now() + tuning.coach.pinchHoldMs;
            evaluate();
            later(tuning.coach.pinchHoldMs + 20);
          });
        }
        evaluate();
      }),
      on('tutorial-requested', () => {
        exportReady = false;
        evaluate();
      }),
    ];
    const offDoc = docStore.subscribe((s, prev) => {
      if (s.doc?.areas !== prev.doc?.areas || s.doc?.openings !== prev.doc?.openings) evaluate();
    });
    const offUi = uiStore.subscribe((s, prev) => {
      if (s.dialog === 'export' && prev.dialog !== 'export') done('first-export');
      else if (s.screen !== prev.screen) evaluate();
    });
    return () => {
      for (const off of offs) off();
      offDoc();
      offUi();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !mark) return;
    const anchor = mark.anchor;
    const reposition = () => place(el, anchor);
    reposition();
    window.addEventListener('resize', reposition);
    const ro = new ResizeObserver(reposition);
    ro.observe(document.body);
    // The rail moves when the side panel is resized; the stage width tracks that.
    const stage = document.querySelector('.shell-stage');
    if (stage) ro.observe(stage);
    return () => {
      window.removeEventListener('resize', reposition);
      ro.disconnect();
    };
  }, [mark]);

  if (!mark) return null;
  return (
    <div
      ref={ref}
      key={mark.id}
      className="edu-coach"
      role="status"
      aria-live="polite"
      data-side="none"
    >
      <p className="edu-coach-title">{mark.title}</p>
      <p className="edu-coach-text">{mark.text}</p>
      <button
        type="button"
        className="edu-coach-close"
        aria-label="Fechar dica"
        title="Fechar dica"
        onClick={() => {
          markSeen(coachKey(mark.id));
          if (mark.id === 'pinch') markSeen(PINCH_USED);
          setMark(null);
        }}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}
