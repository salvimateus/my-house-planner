import type { LucideIcon } from 'lucide-react';
import {
  CircleQuestionMark,
  Download,
  FileDown,
  FolderOpen,
  GraduationCap,
  House,
  Info,
  LandPlot,
  Layers,
  Lightbulb,
  Menu as MenuIcon,
  Plus,
  Settings,
  Share2,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useId, useRef } from 'react';
import { downloadProjectFile, pickProjectFile } from '../io/projectFile.ts';
import { emit } from '../juice/events.ts';
import { closeProject, duplicateCurrentAsIdea } from '../persistence/repository.ts';
import { docStore, useDoc } from '../store/docStore.ts';
import { uiStore } from '../store/uiStore.ts';
import { toast } from './controls/Toast.tsx';
import { commands } from './shortcuts.ts';
import './Menu.css';

type Entry = {
  label: string;
  icon: LucideIcon;
  run(): void | Promise<void>;
  /** Changes the open plan, so it is off in read-only mode. */
  edits?: boolean;
  needsDoc?: boolean;
};

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'userMessage' in err) {
    const m = (err as { userMessage: unknown }).userMessage;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}

async function guarded(task: () => void | Promise<void>, fallback: string): Promise<void> {
  try {
    await task();
  } catch (err) {
    toast(errorMessage(err, fallback), { tone: 'error' });
  }
}

const GROUPS: Entry[][] = [
  [
    { label: 'Minhas plantas', icon: House, run: () => closeProject() },
    {
      label: 'Nova planta',
      icon: Plus,
      run: async () => {
        await closeProject();
        uiStore.getState().setScreen('wizard');
      },
    },
    { label: 'Abrir arquivo…', icon: FolderOpen, run: () => pickProjectFile() },
  ],
  [
    {
      label: 'Salvar arquivo',
      icon: Download,
      needsDoc: true,
      run: () => {
        const doc = docStore.getState().doc;
        if (doc) downloadProjectFile(doc);
      },
    },
    {
      label: 'Compartilhar',
      icon: Share2,
      needsDoc: true,
      run: () => uiStore.getState().openDialog('share'),
    },
    {
      label: 'Exportar PDF ou imagem',
      icon: FileDown,
      needsDoc: true,
      run: () => uiStore.getState().openDialog('export'),
    },
    {
      label: 'Salvar como nova ideia',
      icon: Lightbulb,
      needsDoc: true,
      run: () => duplicateCurrentAsIdea(),
    },
  ],
  [
    { label: 'Terreno', icon: LandPlot, needsDoc: true, edits: true, run: commands.selectLot },
    {
      label: 'Camadas',
      icon: Layers,
      needsDoc: true,
      run: () => uiStore.getState().setSheet('layers', 'half'),
    },
    {
      label: 'Configurações',
      icon: Settings,
      run: () => uiStore.getState().openDialog('settings'),
    },
  ],
  [
    {
      label: 'Tutorial',
      icon: GraduationCap,
      run: () => emit({ type: 'tutorial-requested' }),
    },
    {
      label: 'Atalhos e ajuda',
      icon: CircleQuestionMark,
      run: () => uiStore.getState().openDialog('about'),
    },
    { label: 'Sobre o app', icon: Info, run: () => uiStore.getState().openDialog('about') },
  ],
];

export function Menu(): ReactElement {
  const id = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const readOnly = useDoc((s) => s.readOnly);
  const hasDoc = useDoc((s) => s.doc !== null);

  const run = (e: Entry) => {
    popRef.current?.hidePopover();
    void guarded(e.run, 'Algo deu errado. Tente de novo.');
  };

  return (
    <>
      <button
        type="button"
        className="menu-trigger"
        popoverTarget={`${id}-menu`}
        aria-label="Menu"
        title="Menu"
      >
        <MenuIcon aria-hidden="true" />
      </button>
      <div ref={popRef} id={`${id}-menu`} popover="auto" className="menu-pop">
        <nav aria-label="Menu principal">
          {GROUPS.map((group) => (
            <ul key={group[0]?.label} className="menu-group">
              {group.map((e) => {
                const Icon = e.icon;
                const disabled = (e.needsDoc && !hasDoc) || (e.edits && readOnly);
                return (
                  <li key={e.label}>
                    <button
                      type="button"
                      className="menu-item"
                      disabled={disabled}
                      onClick={() => run(e)}
                    >
                      <Icon className="menu-icon" aria-hidden="true" />
                      <span>{e.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>
      </div>
    </>
  );
}
