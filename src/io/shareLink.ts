import { createStore, useStore } from 'zustand';
import { track } from '../analytics/track.ts';
import { MAX_FILE_CHARS } from '../model/codec.ts';
import type { ProjectDoc } from '../model/types.ts';
import { PersistenceError, userMessageOf } from '../persistence/db.ts';
import { toast } from '../ui/controls/Toast.tsx';
import { importProjectText } from './projectFile.ts';

const HASH_KEY = '#plan=';
const PREFIX = `${HASH_KEY}1.`;
/** Above this length, chat apps and some browsers cut the link: the share UI recommends the file. */
export const SHARE_LINK_MAX = 30_000;
const MAX_HASH_CHARS = 4_000_000;

const BROKEN_LINK =
  'Este link está quebrado ou incompleto. Peça para enviarem de novo, ou peça o arquivo da planta.';

const canCompress = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new PersistenceError(BROKEN_LINK);
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  let bin: string;
  try {
    bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  } catch {
    throw new PersistenceError(BROKEN_LINK);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The link that opens a copy of the plan in any browser. Throws when the browser cannot compress. */
export async function encodeShareLink(doc: ProjectDoc): Promise<string> {
  if (!canCompress()) {
    throw new PersistenceError(
      'Este navegador não consegue criar o link. Salve um arquivo da planta e envie o arquivo.',
    );
  }
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${location.origin}${location.pathname}${PREFIX}${toBase64Url(packed)}`;
}

export const isShareLinkTooLong = (link: string): boolean => link.length > SHARE_LINK_MAX;

/** Inflates with a size cap, so a tiny link cannot expand into gigabytes. */
async function inflate(packed: Uint8Array): Promise<string> {
  const stream = new Blob([packed as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > MAX_FILE_CHARS) {
        void reader.cancel();
        throw new PersistenceError('Este link traz uma planta grande demais.');
      }
    }
    return text + decoder.decode();
  } catch (err) {
    if (err instanceof PersistenceError) throw err;
    throw new PersistenceError(BROKEN_LINK);
  }
}

async function decodeShareHash(hash: string): Promise<string> {
  if (!hash.startsWith(PREFIX)) {
    const version = /^#plan=(\d+)\./.exec(hash)?.[1];
    if (version && Number(version) > 1) {
      throw new PersistenceError(
        'Este link foi feito numa versão mais nova do app Minha Casinha. Recarregue a página e tente de novo.',
      );
    }
    throw new PersistenceError(BROKEN_LINK);
  }
  if (hash.length > MAX_HASH_CHARS)
    throw new PersistenceError('Este link traz uma planta grande demais.');
  if (!canCompress()) {
    throw new PersistenceError(
      'Este navegador não consegue abrir links de planta. Peça o arquivo da planta.',
    );
  }
  const packed = fromBase64Url(hash.slice(PREFIX.length));
  if (packed.length === 0) throw new PersistenceError(BROKEN_LINK);
  return inflate(packed);
}

// ---------------------------------------------------------------------------
// Confirmation prompt, rendered by PersistenceBanners

export interface ShareRequest {
  name: string;
  answer(open: boolean): void;
}

export const shareRequestStore = createStore<{ request: ShareRequest | null }>()(() => ({
  request: null,
}));

export const useShareRequest = (): ShareRequest | null =>
  useStore(shareRequestStore, (s) => s.request);

function askToOpen(name: string): Promise<boolean> {
  shareRequestStore.getState().request?.answer(false);
  return new Promise<boolean>((resolve) => {
    const request: ShareRequest = {
      name,
      answer(open) {
        if (shareRequestStore.getState().request === request) {
          shareRequestStore.setState({ request: null });
        }
        resolve(open);
      },
    };
    shareRequestStore.setState({ request });
  });
}

/** A best-effort name for the prompt; the codec validates everything later. */
function peekName(text: string): string {
  try {
    const raw: unknown = JSON.parse(text);
    if (raw && typeof raw === 'object' && 'name' in raw && typeof raw.name === 'string') {
      return [...raw.name].slice(0, 60).join('').trim();
    }
  } catch {
    // The codec reports the problem.
  }
  return '';
}

function clearHash(): void {
  const url = `${location.pathname}${location.search}`;
  history.replaceState(history.state, '', url);
}

let busy = false;
let hashListening = false;

async function handleHash(): Promise<void> {
  if (busy || !location.hash.startsWith(HASH_KEY)) return;
  busy = true;
  const hash = location.hash;
  clearHash();
  try {
    const text = await decodeShareHash(hash);
    const open = await askToOpen(peekName(text));
    if (!open) return;
    await importProjectText(text, {
      suffix: '',
      label: 'Planta compartilhada aberta. Ela já está salva aqui.',
    });
    track('share_link_open');
  } finally {
    busy = false;
  }
}

/** Opens a `#plan=` link as a copy, after the user confirms. Throws errors with `userMessage`. */
export async function handleIncomingShare(): Promise<void> {
  if (!hashListening) {
    hashListening = true;
    // A link pasted into a tab that already runs the app changes only the hash.
    window.addEventListener('hashchange', () => {
      handleHash().catch((err: unknown) => {
        toast(userMessageOf(err, 'Não foi possível abrir o link compartilhado.'), {
          tone: 'error',
        });
      });
    });
  }
  await handleHash();
}
