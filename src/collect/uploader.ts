import { MATERIALS } from '../catalog/registry.ts';
import { parseProject, serializeProject } from '../model/codec.ts';
import type { Id, ProjectDoc } from '../model/types.ts';
import { onDocSaved, onUserEdit } from '../persistence/autosave.ts';
import { listProjectMeta, loadProjectRecord } from '../persistence/db.ts';
import { docStore } from '../store/docStore.ts';
import { TEMPLATES } from '../templates/index.ts';
import { ID_PATTERN, postPlan, type UploadMeta, type UploadResult } from './api.ts';
import { hasGalleryKey } from './galleryKey.ts';

const STATE_KEY = 'casinha:collect';
const THROTTLE_MS = 5 * 60_000;
const PREPARE_DELAY_MS = 1000;
const BACKFILL_DELAY_MS = 5000;
const BACKFILL_GAP_MS = 1500;
const BACKFILL_MAX = 20;
/** The keepalive limit is 64 KB for all in-flight requests together. */
const KEEPALIVE_MAX_BYTES = 60 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const BACKOFF_START_MS = 10 * 60_000;
const BACKOFF_MAX_MS = 6 * 60 * 60_000;
/** The quota service is down: a short pause, so a broken counter is not hammered. */
const UNAVAILABLE_BACKOFF_MS = 15 * 60_000;
const QUOTA_PAUSE_DEFAULT_MS = 24 * 60 * 60_000;

/** The end of the 429 back-off, the 503 back-off or the quota pause, whichever is later. */
const blockedUntil = (s: CollectState): number => Math.max(s.backoffUntil, s.pausedUntil);

interface Sent {
  /** Sync hash of the uploaded content (`contentKey`). */
  h: string;
  at: number;
}

interface CollectState {
  device: string;
  /** Plans created after this time count as edited only after a user edit. */
  since: string;
  edited: Record<Id, 1>;
  dirty: Record<Id, 1>;
  sent: Record<Id, Sent>;
  backoffUntil: number;
  backoffMs: number;
  /** The Worker's quota is full: nothing goes out before this time. */
  pausedUntil: number;
}

interface Prepared {
  hash: string;
  body: Uint8Array<ArrayBuffer>;
  meta: UploadMeta;
}

// ---------------------------------------------------------------------------
// Persistent state (localStorage)

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readState(): CollectState {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null');
  } catch {
    raw = null;
  }
  const r = isObj(raw) ? raw : {};
  const state: CollectState = {
    device: typeof r.device === 'string' && ID_PATTERN.test(r.device) ? r.device : randomId(),
    since: typeof r.since === 'string' ? r.since : new Date().toISOString(),
    edited: isObj(r.edited) ? (r.edited as CollectState['edited']) : {},
    dirty: isObj(r.dirty) ? (r.dirty as CollectState['dirty']) : {},
    sent: isObj(r.sent) ? (r.sent as CollectState['sent']) : {},
    backoffUntil: typeof r.backoffUntil === 'number' ? r.backoffUntil : 0,
    backoffMs: typeof r.backoffMs === 'number' ? r.backoffMs : 0,
    pausedUntil: typeof r.pausedUntil === 'number' ? r.pausedUntil : 0,
  };
  if (r.device !== state.device || r.since !== state.since) writeState(state);
  return state;
}

function writeState(state: CollectState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: the next session starts again.
  }
}

/** Read, change, write: other tabs may change the state between two calls. */
function update(fn: (s: CollectState) => void): CollectState {
  const s = readState();
  fn(s);
  writeState(s);
  return s;
}

// ---------------------------------------------------------------------------
// Content

const encoder = new TextEncoder();

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  let hex = '';
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Two FNV-1a 32-bit passes with different seeds. Sync, so the hide flush can use it while the
 * page closes; it only tells changed content from unchanged content.
 */
function quickHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}.${text.length.toString(36)}`;
}

/** The plan content, without the save time: the same plan saved twice has the same hash. */
const contentHash = (doc: ProjectDoc): string =>
  quickHash(JSON.stringify({ ...doc, updatedAt: '' }));

/** The drawing alone, without the fields that each copy of a template changes. */
const drawingHash = (doc: ProjectDoc): Promise<string> =>
  sha256(JSON.stringify({ ...doc, id: '', name: '', createdAt: '', updatedAt: '' }));

const isKnownMaterial = (id: string): boolean => MATERIALS.has(id);

let templateHashes: Promise<Set<string>> | null = null;

function templateDrawings(): Promise<Set<string>> {
  templateHashes ??= Promise.all(
    TEMPLATES.map(async (t) => {
      try {
        const doc = await t.load();
        // The same path as "Abrir exemplo": the copy goes through the codec once more.
        const copy = parseProject(JSON.stringify(doc), { isKnownMaterial }).doc;
        return await drawingHash(copy);
      } catch {
        return '';
      }
    }),
  ).then((list) => new Set(list.filter(Boolean)));
  return templateHashes;
}

/**
 * A plan counts as the user's own work when it has a room and the user changed it: a user edit
 * in the editor, or, for plans from before the collection, a drawing unlike every template.
 */
async function isEdited(doc: ProjectDoc, state: CollectState): Promise<boolean> {
  if (doc.areas.length === 0) return false;
  if (state.edited[doc.id]) return true;
  if (doc.createdAt >= state.since) return false;
  return !(await templateDrawings()).has(await drawingHash(doc));
}

// ---------------------------------------------------------------------------
// Upload

/** The last stored copy of each plan this session saved. */
const latest = new Map<Id, ProjectDoc>();
/** The newest gzip body of each dirty plan, ready for a hide flush. */
const prepared = new Map<Id, Prepared>();
const prepareTimers = new Map<Id, number>();
const uploadTimers = new Map<Id, number>();
const lastAttempt = new Map<Id, number>();
/** The content hash that the last hide flush sent, so `pagehide` after `visibilitychange` is a no-op. */
const hideSent = new Map<Id, string>();
const inFlight = new Set<Id>();

function active(): boolean {
  return import.meta.env.PROD && !hasGalleryKey();
}

function whenIdle(task: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 3000 });
  } else {
    window.setTimeout(task, 200);
  }
}

/** The open plan in the editor, edits included, even before autosave writes them. */
function openDoc(): ProjectDoc | null {
  const { doc, gesture, ephemeral, readOnly } = docStore.getState();
  // A temporary gallery plan is never the user's work; a read-only tab is not the editor of it.
  if (!doc || ephemeral || readOnly) return null;
  return gesture?.base ?? doc;
}

/** The newest content of a plan this tab knows, without a wait. */
function currentDoc(id: Id): ProjectDoc | null {
  const open = openDoc();
  if (open?.id === id) return open;
  return latest.get(id) ?? null;
}

async function loadDoc(id: Id): Promise<ProjectDoc | null> {
  const mem = currentDoc(id);
  if (mem) return mem;
  try {
    const raw = await loadProjectRecord(id);
    if (raw === undefined) return null;
    return parseProject(JSON.stringify(raw), { isKnownMaterial }).doc;
  } catch {
    return null;
  }
}

/** When the user last changed each plan in this tab; autosave may not have stored it yet. */
const editedAt = new Map<Id, string>();

function metaOf(doc: ProjectDoc, device: string): UploadMeta {
  const edit = editedAt.get(doc.id) ?? '';
  return {
    device,
    project: doc.id,
    name: doc.name,
    widthM: doc.lot.width / 1000,
    depthM: doc.lot.depth / 1000,
    // ISO strings: the later one sorts last.
    updatedAt: [doc.updatedAt, edit].sort()[1]!,
  };
}

/** Null when the plan is gone or does not count as edited. */
async function prepare(id: Id): Promise<Prepared | null> {
  const doc = await loadDoc(id);
  if (!doc || !ID_PATTERN.test(doc.id)) return null;
  const state = readState();
  if (!(await isEdited(doc, state))) return null;
  const p: Prepared = {
    hash: contentHash(doc),
    body: await gzip(serializeProject(doc)),
    meta: metaOf(doc, state.device),
  };
  prepared.set(id, p);
  return p;
}

/** Clears the dirty flag only when the sent content is still the newest one. */
function clearDirtyIf(id: Id, hash: string): void {
  const cur = currentDoc(id);
  if (cur && contentHash(cur) !== hash) return;
  update((s) => {
    delete s.dirty[id];
  });
}

const NO_RESPONSE: UploadResult = { status: 0, retryAfterS: null };

function onStatus(id: Id, hash: string, { status, retryAfterS }: UploadResult): void {
  if (status >= 200 && status < 300) {
    update((s) => {
      s.sent[id] = { h: hash, at: Date.now() };
      s.backoffMs = 0;
      s.backoffUntil = 0;
    });
    clearDirtyIf(id, hash);
  } else if (status === 429 || status === 503 || status === 507) {
    // Nothing was stored: the shared wait below decides when to try again, not the throttle.
    lastAttempt.delete(id);
  }
  if (status === 429) {
    update((s) => {
      s.backoffMs = Math.min(BACKOFF_MAX_MS, s.backoffMs ? s.backoffMs * 2 : BACKOFF_START_MS);
      s.backoffUntil = Date.now() + s.backoffMs;
    });
  } else if (status === 507) {
    update((s) => {
      s.pausedUntil = Date.now() + (retryAfterS ? retryAfterS * 1000 : QUOTA_PAUSE_DEFAULT_MS);
    });
  } else if (status === 503) {
    update((s) => {
      s.backoffUntil = Math.max(s.backoffUntil, Date.now() + UNAVAILABLE_BACKOFF_MS);
    });
  }
  // Other failures keep the plan dirty: a later save or session tries again.
}

/** The throttled path. True when the request went out. */
async function upload(id: Id): Promise<boolean> {
  if (!active() || inFlight.has(id)) return false;
  if (blockedUntil(readState()) > Date.now()) return false;
  inFlight.add(id);
  try {
    const p = await prepare(id);
    if (!p) {
      update((s) => {
        delete s.dirty[id];
      });
      return false;
    }
    if (readState().sent[id]?.h === p.hash || p.body.byteLength > MAX_BODY_BYTES) {
      // Unchanged, or too big for the Worker: a later, changed version can go.
      clearDirtyIf(id, p.hash);
      return false;
    }
    lastAttempt.set(id, Date.now());
    onStatus(id, p.hash, await postPlan(p.meta, p.body, false).catch(() => NO_RESPONSE));
    return true;
  } catch {
    return false;
  } finally {
    inFlight.delete(id);
  }
}

function lastSendOf(id: Id, state: CollectState): number {
  return Math.max(lastAttempt.get(id) ?? 0, state.sent[id]?.at ?? 0);
}

/** Leading upload now, then at most one per window; the trailing one sends the latest version. */
function schedule(id: Id): void {
  if (uploadTimers.has(id)) return;
  const state = readState();
  const now = Date.now();
  const wait = Math.max(0, lastSendOf(id, state) + THROTTLE_MS - now, blockedUntil(state) - now);
  uploadTimers.set(
    id,
    window.setTimeout(() => {
      whenIdle(() => {
        uploadTimers.delete(id);
        void upload(id).then(() => {
          if (readState().dirty[id] && active()) schedule(id);
        });
      });
    }, wait),
  );
}

function prepareSoon(id: Id): void {
  window.clearTimeout(prepareTimers.get(id));
  prepareTimers.set(
    id,
    window.setTimeout(() => {
      prepareTimers.delete(id);
      void prepare(id).catch(() => undefined);
    }, PREPARE_DELAY_MS),
  );
}

/**
 * Sends the newest content of every dirty plan with `keepalive`, the open plan first. It runs
 * fully sync up to each `fetch`: nothing async can finish while the page closes.
 */
function flushHidden(): void {
  if (!active()) return;
  const state = readState();
  if (blockedUntil(state) > Date.now()) return;
  const open = openDoc();
  const dirty = Object.keys(state.dirty);
  const ids =
    open && dirty.includes(open.id) ? [open.id, ...dirty.filter((id) => id !== open.id)] : dirty;
  let left = KEEPALIVE_MAX_BYTES;
  for (const id of ids) {
    if (!state.edited[id] && !prepared.has(id)) continue;
    const doc = currentDoc(id);
    const hash = doc ? contentHash(doc) : prepared.get(id)?.hash;
    if (!hash || state.sent[id]?.h === hash || hideSent.get(id) === hash) continue;
    let body: Uint8Array<ArrayBuffer> | null = null;
    let meta: UploadMeta | null = null;
    const ready = prepared.get(id);
    if (ready && ready.hash === hash) {
      body = ready.body;
      meta = ready.meta;
    } else if (doc && doc.areas.length > 0 && ID_PATTERN.test(doc.id)) {
      // The last edit is newer than the gzip body: plain JSON, which the Worker also takes.
      const raw = encoder.encode(serializeProject(doc));
      if (raw.byteLength <= left) {
        body = raw;
        meta = metaOf(doc, state.device);
      }
    }
    if ((!body || body.byteLength > left) && ready) {
      // Too big as plain JSON: the newest gzip body is still better than nothing.
      body = ready.body;
      meta = ready.meta;
    }
    if (!body || !meta || body.byteLength > left) continue;
    left -= body.byteLength;
    const sentHash = body === ready?.body ? ready.hash : hash;
    hideSent.set(id, sentHash);
    lastAttempt.set(id, Date.now());
    postPlan(meta, body, true).then(
      (res) => onStatus(id, sentHash, res),
      () => undefined,
    );
  }
}

function onEdit(id: Id): void {
  if (!active()) return;
  const open = openDoc();
  if (!open || open.id !== id) return;
  editedAt.set(id, new Date().toISOString());
  update((s) => {
    s.edited[id] = 1;
    if (open.areas.length > 0) s.dirty[id] = 1;
  });
  if (open.areas.length === 0) return;
  prepareSoon(id);
  schedule(id);
}

function onSaved(doc: ProjectDoc): void {
  if (!active()) return;
  latest.set(doc.id, doc);
  if (!readState().edited[doc.id] || doc.areas.length === 0) return;
  // A save of a plan that is not open (a rename on the start screen) is an edit too.
  if (openDoc()?.id !== doc.id) {
    update((s) => {
      s.dirty[doc.id] = 1;
    });
    prepareSoon(doc.id);
    schedule(doc.id);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Sends the dirty and the never-sent plans of this browser, one by one. */
async function backfill(): Promise<void> {
  let metas: { id: Id }[];
  try {
    metas = await listProjectMeta();
  } catch {
    return;
  }
  const known = new Set(metas.map((m) => m.id));
  update((s) => {
    for (const map of [s.edited, s.dirty, s.sent]) {
      for (const id of Object.keys(map)) if (!known.has(id)) delete map[id];
    }
  });
  let sent = 0;
  for (const { id } of metas) {
    if (sent >= BACKFILL_MAX || !active()) return;
    const state = readState();
    if (!state.dirty[id] && state.sent[id]) continue;
    if (uploadTimers.has(id)) continue;
    if (blockedUntil(state) > Date.now()) {
      // Paused or backing off: the dirty plans go once the wait ends.
      if (state.dirty[id]) schedule(id);
      continue;
    }
    if (Date.now() - lastSendOf(id, state) < THROTTLE_MS) {
      schedule(id);
      continue;
    }
    if (await upload(id)) {
      sent += 1;
      await sleep(BACKFILL_GAP_MS);
    }
  }
}

let started = false;

/** Production only, and never on the device that holds the gallery key. */
export function startCollect(): () => void {
  if (!import.meta.env.PROD || started) return () => undefined;
  started = true;
  readState();
  const offEdit = onUserEdit(onEdit);
  const offSaved = onDocSaved((doc) => onSaved(doc));
  const onHide = () => {
    if (document.visibilityState === 'hidden') flushHidden();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flushHidden);
  const backfillTimer = window.setTimeout(
    () => whenIdle(() => void backfill().catch(() => undefined)),
    BACKFILL_DELAY_MS,
  );
  return () => {
    started = false;
    offEdit();
    offSaved();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flushHidden);
    window.clearTimeout(backfillTimer);
    for (const t of uploadTimers.values()) window.clearTimeout(t);
    for (const t of prepareTimers.values()) window.clearTimeout(t);
    uploadTimers.clear();
    prepareTimers.clear();
  };
}
