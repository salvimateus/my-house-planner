/**
 * Minha Casinha plan collection Worker.
 *
 * POST /v1/plans stores one project JSON in R2. The gallery routes (GET) need
 * `Authorization: Bearer <GALLERY_KEY>`, and so do DELETE /v1/plans/<device>/<project>
 * and the /v1/usage routes.
 *
 * A single UsageCounter Durable Object enforces a hard quota so the bucket stays
 * inside the R2 free tier: total stored bytes and successful writes per UTC month.
 * The same object serves /v1/live, a hibernatable WebSocket that pushes gallery
 * changes to authed clients. The key arrives in the first message, never in the URL.
 *
 * @typedef {object} Env
 * @property {R2Bucket} PLANS
 * @property {string} GALLERY_KEY
 * @property {DurableObjectNamespace} USAGE
 * @property {{ limit(options: { key: string }): Promise<{ success: boolean }> }} [WRITE_LIMIT]
 *
 * @typedef {{ month: string, writes: number, bytes: number, plans: number, seeded: boolean }} Meta
 * @typedef {{ b: number, t: number }} SizeEntry
 * @typedef {{ authed: boolean, openedAt: number }} SocketState
 * @typedef {{ ok: true, previous: number | null, month: string, listeners: number }
 *   | { ok: false, reason: 'storage' | 'writes', retryAfter: number }
 *   | { ok: false, reason: 'unseeded' }} Reservation
 */

import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = new Set([
  'https://minha-casinha.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const MAX_RAW_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const PREFIX = 'plans/';

export const BYTES_LIMIT = 1_000_000_000;
export const WRITES_LIMIT = 100_000;
const STORAGE_RETRY_AFTER = 86400;
const AUTH_TIMEOUT_MS = 10_000;
const MAX_AUTHED_SOCKETS = 10;
const MAX_OPEN_SOCKETS = 20;
const MAX_SOCKET_MESSAGE = 1024;
const PING = '{"type":"ping"}';
const PONG = '{"type":"pong"}';
const META_KEY = 'meta';
const SIZE_PREFIX = 'p:';

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    let response;
    try {
      response = await route(request, env);
    } catch (error) {
      console.error(error);
      response = text('Internal error', 500);
    }
    if (response.status === 101) return response;
    return withCommonHeaders(response, origin);
  },
};

/**
 * Holds the quota state. Every method body is synchronous, so each call is atomic
 * against all other calls to this object.
 */
