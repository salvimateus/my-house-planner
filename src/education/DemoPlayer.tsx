import type { ReactElement } from 'react';
import { useEffect, useRef } from 'react';
import { on } from '../juice/events.ts';
import { tuning } from '../juice/tuning.ts';
import { reducedMotion } from '../juice/tween.ts';
import { camera } from '../store/cameraStore.ts';
import { DEMO_TOOLS, type DemoPlan, type DemoTool, type HandKey, planDemo } from './demos.ts';
import { markSeen, seen } from './storage.ts';

const STATE = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** Lucide "pointer" drawn at 34 px: the index fingertip sits here. */
const TIP = { x: 11.3, y: 2.8 };
const HAND_PATHS = [
  'M22 14a8 8 0 0 1-8 8',
  'M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
  'M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1',
  'M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10',
  'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
];

interface Nodes {
  root: SVGSVGElement;
  marks: SVGGElement;
  hand: SVGGElement;
  icon: SVGGElement;
  ring: SVGCircleElement;
  caption: HTMLElement;
}

const demoKey = (tool: DemoTool) => `demo:${tool}`;

function handFrames(keys: HandKey[]): {
  move: Keyframe[];
  press: Keyframe[];
  ring: Keyframe[];
} {
  return {
    move: keys.map((k) => ({
      offset: k.offset,
      easing: STATE,
      transform: `translate(${k.at.x}px, ${k.at.y}px)`,
      opacity: k.visible ? 1 : 0,
    })),
    press: keys.map((k) => ({ offset: k.offset, easing: STATE, scale: k.down ? '0.86' : '1' })),
    ring: keys.map((k) => ({
      offset: k.offset,
      easing: STATE,
      scale: k.down ? '1' : '0.4',
      opacity: k.down ? 0.45 : 0,
    })),
  };
}

function placeCaption(el: HTMLElement, plan: DemoPlan): void {
  const ys = plan.hand.filter((k) => k.visible).map((k) => k.at.y);
  const xs = plan.hand.filter((k) => k.visible).map((k) => k.at.x);
  const top = Math.min(...ys);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const vw = document.documentElement.clientWidth;
  const w = el.offsetWidth;
  const left = Math.max(12, Math.min(vw - w - 12, x - w / 2));
  const y = Math.max(12, top - el.offsetHeight - 28);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
}

/**
 * Ghost hand demos. Each one plays on the first use of its tool, stops on any user input and never
 * takes pointer events. Playback is imperative WAAPI, so React renders this layer once.
 */
function createPlayer(n: Nodes) {
  let timer = 0;
  let queue: DemoTool[] = [];
  let loops: number = tuning.ghostHand.loops;
  let current: { anims: Animation[]; release(): void } | null = null;

  const clear = () => {
    if (!current) return;
    const c = current;
    current = null;
    c.release();
    for (const a of c.anims) a.cancel();
    n.marks.replaceChildren();
    n.root.dataset.active = 'false';
    n.caption.dataset.active = 'false';
  };

  const stop = () => {
    window.clearTimeout(timer);
    queue = [];
    clear();
  };

  const play = (tool: DemoTool, plan: DemoPlan) => {
    markSeen(demoKey(tool));
    n.root.dataset.active = 'true';
    n.caption.textContent = plan.caption;
    n.caption.dataset.active = 'true';
    placeCaption(n.caption, plan);

    const duration = tuning.ghostHand.loopMs;
    const timing: KeyframeAnimationOptions = { duration, iterations: loops, fill: 'both' };
    const f = handFrames(plan.hand);
    const anims = [
      n.hand.animate(f.move, timing),
      n.icon.animate(f.press, timing),
      n.ring.animate(f.ring, timing),
      n.caption.animate(
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.08 / loops },
          { opacity: 1, offset: 1 - 0.06 / loops },
          { opacity: 0, offset: 1 },
        ],
        { duration: duration * loops, fill: 'both' },
      ),
      ...plan.decorate(n.marks, timing),
    ];

    let holdTimer = 0;
    if (reducedMotion()) {
      // A still frame of the finished gesture, no motion.
      for (const a of anims) {
        a.pause();
        a.currentTime = duration * 0.8;
      }
      holdTimer = window.setTimeout(next, duration * loops);
    }

    const onInput = () => stop();
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('pointerdown', onInput, opts);
    window.addEventListener('keydown', onInput, opts);
    window.addEventListener('wheel', onInput, opts);
    const unsubscribe = camera.subscribe(onInput);
    current = {
      anims,
      release() {
        window.clearTimeout(holdTimer);
        window.removeEventListener('pointerdown', onInput, opts);
        window.removeEventListener('keydown', onInput, opts);
        window.removeEventListener('wheel', onInput, opts);
        unsubscribe();
      },
    };
    if (!reducedMotion()) {
      const mine = current;
      void Promise.all(anims.map((a) => a.finished)).then(
        () => {
          if (current === mine) next();
        },
        () => {},
      );
    }
  };

  function next(): void {
    clear();
    while (queue.length > 0) {
      const tool = queue.shift()!;
      const plan = planDemo(tool);
      if (!plan) continue;
      play(tool, plan);
      return;
    }
  }

  return {
    /** Plays the demos of `tools` in order after a short pause. */
    schedule(tools: readonly DemoTool[], times: number) {
      stop();
      queue = [...tools];
      loops = Math.max(1, times);
      timer = window.setTimeout(next, tuning.ghostHand.startDelayMs);
    },
    stop,
  };
}

const isDemoTool = (t: string): t is DemoTool => (DEMO_TOOLS as readonly string[]).includes(t);

export function DemoPlayer(): ReactElement {
  const rootRef = useRef<SVGSVGElement>(null);
  const marksRef = useRef<SVGGElement>(null);
  const handRef = useRef<SVGGElement>(null);
  const iconRef = useRef<SVGGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const marks = marksRef.current;
    const hand = handRef.current;
    const icon = iconRef.current;
    const ring = ringRef.current;
    const caption = captionRef.current;
    if (!root || !marks || !hand || !icon || !ring || !caption) return;
    const player = createPlayer({ root, marks, hand, icon, ring, caption });
    const offTool = on('tool-activated', (e) => {
      if (!isDemoTool(e.tool)) {
        player.stop();
        return;
      }
      if (seen(demoKey(e.tool))) player.stop();
      else player.schedule([e.tool], tuning.ghostHand.loops);
    });
    const offTutorial = on('tutorial-requested', () => player.schedule(DEMO_TOOLS, 1));
    return () => {
      offTool();
      offTutorial();
      player.stop();
    };
  }, []);

  return (
    <>
      <svg
        ref={rootRef}
        className="edu-demo"
        data-active="false"
        aria-hidden="true"
        focusable="false"
      >
        <g ref={marksRef} />
        <g ref={handRef} className="edu-hand" opacity={0}>
          <circle ref={ringRef} className="edu-hand-ring" r={20} />
          <g ref={iconRef} className="edu-hand-icon">
            <g transform={`translate(${-TIP.x} ${-TIP.y}) scale(${34 / 24})`}>
              {HAND_PATHS.map((d) => (
                <path key={`halo-${d}`} d={d} className="edu-hand-halo" />
              ))}
              {HAND_PATHS.map((d) => (
                <path key={d} d={d} className="edu-hand-line" />
              ))}
            </g>
          </g>
        </g>
      </svg>
      <p ref={captionRef} className="edu-demo-caption" data-active="false" aria-live="polite" />
    </>
  );
}
