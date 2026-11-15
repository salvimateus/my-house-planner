import type { ReactElement } from 'react';
import type { ToolId } from '../editor/tools/types.ts';
import { useDoc } from '../store/docStore.ts';
import { type SheetId, type UiState, uiStore, useUi } from '../store/uiStore.ts';
import { EmptySelection, Inspector, inspectorTitle } from './inspector/Inspector.tsx';
import { BuildPanel } from './panels/BuildPanel.tsx';
import { CatalogPanel } from './panels/CatalogPanel.tsx';
import { HealthPanel } from './panels/HealthPanel.tsx';
import { LayersPanel } from './panels/LayersPanel.tsx';
import { OpeningsPanel } from './panels/OpeningsPanel.tsx';
import { PaintPanel } from './panels/PaintPanel.tsx';
import { RulerPanel } from './panels/RulerPanel.tsx';
import './SidePanel.css';

export type PanelId = NonNullable<SheetId>;

const TOOL_PANEL: Record<ToolId, PanelId | null> = {
  select: null,
  build: 'build',
  opening: 'openings',
  item: 'catalog',
  ruler: 'ruler',
  paint: 'paint',
};

export const toolPanelId = (tool: ToolId): PanelId | null => TOOL_PANEL[tool];

/** Opening snap on phones: panels that need a choice before drawing open at half height. */
export const panelSnapFor = (id: PanelId | null): 'peek' | 'half' =>
  id === 'build' || id === 'ruler' ? 'peek' : 'half';

const TITLES: Record<Exclude<PanelId, 'inspector'>, { title: string; hint: string }> = {
  build: { title: 'Construir', hint: 'Arraste no terreno para desenhar um cômodo.' },
  openings: { title: 'Portas e janelas', hint: 'Escolha um modelo e toque numa parede.' },
  catalog: { title: 'Objetos', hint: 'Escolha um móvel e toque na planta para colocar.' },
  ruler: { title: 'Régua', hint: 'Toque num espaço para medir, ou arraste entre dois pontos.' },
  paint: { title: 'Pintar', hint: 'Escolha uma cor ou textura e toque num cômodo.' },
  layers: { title: 'Camadas', hint: 'Mostre ou esconda partes do desenho.' },
  health: { title: 'Saúde da planta', hint: 'Dicas para a sua planta ficar boa de morar.' },
};

export function panelTitle(id: PanelId | null, sel: UiState['selection']): string {
  if (id === null) return 'Mover e selecionar';
  if (id === 'inspector') return inspectorTitle(sel);
  return TITLES[id].title;
}

export function panelHint(id: PanelId | null): string | null {
  if (id === null) return 'Toque em algo para editar. Arraste com dois dedos para mover a vista.';
  if (id === 'inspector') return null;
  return TITLES[id].hint;
}

/** Content of a panel id, shared by the phone sheet and the desktop side panel. */
export function PanelBody({ id }: { id: PanelId | null }): ReactElement {
  const readOnly = useDoc((s) => s.readOnly);
  if (id === null) return <EmptySelection />;
  if (id === 'inspector') return <Inspector />;
  if (id === 'layers') return <LayersPanel />;
  if (id === 'health') return <HealthPanel />;
  return (
    <fieldset className="panel-fieldset" disabled={readOnly}>
      <legend className="sr-only">{TITLES[id].title}</legend>
      {id === 'build' ? <BuildPanel /> : null}
      {id === 'openings' ? <OpeningsPanel /> : null}
      {id === 'catalog' ? <CatalogPanel /> : null}
      {id === 'ruler' ? <RulerPanel /> : null}
      {id === 'paint' ? <PaintPanel /> : null}
    </fieldset>
  );
}

const TOOL_TAB_LABEL: Record<ToolId, string> = {
  select: 'Mover',
  build: 'Construir',
  opening: 'Aberturas',
  item: 'Objetos',
  ruler: 'Régua',
  paint: 'Pintar',
};

type Tab = { key: 'tool' | 'inspector' | 'layers' | 'health'; label: string; id: PanelId | null };

export function SidePanel(): ReactElement {
  const tool = useUi((s) => s.tool);
  const sheetId = useUi((s) => s.sheet.id);
  const selection = useUi((s) => s.selection);
  const toolPanel = toolPanelId(tool);
  const active: PanelId | null = sheetId ?? toolPanel;
  const tabs: Tab[] = [
    { key: 'tool', label: TOOL_TAB_LABEL[tool], id: toolPanel },
    { key: 'inspector', label: 'Seleção', id: 'inspector' },
    { key: 'layers', label: 'Camadas', id: 'layers' },
    { key: 'health', label: 'Saúde', id: 'health' },
  ];
  const isActive = (t: Tab) =>
    t.key === 'tool' ? active === toolPanel : active === t.id && t.id !== toolPanel;
  const hint = panelHint(active);

  return (
    <aside className="side-panel" aria-label="Painel">
      <nav className="side-tabs" aria-label="Seções do painel">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className="side-tab"
            aria-pressed={isActive(t)}
            disabled={t.key === 'inspector' && !selection}
            onClick={() => uiStore.getState().setSheet(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="side-body">
        <header className="side-head">
          <h2 className="side-title">{panelTitle(active, selection)}</h2>
          {hint ? <p className="side-hint">{hint}</p> : null}
        </header>
        <div key={active ?? 'none'} className="side-content">
          <PanelBody id={active} />
        </div>
      </div>
    </aside>
  );
}
