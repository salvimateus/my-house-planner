/**
 * Minha Casinha plan collection Worker.
 *
 * POST /v1/plans stores one project JSON in R2. The gallery routes (GET) need
 * `Authorization: Bearer <GALLERY_KEY>`.
 *
 * @typedef {object} Env
 * @property {R2Bucket} PLANS
 * @property {string} GALLERY_KEY
 * @property {{ limit(options: { key: string }): Promise<{ success: boolean }> }} [WRITE_LIMIT]
 */

const ALLOWED_ORIGINS = new Set([
  'https://minha-casinha.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const MAX_RAW_BYTES = 1024 * 1024;
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const PREFIX = 'plans/';

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
    return withCommonHeaders(response, origin);
  },
};

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
    if (method !== 'GET') return text('Method not allowed', 405);
    return getPlan(request, env, match[1], match[2]);
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

  let body;
  let data;
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    data = JSON.parse(body);
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

  await env.PLANS.put(planKey(device, project), body, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      name: cleanName(params.get('name')),
      w: cleanMeters(params.get('w')),
      d: cleanMeters(params.get('d')),
      updated: cleanDate(params.get('updated')),
      bytes: String(bytes.length),
    },
  });

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
 * Compares SHA-256 digests so the check takes the same time for any key length.
 *
 * @param {Request} request
 * @param {Env} env
 */
async function isAuthorized(request, env) {
  const header = request.headers.get('Authorization') ?? '';
  if (!env.GALLERY_KEY || !header.startsWith('Bearer ')) return false;
  const encoder = new TextEncoder();
  const [given, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(header.slice(7))),
    crypto.subtle.digest('SHA-256', encoder.encode(env.GALLERY_KEY)),
  ]);
  return crypto.subtle.timingSafeEqual(given, expected);
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

/** @param {string | null} value */
function cleanDate(value) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
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
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(response.body, { status: response.status, headers });
}
