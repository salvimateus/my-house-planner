import { alignmentLines } from '../geometry/snap.ts';
import type { SnapContext } from '../geometry/types.ts';
import { feedback } from '../juice/feedback.ts';
import { tuning } from '../juice/tuning.ts';
import { DEFAULT_LOT } from '../model/defaults.ts';
import type { Area, Lot } from '../model/types.ts';
import { camera } from '../store/cameraStore.ts';
import { docStore } from '../store/docStore.ts';
import { sceneOf } from '../store/selectors.ts';
import { uiStore } from '../store/uiStore.ts';
import type { PointerInput, ToolContext } from './tools/types.ts';

type PointerKind = PointerInput['pointerType'];

let lastPointer: PointerKind = 'mouse';

/** The input router reports the pointer type of each press, for the default tolerance. */
export function setPointerKind(kind: PointerKind): void {
  lastPointer = kind;
}

export const pointerKind = (): PointerKind => lastPointer;

/** Default hit tolerance in screen px for a pointer type. */
export const tolPxFor = (kind: PointerKind): number =>
  kind === 'mouse' ? tuning.touch.mouseTolPx : tuning.touch.tolPx;

let cursorSink: ((cursor: string | null) => void) | null = null;

/** The canvas registers how to show a hover cursor; tools call `setCanvasCursor`. */
export function setCursorSink(fn: ((cursor: string | null) => void) | null): void {
  cursorSink = fn;
}

/** null restores the active tool cursor. */
export function setCanvasCursor(cursor: string | null): void {
  cursorSink?.(cursor);
}

const EMPTY_LOT: Lot = { ...DEFAULT_LOT, width: 0, depth: 0 };

const alignCache = new WeakMap<Area[], { lot: Lot; value: ReturnType<typeof alignmentLines> }>();

function alignmentOf(areas: Area[], lot: Lot) {
  const hit = alignCache.get(areas);
  if (hit && hit.lot === lot) return hit.value;
  const value = alignmentLines(areas, lot);
  alignCache.set(areas, { lot, value });
  return value;
}

function snapContext(): SnapContext {
  const doc = docStore.getState().doc;
  const ui = uiStore.getState();
  const scene = sceneOf(doc);
  const lot = doc?.lot ?? EMPTY_LOT;
  const { alignX, alignY } = doc ? alignmentOf(doc.areas, lot) : { alignX: [], alignY: [] };
  return {
    step: ui.snapStep,
    tolMm: tuning.magnet.alignRadiusPx * camera.mmPerPx(),
    lot,
    alignX,
    alignY,
    faces: scene.faces,
    runs: scene.runs,
  };
}

const docFacade: ToolContext['doc'] = {
  get readOnly() {
    return docStore.getState().readOnly;
  },
  load: (doc) => docStore.getState().load(doc),
  close: () => docStore.getState().close(),
  setReadOnly: (v) => docStore.getState().setReadOnly(v),
  commit: (label, recipe) => docStore.getState().commit(label, recipe),
  beginGesture: (label) => docStore.getState().beginGesture(label),
  updateGesture: (recipe) => docStore.getState().updateGesture(recipe),
  endGesture: () => docStore.getState().endGesture(),
  cancelGesture: () => docStore.getState().cancelGesture(),
  undo: () => docStore.getState().undo(),
  redo: () => docStore.getState().redo(),
};

const s = uiStore.getState();
// Zustand actions are stable, so the facade holds them without the state snapshot around them.
const uiFacade: ToolContext['ui'] = {
  setScreen: s.setScreen,
  setTool: s.setTool,
  setBuildMode: s.setBuildMode,
  setOutdoorPreset: s.setOutdoorPreset,
  select: s.select,
  setSheet: s.setSheet,
  openDialog: s.openDialog,
  closeDialog: s.closeDialog,
  toggleLayer: s.toggleLayer,
  setLayers: s.setLayers,
  setPrefs: s.setPrefs,
  setTransient: s.setTransient,
  setPaintFill: s.setPaintFill,
  setPending: s.setPending,
  setSnap: s.setSnap,
  setSaveStatus: s.setSaveStatus,
};

/** The one ToolContext of the app. Every getter reads the stores live. */
export const toolContext: ToolContext = {
  getDoc: () => docStore.getState().doc,
  getScene: () => sceneOf(docStore.getState().doc),
  getUi: () => uiStore.getState(),
  doc: docFacade,
  ui: uiFacade,
  camera,
  feedback,
  snapContext,
  tolMm: (px) => (px ?? tolPxFor(lastPointer)) * camera.mmPerPx(),
};
