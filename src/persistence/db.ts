import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { Id, LayerId, ProjectDoc, ProjectMeta, ViewPrefs } from '../model/types.ts';
import { DEFAULT_LAYERS } from '../store/uiStore.ts';
import { reportStorageUnavailable } from './storageGuard.ts';

/** Error with a pt-BR message that the UI shows as is. */
export class PersistenceError extends Error {
  userMessage: string;
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceError';
    this.userMessage = message;
  }
}

/** The pt-BR message of a codec or persistence error, or the fallback. */
export function userMessageOf(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'userMessage' in err) {
    const m = (err as { userMessage: unknown }).userMessage;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}

interface CasinhaDB extends DBSchema {
  projects: { key: Id; value: ProjectDoc };
  meta: { key: Id; value: ProjectMeta; indexes: { byUpdated: string } };
  kv: { key: string; value: unknown };
}

export type MetaPatch = {
  /** Omitted: keep the stored thumbnail. */
  thumbSvg?: string;
  lotLabel: string;
  view: ViewPrefs;
};

interface Backend {
  getProject(id: Id): Promise<unknown>;
  getMeta(id: Id): Promise<unknown>;
  listMeta(): Promise<unknown[]>;
  put(doc: ProjectDoc, meta: ProjectMeta): Promise<void>;
  remove(id: Id): Promise<void>;
  kvGet(key: string): Promise<unknown>;
  kvSet(key: string, value: unknown): Promise<void>;
  kvDelete(key: string): Promise<void>;
}

const DB_NAME = 'casinha';
const OPEN_TIMEOUT_MS = 5000;
const MAX_THUMB_CHARS = 400_000;

function idbBackend(db: IDBPDatabase<CasinhaDB>): Backend {
  return {
    getProject: (id) => db.get('projects', id),
    getMeta: (id) => db.get('meta', id),
    // Newest first.
    listMeta: async () => (await db.getAllFromIndex('meta', 'byUpdated')).reverse(),
    put: async (doc, meta) => {
      const tx = db.transaction(['projects', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('projects').put(doc),
        tx.objectStore('meta').put(meta),
        tx.done,
      ]);
    },
    remove: async (id) => {
      const tx = db.transaction(['projects', 'meta'], 'readwrite');
      await Promise.all([
        tx.objectStore('projects').delete(id),
        tx.objectStore('meta').delete(id),
        tx.done,
      ]);
    },
    kvGet: (key) => db.get('kv', key),
    kvSet: async (key, value) => {
      await db.put('kv', value, key);
    },
    kvDelete: (key) => db.delete('kv', key),
  };
}

/** Session-only storage when IndexedDB is missing or blocked (private mode). */
function memoryBackend(): Backend {
  const projects = new Map<Id, ProjectDoc>();
  const metas = new Map<Id, ProjectMeta>();
  const kv = new Map<string, unknown>();
  return {
    getProject: async (id) => structuredClone(projects.get(id)),
    getMeta: async (id) => structuredClone(metas.get(id)),
    listMeta: async () =>
      [...metas.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((m) => structuredClone(m)),
    put: async (doc, meta) => {
      projects.set(doc.id, structuredClone(doc));
      metas.set(meta.id, structuredClone(meta));
    },
    remove: async (id) => {
      projects.delete(id);
      metas.delete(id);
    },
    kvGet: async (key) => kv.get(key),
    kvSet: async (key, value) => {
      kv.set(key, value);
    },
    kvDelete: async (key) => {
      kv.delete(key);
    },
  };
}

let backendPromise: Promise<Backend> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('IndexedDB open timed out')), ms);
    p.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function openBackend(): Promise<Backend> {
  if (typeof indexedDB === 'undefined') {
    reportStorageUnavailable();
    return memoryBackend();
  }
  try {
    const db = await withTimeout(
      openDB<CasinhaDB>(DB_NAME, 1, {
        upgrade(database, oldVersion) {
          if (oldVersion < 1) {
            database.createObjectStore('projects', { keyPath: 'id' });
            database
              .createObjectStore('meta', { keyPath: 'id' })
              .createIndex('byUpdated', 'updatedAt');
            database.createObjectStore('kv');
          }
        },
        blocking() {
          // A newer app version in another tab wants to upgrade: let it.
          db.close();
          backendPromise = null;
        },
        terminated() {
          backendPromise = null;
        },
      }),
      OPEN_TIMEOUT_MS,
    );
    return idbBackend(db);
  } catch {
    reportStorageUnavailable();
    return memoryBackend();
  }
}