export class UsageCounter extends DurableObject {
  /**
   * @param {DurableObjectState} ctx
   * @param {Env} env
   */
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /**
   * @param {string} key
   * @param {number} newBytes
   * @returns {Reservation}
   */
  reserve(key, newBytes) {
    const meta = this.#meta();
    if (!meta.seeded) return { ok: false, reason: 'unseeded' };

    if (meta.writes >= WRITES_LIMIT) {
      return { ok: false, reason: 'writes', retryAfter: secondsToNextMonth() };
    }
    const entry = this.#size(key);
    const previous = entry ? entry.b : null;
    const delta = newBytes - (previous ?? 0);
    if (delta > 0 && meta.bytes + delta > BYTES_LIMIT) {
      return { ok: false, reason: 'storage', retryAfter: STORAGE_RETRY_AFTER };
    }

    meta.writes += 1;
    meta.bytes += delta;
    if (previous === null) meta.plans += 1;
    this.ctx.storage.kv.put(SIZE_PREFIX + key, { b: newBytes, t: Date.now() });
    this.ctx.storage.kv.put(META_KEY, meta);
    return { ok: true, previous, month: meta.month, listeners: this.#authedSockets().length };
  }

  /**
   * Reverts a reservation whose R2 put failed. It does nothing when a later write
   * already replaced the entry.
   *
   * @param {string} key
   * @param {number} newBytes
   * @param {number | null} previous
   * @param {string} month
   */
  undo(key, newBytes, previous, month) {
    const meta = this.#meta();
    if (month === meta.month) meta.writes = Math.max(0, meta.writes - 1);
    const entry = this.#size(key);
    if (entry && entry.b === newBytes) {
      meta.bytes = Math.max(0, meta.bytes - newBytes + (previous ?? 0));
      if (previous === null) {
        meta.plans = Math.max(0, meta.plans - 1);
        this.ctx.storage.kv.delete(SIZE_PREFIX + key);
      } else {
        this.ctx.storage.kv.put(SIZE_PREFIX + key, { b: previous, t: entry.t });
      }
    }
    this.ctx.storage.kv.put(META_KEY, meta);
  }

  /**
   * @param {string} key
   * @returns {number} the number of authed live sockets
   */
  release(key) {
    const meta = this.#meta();
    const entry = this.#size(key);
    if (entry) {
      meta.bytes = Math.max(0, meta.bytes - entry.b);
      meta.plans = Math.max(0, meta.plans - 1);
      this.ctx.storage.kv.delete(SIZE_PREFIX + key);
      this.ctx.storage.kv.put(META_KEY, meta);
    }
    return this.#authedSockets().length;
  }

  /**
   * Replaces the size map with a bucket listing taken from `startedAt` on. Entries
   * written after `startedAt` win over the listing, so a concurrent write is never lost.
   *
   * @param {Array<[string, number]>} entries
   * @param {number} startedAt
   * @param {boolean} onlyIfUnseeded
   */
  recount(entries, startedAt, onlyIfUnseeded) {
    const meta = this.#meta();
    if (onlyIfUnseeded && meta.seeded) return this.usage();

    /** @type {Map<string, SizeEntry>} */
    const next = new Map(entries.map(([key, b]) => [key, { b, t: startedAt }]));
    for (const [storageKey, value] of this.ctx.storage.kv.list({ prefix: SIZE_PREFIX })) {
      const entry = /** @type {SizeEntry} */ (value);
      if (entry.t >= startedAt) next.set(storageKey.slice(SIZE_PREFIX.length), entry);
      this.ctx.storage.kv.delete(storageKey);
    }

    let bytes = 0;
    for (const [key, entry] of next) {
      bytes += entry.b;
      this.ctx.storage.kv.put(SIZE_PREFIX + key, entry);
    }
    meta.bytes = bytes;
    meta.plans = next.size;
    meta.seeded = true;
    this.ctx.storage.kv.put(META_KEY, meta);
    return this.usage();
  }

  /**
   * Sends one event, with the current usage, to every authed live socket.
   *
   * @param {Record<string, unknown>} event
   */
  broadcast(event) {
    const message = JSON.stringify({ ...event, usage: publicUsage(this.usage()) });
    for (const ws of this.#authedSockets()) {
      try {
        ws.send(message);
      } catch (error) {
        console.error(error);
      }
    }
  }

  /** @param {Request} request */
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return text('Upgrade required', 426);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    await this.acceptSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Accepts a hibernatable socket and arms the auth timeout alarm.
   *
   * @param {WebSocket} ws
   */
  async acceptSocket(ws) {
    const tooMany = this.ctx.getWebSockets().length >= MAX_OPEN_SOCKETS;
    this.ctx.acceptWebSocket(ws);
    if (tooMany) {
      ws.close(4429, 'too many connections');
      return;
    }
    const openedAt = Date.now();
    ws.serializeAttachment(/** @type {SocketState} */ ({ authed: false, openedAt }));
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(openedAt + AUTH_TIMEOUT_MS);
    }
  }

  /**
   * @param {WebSocket} ws
   * @param {string | ArrayBuffer} message
   */
  async webSocketMessage(ws, message) {
    const state = /** @type {SocketState | null} */ (ws.deserializeAttachment());
    if (!state) return;
    /** @type {{ type?: unknown, key?: unknown } | null} */
    let data = null;
    if (typeof message === 'string' && message.length <= MAX_SOCKET_MESSAGE) {
      try {
        data = JSON.parse(message);
      } catch {
        data = null;
      }
    }
    if (data?.type === 'ping') {
      ws.send(PONG);
      return;
    }
    if (state.authed) return;

    if (Date.now() - state.openedAt > AUTH_TIMEOUT_MS) {
      ws.close(4408, 'auth timeout');
      return;
    }
    if (data?.type !== 'auth' || typeof data.key !== 'string') {
      ws.close(4401, 'unauthorized');
      return;
    }
    if (!(await keyMatches(data.key, this.env.GALLERY_KEY))) {
      ws.close(4401, 'unauthorized');
      return;
    }
    if (this.#authedSockets().length >= MAX_AUTHED_SOCKETS) {
      ws.close(4429, 'too many connections');
      return;
    }
    ws.serializeAttachment(/** @type {SocketState} */ ({ ...state, authed: true }));
    ws.send(JSON.stringify({ type: 'ready', usage: publicUsage(this.usage()) }));
  }

