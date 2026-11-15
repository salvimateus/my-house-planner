import { createStore, useStore } from 'zustand';

export type StorageBanner = 'private' | 'writeError' | 'nearlyFull' | 'ios' | 'exportReminder';

export interface GuardState {
  /** IndexedDB missing or blocked: projects live only in this tab's memory. */
  privateMode: boolean;
  writeError: 'quota' | 'failed' | null;
  nearlyFull: boolean;
  iosNotice: boolean;
  exportReminder: boolean;
  dismissed: Partial<Record<StorageBanner, true>>;
}

export const guardStore = createStore<GuardState>()(() => ({
  privateMode: false,
  writeError: null,
  nearlyFull: false,
  iosNotice: false,
  exportReminder: false,
  dismissed: {},
}));

export const useGuard = <T>(selector: (s: GuardState) => T): T => useStore(guardStore, selector);

const EDITS_BEFORE_REMINDER = 30;
const NEARLY_FULL_RATIO = 0.85;
const ESTIMATE_EVERY_MS = 60_000;
const IOS_NOTICE_KEY = 'casinha:ios-notice';

let persistAsked = false;
let lastEstimateAt = 0;
let iosChecked = false;
let editsSinceExport = 0;

export function reportStorageUnavailable(): void {
  guardStore.setState({ privateMode: true });
}

export function reportWriteError(quota: boolean): void {
  guardStore.setState((s) => ({
    writeError: quota ? 'quota' : 'failed',
    dismissed: { ...s.dismissed, writeError: undefined },
  }));
}

export function dismissBanner(id: StorageBanner): void {
  guardStore.setState((s) => ({
    dismissed: { ...s.dismissed, [id]: true },
    exportReminder: id === 'exportReminder' ? false : s.exportReminder,
  }));
  if (id === 'ios') {
    try {
      localStorage.setItem(IOS_NOTICE_KEY, '1');
    } catch {
      // Storage blocked: the notice may show again next session.
    }
  }
}

function isIosBrowserTab(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

function checkIosNotice(): void {
  if (iosChecked) return;
  iosChecked = true;
  if (!isIosBrowserTab()) return;
  try {
    if (localStorage.getItem(IOS_NOTICE_KEY)) return;
    localStorage.setItem(IOS_NOTICE_KEY, '1');
  } catch {
    // Storage blocked: show it for this session.
  }
  guardStore.setState({ iosNotice: true });
}

async function checkEstimate(): Promise<void> {
  const now = Date.now();
  if (now - lastEstimateAt < ESTIMATE_EVERY_MS || !navigator.storage?.estimate) return;
  lastEstimateAt = now;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (usage !== undefined && quota) {
      guardStore.setState({ nearlyFull: usage / quota >= NEARLY_FULL_RATIO });
    }
  } catch {
    // Estimate is a hint only.
  }
}

/** Runs after each successful save to the browser. */
export function noteSaved(): void {
  if (guardStore.getState().writeError) guardStore.setState({ writeError: null });
  if (!persistAsked) {
    persistAsked = true;
    void navigator.storage
      ?.persisted?.()
      .then((done) => (done ? true : navigator.storage.persist()))
      .catch(() => false);
  }
  checkIosNotice();
  void checkEstimate();
}

export function noteEdit(): void {
  editsSinceExport += 1;
  if (
    editsSinceExport === EDITS_BEFORE_REMINDER &&
    !guardStore.getState().dismissed.exportReminder
  ) {
    guardStore.setState({ exportReminder: true });
  }
}

export function noteFileExported(): void {
  editsSinceExport = 0;
  guardStore.setState((s) => ({
    exportReminder: false,
    dismissed: { ...s.dismissed, exportReminder: undefined },
  }));
}

export function resetEditCount(): void {
  editsSinceExport = 0;
  guardStore.setState({ exportReminder: false });
}
