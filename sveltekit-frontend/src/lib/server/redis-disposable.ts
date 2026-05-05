/**
 * Disposable Redis client (TS 5.2+ `using` / `await using`).
 *
 * Wraps the existing pooled `getRedis()` factory with a `Symbol.asyncDispose`
 * implementation so callers can use the explicit-resource-management pattern
 * recommended in CLAUDE.md:
 *
 *   await using redis = getDisposableRedis();
 *   const v = await redis.get(...);
 *   // redis.[Symbol.asyncDispose]() fires automatically on scope exit
 *   // even if an exception is thrown — no manual try/finally needed.
 *
 * Notes:
 * - The underlying pool is shared. `Symbol.asyncDispose` does NOT close the
 *   pool connection (that would defeat the round-robin pool). It just signals
 *   that this scope is done with the handle. The pool drains via its own
 *   shutdown hook.
 * - For one-shot scripts that own their own Redis client (NOT the pool),
 *   use `createDisposableRedis(url)` which DOES quit on dispose.
 *
 * This is the "TS 7 enhancement app-wide" entry point. Files that previously
 * had try/finally patterns around `.quit()` can switch to `await using`
 * once they're touched.
 */

import { Redis } from 'ioredis';
import { getRedis } from './redis.js';
import { ENV } from './env.server.js';

/** Wrap a Redis handle so it participates in `await using` scope exit. */
export interface DisposableRedis extends Redis {
  /**
   * `await using` calls this on scope exit. Pooled handles intentionally
   * NO-OP — the pool decides when to drain. Standalone handles (from
   * createDisposableRedis) actually call .quit() here.
   */
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Get a pooled Redis handle that supports `await using`. The dispose hook
 * is a no-op so we don't kill the round-robin pool — the pool's own
 * shutdown hook handles connection lifecycle.
 *
 * Use this in route handlers, ACE preflight, and anywhere you'd normally
 * call `getRedis()` and don't own the connection.
 */
export function getDisposableRedis(): DisposableRedis {
  const r = getRedis() as DisposableRedis;
  // Idempotent: don't redefine if a previous caller already attached
  if (typeof (r as unknown as Record<symbol, unknown>)[Symbol.asyncDispose] !== 'function') {
    Object.defineProperty(r, Symbol.asyncDispose, {
      value:        async () => { /* pooled handle — no-op */ },
      configurable: true,
      writable:     false,
      enumerable:   false,
    });
  }
  return r;
}

/**
 * Create a STANDALONE Redis client (NOT pooled) that auto-quits on
 * `await using` scope exit. Use in one-shot scripts (seeders, batch
 * jobs, smoke tests) that should not share the production pool.
 *
 * Example:
 *   await using redis = createDisposableRedis();
 *   await redis.ping();
 *   // .quit() fires automatically here, even on throw
 */
export function createDisposableRedis(url: string = ENV.REDIS_URL): DisposableRedis {
  const r = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout:       3000,
    lazyConnect:          true,
  }) as DisposableRedis;
  Object.defineProperty(r, Symbol.asyncDispose, {
    value: async () => {
      try { await r.quit(); }
      catch { /* already disconnected — fine */ }
    },
    configurable: true,
    writable:     false,
    enumerable:   false,
  });
  return r;
}
