import { syncGateRamps } from '../geometry/frontage.ts';
import type { ProjectDoc } from '../model/types.ts';
import { docStore } from '../store/docStore.ts';

/**
 * Keeps ramps linked to their vehicle gates and trees out of ramps and gates after every doc change.
 * The patch replaces the current doc in place, so it joins the history step of the change that caused
 * it: undo returns to the doc before that change, and the patched doc is what redo brings back.
 * During a gesture only the ramps follow; trees step aside when the gesture ends.
 * Returns the clean-up.
 */
export function startFrontageSync(): () => void {
  let prev: ProjectDoc | null = null;
  let busy = false;

  const run = (doc: ProjectDoc, before: ProjectDoc | null, inGesture: boolean) => {
    const patch = syncGateRamps(doc, before, !inGesture);
    if (!patch.lot) return;
    busy = true;
    try {
      docStore.setState({ doc: { ...doc, ...patch } });
    } finally {
      busy = false;
    }
  };

  const initial = docStore.getState();
  if (initial.doc && !initial.readOnly) run(initial.doc, null, initial.gesture !== null);
  prev = docStore.getState().doc;

  const unsubscribe = docStore.subscribe((s, old) => {
    if (busy) return;
    const doc = s.doc;
    if (!doc) {
      prev = null;
      return;
    }
    const gestureEnded = old.gesture !== null && s.gesture === null;
    if (doc === prev && !gestureEnded) return;
    // Gesture frames are all made from the gesture base, so the base is what each frame changed.
    const base = s.gesture?.base ?? (gestureEnded ? old.gesture?.base : null) ?? prev;
    const before = base && base.id === doc.id ? base : null;
    prev = doc;
    if (s.readOnly) return;
    run(doc, before, s.gesture !== null);
    prev = docStore.getState().doc;
  });

  return () => {
    unsubscribe();
    prev = null;
  };
}
