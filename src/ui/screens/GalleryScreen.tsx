import {
  ArrowLeft,
  Check,
  Download,
  EllipsisVertical,
  Eye,
  EyeOff,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Trash,
  WifiOff,
} from 'lucide-react';
import type { FormEvent, ReactElement } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  deletePlan,
  fetchPlanText,
  GalleryApiError,
  getUsage,
  listPlans,
  type RemotePlan,
  recountUsage,
  type Usage,
} from '../../collect/api.ts';
import { clearGalleryKey, getGalleryKey, setGalleryKey } from '../../collect/galleryKey.ts';
import {
  planId,
  readSeen,
  type SeenMap,
  type SeenState,
  seenStateOf,
  writeSeen,
} from '../../collect/seenPlans.ts';
import { downloadFile } from '../../export/share.ts';
import { PROJECT_FILE_EXT, projectFileSlug } from '../../io/projectFile.ts';
import { parseProject } from '../../model/codec.ts';
import { isKnownMaterial, openTemporary } from '../../persistence/repository.ts';
import { renderThumbSvg } from '../../render/thumb.ts';
import { uiStore } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Dialog } from '../controls/Dialog.tsx';
import { IconButton } from '../controls/IconButton.tsx';
import { toast } from '../controls/Toast.tsx';
import { relativeTime, Thumb } from './StartScreen.tsx';
import './StartScreen.css';
import './GalleryScreen.css';

interface Loaded {
  text: string;
  thumbSvg: string;
}

/** One entry per received version, for the life of the tab. */
const planCache = new Map<string, Promise<Loaded>>();

const cacheKey = (p: RemotePlan) => `${p.device}/${p.project}/${p.updatedAt}`;

function loadPlan(key: string, p: RemotePlan): Promise<Loaded> {
  const k = cacheKey(p);
  let hit = planCache.get(k);
  if (!hit) {
    hit = fetchPlanText(key, p.device, p.project).then((text) => {
      let thumbSvg = '';
      try {
        thumbSvg = renderThumbSvg(parseProject(text, { isKnownMaterial }).doc);
      } catch {
        // The card shows the empty thumbnail; the actions still work.
      }
      return { text, thumbSvg };
    });
    // A failure must not stay in the cache: the next try fetches again.
    hit.catch(() => planCache.delete(k));
    planCache.set(k, hit);
  }
  return hit;
}

const meters = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const lotLabel = (p: RemotePlan) =>
  p.lotWidthM > 0 && p.lotDepthM > 0
    ? `${meters.format(p.lotWidthM)} × ${meters.format(p.lotDepthM)} m`
    : '';

const isUnauthorized = (err: unknown) =>
  err instanceof GalleryApiError && err.kind === 'unauthorized';

function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

const STATE_TAG: Record<SeenState, string | null> = {
  new: 'Nova',
  updated: 'Nova versão',
  seen: null,
};

