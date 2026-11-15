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
): Promise<number> {
  const res = await fetch(uploadUrl(meta), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
    keepalive,
    credentials: 'omit',
    mode: 'cors',
  });
  return res.status;
}

async function authed(path: string, key: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${PLANS_API}${path}`, {
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
  return plans.filter(isRemotePlan).map((p) => ({
    device: p.device,
    project: p.project,
    name: typeof p.name === 'string' ? p.name : '',
    lotWidthM: Number(p.lotWidthM) || 0,
    lotDepthM: Number(p.lotDepthM) || 0,
    updatedAt: p.updatedAt,
    bytes: Number(p.bytes) || 0,
  }));
}

/** The project JSON text of one received plan. */
export async function fetchPlanText(key: string, device: string, project: string): Promise<string> {
  const res = await authed(
    `/v1/plans/${encodeURIComponent(device)}/${encodeURIComponent(project)}`,
    key,
  );
  try {
    return await res.text();
  } catch {
    throw new GalleryApiError('network');
  }
}
