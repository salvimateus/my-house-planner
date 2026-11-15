import { uiStore } from '../store/uiStore.ts';

export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** Back-out overshoot. */
export const springOut = (t: number): number => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

export interface TweenHandle {
  cancel(): void;
  finished: Promise<void>;
}

export function reducedMotion(): boolean {
  const pref = uiStore.getState().prefs.motion;
  if (pref !== 'auto') return pref === 'reduced';
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** rAF tween for SVG attributes. Under reduced motion it jumps to the final frame. */
export function tween(
  ms: number,
  onFrame: (t: number) => void,
  ease: (t: number) => number = easeOut,
): TweenHandle {
  if (reducedMotion() || ms <= 0) {
    onFrame(1);
    return { cancel() {}, finished: Promise.resolve() };
  }
  let raf = 0;
  let startTime: number | null = null;
  let resolve!: () => void;
  const finished = new Promise<void>((r) => {
    resolve = r;
  });
  const step = (now: number) => {
    startTime ??= now;
    const t = Math.min(1, (now - startTime) / ms);
    onFrame(ease(t));
    if (t < 1) raf = requestAnimationFrame(step);
    else resolve();
  };
  raf = requestAnimationFrame(step);
  return {
    cancel() {
      cancelAnimationFrame(raf);
      resolve();
    },
    finished,
  };
}

/** WAAPI helper for transforms and opacity. Returns null under reduced motion; the caller sets the final state. */
export function animateEl(
  el: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation | null {
  if (reducedMotion()) return null;
  return el.animate(keyframes, options);
}
