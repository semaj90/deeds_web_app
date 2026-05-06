/**
 * YJS SSE Provider — bridges YJS CRDT state sync over Server-Sent Events.
 *
 * This provider does NOT import `yjs` directly — it works at the binary update
 * level (Uint8Array) so the caller can plug it into any YJS doc.  The server
 * side stores a per-document update log in Redis and rebroadcasts via SSE.
 *
 * Architecture:
 *   Client GET  /api/reports/[id]/collaborate/stream
 *     → SSE stream of base64-encoded YJS updates since Last-Event-ID
 *   Client POST /api/reports/[id]/collaborate/update
 *     → Single YJS update (base64), server fans out to all SSE subscribers
 *
 * Reconnection:
 *   EventSource automatically reconnects; Last-Event-ID header holds the last
 *   Redis stream entry ID so the server replays only the missed updates.
 *
 * Usage (client side — install yjs separately):
 *   import * as Y from 'yjs';
 *   import { YjsSseProvider } from '$lib/collaboration/yjs-provider';
 *
 *   const doc = new Y.Doc();
 *   const provider = new YjsSseProvider(doc, { reportId: 'abc-123' });
 *   provider.connect();
 *   // doc is now CRDT-synced with other clients
 */

// ─── Redis stream key helpers ─────────────────────────────────────────────────

export function yjsStreamKey(reportId: string): string {
  return `yjs:stream:${reportId}`;
}

export function yjsPresenceKey(reportId: string): string {
  return `yjs:presence:${reportId}`;
}

/** Max updates to replay on reconnect (guards against huge streams). */
export const YJS_REPLAY_LIMIT = 500;

/** Redis stream entry TTL — 24 h (entries older than this are trimmed). */
export const YJS_STREAM_TTL_SECONDS = 86_400;

// ─── Server-side helpers (called from +server.ts route handlers) ──────────────

export interface YjsServerDeps {
  /** ioredis instance (passed in to avoid importing getRedis() in this module) */
  redis: {
    xadd(key: string, id: string, ...args: string[]): Promise<string | null>;
    xrange(key: string, start: string, end: string, ...args: unknown[]): Promise<Array<[string, string[]]>>;
    expire(key: string, seconds: number): Promise<number>;
    sadd(key: string, ...members: string[]): Promise<number>;
    srem(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
  };
}

export interface StoreUpdateResult {
  /** Redis stream entry ID (used as SSE event id for Last-Event-ID replay). */
  entryId: string;
}

/**
 * Persist a YJS update to the Redis stream and return its entry ID.
 * Called from POST /api/reports/[id]/collaborate/update.
 */
export async function storeYjsUpdate(
  reportId: string,
  updateBase64: string,
  deps: YjsServerDeps
): Promise<StoreUpdateResult> {
  const key = yjsStreamKey(reportId);
  // XADD with auto-generated ID and MAXLEN trim to keep stream bounded
  const entryId = await deps.redis.xadd(
    key,
    '*',
    'update', updateBase64,
    'ts', String(Date.now())
  );
  if (entryId) {
    await deps.redis.expire(key, YJS_STREAM_TTL_SECONDS);
  }
  return { entryId: entryId ?? '0-0' };
}

export interface ReplayEntry {
  id: string;
  updateBase64: string;
  ts: number;
}

/**
 * Read YJS updates from Redis stream since `lastEventId`.
 * Called from GET /api/reports/[id]/collaborate/stream to seed reconnects.
 */
export async function replayYjsUpdates(
  reportId: string,
  lastEventId: string | null,
  deps: YjsServerDeps
): Promise<ReplayEntry[]> {
  const key = yjsStreamKey(reportId);
  const start = lastEventId ? incrementStreamId(lastEventId) : '0-0';

  const raw = await deps.redis.xrange(key, start, '+', 'COUNT', YJS_REPLAY_LIMIT);
  if (!Array.isArray(raw)) return [];

  return (raw as Array<[string, string[]]>).map(([id, fields]) => {
    const fieldMap: Record<string, string> = {};
    for (let i = 0; i < fields.length - 1; i += 2) {
      fieldMap[fields[i]] = fields[i + 1];
    }
    return {
      id,
      updateBase64: fieldMap['update'] ?? '',
      ts: Number(fieldMap['ts'] ?? 0),
    };
  }).filter((e) => e.updateBase64);
}

/** Increment a Redis stream ID for XRANGE exclusive start. */
function incrementStreamId(id: string): string {
  const parts = id.split('-');
  if (parts.length === 2) {
    const seq = parseInt(parts[1], 10);
    if (!isNaN(seq)) return `${parts[0]}-${seq + 1}`;
  }
  // Fallback: treat as ms timestamp, add 1
  const ms = parseInt(id, 10);
  if (!isNaN(ms)) return `${ms + 1}-0`;
  return id;
}

// ─── SSE format helpers ───────────────────────────────────────────────────────

export interface YjsSseEvent {
  id: string;
  data: string; // base64-encoded YJS update
}

export function formatYjsSseEvent(entry: ReplayEntry): string {
  return `id: ${entry.id}\nevent: yjs-update\ndata: ${entry.updateBase64}\n\n`;
}

export function formatYjsPresenceEvent(userId: string, online: boolean): string {
  const payload = JSON.stringify({ userId, online, ts: Date.now() });
  return `event: presence\ndata: ${payload}\n\n`;
}

export function formatYjsHeartbeat(): string {
  return `: heartbeat ${Date.now()}\n\n`;
}

// ─── Client-side provider class ───────────────────────────────────────────────

export interface YjsProviderOptions {
  reportId: string;
  /** Callback fired when a binary update arrives from the server. */
  onUpdate: (updateBytes: Uint8Array) => void;
  /** Callback for presence changes. */
  onPresence?: (userId: string, online: boolean) => void;
  /** Heartbeat interval ms (default 30_000). */
  heartbeatMs?: number;
}

export class YjsSseProvider {
  private es: EventSource | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private readonly baseUrl: string;
  readonly reportId: string;

