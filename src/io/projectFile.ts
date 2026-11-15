import { track } from '../analytics/track.ts';
import { CodecError, MAX_FILE_CHARS, parseProject, serializeProject } from '../model/codec.ts';
import type { ProjectDoc } from '../model/types.ts';
import { userMessageOf } from '../persistence/db.ts';
import { isKnownMaterial, nameWithSuffix, openDocAsCopy } from '../persistence/repository.ts';
import { noteFileExported } from '../persistence/storageGuard.ts';
import { toast } from '../ui/controls/Toast.tsx';

export const PROJECT_FILE_EXT = '.casinha.json';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PICK_ACCEPT = '.json,.casinha.json,application/json';

export function projectFileSlug(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'planta';
}

/** A `.casinha.json` file that opens on any computer with the app. */
export function projectFileBlob(doc: ProjectDoc): File {
  return new File([serializeProject(doc)], `${projectFileSlug(doc.name)}${PROJECT_FILE_EXT}`, {
    type: 'application/json',
  });
}

export function downloadProjectFile(doc: ProjectDoc): void {
  const file = projectFileBlob(doc);
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  noteFileExported();
  track('project_file_export', { method: 'download' });
  toast(`Arquivo “${file.name}” salvo. Guarde-o ou envie para quem vai ver a planta.`, {
    tone: 'success',
  });
}

function repairSummary(repairs: string[]): string {
  if (repairs.length === 0) return 'Planta importada.';
  const n = repairs.length;
  const head = n === 1 ? 'Planta importada com 1 ajuste: ' : `Planta importada com ${n} ajustes: `;
  return head + repairs.join(' ');
}

/** Parses untrusted text and opens it as a new project. Throws errors with `userMessage`. */
export async function importProjectText(
  text: string,
  opts: { suffix: string; label?: string },
): Promise<void> {
  const { doc, repairs } = parseProject(text, { newId: true, isKnownMaterial });
  await openDocAsCopy({ ...doc, name: nameWithSuffix(doc.name, opts.suffix) });
  toast(opts.label && repairs.length === 0 ? opts.label : repairSummary(repairs), {
    tone: repairs.length ? 'info' : 'success',
    durationMs: repairs.length ? 9000 : undefined,
  });
}

export async function openProjectFile(file: File): Promise<void> {
  if (file.size > MAX_FILE_BYTES) throw new CodecError('Arquivo grande demais para uma planta.');
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new CodecError('Não foi possível ler este arquivo.');
  }
  if (text.length > MAX_FILE_CHARS) throw new CodecError('Arquivo grande demais para uma planta.');
  await importProjectText(text, { suffix: ' (importada)' });
  track('project_file_import');
}

/** Shows the file picker. Resolves after the chosen file opens, or when the user cancels. */
export function pickProjectFile(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = PICK_ACCEPT;
    input.style.display = 'none';
    let settled = false;
    let focusTimer: number | undefined;

    const finish = () => {
      settled = true;
      window.clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocus);
      input.remove();
    };
    // Browsers without the `cancel` event: the window gets focus back after the picker closes.
    const onFocus = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => {
        if (settled || input.files?.length) return;
        finish();
        resolve();
      }, 1000);
    };

    input.addEventListener('change', () => {
      if (settled) return;
      const file = input.files?.[0];
      finish();
      if (!file) {
        resolve();
        return;
      }
      openProjectFile(file).then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      if (settled) return;
      finish();
      resolve();
    });
    if (!('oncancel' in input)) window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false;

/**
 * Window drag and drop of a project file. `onHover` drives the drop overlay.
 * Returns the clean-up.
 */
export function startFileDrop(onHover: (over: boolean) => void): () => void {
  let depth = 0;
  const onEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth += 1;
    onHover(true);
  };
  const onOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) onHover(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    onHover(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    const file = files[0];
    if (!file) return;
    if (files.length > 1) toast('Abrimos só o primeiro arquivo.');
    openProjectFile(file).catch((err: unknown) => {
      toast(userMessageOf(err, 'Não foi possível abrir este arquivo.'), { tone: 'error' });
    });
  };
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragover', onOver);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragenter', onEnter);
    window.removeEventListener('dragover', onOver);
    window.removeEventListener('dragleave', onLeave);
    window.removeEventListener('drop', onDrop);
  };
}
