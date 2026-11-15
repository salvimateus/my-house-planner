import type { Feedback } from '../editor/tools/types.ts';
import { burst, shake } from './effects.ts';
import { vibrate } from './haptics.ts';
import { installSoundUnlock, playSound } from './sound.ts';
import { tuning } from './tuning.ts';

installSoundUnlock();

/** Without a target, the whole canvas says "no". */
const defaultShakeTarget = (): Element | null =>
  typeof document === 'undefined' ? null : document.querySelector('.canvas');

/** Sound, haptics and screen effects for the tools. Each channel checks its own preference. */
export const feedback: Feedback = {
  tick() {
    playSound('tick');
    vibrate(tuning.snapTick.hapticMs);
  },
  place() {
    playSound('pop');
    vibrate(tuning.haptics.placeMs);
  },
  thunk() {
    playSound('thunk');
    vibrate(tuning.haptics.thunkMs);
  },
  remove(at) {
    playSound('whoosh');
    vibrate([6, 30, 10]);
    burst(at);
  },
  invalid(target) {
    playSound('error');
    vibrate([18, 40, 18]);
    shake(target ?? defaultShakeTarget());
  },
  success() {
    playSound('success');
    vibrate([8, 50, 14]);
  },
};
