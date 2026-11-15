import { userMessageOf } from '../persistence/db.ts';
import { toast } from '../ui/controls/Toast.tsx';
import { openProjectFile } from './projectFile.ts';

interface FileHandleLike {
  kind: string;
  getFile(): Promise<File>;
}

interface LaunchParamsLike {
  files: readonly FileHandleLike[];
}

interface LaunchQueueLike {
  setConsumer(consumer: (params: LaunchParamsLike) => void): void;
}

let started = false;

async function consume(params: LaunchParamsLike): Promise<void> {
  const handles = params.files.filter((h) => h.kind === 'file');
  const first = handles[0];
  if (!first) return;
  if (handles.length > 1) toast('Abrimos só o primeiro arquivo.');
  try {
    await openProjectFile(await first.getFile());
  } catch (err) {
    toast(userMessageOf(err, 'Não foi possível abrir este arquivo.'), { tone: 'error' });
  }
}

/** Installed PWA on desktop Chrome: opens a `.casinha.json` that the user double-clicked. */
export function startLaunchQueue(): void {
  if (started) return;
  const queue = (window as Window & { launchQueue?: LaunchQueueLike }).launchQueue;
  if (!queue || typeof queue.setConsumer !== 'function') return;
  started = true;
  queue.setConsumer((params) => {
    void consume(params);
  });
}
