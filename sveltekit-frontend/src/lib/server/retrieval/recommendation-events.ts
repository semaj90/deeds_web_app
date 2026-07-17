/**
 * Recommendation Events — fire-and-forget interaction ledger.
 *
 * Logs every retrieval exposure and outcome event to the recommendation_events
 * table. The append-only design lets the offline ALS/BPR training pipeline
 * derive sparse (query_cluster × packet) matrices via SQL aggregation without
 * ever touching the hot path.
 *
 * Design contract:
 *   - Exposure events MUST be logged before any acceptance event for the same
 *     (session_key, packet_key) pair (avoids missing-data bias in CF training).
 *   - actor_key is SHA-256(user_id + daily_salt) — pseudonymized, not raw user_id.
 *   - All writes are fire-and-forget: callers don't await, errors are swallowed
 *     after logging.  The retrieval hot path must never block on analytics.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventType =
  // Exposure
  | 'exposed'
  | 'not_displayed'
  // Acceptance
  | 'opened'
  | 'copied'
  | 'cited'
  | 'accepted'
  | 'rejected'
  | 'ignored'
  // Tool / task
  | 'tool_executed'
  | 'tool_failed'
  | 'repair_accepted'
  | 'repair_rejected'
  | 'manual_correction'
  // Quality signals
  | 'dwell_time'
  | 'repeated_retrieval'
  | 'validation_failure';

export type ItemKind = 'packet' | 'chunk' | 'tool' | 'repair' | 'suggestion';

export interface RecommendationEventInput {
  /** Pseudonymized actor key (caller must hash before passing). */
  actor_key?: string;
  session_key?: string;
  query_text?: string;
  /** SHA-256(lower(query_text))[:16] — caller may pre-compute. */
  query_hash: string;
  query_cluster_id?: string;
  packet_key: string;
  source_ref: string;
  item_kind?: ItemKind;
  event_type: EventType;
  event_value?: number;
  position?: number;
  ranked_list_id?: string;
  model_version?: string;
  policy_version?: string;
}

// ---------------------------------------------------------------------------
// Pseudonymization helpers
// ---------------------------------------------------------------------------

