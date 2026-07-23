/**
 * Analytics event sink — durable Postgres write + Redis Streams fanout.
 *
 * Usage:
 *   import { emit } from '$lib/server/analytics/analytics-sink.js';
 *   emit(makeEvent({ eventType: 'lane.result', traceId, laneId, score, ... }));
 *   // Never await — fire-and-forget by contract.
 *
 * Transport:
 *   1. Postgres  analytics_events table — durable append-only ledger.
 *   2. Redis Streams  analytics:events  — live fanout for dashboards / workers.
 *      MAXLEN ~50 000 entries, auto-trimmed. 24-hour TTL is not applied because
 *      the stream is continuously read by consumers; use MAXLEN for backpressure.
 *
 * Postgres is truth. Redis is the hot delivery lane; it can be rebuilt from
 * Postgres at any time and must never be treated as the source of record.
 */

import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/client.js';
import { analyticsEvents } from '$lib/server/db/schema-postgres.js';
import { getRedis } from '$lib/server/redis.js';
import type { AnalyticsEventEnvelope } from './analytics-event-envelope.js';

// ---------------------------------------------------------------------------
// Redis Streams key
// ---------------------------------------------------------------------------

const STREAM_KEY = 'analytics:events';
const STREAM_MAXLEN = 50_000;

/**
 * Minimal typed overlay for the XADD command used here.
 * Mirrors the pattern in redis-streams.ts — avoids `as unknown as` at call sites.
 */
interface XAddRedis {
  xadd(
    key: string,
    op: 'MAXLEN',
    approx: '~',
    max: number,
    id: string,
    ...fieldValues: string[]
  ): Promise<string | null>;
}

function xr(): XAddRedis {
  return getRedis() as unknown as XAddRedis;
}

// ---------------------------------------------------------------------------
// Postgres write
// ---------------------------------------------------------------------------

async function writeToPostgres(event: AnalyticsEventEnvelope): Promise<void> {
  await db.insert(analyticsEvents).values({
    // analytics_events has: id (uuid default), eventType, userId, sessionId, payload, createdAt
    eventType: event.eventType,
    userId: event.userId ?? null,
    sessionId: event.sessionId ?? null,
    // Everything else goes into the JSONB payload column.
    payload: event as unknown as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// Redis Streams write
// ---------------------------------------------------------------------------

async function writeToStream(event: AnalyticsEventEnvelope): Promise<void> {
  // Flatten the envelope to string field pairs for XADD.
  // Redis Streams entries must be string→string maps.
  await xr().xadd(
    STREAM_KEY,
    'MAXLEN', '~', STREAM_MAXLEN,
    '*',                              // auto-generate stream ID
    'eventId',     event.eventId,
    'occurredAt',  event.occurredAt,
    'eventType',   event.eventType,
    'traceId',     event.traceId,
    // Optional fields only included when present to keep entries lean.
    ...(event.sessionId   ? ['sessionId',    event.sessionId]               : []),
    ...(event.userId      ? ['userId',       String(event.userId)]           : []),
    ...(event.queryHash   ? ['queryHash',    event.queryHash]                : []),
    ...(event.packetKey   ? ['packetKey',    event.packetKey]                : []),
    ...(event.sourceRef   ? ['sourceRef',    event.sourceRef]                : []),
    ...(event.laneId      ? ['laneId',       event.laneId]                  : []),
    ...(event.score       != null ? ['score', String(event.score)]          : []),
    ...(event.rank        != null ? ['rank',  String(event.rank)]            : []),
    ...(event.centroidId  ? ['centroidId',   event.centroidId]              : []),
    ...(event.somCell     != null ? ['somCell', String(event.somCell)]      : []),
    ...(event.latencyMs   != null ? ['latencyMs', String(event.latencyMs)] : []),
    // Compact JSON for the open metadata bag.
    ...(event.metadata    ? ['metadata', JSON.stringify(event.metadata)]    : []),
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Construct a complete AnalyticsEventEnvelope from partial fields.
 * Callers supply everything except eventId and occurredAt.
 */
export function makeEvent(
  fields: Omit<AnalyticsEventEnvelope, 'eventId' | 'occurredAt'>,
): AnalyticsEventEnvelope {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit one analytics event.
 *
 * Both writes are fire-and-forget. Errors are swallowed so the hot path is
 * never blocked. Each transport logs independently — a Redis failure does not
 * suppress the Postgres write and vice versa.
 *
 * Call pattern:
 *   emit(makeEvent({ eventType: 'candidate.selected', traceId, packetKey, score }));
 */
export function emit(event: AnalyticsEventEnvelope): void {
  // Postgres — durable ledger
  writeToPostgres(event).catch((err) => {
    console.warn('[analytics-sink] postgres write failed', event.eventType, err?.message);
  });

  // Redis Streams — live fanout
  writeToStream(event).catch((err) => {
    console.warn('[analytics-sink] redis stream write failed', event.eventType, err?.message);
  });
}

/**
 * Emit a batch of events.
 * Each event still goes through the same dual-transport path.
 * Use when a single operation produces multiple correlated events
 * (e.g., one per lane result).
 */
export function emitBatch(events: AnalyticsEventEnvelope[]): void {
  for (const event of events) emit(event);
}
