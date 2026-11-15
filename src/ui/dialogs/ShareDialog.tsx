import { Check, Copy, Download, FileText, Share2, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { canShareLink, shareLink, shareOrDownload } from '../../export/share.ts';
import { downloadProjectFile, projectFileBlob } from '../../io/projectFile.ts';
import { encodeShareLink, isShareLinkTooLong, SHARE_LINK_MAX } from '../../io/shareLink.ts';
import { userMessageOf } from '../../persistence/db.ts';
import { noteFileExported } from '../../persistence/storageGuard.ts';
import { useDoc } from '../../store/docStore.ts';
import { uiStore, useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Dialog } from '../controls/Dialog.tsx';
import { toast } from '../controls/Toast.tsx';
import './ShareDialog.css';
import { track } from '../../analytics/track.ts';

type LinkState =
  | { kind: 'busy' }
  | { kind: 'ready'; url: string }
  | { kind: 'error'; message: string };

const countFormat = new Intl.NumberFormat('pt-BR');

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareDialog(): ReactElement {
  const dialog = useUi((s) => s.dialog);
  const doc = useDoc((s) => s.doc);
  const open = dialog === 'share';
  const [link, setLink] = useState<LinkState>({ kind: 'busy' });
  const [copied, setCopied] = useState(false);
  const linkField = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !doc) return;
    let alive = true;
    setLink({ kind: 'busy' });
    setCopied(false);
    encodeShareLink(doc).then(
      (url) => {
        if (alive) setLink({ kind: 'ready', url });
      },
      (err: unknown) => {
        if (alive) {
          setLink({
            kind: 'error',
            message: userMessageOf(
              err,
              'Não foi possível criar o link. Envie o arquivo da planta.',
            ),
          });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [open, doc]);

  const close = () => uiStore.getState().closeDialog();
  const title = doc?.name || 'Planta';

  const shareFile = async () => {
    if (!doc) return;
    let file: File;
    try {
      file = projectFileBlob(doc);
    } catch (err) {
      toast(userMessageOf(err, 'Não foi possível criar o arquivo da planta.'), { tone: 'error' });
      return;
    }
    const outcome = await shareOrDownload(file, title);
    if (outcome === 'cancelled') return;
    noteFileExported();
    track('project_file_export', { method: outcome === 'shared' ? 'web_share' : 'download' });
    if (outcome === 'downloaded') {
      toast(`Arquivo “${file.name}” baixado. Envie-o por onde preferir.`, { tone: 'success' });
    }
  };

  const saveFile = () => {
    if (!doc) return;
    try {
      downloadProjectFile(doc);
    } catch (err) {
      toast(userMessageOf(err, 'Não foi possível criar o arquivo da planta.'), { tone: 'error' });
    }
  };

  const copyLink = async (url: string) => {
    if (await copyText(url)) {
      setCopied(true);
      track('share_link_create', { method: 'copy' });
      toast('Link copiado. Cole na conversa com quem vai ver a planta.', { tone: 'success' });
      return;
    }
    linkField.current?.focus();
    linkField.current?.select();
    toast('Não foi possível copiar sozinho. O link está selecionado: copie e cole.', {
      tone: 'info',
    });
  };

  const sendLink = async (url: string) => {
    const outcome = await shareLink(url, title, `Planta “${title}” feita no app Minha Casinha`);
    if (outcome === 'shared') track('share_link_create', { method: 'web_share' });
    if (outcome === null) await copyLink(url);
  };

  const tooLong = link.kind === 'ready' && isShareLinkTooLong(link.url);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Compartilhar planta"
      description="Envie a planta para outra pessoa abrir e continuar no app Minha Casinha."
      size="md"
    >
      {doc ? (
        <div className="share">
          <section className="share-section">
            <h3 className="share-h3">Arquivo da planta</h3>
            <p className="share-note">
              Um arquivo “.casinha.json” que abre no app Minha Casinha em qualquer aparelho. É o
              jeito mais seguro de enviar e de guardar uma cópia.
            </p>
            <div className="share-actions">
              <Button variant="primary" icon={<Share2 />} onClick={() => void shareFile()}>
                Compartilhar arquivo
              </Button>
              <Button variant="secondary" icon={<Download />} onClick={saveFile}>
                Baixar arquivo
              </Button>
            </div>
          </section>

          <section className="share-section">
            <h3 className="share-h3">Link</h3>
            {link.kind === 'busy' ? (
              <p className="share-note" role="status">
                Criando o link…
              </p>
            ) : link.kind === 'error' ? (
              <p className="share-error" role="alert">
                {link.message}
              </p>
            ) : (
              <>
                <p className="share-note">
                  Quem abrir o link recebe uma cópia da planta. Mudanças depois não chegam pelo
                  mesmo link.
                </p>
                <textarea
                  ref={linkField}
                  className="share-link"
                  readOnly
                  rows={2}
                  value={link.url}
                  aria-label="Link da planta"
                  onFocus={(e) => e.currentTarget.select()}
                />
                {tooLong ? (
                  <p className="share-warn">
                    <TriangleAlert aria-hidden="true" />
                    Este link tem {countFormat.format(link.url.length)} caracteres (mais de{' '}
                    {countFormat.format(SHARE_LINK_MAX)}). Alguns apps cortam links longos: prefira
                    enviar o arquivo da planta.
                  </p>
                ) : null}
                <div className="share-actions">
                  {canShareLink() ? (
                    <Button
                      variant={tooLong ? 'secondary' : 'primary'}
                      icon={<Share2 />}
                      onClick={() => void sendLink(link.url)}
                    >
                      Compartilhar link
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    icon={copied ? <Check /> : <Copy />}
                    onClick={() => void copyLink(link.url)}
                  >
                    {copied ? 'Copiado' : 'Copiar link'}
                  </Button>
                </div>
              </>
            )}
          </section>

          <section className="share-section">
            <h3 className="share-h3">Para um(a) profissional</h3>
            <p className="share-note">
              Um PDF vetorial em escala, com quadro de áreas, para arquiteto(a) ou engenheiro(a).
            </p>
            <div className="share-actions">
              <Button
                variant="secondary"
                icon={<FileText />}
                onClick={() => uiStore.getState().openDialog('export')}
              >
                Exportar PDF ou imagem
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <p className="share-note">Abra uma planta para compartilhar.</p>
      )}
    </Dialog>
  );
}