function GalleryCard({
  plan,
  index,
  galleryKey,
  seen,
  leaving,
  onStale,
  onSeen,
  onToggleSeen,
  onDelete,
  onLeft,
}: {
  plan: RemotePlan;
  index: number;
  galleryKey: string;
  seen: SeenState;
  leaving: boolean;
  onStale(): void;
  onSeen(plan: RemotePlan): void;
  onToggleSeen(plan: RemotePlan): void;
  onDelete(plan: RemotePlan): void;
  onLeft(plan: RemotePlan): void;
}): ReactElement {
  const ref = useRef<HTMLLIElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<'open' | 'download' | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        loadPlan(galleryKey, plan).then(
          (l) => {
            if (alive) setLoaded(l);
          },
          (err: unknown) => {
            if (alive && isUnauthorized(err)) onStale();
          },
        );
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [galleryKey, plan, onStale]);

  const withText = async (kind: 'open' | 'download', task: (text: string) => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      const { text } = await loadPlan(galleryKey, plan);
      onSeen(plan);
      await task(text);
    } catch (err) {
      if (isUnauthorized(err)) {
        onStale();
        return;
      }
      toast(
        err instanceof GalleryApiError
          ? 'Não foi possível baixar esta planta. Tente de novo.'
          : kind === 'open'
            ? 'Não foi possível abrir esta planta.'
            : 'Não foi possível salvar o arquivo.',
        { tone: 'error' },
      );
    } finally {
      setBusy(null);
    }
  };

  const openPlan = () =>
    withText('open', async (text) => {
      await openTemporary(parseProject(text, { isKnownMaterial }).doc);
    });

  const download = () =>
    withText('download', async (text) => {
      const name = `${projectFileSlug(plan.name)}${PROJECT_FILE_EXT}`;
      downloadFile(new File([text], name, { type: 'application/json' }));
    });

  const pick = (fn: () => void) => {
    popRef.current?.hidePopover();
    fn();
  };

  const name = plan.name || 'Sem nome';
  const tag = STATE_TAG[seen];
  const lot = lotLabel(plan);
  return (
    <li
      ref={ref}
      className="gallery-card"
      data-index={index}
      data-seen={seen}
      data-leaving={leaving ? 'true' : undefined}
      tabIndex={-1}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onLeft(plan);
      }}
    >
      <Thumb svg={loaded?.thumbSvg ?? ''} />
      <div className="gallery-card-head">
        <div className="gallery-card-text">
          <span className="gallery-card-name">
            {name}
            {seen === 'seen' ? <span className="sr-only"> (vista)</span> : null}
          </span>
          <span className="gallery-card-meta">
            {lot ? `${lot} · ` : ''}editada {relativeTime(plan.updatedAt)}
          </span>
        </div>
        {tag ? <span className="gallery-tag">{tag}</span> : null}
        <button
          type="button"
          className="plan-card-more"
          popoverTarget={`${popId}-more`}
          aria-label={`Mais opções para ${name}`}
        >
          <EllipsisVertical aria-hidden="true" />
        </button>
        <div ref={popRef} id={`${popId}-more`} popover="auto" className="plan-card-pop">
          <button
            type="button"
            className="plan-card-action"
            onClick={() => pick(() => onToggleSeen(plan))}
          >
            {seen === 'seen' ? <EyeOff aria-hidden="true" /> : <Check aria-hidden="true" />}
            {seen === 'seen' ? 'Marcar como não vista' : 'Marcar como vista'}
          </button>
          <button
            type="button"
            className="plan-card-action plan-card-danger"
            onClick={() => pick(() => onDelete(plan))}
          >
            <Trash aria-hidden="true" />
            Excluir
          </button>
        </div>
      </div>
      <div className="gallery-card-actions">
        <Button
          size="sm"
          variant="primary"
          icon={busy === 'open' ? <LoaderCircle className="spin" /> : <Eye />}
          disabled={busy !== null || leaving}
          onClick={openPlan}
        >
          Abrir
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={busy === 'download' ? <LoaderCircle className="spin" /> : <Download />}
          disabled={busy !== null || leaving}
          onClick={download}
        >
          Baixar JSON
        </Button>
      </div>
    </li>
  );
}

function DeleteDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: RemotePlan | null;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}): ReactElement {
  return (
    <Dialog
      open={target !== null}
      onClose={onCancel}
      title="Excluir esta planta da galeria?"
      size="sm"
      description="Ela será apagada do armazenamento. Se a pessoa editar a planta de novo, ela volta."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            icon={busy ? <LoaderCircle className="spin" /> : <Trash />}
            disabled={busy}
            onClick={onConfirm}
          >
            Excluir
          </Button>
        </>
      }
    />
  );
}

function KeyForm({ onEnter }: { onEnter(key: string, plans: RemotePlan[]): void }): ReactElement {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    setError(null);
    try {
      const plans = await listPlans(key);
      setGalleryKey(key);
      onEnter(key, plans);
    } catch (err) {
      setError(
        isUnauthorized(err)
          ? 'Chave incorreta'
          : 'Não foi possível falar com o servidor. Confira a internet e tente de novo.',
      );
      setBusy(false);
    }
  };

  return (
    <form className="gallery-key" onSubmit={submit}>
      <label htmlFor={inputId} className="start-label">
        Chave da galeria
      </label>
      <div className="gallery-key-row">
        <input
          id={inputId}
          className="start-input gallery-key-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={error === 'Chave incorreta' ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!value.trim() || busy}
          icon={busy ? <LoaderCircle className="spin" /> : undefined}
        >
          Entrar
        </Button>
      </div>
      {error ? (
        <p id={errorId} className="gallery-key-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

const count = new Intl.NumberFormat('pt-BR');
const oneDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Decimal units, like the Worker's limit of 1 GB = 10⁹ bytes. */
function sizeLabel(bytes: number): string {
  if (bytes >= 1e9) return `${oneDecimal.format(bytes / 1e9)} GB`;
  if (bytes >= 1e6) return `${oneDecimal.format(bytes / 1e6)} MB`;
  return `${oneDecimal.format(bytes / 1e3)} KB`;
}

const WARN_RATIO = 0.8;

function UsageLine({
  usage,
  busy,
  onRecount,
}: {
  usage: Usage;
  busy: boolean;
  onRecount(): void;
}): ReactElement {
  const near =
    (usage.writesLimit > 0 && usage.writes / usage.writesLimit >= WARN_RATIO) ||
    (usage.bytesLimit > 0 && usage.bytes / usage.bytesLimit >= WARN_RATIO);
  const tone = usage.paused ? 'paused' : near ? 'near' : 'ok';
  return (
    <div className="gallery-usage" data-tone={tone} role={tone === 'ok' ? undefined : 'status'}>
      <p className="gallery-usage-text">
        Uso do mês: {count.format(usage.writes)} de {count.format(usage.writesLimit)} envios ·{' '}
        {sizeLabel(usage.bytes)} de {sizeLabel(usage.bytesLimit)}
        {tone === 'near' ? (
          <strong className="gallery-usage-note">Perto do limite grátis</strong>
        ) : null}
        {usage.paused ? (
          <strong className="gallery-usage-note">
            {usage.reason === 'writes'
              ? 'Novos envios pausados até o próximo mês.'
              : 'Novos envios pausados: limite de espaço atingido. Exclua plantas para liberar.'}
          </strong>
        ) : null}
      </p>
      <button type="button" className="gallery-usage-recount" disabled={busy} onClick={onRecount}>
        {busy ? 'Recontando…' : 'Recontar uso'}
      </button>
    </div>
  );
}

type View =
  | { kind: 'key' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; plans: RemotePlan[] };

interface Group {
  device: string;
  plans: { plan: RemotePlan; index: number }[];
}

const PAGE_SIZE = 48;

/** The list comes newest first, so each device's first plan orders the groups. */
function groupOrder(plans: RemotePlan[]): RemotePlan[] {
  const groups = new Map<string, RemotePlan[]>();
  for (const p of plans) {
    const list = groups.get(p.device);
    if (list) list.push(p);
    else groups.set(p.device, [p]);
  }
  return [...groups.values()].flat();
}

/** Consecutive plans of one device share a header, also across a page boundary. */
function groupShown(plans: RemotePlan[]): Group[] {
  const groups: Group[] = [];
  plans.forEach((plan, index) => {
    const last = groups[groups.length - 1];
    if (last && last.device === plan.device) last.plans.push({ plan, index });
    else groups.push({ device: plan.device, plans: [{ plan, index }] });
  });
  return groups;
}

function SkeletonGrid(): ReactElement {
  return (
    <ul className="plan-grid" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="plan-card plan-card-skeleton" aria-hidden="true" />
      ))}
    </ul>
  );
}