  /**
   * @param {WebSocket} ws
   * @param {number} code
   * @param {string} reason
   */
  webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  /**
   * @param {WebSocket} _ws
   * @param {unknown} error
   */
  webSocketError(_ws, error) {
    console.error(error);
  }

  /** Closes sockets that did not authenticate in time, then re-arms for the rest. */
  async alarm() {
    const now = Date.now();
    let next = Number.POSITIVE_INFINITY;
    for (const ws of this.ctx.getWebSockets()) {
      const state = /** @type {SocketState | null} */ (ws.deserializeAttachment());
      if (!state || state.authed) continue;
      const deadline = state.openedAt + AUTH_TIMEOUT_MS;
      if (deadline <= now) {
        try {
          ws.close(4408, 'auth timeout');
        } catch (error) {
          console.error(error);
        }
      } else {
        next = Math.min(next, deadline);
      }
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
  }

  usage() {
    const meta = this.#meta();
    const reason =
      meta.writes >= WRITES_LIMIT ? 'writes' : meta.bytes >= BYTES_LIMIT ? 'storage' : null;
    return {
      month: meta.month,
      writes: meta.writes,
      writesLimit: WRITES_LIMIT,
      bytes: meta.bytes,
      bytesLimit: BYTES_LIMIT,
      plans: meta.plans,
      paused: reason !== null,
      reason,
      seeded: meta.seeded,
    };
  }

  /** @returns {WebSocket[]} */
  #authedSockets() {
    return this.ctx.getWebSockets().filter((ws) => {
      const state = /** @type {SocketState | null} */ (ws.deserializeAttachment());
      return state?.authed === true;
    });
  }

  /**
   * Reads the totals and resets the write count when a new UTC month starts.
   *
   * @returns {Meta}
   */
  #meta() {
    const month = currentMonth();
    const stored = /** @type {Meta | undefined} */ (this.ctx.storage.kv.get(META_KEY));
    const meta = stored ?? { month, writes: 0, bytes: 0, plans: 0, seeded: false };
    if (meta.month !== month) {
      meta.month = month;
      meta.writes = 0;
      this.ctx.storage.kv.put(META_KEY, meta);
    }
    return meta;
  }

  /**
   * @param {string} key
   * @returns {SizeEntry | undefined}
   */
  #size(key) {
    return /** @type {SizeEntry | undefined} */ (this.ctx.storage.kv.get(SIZE_PREFIX + key));
  }
}

/**
 * @param {Request} request
 * @param {Env} env
 * @returns {Promise<Response>}
 */
