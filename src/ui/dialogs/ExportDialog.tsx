import {
  CircleCheck,
  Download,
  LoaderCircle,
  RefreshCw,
  Share2,
  TriangleAlert,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SCALES } from '../../export/layout.ts';
import { exportPdf } from '../../export/pdfExport.ts';
import { exportPng, type PngDpi, type PngSize } from '../../export/pngExport.ts';
import { canShareFile, downloadUrl, shareOrDownload } from '../../export/share.ts';
import { sheetLayoutFor } from '../../export/sheet.ts';
import { exportSvg, sheetSvgMarkup } from '../../export/svgExport.ts';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportFormat,
  type ExportOptions,
} from '../../export/types.ts';
import { emit } from '../../juice/events.ts';
import { feedback } from '../../juice/feedback.ts';
import type { ProjectDoc } from '../../model/types.ts';
import { userMessageOf } from '../../persistence/db.ts';
import { useDoc } from '../../store/docStore.ts';
import { uiStore, useUi } from '../../store/uiStore.ts';
import { Button } from '../controls/Button.tsx';
import { Dialog } from '../controls/Dialog.tsx';
import { Segmented } from '../controls/Segmented.tsx';
import { Switch } from '../controls/Switch.tsx';
import { toast } from '../controls/Toast.tsx';
import './ExportDialog.css';
import { errorCode, track } from '../../analytics/track.ts';

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF vetorial' },
  { value: 'svg', label: 'SVG vetorial' },
  { value: 'png', label: 'PNG alta resolução' },
];

const FORMAT_NOTE: Record<ExportFormat, string> = {
  pdf: 'Melhor para imprimir e enviar: linhas nítidas em qualquer zoom.',
  svg: 'Desenho vetorial que abre no navegador e em programas de desenho.',
  png: 'Imagem para ver no celular ou colar em mensagens.',
};

const PAPER_OPTIONS = [
  { value: 'A4', label: 'A4' },
  { value: 'A3', label: 'A3' },
] as const;

const FRAME_OPTIONS = [
  { value: 'lot', label: 'Terreno inteiro' },
  { value: 'building', label: 'Só a construção' },
] as const;

const COLOR_OPTIONS = [
  { value: 'color', label: 'Cores' },
  { value: 'mono', label: 'Preto e branco' },
] as const;

const DPI_OPTIONS = [
  { value: '300', label: '300 DPI' },
  { value: '150', label: 'Mais leve (150 DPI)' },
] as const;

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ready'; file: File; png: PngSize | null }
  /** The options changed after the file was made: it no longer matches them. */
  | { kind: 'stale' }
  | { kind: 'error'; message: string };

const ACTION_LABEL: Record<ExportFormat, string> = {
  pdf: 'Gerar PDF',
  svg: 'Gerar SVG',
  png: 'Gerar imagem',
};

const sizeFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${sizeFormat.format(Math.max(1, bytes / 1024))} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

async function createFile(
  doc: ProjectDoc,
  format: ExportFormat,
  opts: ExportOptions,
  dpi: PngDpi,
): Promise<{ file: File; png: PngSize | null }> {
  if (format === 'pdf') return { file: await exportPdf(doc, opts), png: null };
  if (format === 'svg') return { file: await exportSvg(doc, opts), png: null };
  const r = await exportPng(doc, opts, dpi);
  return { file: r.file, png: r.size };
}

/** The export settings as short analytics values: the switches on, the frame and the color. */
function exportParams(format: ExportFormat, opts: ExportOptions, dpi: PngDpi) {
  const { paper, frame, scale, mono, ...switches } = opts;
  const on = Object.entries(switches)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return {
    format,
    paper,
    scale: scale === null ? 'auto' : `1:${scale}`,
    dpi: format === 'png' ? dpi : undefined,
    options: [`frame:${frame}`, mono ? 'mono' : 'color', ...on].join(','),
  };
}

const shareMethod = (outcome: 'shared' | 'downloaded') =>
  outcome === 'shared' ? ('web_share' as const) : ('download' as const);

/** One object URL for the file, revoked when the file changes and on unmount. */
function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return url;
}

/** Live preview: the same self-contained SVG that the export writes, in an `<img>`. */
function usePreview(doc: ProjectDoc | null, opts: ExportOptions, open: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || !doc) return;
    let alive = true;
    let made: string | null = null;
    const timer = window.setTimeout(() => {
      sheetSvgMarkup(doc, opts).then(
        ({ markup }) => {
          if (!alive) return;
          made = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
          setUrl(made);
          setFailed(false);
        },
        () => {
          if (alive) setFailed(true);
        },
      );
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      // The next preview replaces this one; revoke after the swap.
      if (made) {
        const old = made;
        window.setTimeout(() => URL.revokeObjectURL(old), 1000);
      }
    };
  }, [doc, opts, open]);
  useEffect(() => {
    if (!open) setUrl(null);
  }, [open]);
  return { url, failed };
}

