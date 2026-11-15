import { type Draft, produce } from 'immer';
import { createStore, useStore } from 'zustand';
import { track } from '../analytics/track.ts';
import type { ProjectDoc } from '../model/types.ts';

const LIMIT = 200;

export type Recipe = (draft: Draft<ProjectDoc>) => void;

export interface DocState {
  doc: ProjectDoc | null;
  past: ProjectDoc[];
  future: ProjectDoc[];
  gesture: { base: ProjectDoc; label: string } | null;
  lastLabel: string | null;
  readOnly: boolean;
}

export interface DocActions {
  load(doc: ProjectDoc): void;
  close(): void;
  setReadOnly(v: boolean): void;
  commit(label: string, recipe: Recipe): void;
  beginGesture(label: string): void;
  /** Always applied to the gesture base, so each call replaces the previous preview. */
  updateGesture(recipe: Recipe): void;
  endGesture(): void;
  cancelGesture(): void;
  undo(): void;
  redo(): void;
}

export const docStore = createStore<DocState & DocActions>()((set, get) => ({
  doc: null,
  past: [],
  future: [],
  gesture: null,
  lastLabel: null,
  readOnly: false,

  load: (doc) =>
    set({ doc, past: [], future: [], gesture: null, lastLabel: null, readOnly: false }),

  close: () =>
    set({ doc: null, past: [], future: [], gesture: null, lastLabel: null, readOnly: false }),

  setReadOnly: (readOnly) => set({ readOnly }),

  commit: (label, recipe) => {
    const { doc, gesture, readOnly } = get();
    if (!doc || gesture || readOnly) return;
    const next = produce(doc, recipe);
    if (next === doc) return;
    set((s) => ({
      doc: next,
      past: [...s.past, doc].slice(-LIMIT),
      future: [],
      lastLabel: label,
    }));
  },

  beginGesture: (label) => {
    const { doc, readOnly, gesture } = get();
    if (doc && !readOnly && !gesture) set({ gesture: { base: doc, label } });
  },

  updateGesture: (recipe) => {
    const g = get().gesture;
    if (g) set({ doc: produce(g.base, recipe) });
  },

  endGesture: () => {
    const { gesture: g, doc } = get();
    if (!g) return;
    if (!doc || doc === g.base) {
      set({ gesture: null });
      return;
    }
    set((s) => ({
      gesture: null,
      past: [...s.past, g.base].slice(-LIMIT),
      future: [],
      lastLabel: g.label,
    }));
  },

  cancelGesture: () => {
    const g = get().gesture;
    if (g) set({ doc: g.base, gesture: null });
  },

  undo: () => {
    const { past, doc, future, gesture, readOnly } = get();
    if (gesture || readOnly || !doc || past.length === 0) return;
    set({ doc: past[past.length - 1]!, past: past.slice(0, -1), future: [doc, ...future] });
    track('undo');
  },

  redo: () => {
    const { past, doc, future, gesture, readOnly } = get();
    if (gesture || readOnly || !doc || future.length === 0) return;
    set({ doc: future[0]!, past: [...past, doc], future: future.slice(1) });
    track('redo');
  },
}));

export const useDoc = <T>(selector: (s: DocState & DocActions) => T): T =>
  useStore(docStore, selector);
