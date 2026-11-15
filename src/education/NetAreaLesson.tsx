import type { ReactElement } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { on } from '../juice/events.ts';
import { tuning } from '../juice/tuning.ts';
import { reducedMotion } from '../juice/tween.ts';
import type { Id } from '../model/types.ts';
import { formatArea } from '../model/units.ts';
import { camera } from '../store/cameraStore.ts';
import { docStore } from '../store/docStore.ts';
import { sceneOf } from '../store/selectors.ts';
import { openWallThickness } from './explainers/WallThickness.tsx';
import { readCount, writeCount } from './storage.ts';

const COUNT_KEY = 'net-lesson-count';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const EXIT = 'cubic-bezier(0.4, 0, 1, 1)';
const EXIT_MS = 220;

interface Lesson {
  seq: number;
  areaId: Id;
  drawn: string;
  walls: string;
  net: string;
}

let activeUntil = 0;

/** Time left on the lesson on screen, so the next coach mark waits for it. */
export const lessonActiveMs = (): number => Math.max(0, activeUntil - performance.now());

const visibleMs = () => {
  const l = tuning.netLesson;
  return l.chipMs + 2 * l.staggerMs + l.holdMs;
};

/** Anchor under the room label, in page px; null when the room is gone. */
function anchorOf(areaId: Id): { x: number; y: number } | null {
  const doc = docStore.getState().doc;
  const d = sceneOf(doc).areas.get(areaId);
  const canvas = document.querySelector('.canvas');
  if (!d || !canvas) return null;
  const c = canvas.getBoundingClientRect();
  const s = camera.worldToScreen({ x: d.label.x, y: d.label.y });
  // The label is two lines around its center; the chips start under the second one.
  const below = Math.max(18, d.label.fit * camera.get().zoom * 1.5);
  return { x: c.left + s.x, y: c.top + s.y + below };
}

/**
 * The net area lesson: on the first rooms, three chips under the room label explain why the
 * usable area is smaller than the drawn one, with a "por quê?" link to the wall explainer.
 */
export function NetAreaLesson(): ReactElement | null {
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let seq = 0;
    return on('room-created', (e) => {
      const area = docStore.getState().doc?.areas.find((a) => a.id === e.areaId);
      if (area?.kind !== 'room') return;
      // Integer hundredths first, so the three chips always add up on screen.
      const gross = Math.round(e.grossArea / 10_000);
      const net = Math.round(e.netArea / 10_000);
      if (gross <= net) return;
      const count = readCount(COUNT_KEY);
      if (count >= tuning.netLesson.rooms) return;
      writeCount(COUNT_KEY, count + 1);
      seq += 1;
      activeUntil = performance.now() + visibleMs() + EXIT_MS;
      setLesson({
        seq,
        areaId: e.areaId,
        drawn: `${formatArea(gross * 10_000)} desenhado`,
        walls: `menos ${formatArea((gross - net) * 10_000)} de paredes`,
        net: `= ${formatArea(net * 10_000)} úteis`,
      });
    });
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !lesson) return;
    const { areaId } = lesson;
    const reposition = () => {
      const p = anchorOf(areaId);
      if (!p) {
        setLesson(null);
        return;
      }
      el.style.transform = `translate(${Math.round(p.x - el.offsetWidth / 2)}px, ${Math.round(p.y)}px)`;
    };
    reposition();
    const offCamera = camera.subscribe(reposition);
    const offDoc = docStore.subscribe((s, prev) => {
      if (s.doc !== prev.doc) reposition();
    });
    window.addEventListener('resize', reposition);

    const anims: Animation[] = [];
    const l = tuning.netLesson;
    const still = reducedMotion();
    if (!still) {
      el.querySelectorAll<HTMLElement>('[data-step]').forEach((chip) => {
        const i = Number(chip.dataset.step);
        anims.push(
          chip.animate(
            [
              { opacity: 0, transform: 'translateY(8px) scale(0.9)' },
              { opacity: 1, transform: 'translateY(0) scale(1)' },
            ],
            { duration: l.chipMs, delay: i * l.staggerMs, easing: SPRING, fill: 'backwards' },
          ),
        );
      });
    }
    let exitTimer = window.setTimeout(() => {
      if (still) {
        setLesson(null);
        return;
      }
      const out = el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: EXIT_MS,
        easing: EXIT,
        fill: 'forwards',
      });
      anims.push(out);
      exitTimer = window.setTimeout(() => setLesson(null), EXIT_MS);
    }, visibleMs());

    return () => {
      window.clearTimeout(exitTimer);
      offCamera();
      offDoc();
      window.removeEventListener('resize', reposition);
      for (const a of anims) a.cancel();
    };
  }, [lesson]);

  useEffect(() => {
    if (!lesson) activeUntil = 0;
  }, [lesson]);

  if (!lesson) return null;
  return (
    <div ref={ref} key={lesson.seq} className="edu-lesson" role="status" aria-live="polite">
      <span className="edu-lesson-chip" data-step={0}>
        {lesson.drawn}
      </span>
      <span className="edu-lesson-chip edu-lesson-walls" data-step={1}>
        {lesson.walls}
      </span>
      <span className="edu-lesson-row" data-step={2}>
        <span className="edu-lesson-chip edu-lesson-net">{lesson.net}</span>
        <button type="button" className="edu-lesson-why" onClick={openWallThickness}>
          por quê?
        </button>
      </span>
    </div>
  );
}
