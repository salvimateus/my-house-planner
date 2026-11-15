import type { ReactElement } from 'react';
import { lazy, Suspense, useEffect } from 'react';
import { EducationLayer } from './education/EducationLayer.tsx';
import { startLaunchQueue } from './io/launchQueue.ts';
import { handleIncomingShare } from './io/shareLink.ts';
import { startAutosave } from './persistence/autosave.ts';
import { PersistenceBanners } from './persistence/PersistenceBanners.tsx';
import { closeProject } from './persistence/repository.ts';
import { type Screen, uiStore, useUi } from './store/uiStore.ts';
import { AppShell } from './ui/AppShell.tsx';
import { ToastHost, toast } from './ui/controls/Toast.tsx';
import { AboutDialog } from './ui/dialogs/AboutDialog.tsx';
import { ExportDialog } from './ui/dialogs/ExportDialog.tsx';
import { SettingsDialog } from './ui/dialogs/SettingsDialog.tsx';
import { ShareDialog } from './ui/dialogs/ShareDialog.tsx';
import { errorMessage } from './ui/Menu.tsx';
import { LotWizard } from './ui/screens/LotWizard.tsx';
import { StartScreen } from './ui/screens/StartScreen.tsx';
import './App.css';

const DevGallery = import.meta.env.DEV ? lazy(() => import('./catalog/DevGallery.tsx')) : null;
const DevMaterials = import.meta.env.DEV ? lazy(() => import('./catalog/DevMaterials.tsx')) : null;

function devView(): ReactElement | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(window.location.search).get('dev');
  const View = v === 'catalog' ? DevGallery : v === 'materials' ? DevMaterials : null;
  if (!View) return null;
  return (
    <Suspense fallback={<p className="dev-loading">Carregando…</p>}>
      <View />
    </Suspense>
  );
}

// One-shot startup work survives the StrictMode double effect run.
let incomingHandled = false;

const HISTORY_KEY = 'casinha';
let ignoreNextPop = false;
/** Screen that needs an entry once the pending back() lands. */
let pendingPush: Screen | null = null;

/** Keeps one history entry above the start screen, so the Android back button returns to it. */
function syncHistory(screen: Screen): void {
  if (ignoreNextPop) {
    pendingPush = screen === 'start' ? null : screen;
    return;
  }
  const state = window.history.state as Record<string, unknown> | null;
  const ours = state !== null && typeof state === 'object' && HISTORY_KEY in state;
  if (screen !== 'start') {
    if (ours) window.history.replaceState({ [HISTORY_KEY]: screen }, '');
    else window.history.pushState({ [HISTORY_KEY]: screen }, '');
  } else if (ours) {
    ignoreNextPop = true;
    window.history.back();
  }
}

function onPopState(): void {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    if (pendingPush) window.history.pushState({ [HISTORY_KEY]: pendingPush }, '');
    pendingPush = null;
    return;
  }
  const ui = uiStore.getState();
  if (ui.screen === 'editor') {
    void closeProject().catch((err: unknown) =>
      toast(errorMessage(err, 'Não foi possível fechar a planta.'), { tone: 'error' }),
    );
  } else if (ui.screen === 'wizard') {
    ui.setScreen('start');
  }
}

function MainApp(): ReactElement {
  const screen = useUi((s) => s.screen);
  const motion = useUi((s) => s.prefs.motion);

  useEffect(() => startAutosave(), []);

  useEffect(() => {
    startLaunchQueue();
    if (incomingHandled) return;
    incomingHandled = true;
    void handleIncomingShare().catch((err: unknown) =>
      toast(errorMessage(err, 'Não foi possível abrir o link compartilhado.'), { tone: 'error' }),
    );
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  useEffect(() => {
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    syncHistory(screen);
  }, [screen]);

  return (
    <div className="app-root">
      <div key={screen} className="screen-enter">
        {screen === 'start' ? <StartScreen /> : null}
        {screen === 'wizard' ? <LotWizard /> : null}
        {screen === 'editor' ? <AppShell /> : null}
      </div>
      <PersistenceBanners />
      <EducationLayer />
      <ExportDialog />
      <ShareDialog />
      <SettingsDialog />
      <AboutDialog />
      <ToastHost />
    </div>
  );
}

export function App(): ReactElement {
  return devView() ?? <MainApp />;
}
