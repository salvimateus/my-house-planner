import type { LucideIcon } from 'lucide-react';
import { DoorOpen, MousePointer2, PaintRoller, Ruler, Sofa, SquarePlus } from 'lucide-react';
import type { ReactElement } from 'react';
import type { ToolId } from '../editor/tools/types.ts';
import { useDoc } from '../store/docStore.ts';
import { uiStore, useUi } from '../store/uiStore.ts';
import { panelSnapFor, toolPanelId } from './SidePanel.tsx';
import { commands } from './shortcuts.ts';
import './ToolBar.css';

type ToolEntry = { id: ToolId; label: string; long: string; icon: LucideIcon; key: string };

export const TOOLS: readonly ToolEntry[] = [
  { id: 'select', label: 'Mover', long: 'Mover e selecionar', icon: MousePointer2, key: 'V' },
  { id: 'build', label: 'Cômodo', long: 'Desenhar cômodo', icon: SquarePlus, key: 'R' },
  { id: 'opening', label: 'Portas', long: 'Portas e janelas', icon: DoorOpen, key: 'O' },
  { id: 'item', label: 'Objetos', long: 'Objetos e móveis', icon: Sofa, key: 'F' },
  { id: 'ruler', label: 'Régua', long: 'Régua', icon: Ruler, key: 'M' },
  { id: 'paint', label: 'Pintar', long: 'Pintar', icon: PaintRoller, key: 'B' },
];

export function ToolBar({ orientation }: { orientation: 'horizontal' | 'vertical' }): ReactElement {
  const tool = useUi((s) => s.tool);
  const readOnly = useDoc((s) => s.readOnly);

  const pick = (id: ToolId) => {
    if (id !== tool) {
      commands.activateTool(id);
      return;
    }
    // A second tap on the active tool brings its panel back.
    const ui = uiStore.getState();
    const panel = ui.selection ? 'inspector' : toolPanelId(id);
    if (panel && ui.sheet.id !== panel) ui.setSheet(panel, panelSnapFor(panel));
    else if (panel && ui.sheet.snap === 'peek') ui.setSheet(panel, 'half');
  };

  return (
    <nav className="toolbar" data-orientation={orientation} aria-label="Ferramentas">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const active = t.id === tool;
        return (
          <button
            key={t.id}
            type="button"
            className="tool-btn"
            aria-pressed={active}
            aria-keyshortcuts={t.key}
            title={`${t.long} (${t.key})`}
            disabled={readOnly && t.id !== 'select'}
            onClick={() => pick(t.id)}
          >
            <span className="tool-icon" aria-hidden="true">
              <Icon />
            </span>
            <span className="tool-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
