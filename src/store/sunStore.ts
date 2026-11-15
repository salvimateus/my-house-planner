import { createStore, useStore } from 'zustand';
import { track } from '../analytics/track.ts';
import { type SunDate, sunTimes } from '../geometry/sun.ts';
import { reducedMotion } from '../juice/tween.ts';

export interface Season {
  id: 'summer' | 'autumn' | 'winter' | 'spring';
  label: string;
  date: SunDate;
}

/** Southern hemisphere: solstices and equinoxes. */
export const SEASONS: readonly Season[] = [
  { id: 'summer', label: 'Verão', date: { month: 12, day: 21 } },
  { id: 'autumn', label: 'Outono', date: { month: 3, day: 21 } },
  { id: 'winter', label: 'Inverno', date: { month: 6, day: 21 } },
  { id: 'spring', label: 'Primavera', date: { month: 9, day: 23 } },
];

export const SUN_MIN_MINUTES = 5 * 60;
export const SUN_MAX_MINUTES = 19 * 60 + 30;
export const SUN_STEP_MINUTES = 15;
/** Sunrise to sunset in about this long. */
const PLAY_MS = 12_000;
/** Reduced motion: one jump of this many minutes per tick. */
const REDUCED_STEP = 60;
const REDUCED_TICK_MS = 700;

export interface SunState {
  on: boolean;
  date: SunDate;
  /** Local minutes after midnight; fractional while playing. */
  minutes: number;
  playing: boolean;
}

export interface SunActions {
  toggle(): void;
  close(): void;
  setDate(date: SunDate): void;
  setMinutes(minutes: number): void;
  play(): void;
  pause(): void;
}

/** Season nearest to today, so the first look matches the current sky. */
function nearestSeason(now: Date): SunDate {
  const t = now.getTime();
  const y = now.getFullYear();
  let best = SEASONS[0]!.date;
  let bestDist = Infinity;
  for (const s of SEASONS) {
    for (const yy of [y - 1, y, y + 1]) {
      const dist = Math.abs(new Date(yy, s.date.month - 1, s.date.day).getTime() - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = s.date;
      }
    }
  }
  return best;
}

const clampMinutes = (m: number) => Math.min(SUN_MAX_MINUTES, Math.max(SUN_MIN_MINUTES, m));

let raf = 0;
let last = 0;
let tickAcc = 0;

const stopLoop = () => {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
  tickAcc = 0;
};

/** Screen-only view state: never part of the document, the undo history or the saved file. */
export const sunStore = createStore<SunState & SunActions>()((set, get) => {
  const step = (now: number) => {
    raf = 0;
    const st = get();
    if (!st.playing) return;
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    const { sunrise, sunset } = sunTimes(st.date);
    let next: number;
    if (reducedMotion()) {
      tickAcc += dt;
      if (tickAcc < REDUCED_TICK_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      tickAcc = 0;
      next = st.minutes + REDUCED_STEP;
    } else {
      next = st.minutes + ((sunset - sunrise) * dt) / PLAY_MS;
    }
    if (next >= sunset) {
      set({ minutes: sunset, playing: false });
      stopLoop();
      return;
    }
    set({ minutes: next });
    raf = requestAnimationFrame(step);
  };

  return {
    on: false,
    date: nearestSeason(new Date()),
    minutes: 9 * 60,
    playing: false,
    toggle: () => {
      if (get().on) return get().close();
      set({ on: true });
      track('sun_panel_open');
    },
    close: () => {
      stopLoop();
      set({ on: false, playing: false });
    },
    setDate: (date) => set({ date }),
    setMinutes: (minutes) => {
      stopLoop();
      set({ minutes: clampMinutes(minutes), playing: false });
    },
    play: () => {
      const st = get();
      if (st.playing) return;
      const { sunrise, sunset } = sunTimes(st.date);
      const start = st.minutes < sunrise || st.minutes >= sunset - 1 ? sunrise : st.minutes;
      stopLoop();
      set({ minutes: start, playing: true });
      raf = requestAnimationFrame(step);
    },
    pause: () => {
      stopLoop();
      set({ playing: false });
    },
  };
});

export const useSun = <T>(selector: (s: SunState & SunActions) => T): T =>
  useStore(sunStore, selector);
