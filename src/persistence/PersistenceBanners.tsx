import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  CircleAlert,
  Copy,
  Download,
  FileUp,
  HardDrive,
  Lock,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { downloadProjectFile, startFileDrop } from '../io/projectFile.ts';
import { useShareRequest } from '../io/shareLink.ts';
import { docStore, useDoc } from '../store/docStore.ts';
import { useUi } from '../store/uiStore.ts';
import { Button } from '../ui/controls/Button.tsx';
import { Dialog } from '../ui/controls/Dialog.tsx';
import { toast } from '../ui/controls/Toast.tsx';
import { flushAutosave } from './autosave.ts';
import { userMessageOf } from './db.ts';
import { openReadOnlyCopy } from './repository.ts';
import { dismissBanner, type StorageBanner, useGuard } from './storageGuard.ts';
import './PersistenceBanners.css';

type BannerProps = {
  icon: ReactNode;
  tone?: 'info' | 'warn' | 'error';
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
};

function Banner({ icon, tone = 'info', children, actions, onDismiss }: BannerProps): ReactElement {
  return (
    <div className={`pbanner pbanner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="pbanner-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="pbanner-text">{children}</p>
      {actions ? <div className="pbanner-actions">{actions}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          className="pbanner-close"
          aria-label="Fechar aviso"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function SaveFileButton(): ReactElement | null {
  const hasDoc = useDoc((s) => s.doc !== null);
  if (!hasDoc) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<Download />}
      onClick={() => {
        const doc = docStore.getState().doc;
        if (doc) downloadProjectFile(doc);
      }}
    >
      Salvar arquivo
    </Button>
  );
}

function ReadOnlyBanner(): ReactElement | null {
  const readOnly = useDoc((s) => s.readOnly && s.doc !== null);
  const screen = useUi((s) => s.screen);
  const [busy, setBusy] = useState(false);
  if (!readOnly || screen !== 'editor') return null;
  const openCopy = () => {
    setBusy(true);
    openReadOnlyCopy()
      .catch((err: unknown) =>
        toast(userMessageOf(err, 'Não foi possível abrir uma cópia.'), { tone: 'error' }),
      )
      .finally(() => setBusy(false));
  };
  return (
    <Banner
      icon={<Lock />}
      tone="warn"
      actions={
        <Button size="sm" variant="primary" icon={<Copy />} disabled={busy} onClick={openCopy}>
          Abrir uma cópia
        </Button>
      }
    >
      Esta planta está aberta em outra aba. Você está vendo uma versão só para leitura.
    </Banner>
  );
}

function StorageBanners(): ReactElement {
  const g = useGuard((s) => s);
  const editing = useUi((s) => s.screen === 'editor');
  const dismiss = (id: StorageBanner) => () => dismissBanner(id);
  const show = (id: StorageBanner, on: boolean) => on && !g.dismissed[id];
  return (
    <>
      {show('writeError', g.writeError !== null) ? (
        <Banner
          icon={<CircleAlert />}
          tone="error"
          actions={<SaveFileButton />}
          onDismiss={dismiss('writeError')}
        >
          {g.writeError === 'quota'
            ? 'O espaço do navegador acabou e a planta não foi salva aqui. Salve um arquivo para não perder nada.'
            : 'Não foi possível salvar no navegador. Salve um arquivo para não perder sua planta.'}
        </Banner>
      ) : null}
      {show('private', g.privateMode) ? (
        <Banner
          icon={<HardDrive />}
          tone="warn"
          actions={<SaveFileButton />}
          onDismiss={dismiss('private')}
        >
          Modo privado: salve um arquivo para não perder sua planta.
        </Banner>
      ) : null}
      {show('nearlyFull', g.nearlyFull && !g.writeError) ? (
        <Banner
          icon={<HardDrive />}
          tone="warn"
          actions={<SaveFileButton />}
          onDismiss={dismiss('nearlyFull')}
        >
          O espaço do navegador está quase cheio. Salve um arquivo e exclua plantas que você não
          usa.
        </Banner>
      ) : null}
      {show('ios', g.iosNotice) ? (
        <Banner icon={<Smartphone />} onDismiss={dismiss('ios')}>
          No iPhone, o Safari pode apagar dados de sites sem uso por 7 dias. Adicione à Tela de
          Início ou salve um arquivo.
        </Banner>
      ) : null}
      {editing && show('exportReminder', g.exportReminder) ? (
        <Banner
          icon={<Download />}
          actions={<SaveFileButton />}
          onDismiss={dismiss('exportReminder')}
        >
          Você já fez muitas mudanças. Que tal salvar um arquivo como cópia de segurança?
        </Banner>
      ) : null}
    </>
  );
}

function UpdateBanner(): ReactElement | null {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError() {
      // No service worker (private mode, http): the app still works online.
    },
  });
  if (!needRefresh) return null;
  const update = async () => {
    setUpdating(true);
    try {
      await flushAutosave({ thumb: true });
      await updateServiceWorker(true);
    } catch {
      setUpdating(false);
      toast('Não foi possível atualizar agora. Recarregue a página mais tarde.', { tone: 'error' });
    }
  };
  return (
    <Banner
      icon={<RefreshCw />}
      actions={
        <Button size="sm" variant="primary" disabled={updating} onClick={() => void update()}>
          Atualizar
        </Button>
      }
      onDismiss={() => setNeedRefresh(false)}
    >
      Nova versão disponível
    </Banner>
  );
}

function ShareConfirm(): ReactElement {
  const request = useShareRequest();
  const [last, setLast] = useState(request);
  if (request && request !== last) setLast(request);
  const shown = request ?? last;
  return (
    <Dialog
      open={request !== null}
      onClose={() => request?.answer(false)}
      title="Abrir planta compartilhada?"
      size="sm"
      description={
        shown?.name
          ? `Alguém mandou a planta “${shown.name}”. Ela vai virar uma cópia salva neste navegador.`
          : 'Alguém mandou uma planta. Ela vai virar uma cópia salva neste navegador.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => request?.answer(false)}>
            Agora não
          </Button>
          <Button variant="primary" onClick={() => request?.answer(true)}>
            Abrir planta
          </Button>
        </>
      }
    />
  );
}

function DropOverlay(): ReactElement | null {
  const [over, setOver] = useState(false);
  useEffect(() => startFileDrop(setOver), []);
  if (!over) return null;
  return (
    <div className="pdrop" aria-hidden="true">
      <div className="pdrop-card">
        <FileUp className="pdrop-icon" />
        <p>Solte o arquivo para abrir a planta</p>
      </div>
    </div>
  );
}

export function PersistenceBanners(): ReactElement {
  const screen = useUi((s) => s.screen);
  return (
    <>
      <div className="pbanners" data-screen={screen}>
        <ReadOnlyBanner />
        <StorageBanners />
        <UpdateBanner />
      </div>
      <ShareConfirm />
      <DropOverlay />
    </>
  );
}
