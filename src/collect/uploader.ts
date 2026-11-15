import { MATERIALS } from '../catalog/registry.ts';
import { parseProject, serializeProject } from '../model/codec.ts';
import type { Id, ProjectDoc } from '../model/types.ts';
import { onDocSaved, onUserEdit } from '../persistence/autosave.ts';
import { listProjectMeta, loadProjectRecord } from '../persistence/db.ts';
import { TEMPLATES } from '../templates/index.ts';
import { ID_PATTERN, postPlan, type UploadMeta } from './api.ts';
import { hasGalleryKey } from './galleryKey.ts';

const STATE_KEY = 'casinha:collect';
const THROTTLE_MS = 10 * 60_000;
/** A hide flush skips the throttle, so the last version is not lost; this cap stops tab-switch spam. */
const HIDE_GAP_MS = 2 * 60_000;
const PREPARE_DELAY_MS = 1500;
const BACKFILL_DELAY_MS = 5000;
const BACKFILL_GAP_MS = 1500;
const BACKFILL_MAX = 20;
/** The keepalive limit is 64 KB for all in-flight requests together. */
const KEEPALIVE_MAX_BYTES = 60 * 1024;
const MAX_BODY_BYTES = 1024 * 1024;
const BACKOFF_START_MS = 10 * 60_000;
const BACKOFF_MAX_MS = 6 * 60 * 60_000;

interface Sent {
  /** SHA-256 of the uploaded content. */
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
}

