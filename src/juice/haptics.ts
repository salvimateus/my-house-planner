import { uiStore } from '../store/uiStore.ts';
import { tuning } from './tuning.ts';

type VibrateNavigator = Navigator & { userActivation?: { hasBeenActive: boolean } };

let last = Number.NEGATIVE_INFINITY;

/** A short vibration on phones that support it, when the haptics preference is on. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !uiStore.getState().prefs.haptics) return;
  const nav = navigator as VibrateNavigator;
  if (typeof nav.vibrate !== 'function') return;
  // Browsers refuse (and warn) before the first user gesture.
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return;
  const now = performance.now();
  if (now - last < tuning.haptics.minGapMs) return;
  last = now;
  try {
    nav.vibrate(pattern);
  } catch {
    // Some embedded browsers throw instead of returning false.
  }
}