/** Daily salt is the UTC date string — rotates every midnight. */
function dailySalt(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Pseudonymize a raw user ID with a daily salt.
 * Returns a 64-char hex string safe to store in actor_key.
 */
export function pseudonymizeActor(userId: string): string {
  return createHash('sha256')
    .update(userId + ':' + dailySalt())
    .digest('hex');
}

/**
 * Hash a query string for the query_hash column.
 * Takes first 16 chars of SHA-256(lower(query_text)).
 */
export function hashQuery(queryText: string): string {
  return createHash('sha256').update(queryText.toLowerCase()).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Single event logger (internal)
// ---------------------------------------------------------------------------

async function insertEvent(input: RecommendationEventInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO recommendation_events (
      actor_key,
      session_key,
      query_text,
      query_hash,
      query_cluster_id,
      packet_key,
      source_ref,
      item_kind,
      event_type,
      event_value,
      position,
      ranked_list_id,
      model_version,
      policy_version
    ) VALUES (
      ${input.actor_key ?? null},
      ${input.session_key ?? null},
      ${input.query_text ?? null},
      ${input.query_hash},
      ${input.query_cluster_id ?? null},
      ${input.packet_key},
      ${input.source_ref},
      ${input.item_kind ?? 'packet'},
      ${input.event_type},
      ${input.event_value ?? null}::real,
      ${input.position ?? null},
      ${input.ranked_list_id ?? null},
      ${input.model_version ?? 'rrf-baseline-v1'},
      ${input.policy_version ?? 'default-v1'}
    )
  `);
}

// ---------------------------------------------------------------------------
// Public API — fire-and-forget wrappers
// ---------------------------------------------------------------------------

/**
 * Log exposure events for a ranked list of packets.
 *
 * MUST be called before any acceptance events in the same session.
 * Batches all inserts into a single SQL VALUES list for efficiency.
 */
export function logExposureEvents(
  packets: Array<{
    packet_key: string;
    source_ref: string;
    position: number;
  }>,
  context: {
    query_text: string;
    query_cluster_id?: string;
    session_key?: string;
    actor_key?: string;
    ranked_list_id?: string;
    model_version?: string;
    policy_version?: string;
  },
): void {
  if (packets.length === 0) return;

  const query_hash = hashQuery(context.query_text);

  // Fire and forget — build a single batch insert
  Promise.resolve()
    .then(async () => {
      // Build VALUES list dynamically. drizzle sql`` handles parameterization.
      for (const pkt of packets) {
        await insertEvent({
          actor_key: context.actor_key,
          session_key: context.session_key,
          query_text: context.query_text,
          query_hash,
          query_cluster_id: context.query_cluster_id,
          packet_key: pkt.packet_key,
          source_ref: pkt.source_ref,
          item_kind: 'packet',
          event_type: 'exposed',
          position: pkt.position,
          ranked_list_id: context.ranked_list_id,
          model_version: context.model_version,
          policy_version: context.policy_version,
        });
      }
    })
    .catch((err) => {
      console.error('[recommendation-events] logExposureEvents failed (non-fatal):', err);
    });
}

/**
 * Log a single acceptance event (opened, copied, cited, accepted, rejected, etc.)
 *
 * Precondition: an 'exposed' event must have been logged for this
 * (session_key, packet_key) earlier in the session.
 */
export function logAcceptanceEvent(
  event: EventType,
  packet_key: string,
  source_ref: string,
  context: {
    query_text: string;
    query_hash?: string;
    query_cluster_id?: string;
    session_key?: string;
    actor_key?: string;
    position?: number;
    ranked_list_id?: string;
    event_value?: number;
    model_version?: string;
    policy_version?: string;
  },
): void {
  Promise.resolve()
    .then(() =>
      insertEvent({
        actor_key: context.actor_key,
        session_key: context.session_key,
        query_text: context.query_text,
        query_hash: context.query_hash ?? hashQuery(context.query_text),
        query_cluster_id: context.query_cluster_id,
        packet_key,
        source_ref,
        item_kind: 'packet',
        event_type: event,
        event_value: context.event_value,
        position: context.position,
        ranked_list_id: context.ranked_list_id,
        model_version: context.model_version,
        policy_version: context.policy_version,
      })
    )
    .catch((err) => {
      console.error('[recommendation-events] logAcceptanceEvent failed (non-fatal):', err);
    });
}

/**
 * Log a tool or repair event (tool_executed, tool_failed, repair_accepted, etc.)
 */
export function logToolEvent(
  event: 'tool_executed' | 'tool_failed' | 'repair_accepted' | 'repair_rejected' | 'manual_correction',
  packet_key: string,
  source_ref: string,
  context: {
    query_text?: string;
    query_hash?: string;
    session_key?: string;
    actor_key?: string;
    event_value?: number;
    model_version?: string;
    policy_version?: string;
  } = {},
): void {
  const query_text = context.query_text ?? '';
  Promise.resolve()
    .then(() =>
      insertEvent({
        actor_key: context.actor_key,
        session_key: context.session_key,
        query_text: query_text || undefined,
        query_hash: context.query_hash ?? hashQuery(query_text || packet_key),
        packet_key,
        source_ref,
        item_kind: 'tool',
        event_type: event,
        event_value: context.event_value,
        model_version: context.model_version,
        policy_version: context.policy_version,
      })
    )
    .catch((err) => {
      console.error('[recommendation-events] logToolEvent failed (non-fatal):', err);
    });
}

/**
 * Log a dwell-time quality signal (user spent ≥ N seconds on a result).
 * event_value = seconds spent.
 */
export function logDwellTime(
  packet_key: string,
  source_ref: string,
  seconds: number,
  context: {
    query_text: string;
    query_hash?: string;
    query_cluster_id?: string;
    session_key?: string;
    actor_key?: string;
    position?: number;
    ranked_list_id?: string;
  },
): void {
  Promise.resolve()
    .then(() =>
      insertEvent({
        actor_key: context.actor_key,
        session_key: context.session_key,
        query_text: context.query_text,
        query_hash: context.query_hash ?? hashQuery(context.query_text),
        query_cluster_id: context.query_cluster_id,
        packet_key,
        source_ref,
        item_kind: 'packet',
        event_type: 'dwell_time',
        event_value: seconds,
        position: context.position,
        ranked_list_id: context.ranked_list_id,
      })
    )
    .catch((err) => {
      console.error('[recommendation-events] logDwellTime failed (non-fatal):', err);
    });
}
