import {
  ArrowRight,
  EllipsisVertical,
  FolderOpen,
  House,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldCheck,
  Trash,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useId, useMemo, useRef, useState } from 'react';
import { StartScreenArt } from '../../education/EducationLayer.tsx';
import { pickProjectFile } from '../../io/projectFile.ts';
import type { Id, ProjectMeta } from '../../model/types.ts';
import {
  deleteProject,
  openDocAsCopy,
  openProject,
  renameProject,
  useProjectList,
} from '../../persistence/repository.ts';
import { uiStore } from '../../store/uiStore.ts';
import { TEMPLATES, type TemplateEntry } from '../../templates/index.ts';
import { Button } from '../controls/Button.tsx';
import { Dialog } from '../controls/Dialog.tsx';
import { toast } from '../controls/Toast.tsx';
import { errorMessage } from '../Menu.tsx';
import { ThemeToggle } from '../ThemeToggle.tsx';
import { Logo } from './Logo.tsx';
import './StartScreen.css';
import { track } from '../../analytics/track.ts';

const NAME_MAX = 80;
const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sec = Math.round((t - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return 'agora mesmo';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (abs < 2_592_000) return rtf.format(Math.round(sec / 86_400), 'day');
  if (abs < 31_536_000) return rtf.format(Math.round(sec / 2_592_000), 'month');
  return rtf.format(Math.round(sec / 31_536_000), 'year');
}

/** Thumbnails come from IndexedDB: only ever shown through an <img>, never injected as markup. */
const thumbUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function Thumb({ svg, large = false }: { svg: string; large?: boolean }): ReactElement {
  return (
    <span className="plan-thumb" data-large={large ? 'true' : undefined}>
      {svg ? (
        <img src={thumbUrl(svg)} alt="" width={320} height={240} loading="lazy" decoding="async" />
      ) : (
        <House className="plan-thumb-empty" aria-hidden="true" />
      )}
    </span>
  );
}

async function run(task: () => Promise<void>, fallback: string): Promise<void> {
  try {
    await task();
  } catch (err) {
    toast(errorMessage(err, fallback), { tone: 'error' });
  }
}

function PlanCard({
  meta,
  busy,
  onOpen,
  onRename,
  onDelete,
}: {
  meta: ProjectMeta;
  busy: boolean;
  onOpen(): void;
  onRename(): void;
  onDelete(): void;
}): ReactElement {
  const id = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const pick = (fn: () => void) => {
    popRef.current?.hidePopover();
    fn();
  };
  return (
    <li className="plan-card">
      <button type="button" className="plan-card-main" onClick={onOpen} disabled={busy}>
        <Thumb svg={meta.thumbSvg} />
        <span className="plan-card-text">
          <span className="plan-card-name">{meta.name}</span>
          <span className="plan-card-meta">
            {meta.lotLabel ? `${meta.lotLabel} · ` : ''}
            {relativeTime(meta.updatedAt)}
          </span>
        </span>
        {busy ? <LoaderCircle className="spin plan-card-busy" aria-label="Abrindo" /> : null}
      </button>
      <button
        type="button"
        className="plan-card-more"
        popoverTarget={`${id}-more`}
        aria-label={`Mais opções para ${meta.name}`}
      >
        <EllipsisVertical aria-hidden="true" />
      </button>
      <div ref={popRef} id={`${id}-more`} popover="auto" className="plan-card-pop">
        <button type="button" className="plan-card-action" onClick={() => pick(onRename)}>
          <Pencil aria-hidden="true" />
          Renomear
        </button>
        <button
          type="button"
          className="plan-card-action plan-card-danger"
          onClick={() => pick(onDelete)}
        >
          <Trash aria-hidden="true" />
          Excluir
        </button>
      </div>
    </li>
  );
}

function RenameDialog({
  target,
  onClose,
}: {
  target: ProjectMeta | null;
  onClose(): void;
}): ReactElement {
  const [name, setName] = useState('');
  const [shownFor, setShownFor] = useState<Id | null>(null);
  const inputId = useId();
  if (target && target.id !== shownFor) {
    setShownFor(target.id);
    setName(target.name);
  }
  const save = () => {
    const next = name.trim().slice(0, NAME_MAX);
    if (!target || !next) return;
    onClose();
    void run(() => renameProject(target.id, next), 'Não foi possível renomear.');
  };
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Renomear planta"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={save}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        className="start-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor={inputId} className="start-label">
          Nome
        </label>
        <input
          id={inputId}
          className="start-input"
          value={name}
          maxLength={NAME_MAX}
          enterKeyHint="done"
          onChange={(e) => setName(e.target.value)}
        />
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  onClose,
}: {
  target: ProjectMeta | null;
  onClose(): void;
}): ReactElement {
  const [last, setLast] = useState<ProjectMeta | null>(null);
  if (target && target !== last) setLast(target);
  const shown = target ?? last;
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title="Excluir planta?"
      size="sm"
      description={
        shown ? `“${shown.name}” vai sair deste navegador. Não dá para desfazer.` : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            icon={<Trash />}
            onClick={() => {
              if (!target) return;
              onClose();
              void run(async () => {
                await deleteProject(target.id);
                toast(`“${target.name}” foi excluída.`);
              }, 'Não foi possível excluir.');
            }}
          >
            Excluir
          </Button>
        </>
      }
    >
      <p className="start-note">
        Dica: antes de excluir, você pode salvar um arquivo da planta pelo menu do editor.
      </p>
    </Dialog>
  );
}

