/**
 * Reward Events — bandit feedback loop
 *
 * Records user signals (thumbs, dwell, copy, reformulate) as RewardEvents
 * and writes them to two sinks:
 *   1. Redis LPUSH  `ace:reward:queue` (JSONL buffer, up to 10k events)
 *   2. Postgres     `context_timeline` (durable audit trail)
 *
 * Downstream consumers:
 *   - updateBoostWeights() reads from here to nudge BoostWeights
 *   - grpo-exporter.ts drains `ace:reward:queue` → JSONL for fine-tuning
 */

import { getRedis } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client';
import { contextTimeline } from '$lib/server/db/schema-postgres.js';

// ── Event shape ───────────────────────────────────────────────────────────────

export type RewardSignal =
  | 'thumbs_up'
  | 'thumbs_down'
  | 'copy'
  | 'dwell_long'     // dwell > 8s
  | 'dwell_short'    // dwell < 2s on a retrieved result
  | 'reformulate'    // user immediately rephrased the query
  | 'answer_served'; // implicit: server completed a response (weak positive proxy)

export interface RewardEvent {
  query:                    string;
  selected_chunk_ids:       string[];   // chunk_ids that were shown / selected
  rejected_chunk_ids:       string[];   // chunk_ids ranked lower but not selected
  signal:                   RewardSignal;
  reward:                   number;     // -1 to +1
  /** Partial feature weights snapshot at the time of the event */
  weight_snapshot?:         Record<string, number>;
  session_id?:              string;
  user_id?:                 string;
  pipeline?:                string;
  context_tree_id?:         string;    // from ace.compact_search
  timestamp:                number;    // Date.now()
}

// ── Signal → reward scalar ────────────────────────────────────────────────────

export const SIGNAL_REWARD: Record<RewardSignal, number> = {
  thumbs_up:     +1.0,
  copy:          +0.7,
  dwell_long:    +0.4,
  answer_served: +0.1,  // weak prior — overridden by explicit user signal
  dwell_short:   -0.3,
  reformulate:   -0.5,
  thumbs_down:   -1.0,
};

export function rewardForSignal(signal: RewardSignal): number {
  return SIGNAL_REWARD[signal] ?? 0;
}

// ── Redis queue ───────────────────────────────────────────────────────────────

const QUEUE_KEY   = 'ace:reward:queue';
const QUEUE_CAP   = 10_000;   // LTRIM keeps the newest N events

// ── Postgres sink ─────────────────────────────────────────────────────────────

async function persistToTimeline(event: RewardEvent): Promise<void> {
  try {
    await db.insert(contextTimeline).values({
      eventType:   'reward',
      pipeline:    event.pipeline ?? 'ace',
      signal:      event.signal,
      grpoReward:  event.reward,
      sessionId:   event.session_id ?? '',
      userId:      event.user_id ? Number(event.user_id) : null,
      payload:     {
        query:              event.query,
        selected_chunk_ids: event.selected_chunk_ids,
        rejected_chunk_ids: event.rejected_chunk_ids,
        weight_snapshot:    event.weight_snapshot ?? null,
        context_tree_id:    event.context_tree_id ?? null,
      },
      createdAt:   new Date(event.timestamp),
    });
  } catch {
    // non-fatal — Redis queue is the primary buffer
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * recordRewardEvent — dual-write to Redis queue + Postgres timeline.
 * Fire-and-forget safe: both sinks suppress errors internally.
 */
export async function recordRewardEvent(event: RewardEvent): Promise<void> {
  const line = JSON.stringify(event);

  // Redis: push to head of list, trim to cap
  try {
    const r = getRedis();
    await r.lpush(QUEUE_KEY, line);
    await r.ltrim(QUEUE_KEY, 0, QUEUE_CAP - 1);
  } catch { /* non-fatal */ }

  // Postgres: fire-and-forget
  persistToTimeline(event).catch(() => {});
}

/**
 * peekRewardQueue — read up to N recent events without removing them.
 * Used by grpo-exporter for diagnostic inspection.
 */
export async function peekRewardQueue(limit = 100): Promise<RewardEvent[]> {
  try {
    const r = getRedis();
    const items = await r.lrange(QUEUE_KEY, 0, limit - 1);
    return items.map(s => JSON.parse(s) as RewardEvent);
  } catch {
    return [];
  }
}

/**
 * drainRewardQueue — destructive read of up to `batchSize` events.
 * Called by grpo-exporter.ts; removes items from the queue.
 */
export async function drainRewardQueue(batchSize = 500): Promise<RewardEvent[]> {
  const events: RewardEvent[] = [];
  try {
    const r = getRedis();
    // Atomic drain via pipeline
    const pipe = r.pipeline();
    for (let i = 0; i < batchSize; i++) {
      pipe.rpop(QUEUE_KEY);
    }
    const results = await pipe.exec();
    if (!results) return events;
    for (const [err, val] of results) {
      if (!err && val && typeof val === 'string') {
        try { events.push(JSON.parse(val)); } catch { /* skip malformed */ }
      }
    }
  } catch { /* non-fatal */ }
  return events;
}

/**
 * rewardQueueLength — current depth of the Redis queue.
 */
export async function rewardQueueLength(): Promise<number> {
  try {
    const r = getRedis();
    return await r.llen(QUEUE_KEY);
  } catch {
    return 0;
  }
}