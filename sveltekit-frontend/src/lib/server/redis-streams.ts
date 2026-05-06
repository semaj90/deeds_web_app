/**
 * redis-streams.ts — typed Redis Streams helpers for token-chunk streaming.
 *
 * Key layout: stream:tokens:{requestId}
 * Fields per entry: { seq, chunk, meta (JSON) }
 *
 * Changes vs. original:
 *  - MAXLEN ~ 2000 on every XADD (prevents unbounded growth)
 *  - publishStreamDone() writes a sentinel entry; consumer exits on it
 *  - deleteTokenStream() + setStreamTTL() for explicit cleanup
 *  - StreamRedis interface eliminates all `as unknown as` type-casts
 *  - consumeTokenStream: removed the unnecessary extra {} block
 */

import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';
import { attachDispose } from '$lib/server/redis-disposable.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TokenMeta = Record<string, unknown>;

export type TokenEntry = {
  id:    string;     // Redis stream ID e.g. "1696160000000-0"
  seq:   number;
  chunk: string;
  meta:  TokenMeta;
  done:  boolean;   // true on the sentinel entry
};

/**
 * Typed overlay for the ioredis stream commands used here.
 * Avoids `as unknown as` casts in every call site.
 */
interface StreamRedis {
  xadd(key: string, id: string, ...fieldValues: string[]): Promise<string | null>;
  xadd(key: string, op: 'MAXLEN', approx: '~', max: number, id: string, ...fieldValues: string[]): Promise<string | null>;
  xrange(key: string, start: string, end: string, count: 'COUNT', n: number): Promise<[string, string[]][]>;
  xtrim(key: string, strategy: 'MAXLEN', approx: '~', maxLen: number): Promise<number>;
  xread(
    block: 'BLOCK', blockMs: number,
    streams: 'STREAMS', key: string, id: string,
  ): Promise<[string, [string, string[]][]][] | null>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  duplicate(): StreamRedis;
}

// ── Key ───────────────────────────────────────────────────────────────────────

function streamKey(requestId: string): string {
  return `stream:tokens:${requestId}`;
}

function sr(redis: Redis): StreamRedis {
  return redis as unknown as StreamRedis;
}

// ── Producer API ──────────────────────────────────────────────────────────────

/**
 * Append a token chunk to the stream.
 * Auto-caps the stream at ~2000 entries so it never grows unbounded.
 * Returns the Redis-generated stream entry ID.
 */
export async function produceTokenChunk(
  requestId: string,
  seq: number,
  chunk: string,
  meta: TokenMeta = {},
): Promise<string> {
  const key = streamKey(requestId);
  const id  = await sr(getRedis()).xadd(
    key, 'MAXLEN', '~', 2000, '*',
    'seq',   String(seq),
    'chunk', chunk,
    'meta',  JSON.stringify(meta),
  );
  return id ?? '';
}

/**
 * Write a final sentinel entry so consumers know the stream is complete.
 * Sets a 2-hour TTL on the stream key so it auto-expires after replay window.
 */
export async function publishStreamDone(
  requestId: string,
  seq: number,
  meta: TokenMeta = {},
): Promise<void> {
  const key   = streamKey(requestId);
  const redis = sr(getRedis());
  await redis.xadd(
    key, 'MAXLEN', '~', 2000, '*',
    'seq',   String(seq),
    'chunk', '',
    'meta',  JSON.stringify({ ...meta, done: true }),
  );
  // 2-hour replay window; after that the key expires automatically
  await redis.expire(key, 2 * 60 * 60);
}

// ── Consumer API ──────────────────────────────────────────────────────────────

/**
 * Read entries from a Redis stream using XRANGE.
 * Returns entries in ascending stream-ID order.
 */
export async function readTokenStream(
  requestId: string,
  fromId = '-',
  count  = 100,
): Promise<TokenEntry[]> {
  const key    = streamKey(requestId);
  const rawRes = await sr(getRedis()).xrange(key, fromId, '+', 'COUNT', count);
  if (!rawRes) return [];
  return rawRes.map(([id, fields]) => parseStreamEntry(id, fields));
}

/**
 * Blocking stream consumer.
 * Calls `callback` for each new entry and exits when:
 *   - A sentinel entry (meta.done = true) is received, OR
 *   - `stopAfterMs` of inactivity elapses.
 */
export async function consumeTokenStream(
  requestId:  string,
  fromId      = '0-0',
  callback:   (entry: TokenEntry) => Promise<void>,
  stopAfterMs = 30_000,
): Promise<void> {
  const key    = streamKey(requestId);
  const redis  = sr(getRedis());
  let   lastId = fromId;
  const start  = Date.now();

  // Duplicate connection for blocking XREAD so we don't stall the main pool.
  // `await using` auto-calls .quit() on scope exit — even on throw.
  await using reader = attachDispose(redis.duplicate());

  while (Date.now() - start < stopAfterMs) {
    const response = await reader.xread('BLOCK', 5000, 'STREAMS', key, lastId);
    if (!response) continue; // 5s timeout — check total elapsed and loop

    const [, entries] = response[0];
    for (const [id, fields] of entries) {
      const entry = parseStreamEntry(id, fields);
      await callback(entry);
      lastId = id;
      if (entry.done) return; // sentinel received — clean exit
    }
  }
}

// ── Maintenance ───────────────────────────────────────────────────────────────

/** Trim a stream to approximately maxLen entries (XLTRIM MAXLEN ~). */
export async function trimTokenStream(
  requestId: string,
  maxLen = 2000,
): Promise<void> {
  await sr(getRedis()).xtrim(streamKey(requestId), 'MAXLEN', '~', maxLen);
}

/** Delete the stream key entirely (after replaying / archiving). */
export async function deleteTokenStream(requestId: string): Promise<void> {
  await sr(getRedis()).del(streamKey(requestId));
}

/** Set a TTL on the stream key (default 2h). */
export async function setStreamTTL(
  requestId: string,
  seconds   = 2 * 60 * 60,
): Promise<void> {
  await sr(getRedis()).expire(streamKey(requestId), seconds);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function parseStreamEntry(id: string, fields: string[]): TokenEntry {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];

  let meta: TokenMeta = {};
  try { if (obj.meta) meta = JSON.parse(obj.meta) as TokenMeta; } catch { /* ok */ }

  return {
    id,
    seq:   obj.seq ? Number(obj.seq) : 0,
    chunk: obj.chunk ?? '',
    meta,
    done:  meta.done === true,
  };
}