import { createStore, useStore } from 'zustand';
import type { ToolId } from '../editor/tools/types.ts';
import type { Ghost, Guide, Readout } from '../geometry/types.ts';
import { emit } from '../juice/events.ts';
import { FINE_STEP, SNAP_STEP } from '../model/defaults.ts';
import type {
  Fill,
  Id,
  ItemTypeId,
  LayerId,
  Mm,
  OpeningType,
  RoomPresetId,
  ViewPrefs,
} from '../model/types.ts';

export type Screen = 'start' | 'wizard' | 'editor';
export type BuildMode = 'room' | 'covered' | 'outdoor' | 'split';
export type DialogId = 'export' | 'share' | 'settings' | 'about';
export type Selection =
  | { kind: 'area'; id: Id }
  | { kind: 'wall'; segmentId: string }
  | { kind: 'lot' }
  | { kind: 'opening'; ids: Id[] }
  | { kind: 'item'; ids: Id[] }
  | { kind: 'ruler'; ids: Id[] }
  | { kind: 'street-tree'; id: Id }
  | { kind: 'sidewalk-ramp'; id: Id }
  | null;
export type SheetId =
  | 'build'
  | 'openings'
  | 'catalog'
  | 'ruler'
  | 'paint'
  | 'inspector'
  | 'layers'
  | 'health'
  | null;
export type SheetSnap = 'peek' | 'half' | 'full';

export interface UiState {
  screen: Screen;
  tool: ToolId;
  buildMode: BuildMode;
  outdoorPreset: RoomPresetId;
  pendingOpening: OpeningType | null;
  pendingItem: { type: ItemTypeId; variant: string | null } | null;
  paintFill: Fill;
  selection: Selection;
  dialog: DialogId | null;
  sheet: { id: SheetId; snap: SheetSnap };
  layers: ViewPrefs['layers'];
  snapEnabled: boolean;
  snapStep: Mm;
  prefs: { sound: boolean; haptics: boolean; motion: 'auto' | 'reduced' | 'full' };
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  transient: { guides: Guide[]; ghost: Ghost | null; invalid: boolean; readout: Readout | null };
}

export interface UiActions {
  setScreen(s: Screen): void;
  setTool(t: ToolId): void;
  setBuildMode(m: BuildMode): void;
  setOutdoorPreset(id: RoomPresetId): void;
  select(sel: Selection): void;
  setSheet(id: SheetId, snap?: SheetSnap): void;
  openDialog(id: DialogId): void;
  closeDialog(): void;
  toggleLayer(id: LayerId, key: 'visible' | 'locked'): void;
  setLayers(layers: ViewPrefs['layers']): void;
  setPrefs(p: Partial<UiState['prefs']>): void;
  setTransient(p: Partial<UiState['transient']>): void;
  setPaintFill(f: Fill): void;
  setPending(p: { opening?: OpeningType | null; item?: UiState['pendingItem'] }): void;
  setSnap(enabled: boolean, step?: Mm): void;
  setSaveStatus(s: UiState['saveStatus']): void;
}

const PREFS_KEY = 'casinha:prefs';

export const DEFAULT_PREFS: UiState['prefs'] = { sound: true, haptics: true, motion: 'auto' };

export const DEFAULT_LAYERS: ViewPrefs['layers'] = {
  grid: { visible: true, locked: false },
  context: { visible: true, locked: false },
  textures: { visible: true, locked: false },
  items: { visible: true, locked: false },
  openings: { visible: true, locked: false },
  measures: { visible: true, locked: false },
};

export const EMPTY_TRANSIENT: UiState['transient'] = {
  guides: [],
  ghost: null,
  invalid: false,
  readout: null,
};

function readPrefs(): UiState['prefs'] {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Record<keyof UiState['prefs'], unknown>>;
    return {
      sound: typeof p.sound === 'boolean' ? p.sound : DEFAULT_PREFS.sound,
      haptics: typeof p.haptics === 'boolean' ? p.haptics : DEFAULT_PREFS.haptics,
      motion:
        p.motion === 'auto' || p.motion === 'reduced' || p.motion === 'full'
          ? p.motion
          : DEFAULT_PREFS.motion,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: UiState['prefs']): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: prefs stay in memory for this session.
  }
}

export const uiStore = createStore<UiState & UiActions>()((set, get) => ({
  screen: 'start',
  tool: 'select',
  buildMode: 'room',
  outdoorPreset: 'lawn',
  pendingOpening: null,
  pendingItem: null,
  paintFill: { color: '#F4F1EA', material: 'solid', scale: 1, angle: 0 },
  selection: null,
  dialog: null,
  sheet: { id: null, snap: 'peek' },
  layers: DEFAULT_LAYERS,
  snapEnabled: true,
  snapStep: SNAP_STEP,
  prefs: readPrefs(),
  saveStatus: 'idle',
  transient: EMPTY_TRANSIENT,

  setScreen: (screen) => {
    if (screen === get().screen) return;
    set({ screen, selection: null, dialog: null, transient: EMPTY_TRANSIENT });
  },

  setTool: (tool) => {
    if (tool === get().tool) return;
    set({ tool, transient: EMPTY_TRANSIENT });
    emit({ type: 'tool-activated', tool });
  },

  setBuildMode: (buildMode) => set({ buildMode }),

  setOutdoorPreset: (outdoorPreset) => set({ outdoorPreset }),

  select: (selection) => set({ selection }),

  setSheet: (id, snap) =>
    set((s) => ({
      sheet: {
        id,
        snap: snap ?? (id === null ? 'peek' : id === s.sheet.id ? s.sheet.snap : 'half'),
      },
    })),

  openDialog: (dialog) => set({ dialog }),

  closeDialog: () => set({ dialog: null }),

  toggleLayer: (id, key) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], [key]: !s.layers[id][key] } } })),

  setLayers: (layers) => set({ layers }),

  setPrefs: (p) => {
    const prefs = { ...get().prefs, ...p };
    set({ prefs });
    writePrefs(prefs);
  },

  setTransient: (p) => set((s) => ({ transient: { ...s.transient, ...p } })),

  setPaintFill: (paintFill) => set({ paintFill }),

  setPending: (p) =>
    set((s) => ({
      pendingOpening: p.opening !== undefined ? p.opening : s.pendingOpening,
      pendingItem: p.item !== undefined ? p.item : s.pendingItem,
    })),

  setSnap: (snapEnabled, step) =>
    set({ snapEnabled, snapStep: step ?? (snapEnabled ? SNAP_STEP : FINE_STEP) }),

  setSaveStatus: (saveStatus) => set({ saveStatus }),
}));

export const useUi = <T>(selector: (s: UiState & UiActions) => T): T => useStore(uiStore, selector);