export function ExportDialog(): ReactElement {
  const dialog = useUi((s) => s.dialog);
  const doc = useDoc((s) => s.doc);
  const open = dialog === 'export';
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [opts, setOpts] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [dpi, setDpi] = useState<PngDpi>(300);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const run = useRef(0);
  const preview = usePreview(doc, opts, open);
  const layout = doc ? sheetLayoutFor(doc, opts) : null;
  const busy = phase.kind === 'busy';
  const fileUrl = useObjectUrl(phase.kind === 'ready' ? phase.file : null);
  const downloadRef = useRef<HTMLButtonElement>(null);

  // A new file is needed after any change. A file made for other options becomes stale.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependencies are the triggers
  useEffect(() => {
    run.current += 1;
    setPhase((p) =>
      p.kind === 'ready' || p.kind === 'stale' ? { kind: 'stale' } : { kind: 'idle' },
    );
  }, [format, opts, dpi, doc]);

  // Each opening starts clean.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the dependency is the trigger
  useEffect(() => {
    run.current += 1;
    setPhase({ kind: 'idle' });
  }, [open]);

  // The URL arrives once per new file: move focus to its download.
  useEffect(() => {
    if (fileUrl) downloadRef.current?.focus();
  }, [fileUrl]);

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) =>
    setOpts((o) => ({ ...o, [key]: value }));

  const close = () => uiStore.getState().closeDialog();

  const create = async () => {
    if (!doc || busy) return;
    const id = ++run.current;
    setPhase({ kind: 'busy' });
    try {
      const r = await createFile(doc, format, opts, dpi);
      if (id !== run.current) return;
      setPhase({ kind: 'ready', file: r.file, png: r.png });
      feedback.success();
      emit({ type: 'export-done', format });
      track('export_generate', exportParams(format, opts, dpi));
    } catch (err) {
      if (id !== run.current) return;
      const message = userMessageOf(err, 'Não foi possível criar o arquivo. Tente de novo.');
      setPhase({ kind: 'error', message });
      track('app_error', { error_code: errorCode(message) });
    }
  };

  const download = (file: File) => {
    if (!fileUrl) return;
    downloadUrl(fileUrl, file.name);
    track('export_download', { format });
    toast(`Arquivo “${file.name}” salvo.`, { tone: 'success' });
  };

  const share = async (file: File) => {
    const outcome = await shareOrDownload(file, doc?.name || 'Planta');
    if (outcome !== 'cancelled') track('export_share', { format, method: shareMethod(outcome) });
    if (outcome === 'downloaded') {
      toast(
        'Este navegador não compartilha arquivos. O arquivo foi baixado: envie-o por onde preferir.',
        {
          tone: 'info',
        },
      );
    }
  };

  const scaleValue = opts.scale === null ? 'auto' : String(opts.scale);
  const orientationLabel = layout?.orientation === 'portrait' ? 'em pé' : 'deitada';

  const footer = (
    <div className="export-foot">
      {phase.kind === 'error' ? (
        <p className="export-error" role="alert">
          {phase.message}
        </p>
      ) : null}
      <div className="export-actions">
        <Button variant="ghost" onClick={close}>
          {phase.kind === 'ready' ? 'Fechar' : 'Cancelar'}
        </Button>
        <Button
          variant={phase.kind === 'ready' ? 'secondary' : 'primary'}
          disabled={!doc || busy}
          aria-busy={busy}
          icon={busy ? <LoaderCircle className="export-spin" /> : undefined}
          onClick={() => void create()}
        >
          {busy ? 'Gerando…' : phase.kind === 'ready' ? 'Gerar de novo' : ACTION_LABEL[format]}
        </Button>
      </div>
    </div>
  );

  const readyRow =
    phase.kind === 'ready' ? (
      <section className="export-ready" aria-label="Arquivo pronto">
        <CircleCheck className="export-ready-check" aria-hidden="true" />
        <p className="export-ready-text">
          <span className="export-ready-title">Arquivo pronto</span>
          <span className="export-ready-file">
            {phase.file.name} ({fileSize(phase.file.size)})
            {phase.png ? (
              <>
                {' · '}
                {phase.png.width} × {phase.png.height} px, {phase.png.dpi} DPI
                {phase.png.dpi < dpi ? ' (limite deste aparelho)' : ''}
              </>
            ) : null}
          </span>
        </p>
        <div className="export-ready-actions">
          <Button
            ref={downloadRef}
            variant="primary"
            className="export-download"
            icon={<Download />}
            onClick={() => download(phase.file)}
          >
            Baixar
          </Button>
          {canShareFile(phase.file) ? (
            <Button variant="secondary" icon={<Share2 />} onClick={() => void share(phase.file)}>
              Compartilhar
            </Button>
          ) : null}
        </div>
      </section>
    ) : phase.kind === 'stale' ? (
      <section className="export-ready export-ready-stale" aria-label="Arquivo desatualizado">
        <RefreshCw className="export-ready-check" aria-hidden="true" />
        <p className="export-ready-text">
          <span className="export-ready-title">As opções mudaram</span>
          <span className="export-ready-file">
            Gere o arquivo de novo para baixar com as opções atuais.
          </span>
        </p>
      </section>
    ) : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Exportar planta"
      description="Crie um arquivo de alta qualidade para imprimir ou enviar a um(a) profissional."
      size="lg"
      footer={footer}
    >
      <p className="sr-only" aria-live="polite">
        {phase.kind === 'ready' ? `Arquivo pronto: ${phase.file.name}` : ''}
      </p>
      {doc ? (
        <div className="export">
          <figure className="export-preview">
            <div
              className="export-paper"
              style={{ aspectRatio: layout ? `${layout.w} / ${layout.h}` : undefined }}
            >
              {preview.url ? (
                <img src={preview.url} alt="Prévia da folha exportada" />
              ) : (
                <span className="export-preview-wait">
                  {preview.failed ? 'Não foi possível mostrar a prévia.' : 'Montando a prévia…'}
                </span>
              )}
            </div>
            {layout ? (
              <figcaption className="export-caption">
                {layout.paper} {orientationLabel} · escala 1:{layout.scale}
              </figcaption>
            ) : null}
            {layout && !layout.fits ? (
              <p className="export-warn">
                <TriangleAlert aria-hidden="true" />
                Nesta escala, parte do desenho fica fora da folha. Escolha “Automática” ou a folha
                A3.
              </p>
            ) : null}
          </figure>

          <fieldset className="export-options" disabled={busy}>
            <legend className="sr-only">Opções de exportação</legend>
            <Segmented
              label="Formato"
              showLabel
              options={FORMAT_OPTIONS}
              value={format}
              onChange={(v: ExportFormat) => setFormat(v)}
            />
            <p className="export-note">{FORMAT_NOTE[format]}</p>
            {format === 'png' ? (
              <Segmented
                label="Resolução"
                showLabel
                options={DPI_OPTIONS}
                value={String(dpi) as '150' | '300'}
                onChange={(v) => setDpi(v === '150' ? 150 : 300)}
              />
            ) : null}
            <div className="export-pair">
              <Segmented
                label="Folha"
                showLabel
                options={PAPER_OPTIONS}
                value={opts.paper}
                onChange={(v) => set('paper', v)}
              />
              <label className="export-select">
                <span className="export-select-label">Escala</span>
                <select
                  value={scaleValue}
                  onChange={(e) =>
                    set('scale', e.target.value === 'auto' ? null : Number(e.target.value))
                  }
                >
                  <option value="auto">Automática</option>
                  {SCALES.map((s) => (
                    <option key={s} value={s}>
                      1:{s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Segmented
              label="Enquadramento"
              showLabel
              options={FRAME_OPTIONS}
              value={opts.frame}
              onChange={(v) => set('frame', v)}
            />
            <Segmented
              label="Cores"
              showLabel
              options={COLOR_OPTIONS}
              value={opts.mono ? 'mono' : 'color'}
              onChange={(v) => set('mono', v === 'mono')}
            />
            <div className="export-switches">
              <Switch label="Móveis" checked={opts.items} onChange={(v) => set('items', v)} />
              <Switch
                label="Medidas dos ambientes"
                checked={opts.measures}
                onChange={(v) => set('measures', v)}
              />
              <Switch label="Réguas" checked={opts.rulers} onChange={(v) => set('rulers', v)} />
              <Switch
                label="Cotas do terreno"
                checked={opts.lotSize}
                onChange={(v) => set('lotSize', v)}
              />
              <Switch
                label="Medidas de portas e janelas"
                checked={opts.openingSizes}
                onChange={(v) => set('openingSizes', v)}
              />
              <Switch
                label="Vizinhança"
                description="Divisas dos lotes vizinhos e árvores da calçada."
                checked={opts.context}
                onChange={(v) => set('context', v)}
              />
              <Switch label="Grade de 1 m" checked={opts.grid} onChange={(v) => set('grid', v)} />
            </div>
          </fieldset>
          {readyRow}
        </div>
      ) : (
        <p className="export-note">Abra uma planta para exportar.</p>
      )}
    </Dialog>
  );
}
