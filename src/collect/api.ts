import { PLANS_API } from './config.ts';

export interface RemotePlan {
  device: string;
  project: string;
  name: string;
  lotWidthM: number;
  lotDepthM: number;
  updatedAt: string;
  bytes: number;
}

export interface UploadMeta {
  device: string;
  project: string;
  name: string;
  widthM: number;
  depthM: number;
  updatedAt: string;
}

/** A failed gallery call: `unauthorized` for a 401, `network` when no response came. */
export class GalleryApiError extends Error {
  kind: 'unauthorized' | 'not-found' | 'network' | 'server';
  constructor(kind: GalleryApiError['kind']) {
    super(kind);
    this.name = 'GalleryApiError';
    this.kind = kind;
  }
}

export interface UploadResult {
  status: number;
  /** `Retry-After` in seconds, when the Worker sent a readable one. */
  retryAfterS: number | null;
}

export interface Usage {
  month: string;
  writes: number;
  writesLimit: number;
  bytes: number;
  bytesLimit: number;
  plans: number;
  paused: boolean;
  reason: 'writes' | 'storage' | null;
}

export const ID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

export function uploadUrl(meta: UploadMeta): string {
  const q = new URLSearchParams({
    device: meta.device,
    project: meta.project,
    name: meta.name,
    w: String(meta.widthM),
    d: String(meta.depthM),
    updated: meta.updatedAt,
  });
  return `${PLANS_API}/v1/plans?${q}`;
}

/**
 * Sends one gzip body. The text/plain type keeps it a simple CORS request, with no preflight.
 * Resolves with the status; rejects only on a network failure.
 */
export async function postPlan(
  meta: UploadMeta,
  body: Uint8Array<ArrayBuffer>,
  keepalive: boolean,
): Promise<UploadResult> {
  const res = await fetch(uploadUrl(meta), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
    keepalive,
    credentials: 'omit',
    mode: 'cors',
  });
  const seconds = Number(res.headers.get('Retry-After'));
  return {
    status: res.status,
    retryAfterS: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
  };
}

async function authed(path: string, key: string, method = 'GET'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${PLANS_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}` },
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new GalleryApiError('network');
  }
  if (res.status === 401) throw new GalleryApiError('unauthorized');
  if (res.status === 404) throw new GalleryApiError('not-found');
  if (!res.ok) throw new GalleryApiError('server');
  return res;
}

const isRemotePlan = (v: unknown): v is RemotePlan => {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.device === 'string' &&
    ID_PATTERN.test(p.device) &&
    typeof p.project === 'string' &&
    ID_PATTERN.test(p.project) &&
    typeof p.updatedAt === 'string'
  );
};

/** One plan entry from the Worker, cleaned; null when it is not valid. */
export function toRemotePlan(v: unknown): RemotePlan | null {
  if (!isRemotePlan(v)) return null;
  return {
    device: v.device,
    project: v.project,
    name: typeof v.name === 'string' ? v.name : '',
    lotWidthM: Number(v.lotWidthM) || 0,
    lotDepthM: Number(v.lotDepthM) || 0,
    updatedAt: v.updatedAt,
    bytes: Number(v.bytes) || 0,
  };
}

/** The received plans, newest first. */
export async function listPlans(key: string): Promise<RemotePlan[]> {
  const res = await authed('/v1/plans', key);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new GalleryApiError('server');
  }
  const plans = (data as { plans?: unknown })?.plans;
  if (!Array.isArray(plans)) throw new GalleryApiError('server');
  return plans.map(toRemotePlan).filter((p): p is RemotePlan => p !== null);
}

const planPath = (device: string, project: string) =>
  `/v1/plans/${encodeURIComponent(device)}/${encodeURIComponent(project)}`;

/** Deletes one received plan. A plan that is already gone also counts as deleted. */
export async function deletePlan(key: string, device: string, project: string): Promise<void> {
  await authed(planPath(device, project), key, 'DELETE');
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

async function readUsage(res: Response): Promise<Usage> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new GalleryApiError('server');
  }
  const usage = toUsage(data);
  if (!usage) throw new GalleryApiError('server');
  return usage;
}

/** A usage object from the Worker, cleaned; null when it is not an object. */
export function toUsage(data: unknown): Usage | null {
  if (!data || typeof data !== 'object') return null;
  const u = data as Record<string, unknown>;
  return {
    month: typeof u.month === 'string' ? u.month : '',
    writes: num(u.writes),
    writesLimit: num(u.writesLimit),
    bytes: num(u.bytes),
    bytesLimit: num(u.bytesLimit),
    plans: num(u.plans),
    paused: u.paused === true,
    reason: u.reason === 'writes' || u.reason === 'storage' ? u.reason : null,
  };
}

/** This month's writes and the stored bytes against the free limits. */
export async function getUsage(key: string): Promise<Usage> {
  return readUsage(await authed('/v1/usage', key));
}

/** Rebuilds the totals from the stored plans, then returns them. */
export async function recountUsage(key: string): Promise<Usage> {
  return readUsage(await authed('/v1/usage/recount', key, 'POST'));
}

/** The project JSON text of one received plan. */
export async function fetchPlanText(key: string, device: string, project: string): Promise<string> {
  const res = await authed(planPath(device, project), key);
  try {
    return await res.text();
  } catch {
    throw new GalleryApiError('network');
  }
}
