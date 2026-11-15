import type { ZzfxParams } from 'zzfx';
import { uiStore } from '../store/uiStore.ts';
import { tuning } from './tuning.ts';

export type SoundName = 'tick' | 'pop' | 'thunk' | 'whoosh' | 'error' | 'success';

type Engine = typeof import('zzfx')['ZZFX'];

/**
 * ZzFX parameters: volume, randomness, frequency, attack, sustain, release, shape, shapeCurve,
 * slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay,
 * sustainVolume, decay, tremolo. Soft shapes (sine, triangle) and short tails keep them friendly.
 */
const PARAMS: Record<SoundName, ZzfxParams> = {
  tick: [0.35, 0, 1650, 0, 0.004, 0.025, 0, 1.6],
  pop: [0.7, 0, 420, 0.005, 0.02, 0.09, 0, 1.6, 22],
  thunk: [0.9, 0, 150, 0, 0.015, 0.1, 1, 2.2, -12],
  whoosh: [0.3, 0, 900, 0.03, 0.05, 0.2, 4, 1, -40, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.05],
  error: [0.45, 0, 240, 0, 0.06, 0.1, 1, 1.5, 0, 0, -60, 0.07],
  success: [0.5, 0, 660, 0.01, 0.06, 0.18, 0, 1.4, 0, 0, 330, 0.06],
};

/** Same sound again inside this gap is dropped, so a fast drag does not buzz. */
const MIN_GAP_MS: Record<SoundName, number> = {
  tick: 45,
  pop: 80,
  thunk: 80,
  whoosh: 120,
  error: 200,
  success: 200,
};

let engine: Engine | null = null;
let samples: Map<SoundName, number[]> | null = null;
let loading: Promise<void> | null = null;
const lastPlayed = new Map<SoundName, number>();

function load(): void {
  if (loading) return;
  loading = import('zzfx')
    .then(({ ZZFX }) => {
      ZZFX.volume = tuning.sound.volume;
      const built = new Map<SoundName, number[]>();
      for (const name of Object.keys(PARAMS) as SoundName[]) {
        built.set(name, ZZFX.buildSamples(...PARAMS[name]));
      }
      samples = built;
      engine = ZZFX;
      return ZZFX.audioContext.resume();
    })
    .catch(() => {
      // Audio unavailable (blocked or unsupported): stay silent and allow a retry on the next gesture.
      engine = null;
      samples = null;
      loading = null;
    });
}

/** The AudioContext must start inside a user gesture, so zzfx loads only after the first one. */
function onGesture(): void {
  if (!uiStore.getState().prefs.sound) return;
  if (!engine) {
    load();
    return;
  }
  // iOS suspends the context after a call or a lock; a later gesture wakes it.
  if (engine.audioContext.state !== 'running') void engine.audioContext.resume().catch(() => {});
}

let installed = false;

/** Listens for user gestures for the whole session. Safe to call more than once. */
export function installSoundUnlock(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  window.addEventListener('keydown', onGesture, { capture: true, passive: true });
}

export function playSound(name: SoundName): void {
  if (!engine || !samples || !uiStore.getState().prefs.sound) return;
  if (engine.audioContext.state !== 'running' || document.hidden) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? Number.NEGATIVE_INFINITY) < MIN_GAP_MS[name]) return;
  lastPlayed.set(name, now);
  const channel = samples.get(name);
  if (!channel) return;
  // A small random pitch keeps repeated ticks from sounding mechanical.
  const rate = name === 'tick' ? 0.96 + Math.random() * 0.08 : 1;
  try {
    engine.playSamples([channel], 1, rate);
  } catch {
    // A closed or interrupted context: ignore this sound.
  }
}
