import { type RemotePlan, toRemotePlan, toUsage, type Usage } from './api.ts';
import { PLANS_LIVE_URL } from './config.ts';

export type LiveStatus = 'live' | 'reconnecting';

export interface LiveHandlers {
  onStatus(status: LiveStatus): void;
  onUsage(usage: Usage): void;
  onPlan(plan: RemotePlan): void;
  onDeleted(device: string, project: string): void;
  /** The key was refused (close code 4401). */
  onBadKey(): void;
  /** The socket came back after it dropped: events may be missing. */
  onResync(): void;
}

const PING_MS = 45_000;
const PONG_TIMEOUT_MS = 15_000;
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const TOO_MANY_RETRY_MS = 60_000;

const CLOSE_BAD_KEY = 4401;
const CLOSE_TOO_MANY = 4429;
/** Our own close: no reconnect. */
const CLOSE_BY_CLIENT = 1000;

/**
 * Keeps one authed socket to the Worker, also while the tab is hidden. Returns the stop function.
 * The key goes in the first message, never in the URL.
 */
export function startLive(key: string, h: LiveHandlers): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retryTimer: number | undefined;
  let pingTimer: number | undefined;
  let pongTimer: number | undefined;
  /** The socket dropped after a ready: the next ready resyncs the list. */
  let wasReady = false;
  let needsResync = false;

  const clearTimers = () => {
    window.clearInterval(pingTimer);
    window.clearTimeout(pongTimer);
    pingTimer = undefined;
    pongTimer = undefined;
  };

  const drop = () => {
    clearTimers();
    if (!ws) return;
    const old = ws;
    ws = null;
    old.onopen = null;
    old.onmessage = null;
    old.onclose = null;
    old.onerror = null;
    try {
      old.close(CLOSE_BY_CLIENT);
    } catch {
      // Already closed.
    }
  };

  const scheduleRetry = (ms: number) => {
    window.clearTimeout(retryTimer);
    if (wasReady) needsResync = true;
    h.onStatus('reconnecting');
    retryTimer = window.setTimeout(connect, ms);
  };

  const backoff = () => {
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
    attempt += 1;
    // Full jitter in the upper half, so many tabs do not retry together.
    return base / 2 + Math.random() * (base / 2);
  };

  const send = (msg: object) => {
    try {
      ws?.send(JSON.stringify(msg));
    } catch {
      // The close handler reconnects.
    }
  };

  function onMessage(e: MessageEvent) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(e.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const usage = toUsage(msg.usage);
    switch (msg.type) {
      case 'ready':
        attempt = 0;
        wasReady = true;
        h.onStatus('live');
        if (usage) h.onUsage(usage);
        if (needsResync) {
          needsResync = false;
          h.onResync();
        }
        break;
      case 'plan': {
        const plan = toRemotePlan(msg.plan);
        if (plan) h.onPlan(plan);
        if (usage) h.onUsage(usage);
        break;
      }
      case 'deleted':
        if (typeof msg.device === 'string' && typeof msg.project === 'string') {
          h.onDeleted(msg.device, msg.project);
        }
        if (usage) h.onUsage(usage);
        break;
      case 'usage':
        if (usage) h.onUsage(usage);
        break;
      case 'pong':
        window.clearTimeout(pongTimer);
        pongTimer = undefined;
        break;
    }
  }

  /** A ping with no pong in time means the socket is dead, even if it looks open. */
  function ping() {
    send({ type: 'ping' });
    if (pongTimer !== undefined) return;
    pongTimer = window.setTimeout(() => {
      drop();
      scheduleRetry(backoff());
    }, PONG_TIMEOUT_MS);
  }

  function connect() {
    window.clearTimeout(retryTimer);
    if (stopped || ws) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(PLANS_LIVE_URL);
    } catch {
      scheduleRetry(backoff());
      return;
    }
    ws = socket;
    socket.onopen = () => {
      send({ type: 'auth', key });
      pingTimer = window.setInterval(ping, PING_MS);
    };
    socket.onmessage = onMessage;
    socket.onclose = (e) => {
      if (ws !== socket) return;
      ws = null;
      clearTimers();
      if (stopped) return;
      if (e.code === CLOSE_BAD_KEY) {
        stopped = true;
        h.onBadKey();
        return;
      }
      if (e.code === CLOSE_TOO_MANY) {
        scheduleRetry(TOO_MANY_RETRY_MS);
        return;
      }
      // 4408 (auth timeout), 1006 and the rest: try again with a growing wait.
      scheduleRetry(backoff());
    };
  }

  /** Back from a hidden tab: a dead socket reconnects at once, a live one proves it with a ping. */
  const onVisibility = () => {
    if (document.visibilityState !== 'visible' || stopped) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ping();
      return;
    }
    if (ws && ws.readyState === WebSocket.CONNECTING) return;
    drop();
    attempt = 0;
    if (wasReady) needsResync = true;
    connect();
  };

  document.addEventListener('visibilitychange', onVisibility);
  h.onStatus('reconnecting');
  connect();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.clearTimeout(retryTimer);
    drop();
  };
}
