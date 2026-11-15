import type { ReactElement } from 'react';
import { useEffect, useSyncExternalStore } from 'react';
import { Canvas } from '../editor/Canvas.tsx';
import { useDoc } from '../store/docStore.ts';
import { uiStore, useUi } from '../store/uiStore.ts';
import { BottomSheet } from './BottomSheet.tsx';
import { CanvasControls } from './CanvasControls.tsx';
import { PanelResizer } from './PanelResizer.tsx';
import { panelSnapFor, SidePanel, toolPanelId } from './SidePanel.tsx';
import { StatusBar, StatusChip } from './StatusBar.tsx';
import { startShortcuts } from './shortcuts.ts';
import { ToolBar } from './ToolBar.tsx';
import { TopBar } from './TopBar.tsx';
import './AppShell.css';

const WIDE_QUERY = '(min-width: 900px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = matchMedia(query);
      mql.addEventListener('change', notify);
      return () => mql.removeEventListener('change', notify);
    },
    () => matchMedia(query).matches,
  );
}

/** The panel follows the context: a selection opens the inspector, a tool opens its panel. */
function usePanelFollowsContext(): void {
  useEffect(() => {
    const ui = uiStore.getState();
    if (ui.sheet.id === null) {
      const id = ui.selection ? 'inspector' : toolPanelId(ui.tool);
      if (id) ui.setSheet(id, ui.selection ? 'half' : panelSnapFor(id));
    }
    return uiStore.subscribe((s, prev) => {
      if (s.selection !== prev.selection) {
        if (s.selection) {
          if (s.sheet.id !== 'inspector') s.setSheet('inspector', 'half');
        } else if (s.sheet.id === 'inspector') {
          const id = toolPanelId(s.tool);
          s.setSheet(id, panelSnapFor(id));
        }
        return;
      }
      if (s.tool !== prev.tool) {
        const id = toolPanelId(s.tool);
        const keep = id === null && (s.sheet.id === 'layers' || s.sheet.id === 'health');
        if (!keep) s.setSheet(id, panelSnapFor(id));
      }
    });
  }, []);
}

export function AppShell(): ReactElement {
  const wide = useMediaQuery(WIDE_QUERY);
  const sheetOpen = useUi((s) => s.sheet.id !== null);
  const docName = useDoc((s) => s.doc?.name ?? 'Planta');

  useEffect(() => startShortcuts(), []);
  usePanelFollowsContext();

  return (
    <div className="shell" data-layout={wide ? 'wide' : 'compact'}>
      <h1 className="sr-only">{docName} · Minha Casinha</h1>
      <TopBar wide={wide} />
      <main
        className="shell-stage"
        aria-label="Planta"
        data-sheet={wide || sheetOpen ? 'open' : 'hidden'}
      >
        <div className="shell-canvas">
          <Canvas />
        </div>
        {wide ? null : <StatusChip />}
        <CanvasControls compact={!wide} />
        {wide ? null : <BottomSheet />}
      </main>
      {wide ? <StatusBar /> : null}
      {wide ? (
        <>
          <PanelResizer />
          <ToolBar orientation="vertical" />
          <SidePanel />
        </>
      ) : null}
      {wide ? null : <ToolBar orientation="horizontal" />}
    </div>
  );
}