function TemplateCard({
  entry,
  busy,
  onOpen,
}: {
  entry: TemplateEntry;
  busy: boolean;
  onOpen(): void;
}): ReactElement {
  return (
    <li>
      <button type="button" className="template-card" onClick={onOpen} disabled={busy}>
        <span className="template-title">{entry.title}</span>
        <span className="template-desc">{entry.description}</span>
        <span className="template-cta">
          {busy ? (
            <LoaderCircle className="spin" aria-hidden="true" />
          ) : (
            <ArrowRight aria-hidden="true" />
          )}
          Abrir exemplo
        </span>
      </button>
    </li>
  );
}

export function StartScreen(): ReactElement {
  const { projects, ready } = useProjectList();
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [deleting, setDeleting] = useState<ProjectMeta | null>(null);

  const sorted = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );
  const latest = sorted[0] ?? null;

  const open = (key: string, task: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(key);
    void run(task, fallback).finally(() => setBusy(null));
  };

  const openFile = () => open('file', pickProjectFile, 'Não foi possível abrir este arquivo.');

  return (
    <main className="start">
      <div className="start-art" aria-hidden="true">
        <StartScreenArt />
      </div>
      <ThemeToggle className="start-theme" />
      <div className="start-inner">
        <header className="start-hero">
          <Logo size={64} />
          <h1 className="start-title">Minha Casinha</h1>
          <p className="start-tagline">Desenhe a planta da sua casa, sem ser arquiteto.</p>
          <div className="start-cta">
            <Button
              variant="primary"
              size="lg"
              icon={<Plus />}
              onClick={() => uiStore.getState().setScreen('wizard')}
            >
              Nova planta
            </Button>
            <Button
              variant="secondary"
              size="lg"
              icon={busy === 'file' ? <LoaderCircle className="spin" /> : <FolderOpen />}
              onClick={openFile}
              disabled={busy === 'file'}
            >
              Abrir arquivo
            </Button>
          </div>
        </header>

        {latest ? (
          <section className="start-section" aria-labelledby="start-continue">
            <h2 id="start-continue" className="sr-only">
              Continuar
            </h2>
            <button
              type="button"
              className="continue-card"
              disabled={busy !== null}
              onClick={() =>
                open(latest.id, () => openProject(latest.id), 'Não foi possível abrir a planta.')
              }
            >
              <Thumb svg={latest.thumbSvg} large />
              <span className="continue-text">
                <span className="continue-kicker">Continuar de onde parou</span>
                <span className="continue-name">{latest.name}</span>
                <span className="continue-meta">
                  {latest.lotLabel ? `${latest.lotLabel} · ` : ''}
                  editada {relativeTime(latest.updatedAt)}
                </span>
              </span>
              <span className="continue-go" aria-hidden="true">
                {busy === latest.id ? <LoaderCircle className="spin" /> : <ArrowRight />}
              </span>
            </button>
          </section>
        ) : null}

        <section className="start-section" aria-labelledby="start-mine">
          <h2 id="start-mine" className="start-h2">
            Minhas plantas
          </h2>
          {!ready ? (
            <ul className="plan-grid" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="plan-card plan-card-skeleton" aria-hidden="true" />
              ))}
            </ul>
          ) : sorted.length === 0 ? (
            <div className="start-empty">
              <House className="start-empty-icon" aria-hidden="true" />
              <p className="start-empty-title">Você ainda não tem plantas</p>
              <p className="start-empty-text">
                Comece uma nova com o tamanho do seu terreno, ou abra um exemplo para ver como
                funciona.
              </p>
            </div>
          ) : (
            <ul className="plan-grid">
              {sorted.map((p) => (
                <PlanCard
                  key={p.id}
                  meta={p}
                  busy={busy === p.id}
                  onOpen={() =>
                    open(p.id, () => openProject(p.id), 'Não foi possível abrir a planta.')
                  }
                  onRename={() => setRenaming(p)}
                  onDelete={() => setDeleting(p)}
                />
              ))}
            </ul>
          )}
        </section>

        {TEMPLATES.length > 0 ? (
          <section className="start-section" aria-labelledby="start-examples">
            <h2 id="start-examples" className="start-h2">
              Exemplos
            </h2>
            <ul className="template-row">
              {TEMPLATES.map((t) => (
                <TemplateCard
                  key={t.id}
                  entry={t}
                  busy={busy === `tpl:${t.id}`}
                  onOpen={() =>
                    open(
                      `tpl:${t.id}`,
                      async () => {
                        await openDocAsCopy(await t.load());
                        track('template_open', { template_id: t.id });
                      },
                      'Não foi possível abrir o exemplo.',
                    )
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="start-foot">
          <ShieldCheck className="start-foot-icon" aria-hidden="true" />
          <p>Suas plantas ficam salvas neste navegador.</p>
          <Button variant="ghost" size="sm" onClick={() => uiStore.getState().openDialog('about')}>
            Sobre
          </Button>
        </footer>
      </div>

      <RenameDialog target={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog target={deleting} onClose={() => setDeleting(null)} />
    </main>
  );
}