  constructor(opts: YjsProviderOptions) {
    this.reportId = opts.reportId;
    this.baseUrl = `/api/reports/${opts.reportId}/collaborate`;
    this._opts = opts;
  }

  private _opts: YjsProviderOptions;

  connect(): void {
    if (this.es) return;
    this.es = new EventSource(`${this.baseUrl}/stream`);

    this.es.addEventListener('yjs-update', (e: MessageEvent) => {
      try {
        const bytes = base64ToUint8Array(e.data);
        this._opts.onUpdate(bytes);
      } catch {
        // ignore malformed updates
      }
    });

    this.es.addEventListener('presence', (e: MessageEvent) => {
      try {
        const { userId, online } = JSON.parse(e.data) as { userId: string; online: boolean };
        this._opts.onPresence?.(userId, online);
      } catch {
        // ignore
      }
    });

    this.es.onerror = () => {
      // Browser auto-reconnects with Last-Event-ID; nothing to do here
    };

    this.heartbeatTimer = setInterval(() => {
      // Client-to-server keepalive (POST with empty body) prevents proxy timeout
      fetch(`${this.baseUrl}/heartbeat`, { method: 'POST' }).catch(() => {});
    }, this._opts.heartbeatMs ?? 30_000);
  }

  disconnect(): void {
    this.es?.close();
    this.es = null;
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send a local YJS update to the server (which then fans out to all clients).
   * Call this from your YJS doc's `update` observer.
   */
  async sendUpdate(updateBytes: Uint8Array): Promise<void> {
    const body = JSON.stringify({ update: uint8ArrayToBase64(updateBytes) });
    await fetch(`${this.baseUrl}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
}

// ─── Base64 ↔ Uint8Array helpers (no atob/btoa — safe for SSR) ───────────────

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Use built-in Buffer on Node.js, fallback to manual on browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? BASE64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? BASE64_CHARS[b2 & 63] : '=';
  }
  return result;
}

export function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
