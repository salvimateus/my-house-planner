import { Download, Lock, Redo2, Share2, Undo2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { docStore, useDoc } from '../store/docStore.ts';
import { uiStore, useUi } from '../store/uiStore.ts';
import { Button } from './controls/Button.tsx';
import { IconButton } from './controls/IconButton.tsx';
import { Menu } from './Menu.tsx';
import { commands } from './shortcuts.ts';
import './TopBar.css';

const NAME_MAX = 80;

const SAVE_TEXT = {
  idle: '',
  saving: 'Salvando…',
  saved: 'Salvo neste navegador',
  error: 'Não foi possível salvar',
} as const;

function SaveDot(): ReactElement | null {
  const status = useUi((s) => s.saveStatus);
  const readOnly = useDoc((s) => s.readOnly);
  if (readOnly) {
    return (
      <span className="save-ro" title="Só leitura: esta planta está aberta em outra aba.">
        <Lock aria-hidden="true" />
        <span className="save-ro-text">Só leitura</span>
      </span>
    );
  }
  if (status === 'idle') return null;
  return (
    <span className="save-dot" data-status={status} title={SAVE_TEXT[status]}>
      <span className="save-dot-mark" aria-hidden="true" />
      <span className="sr-only" role="status">
        {SAVE_TEXT[status]}
      </span>
    </span>
  );
}

function ProjectName(): ReactElement {
  const name = useDoc((s) => s.doc?.name ?? '');
  const readOnly = useDoc((s) => s.readOnly);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const finish = (save: boolean) => {
    setEditing(false);
    const next = draft.trim().slice(0, NAME_MAX);
    if (save && next && next !== name) {
      docStore.getState().commit('Renomear planta', (d) => {
        d.name = next;
      });
    }
  };

  if (editing) {
    return (
      <input
        className="project-name-input"
        aria-label="Nome da planta"
        value={draft}
        maxLength={NAME_MAX}
        enterKeyHint="done"
        // biome-ignore lint/a11y/noAutofocus: the field opens only on the user's tap on the name.
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          else if (e.key === 'Escape') finish(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="project-name"
      disabled={readOnly}
      title={readOnly ? name : 'Renomear planta'}
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      <span className="project-name-text">{name || 'Minha casa'}</span>
      <span className="sr-only">, renomear</span>
    </button>
  );
}

export function TopBar({ wide }: { wide: boolean }): ReactElement {
  const canUndo = useDoc((s) => s.past.length > 0 && !s.readOnly && !s.gesture);
  const canRedo = useDoc((s) => s.future.length > 0 && !s.readOnly && !s.gesture);
  const hasDoc = useDoc((s) => s.doc !== null);
  const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

  return (
    <header className="topbar">
      <Menu />
      {wide ? (
        <span className="topbar-brand" aria-hidden="true">
          Minha Casinha
        </span>
      ) : null}
      <div className="topbar-title">
        <ProjectName />
        <SaveDot />
      </div>
      <div className="topbar-actions">
        <IconButton
          label="Desfazer"
          title={`Desfazer (${mod}+Z)`}
          icon={<Undo2 />}
          disabled={!canUndo}
          onClick={commands.undo}
        />
        <IconButton
          label="Refazer"
          title={`Refazer (${mod}+Shift+Z)`}
          icon={<Redo2 />}
          disabled={!canRedo}
          onClick={commands.redo}
        />
        {wide ? (
          <>
            <span className="topbar-sep" aria-hidden="true" />
            <Button
              variant="ghost"
              icon={<Share2 />}
              disabled={!hasDoc}
              onClick={() => uiStore.getState().openDialog('share')}
            >
              Compartilhar
            </Button>
            <Button
              variant="primary"
              icon={<Download />}
              disabled={!hasDoc}
              onClick={() => uiStore.getState().openDialog('export')}
            >
              Exportar
            </Button>
          </>
        ) : (
          <IconButton
            label="Exportar PDF ou imagem"
            icon={<Download />}
            disabled={!hasDoc}
            onClick={() => uiStore.getState().openDialog('export')}
          />
        )}
      </div>
    </header>
  );
}
