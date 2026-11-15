import type { ProjectDoc, ViewPrefs } from '../model/types.ts';
import { renderThumbSvg } from '../render/thumb.ts';
import { docStore } from '../store/docStore.ts';
import { uiStore } from '../store/uiStore.ts';
import { StorageWriteError, saveProjectRecord, warmUpStorage } from './db.ts';
import { noteEdit, noteSaved, reportWriteError } from './storageGuard.ts';
import { notifyGalleryChanged } from './tabSync.ts';

const DEBOUNCE_MS = 800;
const IDLE_TIMEOUT_MS = 1500;
const THUMB_EVERY_MS = 10_000;

const meters = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const lotLabelOf = (doc: ProjectDoc): string =>
  `${meters.format(doc.lot.width / 1000)} × ${meters.format(doc.lot.depth / 1000)} m`;

let lastSavedDoc: ProjectDoc | null = null;
let lastSavedLayers: ViewPrefs['layers'] | null = null;
let lastThumbAt = 0;
let thumbDocId: string | null = null;
let thumbStale = false;

let debounceTimer: number | undefined;
let thumbTimer: number | undefined;
let idleHandle: number | undefined;
let inFlight: Promise<void> | null = null;

function thumbFor(doc: ProjectDoc): string | undefined {
  try {
    return renderThumbSvg(doc);
  } catch {
    // Keep the previous thumbnail; the plan itself still saves.
    return undefined;
  }
}

/** Marks a doc as already stored, so loading it does not trigger a save. */
export function markClean(doc: ProjectDoc): void {
  lastSavedDoc = doc;
  lastSavedLayers = uiStore.getState().layers;
}

/** Writes the doc and its gallery meta now. Throws `StorageWriteError`. */
export async function persistDoc(doc: ProjectDoc, opts: { thumb: boolean }): Promise<void> {
  const thumbSvg = opts.thumb ? thumbFor(doc) : undefined;
  if (opts.thumb) {
    lastThumbAt = Date.now();
    thumbDocId = doc.id;
    thumbStale = false;
  }
  await saveProjectRecord(doc, {
    thumbSvg,
    lotLabel: lotLabelOf(doc),
    view: { layers: uiStore.getState().layers },
  });
  noteSaved();
  notifyGalleryChanged();
}

/** The doc that a save would write now: the gesture base while a drag is live. */
function saveTarget(flush: boolean): ProjectDoc | null {
  const { doc, readOnly, gesture } = docStore.getState();
  if (!doc || readOnly) return null;
  if (gesture) return flush ? gesture.base : null;
  return doc;
}

async function saveNow(opts: { flush?: boolean; thumb?: boolean; evenIfClean?: boolean } = {}) {
  while (inFlight) await inFlight;
  const target = saveTarget(opts.flush ?? false);
  if (!target) return;
  const layers = uiStore.getState().layers;
  const clean = target === lastSavedDoc && layers === lastSavedLayers;
  if (clean && !(opts.evenIfClean && thumbStale)) return;
  const thumb =
    opts.thumb === true || thumbDocId !== target.id || Date.now() - lastThumbAt >= THUMB_EVERY_MS;
  const ui = uiStore.getState();
  ui.setSaveStatus('saving');
  const run = (async () => {
    try {
      await persistDoc(target, { thumb });
      lastSavedDoc = target;
      lastSavedLayers = layers;
      uiStore.getState().setSaveStatus('saved');
      if (!thumb) {
        thumbStale = true;
        scheduleTrailingThumb();
      }
    } catch (err) {
      uiStore.getState().setSaveStatus('error');
      reportWriteError(err instanceof StorageWriteError && err.quota);
    }
  })();
  inFlight = run;
  try {
    await run;
  } finally {
    inFlight = null;
  }
}

function onIdle(fn: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    idleHandle = window.requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS });
  } else {
    idleHandle = window.setTimeout(fn, 0);
  }
}

function cancelIdle(): void {
  if (idleHandle === undefined) return;
  if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleHandle);
  else window.clearTimeout(idleHandle);
  idleHandle = undefined;
}

function cancelPending(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = undefined;
  cancelIdle();
}

function schedule(): void {
  cancelPending();
  debounceTimer = window.setTimeout(() => {
    debounceTimer = undefined;
    onIdle(() => {
      idleHandle = undefined;
      void saveNow();
    });
  }, DEBOUNCE_MS);
}

/** The last edits inside the 10 s window still get a thumbnail once the window ends. */
function scheduleTrailingThumb(): void {
  if (thumbTimer !== undefined) return;
  const wait = Math.max(0, lastThumbAt + THUMB_EVERY_MS - Date.now());
  thumbTimer = window.setTimeout(() => {
    thumbTimer = undefined;
    onIdle(() => {
      idleHandle = undefined;
      void saveNow({ thumb: true, evenIfClean: true });
    });
  }, wait);
}

function isDirty(): boolean {
  const target = saveTarget(false);
  return (
    target !== null && (target !== lastSavedDoc || uiStore.getState().layers !== lastSavedLayers)
  );
}

/** Saves pending changes right away (close, tab hidden, app update). Never throws. */
export async function flushAutosave(opts: { thumb?: boolean } = {}): Promise<void> {
  cancelPending();
  await saveNow({ flush: true, thumb: opts.thumb, evenIfClean: opts.thumb });
}

export function startAutosave(): () => void {
  warmUpStorage();

  const unsubDoc = docStore.subscribe((s, prev) => {
    if (s.doc && prev.doc && s.doc.id === prev.doc.id && !s.readOnly && s.doc !== lastSavedDoc) {
      const committed = s.doc !== prev.doc && s.gesture === null && prev.gesture === null;
      const gestureEnded =
        prev.gesture !== null && s.gesture === null && s.doc !== prev.gesture.base;
      if (committed || gestureEnded) noteEdit();
    }
    if (s.doc !== prev.doc || s.gesture !== prev.gesture || s.readOnly !== prev.readOnly) {
      if (isDirty()) schedule();
    }
  });

  const unsubUi = uiStore.subscribe((s, prev) => {
    if (s.layers !== prev.layers && isDirty()) schedule();
  });

  const onHidden = () => {
    if (document.visibilityState === 'hidden') void flushAutosave({ thumb: thumbStale });
  };
  const onPageHide = () => void flushAutosave({ thumb: thumbStale });
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    unsubDoc();
    unsubUi();
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', onPageHide);
    cancelPending();
    window.clearTimeout(thumbTimer);
    thumbTimer = undefined;
  };
}
