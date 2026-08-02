/**
 * Valkey Streams durable job queue for the acquisition plane.
 *
 * Distinct from $lib/server/redis-streams.ts, which is a single-reader
 * XADD/XREAD token-streaming helper with no consumer-group support. Durable
 * multi-worker job processing needs XREADGROUP/XACK/XPENDING/XAUTOCLAIM —
 * none of which redis-streams.ts provides — so this is new, not a
 * duplicate. Do NOT use Pub/Sub or HyperLogLog here; Valkey carries
 * canonical Postgres IDs only, it never generates alternate identities.
 */

import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis.js';

export const ACQUISITION_STREAM = 'atlas:acquisition:requested';
export const ACQUISITION_CONSUMER_GROUP = 'atlas:acquisition:workers';
export const ACQUISITION_DEAD_LETTER_STREAM = 'atlas:dead_letter';

/** Typed overlay for the ioredis stream commands used here (avoids `as unknown as` at every call site). */
interface StreamGroupRedis {
  xadd(key: string, id: string, ...fieldValues: string[]): Promise<string | null>;
  xadd(key: string, op: 'MAXLEN', approx: '~', max: number, id: string, ...fieldValues: string[]): Promise<string | null>;
  xgroup(cmd: 'CREATE', key: string, group: string, id: string, mkstream: 'MKSTREAM'): Promise<'OK'>;
  xreadgroup(
    group: 'GROUP', groupName: string, consumer: string,
    count: 'COUNT', n: number, block: 'BLOCK', ms: number,
    streams: 'STREAMS', key: string, id: string
  ): Promise<[string, [string, string[]][]][] | null>;
  xack(key: string, group: string, ...ids: string[]): Promise<number>;
  xpending(key: string, group: string): Promise<[number, string | null, string | null, [string, string][] | null]>;
  xpending(
    key: string, group: string,
    start: string, end: string, count: number
  ): Promise<[string, string, number, number][]>;
  xautoclaim(
    key: string, group: string, consumer: string,
    minIdleMs: number, start: string, count: 'COUNT', n: number
  ): Promise<[string, [string, string[]][], string[]]>;
}

function sr(redis: Redis): StreamGroupRedis {
  return redis as unknown as StreamGroupRedis;
}

export interface AcquisitionStreamEntry {
  streamEntryId: string;
  fields: Record<string, string>;
}

/**
 * Publish an acquisition-requested event. MAXLEN ~ caps unbounded growth
 * (bounded replay window, not infinite history — canonical history remains
 * in Postgres fetch_attempts/outbox_events, this is delivery only).
 */
export async function publishAcquisitionRequested(
  payload: Record<string, unknown>
): Promise<string> {
  const id = await sr(getRedis()).xadd(
    ACQUISITION_STREAM, 'MAXLEN', '~', 10_000, '*',
    'schemaVersion', 'atlas.acquisition.requested.v1',
    'payload', JSON.stringify(payload),
  );
  if (!id) throw new Error('acquisition stream publish failed (XADD returned null)');
  return id;
}

/**
 * Idempotent — XGROUP CREATE ... MKSTREAM, ignores BUSYGROUP if the group
 * already exists. Starts at '0' (beginning of stream), NOT '$' (tail) — a
 * durable job queue must process backlogged entries on first group
 * creation, not only entries published after the group exists.
 */
export async function ensureAcquisitionConsumerGroup(): Promise<void> {
  try {
    await sr(getRedis()).xgroup('CREATE', ACQUISITION_STREAM, ACQUISITION_CONSUMER_GROUP, '0', 'MKSTREAM');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('BUSYGROUP')) throw err;
  }
}

/**
 * Read up to `count` new entries for this consumer via XREADGROUP (`>` = only
 * undelivered entries). Does not ack — caller acks after durable processing.
 */
export async function readAcquisitionBatch(
  consumerName: string,
  count = 1,
  blockMs = 2000
): Promise<AcquisitionStreamEntry[]> {
  const res = await sr(getRedis()).xreadgroup(
    'GROUP', ACQUISITION_CONSUMER_GROUP, consumerName,
    'COUNT', count, 'BLOCK', blockMs,
    'STREAMS', ACQUISITION_STREAM, '>'
  );
  if (!res) return [];
  const [, entries] = res[0]!;
  return entries.map(([id, fields]) => ({ streamEntryId: id, fields: parseFields(fields) }));
}

/**
 * Acknowledge after 1) attempt result written to Postgres, 2) canonical
 * workflow state updated, 3) any successor outbox event committed. An ack
 * means "handled durably" — it does not mean "the workflow succeeded."
 */
export async function ackAcquisitionEntry(streamEntryId: string): Promise<void> {
  await sr(getRedis()).xack(ACQUISITION_STREAM, ACQUISITION_CONSUMER_GROUP, streamEntryId);
}

/** Count of pending (delivered, not yet acked) entries for the consumer group. */
export async function getPendingCount(): Promise<number> {
  const summary = await sr(getRedis()).xpending(ACQUISITION_STREAM, ACQUISITION_CONSUMER_GROUP);
  return summary?.[0] ?? 0;
}

/**
 * Recover stale-claimed entries (crashed worker) — reassigns entries idle
 * longer than minIdleMs to `newConsumerName` without re-publishing.
 */
export async function reclaimStaleEntries(
  newConsumerName: string,
  minIdleMs = 60_000,
  count = 10
): Promise<AcquisitionStreamEntry[]> {
  const [, entries] = await sr(getRedis()).xautoclaim(
    ACQUISITION_STREAM, ACQUISITION_CONSUMER_GROUP, newConsumerName,
    minIdleMs, '0-0', 'COUNT', count
  );
  return entries.map(([id, fields]) => ({ streamEntryId: id, fields: parseFields(fields) }));
}

/** Route a non-retryable or attempts-exhausted message to the dead-letter stream, then ack the original. */
export async function deadLetter(
  entry: AcquisitionStreamEntry,
  reason: string
): Promise<void> {
  const redis = sr(getRedis());
  await redis.xadd(
    ACQUISITION_DEAD_LETTER_STREAM, 'MAXLEN', '~', 10_000, '*',
    'sourceStream', ACQUISITION_STREAM,
    'sourceEntryId', entry.streamEntryId,
    'reason', reason,
    'payload', entry.fields.payload ?? '{}',
  );
  await redis.xack(ACQUISITION_STREAM, ACQUISITION_CONSUMER_GROUP, entry.streamEntryId);
}

function parseFields(fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]!] = fields[i + 1]!;
  return obj;
}
