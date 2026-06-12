/**
 * valkey-client.ts
 *
 * Shared Valkey/Redis client factory for the SvelteKit server.
 * This is the single source of truth for ioredis configuration.
 *
 * All modules that need a Redis/Valkey connection should use
 * getValkeyClient() from this file rather than constructing
 * their own `new Redis(...)` instances.
 *
 * Container: valkey/valkey-bundle:8.1.1, name legal-ai-redis
 * Bind: 127.0.0.1:6379, auth password = "redis"
 */

import Redis, { type RedisOptions } from 'ioredis';

// ── env resolution (safe for both Vite and standalone Node) ──────────────────

function resolveUrl(): string {
  // SvelteKit server context — use the ENV singleton when available
  try {
    // dynamic require keeps Vite happy (tree-shaken in client bundles)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ENV } = require('$lib/server/env.server.js');
    if (ENV?.REDIS_URL) {
      const raw = String(ENV.REDIS_URL).trim();
      const password = String(ENV?.REDIS_PASSWORD ?? process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? '').trim();
      if (raw && password) {
        try {
          const parsed = new URL(raw);
          if ((!parsed.password || parsed.password.length === 0) && password) {
            parsed.password = password;
            return parsed.toString();
          }
        } catch {
          // fall through
        }
      }
      return ENV.REDIS_URL;
    }
  } catch {
    // not in SvelteKit context — fall through to process.env
  }
  return mergePasswordIntoUrl(process.env.REDIS_URL ?? buildUrlFromParts(), resolvePassword());
}

function resolvePassword(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ENV } = require('$lib/server/env.server.js');
    if (ENV?.REDIS_PASSWORD !== undefined) return ENV.REDIS_PASSWORD;
  } catch {
    // standalone
  }
  return (
    process.env.REDIS_PASSWORD ??
    process.env.REDIS_PASS ??
    'redis'
  );
}

function buildUrlFromParts(): string {
  const host = process.env.REDIS_HOST ?? '127.0.0.1';
  const port = process.env.REDIS_PORT ?? '6379';
  return `redis://${host}:${port}`;
}

function mergePasswordIntoUrl(url: string, password: string): string {
  const raw = String(url ?? '').trim();
  if (!raw) {
    const host = process.env.REDIS_HOST ?? '127.0.0.1';
    const port = process.env.REDIS_PORT ?? '6379';
    return password ? `redis://:${encodeURIComponent(password)}@${host}:${port}` : `redis://${host}:${port}`;
  }
  if (!password) return raw;
  try {
    const parsed = new URL(raw);
    if ((parsed.protocol === 'redis:' || parsed.protocol === 'rediss:') && (!parsed.password || parsed.password.length === 0)) {
      parsed.password = password;
      return parsed.toString();
    }
  } catch {
    // fall through to synthesized URL below
  }
  if (raw.startsWith('redis://') || raw.startsWith('rediss://')) {
    return raw;
  }
  const host = process.env.REDIS_HOST ?? '127.0.0.1';
  const port = process.env.REDIS_PORT ?? '6379';
  return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
}

// ── singleton ─────────────────────────────────────────────────────────────────

let _client: Redis | null = null;
let _closed = false;

function buildOptions(url: string, password: string): RedisOptions {
  const parsed = (() => { try { return new URL(url); } catch { return null; } })();
  const effectivePassword = password || parsed?.password || '';

  return {
    password             : effectivePassword || undefined,
    family               : 4,          // force IPv4 — avoids localhost → ::1 on Windows
    lazyConnect          : true,
    maxRetriesPerRequest : 1,
    enableReadyCheck     : true,
    connectTimeout       : 5000,
    commandTimeout       : 5000,
    retryStrategy(times: number) {
      if (times > 3) return null;      // give up after 3 attempts
      return Math.min(times * 200, 1000);
    },
    reconnectOnError(err: Error) {
      // Reconnect only on transient load errors, not auth failures
      const msg = err.message ?? '';
      return /LOADING|READONLY|CLUSTERDOWN/.test(msg);
    },
  };
}

/**
 * Returns the module-level singleton Valkey client.
 * Creates it on first call with lazyConnect — call `await client.connect()`
 * before the first command if you need to catch connection errors explicitly.
 */
export function getValkeyClient(): Redis {
  if (_closed) {
    // allow recreation after explicit close
    _client = null;
    _closed = false;
  }
  if (!_client) {
    const url      = resolveUrl();
    const password = resolvePassword();
    _client = new Redis(url, buildOptions(url, password));
    _client.on('error', (err) => {
      const msg = (err as Error)?.message ?? String(err);
      // Only log once per distinct message to avoid spamming on sustained outage
      if (!_lastError || _lastError !== msg) {
        _lastError = msg;
        console.warn('[valkey-client] Connection error:', msg);
      }
    });
  }
  return _client;
}

let _lastError = '';

/**
 * PING the Valkey server via the shared client.
 * Returns true on PONG, false on any error.
 */
export async function pingValkey(): Promise<boolean> {
  try {
    const client = getValkeyClient();
    if (client.status === 'wait') await client.connect();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully close the singleton client.
 * Call on server shutdown — do not call in hot-path code.
 */
export async function closeValkeyClient(): Promise<void> {
  if (_client) {
    try { await _client.quit(); } catch { /* ignore */ }
    _client = null;
    _closed = true;
  }
}

/**
 * Diagnostics snapshot — safe to serialize as JSON.
 */
export async function getValkeyDiagnostics(): Promise<{
  url: string;
  host: string;
  port: number;
  authSource: string;
  status: string;
  ping: boolean;
  latencyMs: number | null;
}> {
  const raw = resolveUrl();
  let parsed: URL | null = null;
  try { parsed = new URL(raw); } catch { /* ignore */ }

  const host = parsed?.hostname ?? '127.0.0.1';
  const port = Number(parsed?.port ?? 6379);

  // Determine auth source without printing the password
  let authSource = 'none';
  if (process.env.REDIS_URL)      authSource = 'env:REDIS_URL';
  else if (process.env.REDIS_PASSWORD || process.env.REDIS_PASS) authSource = 'env:REDIS_PASSWORD';
  else                            authSource = 'default:redis';

  const client = getValkeyClient();
  const status = client.status;

  const t0 = Date.now();
  const ping = await pingValkey();
  const latencyMs = ping ? Date.now() - t0 : null;

  return { url: raw, host, port, authSource, status, ping, latencyMs };
}