async function route(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  if (url.pathname === '/v1/plans') {
    if (method === 'POST') return savePlan(request, env, url);
    if (method === 'GET') return listPlans(request, env);
    return text('Method not allowed', 405);
  }

  const match = url.pathname.match(/^\/v1\/plans\/([^/]+)\/([^/]+)$/);
  if (match) {
    if (method === 'GET') return getPlan(request, env, match[1], match[2]);
    if (method === 'DELETE') return deletePlan(request, env, match[1], match[2]);
    return text('Method not allowed', 405);
  }

  if (url.pathname === '/v1/live') {
    if (method !== 'GET') return text('Method not allowed', 405);
    if (request.headers.get('Upgrade') !== 'websocket') return text('Upgrade required', 426);
    const origin = request.headers.get('Origin');
    if (!origin || !ALLOWED_ORIGINS.has(origin)) return text('Forbidden', 403);
    return usageCounter(env).fetch(request);
  }

  if (url.pathname === '/v1/usage') {
    if (method !== 'GET') return text('Method not allowed', 405);
    return getUsage(request, env);
  }

  if (url.pathname === '/v1/usage/recount') {
    if (method !== 'POST') return text('Method not allowed', 405);
    return recountUsage(request, env);
  }

  return text('Not found', 404);
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {URL} url
 */
async function savePlan(request, env, url) {
  if (env.WRITE_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await env.WRITE_LIMIT.limit({ key: ip });
    if (!success) return text('Too many requests', 429);
  }

  const params = url.searchParams;
  const device = params.get('device') ?? '';
  const project = params.get('project') ?? '';
  if (!ID_PATTERN.test(device) || !ID_PATTERN.test(project)) return text('Bad id', 400);

  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_RAW_BYTES) return text('Too large', 413);

  const raw = await readLimited(request.body, MAX_RAW_BYTES);
  if (!raw) return text('Too large', 413);

  let bytes = raw;
  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    try {
      const inflated = await readLimited(
        new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
        MAX_TEXT_BYTES,
      );
      if (!inflated) return text('Too large', 413);
      bytes = inflated;
    } catch {
      return text('Bad gzip', 400);
    }
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  }

  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    return text('Bad JSON', 400);
  }
  if (
    !data ||
    typeof data !== 'object' ||
    data.format !== 'casinha.project' ||
    typeof data.schemaVersion !== 'number'
  ) {
    return text('Bad format', 400);
  }

  const key = planKey(device, project);
  const counter = usageCounter(env);
  let reservation;
  try {
    reservation = await counter.reserve(key, bytes.length);
    if (!reservation.ok && reservation.reason === 'unseeded') {
      await seedCounter(env, counter, true);
      reservation = await counter.reserve(key, bytes.length);
    }
  } catch (error) {
    console.error(error);
    return text('Quota service unavailable', 503);
  }
  if (!reservation.ok) {
    if (reservation.reason === 'unseeded') return text('Quota service unavailable', 503);
    return Response.json(
      { error: 'quota', reason: reservation.reason },
      { status: 507, headers: { 'Retry-After': String(reservation.retryAfter) } },
    );
  }

  const customMetadata = {
    name: cleanName(params.get('name')),
    w: cleanMeters(params.get('w')),
    d: cleanMeters(params.get('d')),
    updated: cleanDate(params.get('updated')),
    bytes: String(bytes.length),
  };
  try {
    await env.PLANS.put(key, bytes, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata,
    });
  } catch (error) {
    await counter
      .undo(key, bytes.length, reservation.previous, reservation.month)
      .catch((/** @type {unknown} */ undoError) => console.error(undoError));
    throw error;
  }

  if (reservation.listeners > 0) {
    const plan = {
      device,
      project,
      name: customMetadata.name,
      lotWidthM: toNumberOrNull(customMetadata.w),
      lotDepthM: toNumberOrNull(customMetadata.d),
      updatedAt: customMetadata.updated,
      bytes: bytes.length,
    };
    await notify(counter, { type: 'plan', plan });
  }
  return new Response(null, { status: 204 });
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function listPlans(request, env) {
  if (!(await isAuthorized(request, env))) return text('Unauthorized', 401);

  const plans = [];
  /** @type {string | undefined} */
  let cursor;
  do {
    const page = await env.PLANS.list({ prefix: PREFIX, cursor, include: ['customMetadata'] });
    for (const object of page.objects) {
      const parts = object.key
        .slice(PREFIX.length)
        .replace(/\.json$/, '')
        .split('/');
      if (parts.length !== 2) continue;
      const meta = object.customMetadata ?? {};
      plans.push({
        device: parts[0],
        project: parts[1],
        name: meta.name ?? '',
        lotWidthM: toNumberOrNull(meta.w),
        lotDepthM: toNumberOrNull(meta.d),
        updatedAt: meta.updated || object.uploaded.toISOString(),
        bytes: Number(meta.bytes) || object.size,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  plans.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return Response.json({ plans });
}

/**
 * @param {Request} request
 * @param {Env} env
 * @param {string} device
 * @param {string} project
 */
async function getPlan(request, env, device, project) {
  if (!(await isAuthorized(request, env))) return text('Unauthorized', 401);
  if (!ID_PATTERN.test(device) || !ID_PATTERN.test(project)) return text('Bad id', 400);

  const object = await env.PLANS.get(planKey(device, project));
  if (!object) return text('Not found', 404);
  return new Response(object.body, { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Idempotent: a missing plan also returns 204. The R2 delete runs first, so a failed
 * release can only leave the counter too high, never too low.
 *
 * @param {Request} request
 * @param {Env} env
 * @param {string} device
 * @param {string} project
 */
async function deletePlan(request, env, device, project) {
  if (!(await isAuthorized(request, env))) return text('Unauthorized', 401);
  if (!ID_PATTERN.test(device) || !ID_PATTERN.test(project)) return text('Bad id', 400);

  const key = planKey(device, project);
  await env.PLANS.delete(key);
  const counter = usageCounter(env);
  let listeners = 0;
  try {
    listeners = await counter.release(key);
  } catch (error) {
    console.error(error);
  }
  if (listeners > 0) await notify(counter, { type: 'deleted', device, project });
  return new Response(null, { status: 204 });
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function getUsage(request, env) {
  if (!(await isAuthorized(request, env))) return text('Unauthorized', 401);
  const counter = usageCounter(env);
  let usage = await counter.usage();
  if (!usage.seeded) usage = await seedCounter(env, counter, true);
  return Response.json(publicUsage(usage));
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function recountUsage(request, env) {
  if (!(await isAuthorized(request, env))) return text('Unauthorized', 401);
  const counter = usageCounter(env);
  const usage = await seedCounter(env, counter, false);
  await notify(counter, { type: 'usage' });
  return Response.json(publicUsage(usage));
}

/**
 * Lists every stored plan and hands the sizes to the counter.
 *
 * @param {Env} env
 * @param {ReturnType<typeof usageCounter>} counter
 * @param {boolean} onlyIfUnseeded
 */
async function seedCounter(env, counter, onlyIfUnseeded) {
  const startedAt = Date.now();
  /** @type {Array<[string, number]>} */
  const entries = [];
  /** @type {string | undefined} */
  let cursor;
  do {
    const page = await env.PLANS.list({ prefix: PREFIX, cursor });
    for (const object of page.objects) entries.push([object.key, object.size]);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return counter.recount(entries, startedAt, onlyIfUnseeded);
}

/**
 * @param {{ seeded?: boolean } & Record<string, unknown>} usage
 */
function publicUsage(usage) {
  const { seeded: _seeded, ...rest } = usage;
  return rest;
}

/**
 * Pushes a live event. A failure here never fails the write that caused it.
 *
 * @param {ReturnType<typeof usageCounter>} counter
 * @param {Record<string, unknown>} event
 */
async function notify(counter, event) {
  try {
    await counter.broadcast(event);
  } catch (error) {
    console.error(error);
  }
}

/** @param {Env} env */
function usageCounter(env) {
  return /** @type {any} */ (env.USAGE.get(env.USAGE.idFromName('global')));
}

/**
 * @param {Request} request
 * @param {Env} env
 */
async function isAuthorized(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return false;
  return keyMatches(header.slice(7), env.GALLERY_KEY);
}

/**
 * Compares SHA-256 digests so the check takes the same time for any key length.
 *
 * @param {string} given
 * @param {string | undefined} expected
 */
async function keyMatches(given, expected) {
  if (!expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Reads a stream into memory, or returns null when it passes the limit.
 *
 * @param {ReadableStream<Uint8Array> | null} stream
 * @param {number} limit
 * @returns {Promise<Uint8Array | null>}
 */
async function readLimited(stream, limit) {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function currentMonth() {
  return new Date(Date.now()).toISOString().slice(0, 7);
}

function secondsToNextMonth() {
  const now = new Date(Date.now());
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * @param {string} device
 * @param {string} project
 */
function planKey(device, project) {
  return `${PREFIX}${device}/${project}.json`;
}

/** @param {string | null} value */
function cleanName(value) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  return Array.from((value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ''))
    .slice(0, 120)
    .join('');
}

/** @param {string | null} value */
function cleanMeters(value) {
  if (value === null || value.trim() === '') return '';
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1000 ? String(number) : '';
}

/**
 * A client date in the future is clamped to server time, so it cannot pin a plan to
 * the top of the gallery.
 *
 * @param {string | null} value
 */
function cleanDate(value) {
  const now = Date.now();
  const time = value ? Date.parse(value) : Number.NaN;
  return new Date(Number.isNaN(time) ? now : Math.min(time, now)).toISOString();
}

/** @param {string | undefined} value */
function toNumberOrNull(value) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {string} body
 * @param {number} status
 */
function text(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
}

/**
 * @param {Response} response
 * @param {string | null} origin
 */
function withCommonHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Vary', 'Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Expose-Headers', 'Retry-After');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(response.body, { status: response.status, headers });
}
