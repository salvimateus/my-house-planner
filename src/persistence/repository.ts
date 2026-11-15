import { useEffect } from 'react';
import { createStore, useStore } from 'zustand';
import { MATERIALS } from '../catalog/registry.ts';
import { emit } from '../juice/events.ts';
import { MAX_NAME_CHARS, parseProject } from '../model/codec.ts';
import { createProject } from '../model/factories.ts';
import type { Id, NewProjectInput, ProjectDoc, ProjectMeta } from '../model/types.ts';
import { docStore } from '../store/docStore.ts';
import { uiStore } from '../store/uiStore.ts';
import { toast } from '../ui/controls/Toast.tsx';
import { flushAutosave, markClean, persistDoc } from './autosave.ts';
import {
  deleteProjectRecord,
  getProjectMeta,
  kvDelete,
  kvGet,
  kvSet,
  listProjectMeta,
  loadProjectRecord,
  PersistenceError,
  StorageWriteError,
} from './db.ts';
import { acquireProjectLock, type ProjectLock, waitForProjectLock } from './projectLock.ts';
import { reportWriteError, resetEditCount } from './storageGuard.ts';
import { notifyGalleryChanged, onGalleryChanged } from './tabSync.ts';

const LAST_OPENED_KEY = 'lastOpenedId';

interface Current {
  id: Id;
  lock: ProjectLock;
  /** Set while read-only: waits for the other tab to let the lock go. */
  waiter: AbortController | null;
}

let current: Current | null = null;

export const isKnownMaterial = (id: string): boolean => MATERIALS.has(id);

/** Untrusted or stored data always goes through the codec before it reaches the editor. */
function sanitizeDoc(raw: unknown, newId: boolean): ProjectDoc {
  return parseProject(JSON.stringify(raw), { newId, isKnownMaterial }).doc;
}

const cut = (text: string, max: number): string => [...text].slice(0, max).join('').trim();

/** Keeps a suffix whole when the name hits the codec limit. */
export function nameWithSuffix(base: string, suffix: string): string {
  const room = MAX_NAME_CHARS - [...suffix].length;
  return `${cut(base, Math.max(1, room))}${suffix}`;
}

// ---------------------------------------------------------------------------
// Gallery list

const listStore = createStore<{ projects: ProjectMeta[]; ready: boolean }>()(() => ({
  projects: [],
  ready: false,
}));

let listUsers = 0;
let listSeq = 0;
let unsubGallery: (() => void) | null = null;

async function refreshList(): Promise<void> {
  const seq = ++listSeq;
  try {
    const projects = await listProjectMeta();
    if (seq === listSeq) listStore.setState({ projects, ready: true });
  } catch {
    if (seq === listSeq) listStore.setState({ ready: true });
  }
}

export function useProjectList(): { projects: ProjectMeta[]; ready: boolean } {
  const projects = useStore(listStore, (s) => s.projects);
  const ready = useStore(listStore, (s) => s.ready);
  useEffect(() => {
    listUsers += 1;
    if (listUsers === 1) {
      unsubGallery = onGalleryChanged(() => {
        if (listUsers > 0) void refreshList();
      });
    }
    void refreshList();
    return () => {
      listUsers -= 1;
      if (listUsers === 0) {
        unsubGallery?.();
        unsubGallery = null;
      }
    };
  }, []);
  return { projects, ready };
}

export async function getLastOpenedId(): Promise<Id | null> {
  const id = await kvGet(LAST_OPENED_KEY);
  return typeof id === 'string' ? id : null;
}

// ---------------------------------------------------------------------------
// Open and close

async function applyView(id: Id): Promise<void> {
  const meta = await getProjectMeta(id).catch(() => null);
  if (meta) uiStore.getState().setLayers(meta.view.layers);
}

/** Saves pending edits and lets the lock go, without leaving the current screen. */
async function closeCurrent(): Promise<void> {
  if (!current) {
    docStore.getState().close();
    return;
  }
  await flushAutosave();
  const { lock, waiter } = current;
  current = null;
  waiter?.abort();
  lock.release();
  docStore.getState().close();
}

function enterEditor(doc: ProjectDoc, lock: ProjectLock, readOnly: boolean): void {
  markClean(doc);
  resetEditCount();
  const docs = docStore.getState();
  docs.load(doc);
  if (readOnly) docs.setReadOnly(true);
  current = { id: doc.id, lock, waiter: null };
  if (readOnly) watchForUnlock(doc.id);
  void kvSet(LAST_OPENED_KEY, doc.id);
  uiStore.getState().setScreen('editor');
  emit({ type: 'project-opened', projectId: doc.id });
}

/** Saves a doc that this tab just made, then opens it for editing. */
async function openFresh(doc: ProjectDoc): Promise<void> {
  await closeCurrent();
  try {
    await persistDoc(doc, { thumb: true });
  } catch (err) {
    // The plan stays in memory; the banner asks the user to save a file.
    reportWriteError(err instanceof StorageWriteError && err.quota);
  }
  const lock = await acquireProjectLock(doc.id);
  enterEditor(doc, lock, false);
}

const isEmptyPlan = (doc: ProjectDoc): boolean =>
  doc.areas.length +
    doc.items.length +
    doc.openings.length +
    doc.rulers.length +
    doc.walkways.length ===
  0;

