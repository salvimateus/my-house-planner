import { ArrowLeft, Copy, Download, LoaderCircle, LogOut, RefreshCw, WifiOff } from 'lucide-react';
import type { FormEvent, ReactElement } from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fetchPlanText, GalleryApiError, listPlans, type RemotePlan } from '../../collect/api.ts';
import { clearGalleryKey, getGalleryKey, setGalleryKey } from '../../collect/galleryKey.ts';
import { downloadFile } from '../../export/share.ts';
import { importProjectText, PROJECT_FILE_EXT, projectFileSlug } from '../../io/projectFile.ts';
import { parseProject } from '../../model/codec.ts';
import { isKnownMaterial } from '../../persistence/repository.ts';
import { renderThumbSvg } from '../../render/thumb.ts';
import { uiStore } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
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

function GalleryCard({
  plan,
  galleryKey,
  onStale,
}: {
  plan: RemotePlan;
  galleryKey: string;
  onStale(): void;
}): ReactElement {
  const ref = useRef<HTMLLIElement>(null);
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
      await task((await loadPlan(galleryKey, plan)).text);
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

  const openCopy = () =>
    withText('open', (text) =>
      importProjectText(text, {
        suffix: ' (galeria)',
        label: 'Cópia aberta. A planta da galeria não muda.',
      }),
    );

  const download = () =>
    withText('download', async (text) => {
      const name = `${projectFileSlug(plan.name)}${PROJECT_FILE_EXT}`;
      downloadFile(new File([text], name, { type: 'application/json' }));
    });

  const lot = lotLabel(plan);
  return (
    <li ref={ref} className="gallery-card">
      <Thumb svg={loaded?.thumbSvg ?? ''} />
      <div className="gallery-card-text">
        <span className="gallery-card-name">{plan.name || 'Sem nome'}</span>
        <span className="gallery-card-meta">
          {lot ? `${lot} · ` : ''}editada {relativeTime(plan.updatedAt)}
        </span>
      </div>
      <div className="gallery-card-actions">
        <Button
          size="sm"
          variant="primary"
          icon={busy === 'open' ? <LoaderCircle className="spin" /> : <Copy />}
          disabled={busy !== null}
          onClick={openCopy}
        >
          Abrir cópia
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={busy === 'download' ? <LoaderCircle className="spin" /> : <Download />}
          disabled={busy !== null}
          onClick={download}
        >
          Baixar JSON
        </Button>
      </div>
    </li>
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

type View =
  | { kind: 'key' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; plans: RemotePlan[] };

interface Group {
  device: string;
  plans: RemotePlan[];
}

/** The list comes newest first, so each device's first plan orders the groups. */
function groupByDevice(plans: RemotePlan[]): Group[] {
  const groups = new Map<string, RemotePlan[]>();
  for (const p of plans) {
    const list = groups.get(p.device);
    if (list) list.push(p);
    else groups.set(p.device, [p]);
  }
  return [...groups].map(([device, list]) => ({ device, plans: list }));
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
  const seq = useRef(0);

  const forget = useCallback(() => {
    clearGalleryKey();
    planCache.clear();
    setKey(null);
    setView({ kind: 'key' });
  }, []);

  const refresh = useCallback(
    (k: string) => {
      const n = ++seq.current;
      setView({ kind: 'loading' });
      listPlans(k).then(
        (plans) => {
          if (n === seq.current) setView({ kind: 'ready', plans });
        },
        (err: unknown) => {
          if (n !== seq.current) return;
          if (isUnauthorized(err)) forget();
          else setView({ kind: 'error' });
        },
      );
    },
    [forget],
  );

  useEffect(() => {
    const k = getGalleryKey();
    if (k) refresh(k);
  }, [refresh]);

  const groups = useMemo(() => (view.kind === 'ready' ? groupByDevice(view.plans) : []), [view]);

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
        <h1 className="gallery-title">Galeria</h1>
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

      <div className="gallery-inner">
        {view.kind === 'key' || !key ? (
          <KeyForm
            onEnter={(k, plans) => {
              seq.current += 1;
              setKey(k);
              setView({ kind: 'ready', plans });
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
          groups.map((g) => (
            <section
              key={g.device}
              className="gallery-group"
              aria-label={`Aparelho ${g.device.slice(0, 6)}`}
            >
              <h2 className="start-h2">
                Aparelho <span className="gallery-device">{g.device.slice(0, 6)}</span>
              </h2>
              <ul className="plan-grid">
                {g.plans.map((p) => (
                  <GalleryCard key={cacheKey(p)} plan={p} galleryKey={key} onStale={forget} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