function backend(): Promise<Backend> {
  backendPromise ??= openBackend();
  return backendPromise;
}

/** Opens the database early, so the storage mode is known before the first save. */
export function warmUpStorage(): void {
  void backend();
}

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export class StorageWriteError extends PersistenceError {
  quota: boolean;
  constructor(quota: boolean) {
    super(
      quota
        ? 'O espaço do navegador acabou. Salve um arquivo da planta para não perder nada.'
        : 'Não foi possível salvar no navegador. Salve um arquivo da planta para não perder nada.',
    );
    this.name = 'StorageWriteError';
    this.quota = quota;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Raw stored record; the caller must sanitize it through the codec. */
export async function loadProjectRecord(id: Id): Promise<unknown> {
  const b = await backend();
  return b.getProject(id);
}

function cleanMeta(raw: unknown): ProjectMeta | null {
  if (!isRecord(raw)) return null;
  const { id, name, updatedAt, thumbSvg, lotLabel, view } = raw;
  if (typeof id !== 'string' || !id) return null;
  return {
    id,
    name: typeof name === 'string' ? name.slice(0, 200) : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    thumbSvg: typeof thumbSvg === 'string' && thumbSvg.length <= MAX_THUMB_CHARS ? thumbSvg : '',
    lotLabel: typeof lotLabel === 'string' ? lotLabel.slice(0, 60) : '',
    view: cleanView(view),
  };
}

function cleanView(raw: unknown): ViewPrefs {
  const stored = isRecord(raw) && isRecord(raw.layers) ? raw.layers : {};
  const layers = { ...DEFAULT_LAYERS };
  for (const key of Object.keys(DEFAULT_LAYERS) as LayerId[]) {
    const entry = stored[key];
    if (!isRecord(entry)) continue;
    layers[key] = {
      visible: typeof entry.visible === 'boolean' ? entry.visible : DEFAULT_LAYERS[key].visible,
      locked: typeof entry.locked === 'boolean' ? entry.locked : DEFAULT_LAYERS[key].locked,
    };
  }
  return { layers };
}

export async function getProjectMeta(id: Id): Promise<ProjectMeta | null> {
  const b = await backend();
  return cleanMeta(await b.getMeta(id));
}

/** Corrupt meta records are skipped, so one bad entry never hides the whole gallery. */
export async function listProjectMeta(): Promise<ProjectMeta[]> {
  const b = await backend();
  const out: ProjectMeta[] = [];
  for (const raw of await b.listMeta()) {
    const meta = cleanMeta(raw);
    if (meta) out.push(meta);
  }
  return out;
}

/** Writes the doc and its gallery meta in one transaction. Returns the stored `updatedAt`. */
export async function saveProjectRecord(doc: ProjectDoc, patch: MetaPatch): Promise<string> {
  const b = await backend();
  const updatedAt = new Date().toISOString();
  try {
    let thumbSvg = patch.thumbSvg;
    if (thumbSvg === undefined) thumbSvg = cleanMeta(await b.getMeta(doc.id))?.thumbSvg ?? '';
    await b.put(
      { ...doc, updatedAt },
      {
        id: doc.id,
        name: doc.name,
        updatedAt,
        thumbSvg: thumbSvg.length <= MAX_THUMB_CHARS ? thumbSvg : '',
        lotLabel: patch.lotLabel,
        view: patch.view,
      },
    );
  } catch (err) {
    throw new StorageWriteError(isQuotaError(err));
  }
  return updatedAt;
}

export async function deleteProjectRecord(id: Id): Promise<void> {
  const b = await backend();
  try {
    await b.remove(id);
  } catch (err) {
    throw new StorageWriteError(isQuotaError(err));
  }
}

export async function kvGet(key: string): Promise<unknown> {
  try {
    return await (await backend()).kvGet(key);
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await (await backend()).kvSet(key, value);
  } catch {
    // Non-critical keys only: losing one is harmless.
  }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    await (await backend()).kvDelete(key);
  } catch {
    // Non-critical keys only.
  }
}