async function readStored(id: Id): Promise<ProjectDoc> {
  const raw = await loadProjectRecord(id);
  if (raw === undefined) {
    throw new PersistenceError('Esta planta não foi encontrada neste navegador.');
  }
  return sanitizeDoc(raw, false);
}

export async function openProject(id: Id): Promise<void> {
  const doc = await readStored(id);
  await closeCurrent();
  const lock = await acquireProjectLock(id);
  await applyView(id);
  enterEditor(doc, lock, !lock.granted);
}

/**
 * Read-only tab: follows the other tab's saves, and becomes editable when that tab
 * closes the plan.
 */
function watchForUnlock(id: Id): void {
  if (!current || current.id !== id) return;
  const waiter = new AbortController();
  current.waiter = waiter;

  const offGallery = onGalleryChanged(() => {
    if (waiter.signal.aborted || current?.id !== id || !docStore.getState().readOnly) return;
    void readStored(id)
      .then((doc) => {
        if (waiter.signal.aborted || current?.id !== id || !docStore.getState().readOnly) return;
        // A reload of a plan with no content replays the lot reveal; skip it.
        if (isEmptyPlan(doc)) return;
        markClean(doc);
        docStore.getState().load(doc);
        docStore.getState().setReadOnly(true);
      })
      .catch(() => {
        // The other tab may have deleted it; the view keeps the last copy.
      });
  });
  waiter.signal.addEventListener('abort', offGallery, { once: true });

  void waitForProjectLock(id, waiter.signal).then(async (lock) => {
    offGallery();
    if (!lock) return;
    if (waiter.signal.aborted || current?.id !== id) {
      lock.release();
      return;
    }
    try {
      const doc = await readStored(id);
      if (waiter.signal.aborted || current?.id !== id) {
        lock.release();
        return;
      }
      current = { id, lock, waiter: null };
      markClean(doc);
      docStore.getState().load(doc);
      toast('A outra aba fechou esta planta. Agora você pode editar aqui.', { tone: 'success' });
    } catch {
      lock.release();
    }
  });
}

export async function newProject(input: NewProjectInput): Promise<void> {
  await openFresh(createProject(input));
}

/** Opens any doc (import, share link, template, "Abrir uma cópia") as a new project. */
export async function openDocAsCopy(doc: ProjectDoc): Promise<void> {
  const now = new Date().toISOString();
  const copy = { ...sanitizeDoc(doc, true), createdAt: now, updatedAt: now };
  await openFresh(copy);
}

/** Copy of the read-only plan, named so the two are easy to tell apart. */
export async function openReadOnlyCopy(): Promise<void> {
  const doc = docStore.getState().doc;
  if (!doc) return;
  await openDocAsCopy({ ...doc, name: nameWithSuffix(doc.name, ' (cópia)') });
  toast('Cópia aberta. As mudanças aqui não mexem na outra aba.', { tone: 'success' });
}

const IDEA_SUFFIX = /\s·\sideia\s\d+$/;

export async function duplicateCurrentAsIdea(): Promise<void> {
  const doc = docStore.getState().doc;
  if (!doc) return;
  if (!docStore.getState().readOnly) await flushAutosave();
  const base = doc.name.replace(IDEA_SUFFIX, '').trim() || doc.name;
  const taken = new Set((await listProjectMeta().catch(() => [])).map((m) => m.name));
  let n = 2;
  while (taken.has(nameWithSuffix(base, ` · ideia ${n}`))) n += 1;
  const name = nameWithSuffix(base, ` · ideia ${n}`);
  await openDocAsCopy({ ...doc, name });
  toast(`Nova ideia criada: “${name}”. A planta anterior continua salva.`, { tone: 'success' });
}

const LOCKED_ELSEWHERE = 'Esta planta está aberta em outra aba. Feche-a lá e tente de novo.';

/** Runs a change on a stored project that no editor holds. */
async function withStoredProject(id: Id, task: () => Promise<void>): Promise<void> {
  const lock = await acquireProjectLock(id);
  if (!lock.granted) throw new PersistenceError(LOCKED_ELSEWHERE);
  try {
    await task();
  } finally {
    lock.release();
  }
}

export async function renameProject(id: Id, name: string): Promise<void> {
  const next = cut(name, MAX_NAME_CHARS);
  if (!next) return;
  if (current?.id === id) {
    if (docStore.getState().readOnly) throw new PersistenceError(LOCKED_ELSEWHERE);
    docStore.getState().commit('Renomear planta', (d) => {
      d.name = next;
    });
    await flushAutosave();
    return;
  }
  await withStoredProject(id, async () => {
    const doc = await readStored(id);
    await persistDoc({ ...doc, name: next }, { thumb: false });
  });
}

export async function deleteProject(id: Id): Promise<void> {
  if (current?.id === id) await closeCurrent();
  await withStoredProject(id, async () => {
    await deleteProjectRecord(id);
  });
  if ((await getLastOpenedId()) === id) await kvDelete(LAST_OPENED_KEY);
  notifyGalleryChanged();
}

export async function closeProject(): Promise<void> {
  await closeCurrent();
  uiStore.getState().setScreen('start');
}