interface Prepared {
  seq: number;
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

/** The plan content, without the save time: the same plan saved twice has the same hash. */
const contentHash = (doc: ProjectDoc): Promise<string> =>
  sha256(JSON.stringify({ ...doc, updatedAt: '' }));

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

const latest = new Map<Id, ProjectDoc>();
const seqs = new Map<Id, number>();
const prepared = new Map<Id, Prepared>();
const prepareTimers = new Map<Id, number>();
const uploadTimers = new Map<Id, number>();
const lastAttempt = new Map<Id, number>();
const lastHideSend = new Map<Id, number>();
const inFlight = new Set<Id>();

const seqOf = (id: Id): number => seqs.get(id) ?? 0;

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

async function loadDoc(id: Id): Promise<ProjectDoc | null> {
  const mem = latest.get(id);
  if (mem) return mem;
  try {
    const raw = await loadProjectRecord(id);
    if (raw === undefined) return null;
    return parseProject(JSON.stringify(raw), { isKnownMaterial }).doc;
  } catch {
    return null;
  }
}

/** Null when the plan is gone or does not count as edited. */
async function prepare(id: Id): Promise<Prepared | null> {
  const seq = seqOf(id);
  const doc = await loadDoc(id);
  if (!doc || !ID_PATTERN.test(doc.id)) return null;
  const state = readState();
  if (!(await isEdited(doc, state))) return null;
  const text = serializeProject(doc);
  const [hash, body] = await Promise.all([contentHash(doc), gzip(text)]);
  const p: Prepared = {
    seq,
    hash,
    body,
    meta: {
      device: state.device,
      project: doc.id,
      name: doc.name,
      widthM: doc.lot.width / 1000,
      depthM: doc.lot.depth / 1000,
      updatedAt: doc.updatedAt,
    },
  };
  prepared.set(id, p);
  return p;
}

function clearDirty(id: Id, seq: number): void {
  // A save that landed during the upload keeps the plan dirty.
  if (seqOf(id) !== seq) return;
  update((s) => {
    delete s.dirty[id];
  });
}

function onStatus(id: Id, p: Prepared, status: number): void {
  if (status >= 200 && status < 300) {
    update((s) => {
      s.sent[id] = { h: p.hash, at: Date.now() };
      s.backoffMs = 0;
      s.backoffUntil = 0;
    });
    clearDirty(id, p.seq);
  } else if (status === 429) {
    update((s) => {
      s.backoffMs = Math.min(BACKOFF_MAX_MS, s.backoffMs ? s.backoffMs * 2 : BACKOFF_START_MS);
      s.backoffUntil = Date.now() + s.backoffMs;
    });
  }
  // Other failures keep the plan dirty: a later save or session tries again.
}

/** True when the request went out. */
async function upload(
  id: Id,
  keepalive: boolean,
  budget = { left: KEEPALIVE_MAX_BYTES },
): Promise<boolean> {
  if (!active() || inFlight.has(id)) return false;
  const state = readState();
  if (state.backoffUntil > Date.now()) return false;
  inFlight.add(id);
  try {
    const p = keepalive ? prepared.get(id) : await prepare(id);
    if (!p) {
      if (!keepalive) clearDirty(id, seqOf(id));
      return false;
    }
    if (keepalive && p.seq !== seqOf(id)) return false;
    if (state.sent[id]?.h === p.hash) {
      clearDirty(id, p.seq);
      return false;
    }
    if (p.body.byteLength > MAX_BODY_BYTES) {
      // The Worker refuses it; a later, smaller version can go.
      clearDirty(id, p.seq);
      return false;
    }
    if (keepalive) {
      if (p.body.byteLength > budget.left) return false;
      budget.left -= p.body.byteLength;
      lastHideSend.set(id, Date.now());
    }
    lastAttempt.set(id, Date.now());
    const send = postPlan(p.meta, p.body, keepalive);
    if (keepalive) {
      // The page may close before the answer: do not wait for it.
      void send.then((status) => onStatus(id, p, status)).catch(() => undefined);
      return true;
    }
    onStatus(id, p, await send.catch(() => 0));
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
  const wait = Math.max(0, lastSendOf(id, state) + THROTTLE_MS - now, state.backoffUntil - now);
  uploadTimers.set(
    id,
    window.setTimeout(() => {
      whenIdle(() => {
        uploadTimers.delete(id);
        void upload(id, false).then(() => {
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
      whenIdle(() => void prepare(id).catch(() => undefined));
    }, PREPARE_DELAY_MS),
  );
}

function flushHidden(ids: Iterable<Id>): void {
  if (!active()) return;
  const state = readState();
  const budget = { left: KEEPALIVE_MAX_BYTES };
  const now = Date.now();
  for (const id of ids) {
    if (!state.dirty[id]) continue;
    if (now - (lastHideSend.get(id) ?? 0) < HIDE_GAP_MS) continue;
    void upload(id, true, budget);
  }
}

function onSaved(doc: ProjectDoc): void {
  if (!active()) return;
  latest.set(doc.id, doc);
  seqs.set(doc.id, seqOf(doc.id) + 1);
  if (!readState().edited[doc.id] || doc.areas.length === 0) return;
  update((s) => {
    s.dirty[doc.id] = 1;
  });
  if (document.visibilityState === 'hidden') {
    // The last save of a closing page: send it at once, while the page still runs.
    void prepare(doc.id)
      .then(() => flushHidden([doc.id]))
      .catch(() => undefined);
    return;
  }
  prepareSoon(doc.id);
  schedule(doc.id);
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
    if (Date.now() - lastSendOf(id, state) < THROTTLE_MS) {
      schedule(id);
      continue;
    }
    if (await upload(id, false)) {
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
  const offEdit = onUserEdit((id) => {
    if (!active()) return;
    update((s) => {
      s.edited[id] = 1;
    });
  });
  const offSaved = onDocSaved((doc) => onSaved(doc));
  const onHide = () => {
    if (document.visibilityState === 'hidden') flushHidden(Object.keys(readState().dirty));
  };
  const onPageHide = () => flushHidden(Object.keys(readState().dirty));
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  const backfillTimer = window.setTimeout(
    () => whenIdle(() => void backfill().catch(() => undefined)),
    BACKFILL_DELAY_MS,
  );
  return () => {
    started = false;
    offEdit();
    offSaved();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    window.clearTimeout(backfillTimer);
    for (const t of uploadTimers.values()) window.clearTimeout(t);
    for (const t of prepareTimers.values()) window.clearTimeout(t);
    uploadTimers.clear();
    prepareTimers.clear();
  };
}