export default function GalleryScreen(): ReactElement {
  useNoIndex();
  const [key, setKey] = useState<string | null>(() => getGalleryKey());
  const [view, setView] = useState<View>(() =>
    getGalleryKey() ? { kind: 'loading' } : { kind: 'key' },
  );
  const [seen, setSeen] = useState<SeenMap>(readSeen);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<RemotePlan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const [usage, setUsage] = useState<Usage | null>(null);
  const [recounting, setRecounting] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const updateSeen = useCallback((fn: (map: SeenMap) => void) => {
    setSeen((prev) => {
      const next = { ...prev };
      fn(next);
      writeSeen(next);
      return next;
    });
  }, []);

  const showPlans = useCallback(
    (plans: RemotePlan[]) => {
      const live = new Set(plans.map(planId));
      updateSeen((map) => {
        for (const id of Object.keys(map)) if (!live.has(id)) delete map[id];
      });
      setLeaving(new Set());
      setView({ kind: 'ready', plans });
    },
    [updateSeen],
  );

  /** A failed usage call only hides the line: the gallery works without it. */
  const loadUsage = useCallback((k: string) => {
    getUsage(k).then(setUsage, () => setUsage(null));
  }, []);

  const forget = useCallback(() => {
    setUsage(null);
    clearGalleryKey();
    planCache.clear();
    setKey(null);
    setView({ kind: 'key' });
  }, []);

  const refresh = useCallback(
    (k: string) => {
      const n = ++seq.current;
      setView({ kind: 'loading' });
      loadUsage(k);
      listPlans(k).then(
        (plans) => {
          if (n === seq.current) showPlans(plans);
        },
        (err: unknown) => {
          if (n !== seq.current) return;
          if (isUnauthorized(err)) forget();
          else setView({ kind: 'error' });
        },
      );
    },
    [forget, showPlans, loadUsage],
  );

  useEffect(() => {
    const k = getGalleryKey();
    if (k) refresh(k);
  }, [refresh]);

  const all = view.kind === 'ready' ? view.plans : null;
  const ordered = useMemo(() => (all ? groupOrder(all) : []), [all]);
  const groups = useMemo(() => groupShown(ordered.slice(0, shown)), [ordered, shown]);
  const remaining = Math.max(0, ordered.length - shown);
  const unread = useMemo(
    () => ordered.filter((p) => seenStateOf(seen, p) !== 'seen').length,
    [ordered, seen],
  );

  // After "Mostrar mais", the focus goes to the first new card, so the reader goes on from there.
  useEffect(() => {
    if (focusIndex === null) return;
    innerRef.current?.querySelector<HTMLElement>(`[data-index="${focusIndex}"]`)?.focus();
    setFocusIndex(null);
  }, [focusIndex]);

  const markSeen = useCallback(
    (p: RemotePlan) =>
      updateSeen((map) => {
        map[planId(p)] = p.updatedAt;
      }),
    [updateSeen],
  );

  const toggleSeen = useCallback(
    (p: RemotePlan) =>
      updateSeen((map) => {
        if (seenStateOf(map, p) === 'seen') delete map[planId(p)];
        else map[planId(p)] = p.updatedAt;
      }),
    [updateSeen],
  );

  const removePlan = useCallback((p: RemotePlan) => {
    setLeaving((prev) => {
      const next = new Set(prev);
      next.delete(cacheKey(p));
      return next;
    });
    setView((v) =>
      v.kind === 'ready' ? { kind: 'ready', plans: v.plans.filter((x) => x !== p) } : v,
    );
  }, []);

  const confirmDelete = async () => {
    const p = deleting;
    if (!p || !key || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deletePlan(key, p.device, p.project);
      for (const k of planCache.keys()) if (k.startsWith(`${planId(p)}/`)) planCache.delete(k);
      updateSeen((map) => {
        delete map[planId(p)];
      });
      setDeleting(null);
      setLeaving((prev) => new Set(prev).add(cacheKey(p)));
      toast('Planta excluída', { tone: 'success' });
      loadUsage(key);
    } catch (err) {
      setDeleting(null);
      if (isUnauthorized(err)) forget();
      else toast('Não foi possível excluir. Tente de novo.', { tone: 'error' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const recount = () => {
    if (!key || recounting) return;
    setRecounting(true);
    recountUsage(key)
      .then(setUsage, (err: unknown) => {
        if (isUnauthorized(err)) forget();
        else toast('Não foi possível recontar o uso. Tente de novo.', { tone: 'error' });
      })
      .finally(() => setRecounting(false));
  };

  const leave = () => {
    forget();
    uiStore.getState().setScreen('start');
  };

  return (
    <main className="gallery">
      <header className="gallery-top">
        <IconButton
          label="Voltar ao início"
          icon={<ArrowLeft />}
          onClick={() => uiStore.getState().setScreen('start')}
        />
        <h1 className="gallery-title">
          Galeria
          {key && all && unread > 0 ? (
            <span className="gallery-count">{unread === 1 ? '1 nova' : `${unread} novas`}</span>
          ) : null}
        </h1>
        {key ? (
          <div className="gallery-top-actions">
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw />}
              disabled={view.kind === 'loading'}
              onClick={() => refresh(key)}
            >
              Atualizar
            </Button>
            <Button size="sm" variant="ghost" icon={<LogOut />} onClick={leave}>
              Sair da galeria
            </Button>
          </div>
        ) : null}
      </header>

      <div ref={innerRef} className="gallery-inner">
        {key && usage && view.kind !== 'key' ? (
          <UsageLine usage={usage} busy={recounting} onRecount={recount} />
        ) : null}
        {view.kind === 'key' || !key ? (
          <KeyForm
            onEnter={(k, plans) => {
              seq.current += 1;
              setKey(k);
              showPlans(plans);
              loadUsage(k);
            }}
          />
        ) : view.kind === 'loading' ? (
          <SkeletonGrid />
        ) : view.kind === 'error' ? (
          <div className="start-empty" role="alert">
            <WifiOff className="start-empty-icon" aria-hidden="true" />
            <p className="start-empty-title">Não foi possível carregar a galeria</p>
            <p className="start-empty-text">Confira a internet e tente de novo.</p>
            <Button icon={<RefreshCw />} onClick={() => refresh(key)}>
              Tentar de novo
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="start-empty">
            <p className="start-empty-title">Nenhuma planta recebida ainda.</p>
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section
                key={`${g.device}-${g.plans[0]!.index}`}
                className="gallery-group"
                aria-label={`Aparelho ${g.device.slice(0, 6)}`}
              >
                <h2 className="start-h2">
                  Aparelho <span className="gallery-device">{g.device.slice(0, 6)}</span>
                </h2>
                <ul className="plan-grid">
                  {g.plans.map(({ plan, index }) => (
                    <GalleryCard
                      key={cacheKey(plan)}
                      plan={plan}
                      index={index}
                      galleryKey={key}
                      seen={seenStateOf(seen, plan)}
                      leaving={leaving.has(cacheKey(plan))}
                      onStale={forget}
                      onSeen={markSeen}
                      onToggleSeen={toggleSeen}
                      onDelete={setDeleting}
                      onLeft={removePlan}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {remaining > 0 ? (
              <Button
                className="gallery-more"
                onClick={() => {
                  setFocusIndex(shown);
                  setShown((n) => n + PAGE_SIZE);
                }}
              >
                Mostrar mais ({remaining})
              </Button>
            ) : null}
          </>
        )}
      </div>

      <DeleteDialog
        target={deleting}
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </main>
  );
}
