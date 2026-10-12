import type { RouterObservation, ToolDescriptor } from './router-types';

/**
 * Telemetry Ranking Bridge — Feedback loop from past decisions into ranking
 *
 * Queries telemetry to populate `scoreHistoricalSuccess()` instead of neutral 0.5 default.
 *
 * Historical success is computed from:
 * - (previousState, toolName) pairs: how often did this tool succeed from this state?
 * - Query intent: did this tool work well for CODE_SEARCH vs SEMANTIC_SEARCH?
 * - Time decay: recent success is weighted higher than old success
 *
 * Flow:
 * 1. Load retrieval-recorder.ts metrics for (state, tool) pair
 * 2. Filter by intent match (if available)
 * 3. Weight by recency
 * 4. Return [0, 1] success rate
 */

export interface HistoricalSuccessMetrics {
  successRate: number; // [0, 1]
  totalAttempts: number;
  successCount: number;
  confidence: number; // [0, 1] — higher if more samples
  recentSuccessRate: number; // Last 7 days
  avgLatencyMs: number;
  lastSeenAt: Date | null;
}

/**
 * Query historical success rate for a tool in a given state (synchronous ranker version)
 *
 * Returns weighted average:
 * - 0.7 × all-time success rate (broad evidence)
 * - 0.3 × recent success rate (trend signal)
 * - Decay by confidence (few samples → higher uncertainty → revert to 0.5)
 *
 * Uses neutral default (0.5) when async lookup not available.
 * For full async scoring, use getHistoricalSuccessRateAsync().
 */
export function getHistoricalSuccessRate(
  previousState: string,
  toolName: string,
  queryIntent?: string
): number {
  // Synchronous version for ranking: returns neutral default
  // TODO: Wire to Redis cache (proposed_tool_calls + tool_call_events aggregate) for sync lookup
  // For now, return neutral default (real DB query is async)
  return 0.5;
}

/**
 * Async version for full historical success analysis (outside ranking pipeline)
 */
export async function getHistoricalSuccessRateAsync(
  previousState: string,
  toolName: string,
  queryIntent?: string
): Promise<number> {
  try {
    // TODO: Query telemetry store (proposed_tool_calls + tool_call_events + outcome_ledger)
    // SELECT
    //   COUNT(*) as total_attempts,
    //   COUNT(CASE WHEN result_ok = true THEN 1 END) as success_count,
    //   AVG(latency_ms) as avg_latency
    // FROM tool_call_events
    // WHERE tool_name = $1
    //   AND (SELECT initial_state FROM agent_traces WHERE trace_id = tool_call_events.trace_id) = $2
    //   AND called_at > NOW() - INTERVAL '90 days'

    const metrics = await loadHistoricalMetrics(previousState, toolName, queryIntent);

    if (metrics.totalAttempts === 0) {
      // No telemetry yet → return neutral default
      return 0.5;
    }

    // Confidence score: higher with more samples
    // At 10 samples: confidence = 0.7. At 100: confidence = 0.95. At 1000: confidence ≈ 1.0
    const confidence = 1 - 1 / (1 + metrics.totalAttempts / 20);

    // Blend: all-time + recent, weighted by confidence
    const blendedRate = 0.7 * metrics.successRate + 0.3 * metrics.recentSuccessRate;

    // Revert to 0.5 if confidence is low (< 20 samples)
    if (metrics.totalAttempts < 20) {
      return 0.5 + (blendedRate - 0.5) * (confidence * 0.5);
    }

    return Math.min(1, Math.max(0, blendedRate));
  } catch (err) {
    // On error, fall back to neutral
    console.warn('[getHistoricalSuccessRateAsync] error, falling back to 0.5:', err);
    return 0.5;
  }
}

/**
 * Get state transition priors from telemetry
 *
 * Returns probability of transitioning from state A to state B
 * based on historical tool execution outcomes.
 *
 * Example:
 * P(RETRIEVE → VALIDATE) = (times tool returned validation-ready results) / (times tool returned from RETRIEVE)
 */
export async function getStateTransitionPriors(
  currentState: string,
  targetState: string
): Promise<number> {
  try {
    // TODO: Query telemetry for outcome_ledger
    // SELECT
    //   COUNT(CASE WHEN final_state = $2 THEN 1 END) as target_count,
    //   COUNT(*) as total_count
    // FROM outcome_ledger
    // WHERE (SELECT initial_state FROM ...) = $1
    //   AND recorded_at > NOW() - INTERVAL '90 days'

    const { targetCount, totalCount } = await loadTransitionCounts(currentState, targetState);

    if (totalCount === 0) {
      return 0.6; // Neutral default for unknown transition
    }

    return targetCount / totalCount;
  } catch (err) {
    console.warn('[getStateTransitionPriors] error, falling back to 0.6:', err);
    return 0.6;
  }
}

/**
 * Get cache warmth for a tool
 *
 * Tools that cache well should score higher (lower latency, less computation).
 *
 * Computed from:
 * - How often is the result cached? (cache hit rate)
 * - How old is the cached result? (recency decay)
 * - How frequently is this tool called? (popularity signal)
 */
export async function getCacheWarmth(toolName: string): Promise<number> {
  try {
    // TODO: Query Redis cache statistics
    // Example: redis.hget('cache:stats:by_tool', toolName) → { hits, misses, avg_age_min }

    const cacheStats = await loadCacheStats(toolName);

    if (cacheStats.totalLookups === 0) {
      return 0.5; // Neutral if no cache usage yet
    }

    const hitRate = cacheStats.hits / cacheStats.totalLookups;

    // Age decay: entries older than 6 hours score 0.1; fresh entries score 0.9
    const ageFactor = Math.max(0.1, 0.9 - (cacheStats.avgAgeMinutes / 360) * 0.8);

    return hitRate * ageFactor;
  } catch (err) {
    return 0.5;
  }
}

/**
 * Load historical metrics from telemetry store
 *
 * Returns: successRate, totalAttempts, recentSuccessRate, avgLatency, lastSeen
 */
async function loadHistoricalMetrics(
  _previousState: string,
  toolName: string,
  _queryIntent?: string
): Promise<HistoricalSuccessMetrics> {
  const neutral: HistoricalSuccessMetrics = {
    successRate: 0.5,
    totalAttempts: 0,
    successCount: 0,
    confidence: 0,
    recentSuccessRate: 0.5,
    avgLatencyMs: 0,
    lastSeenAt: null
  };
  try {
    // Per-tool aggregate over the last 90 days, across ALL previous states. The live
    // tool_call_events rows carry no state: trace_id is null on every row, and
    // agent_traces has no initial_state column, so state-conditioning is not possible
    // from the current schema. Callers must not treat this as state-specific evidence.
    // Dynamic import keeps the DB client out of this module's import graph.
    const { db, pgRows } = await import('$lib/server/db/client');
    const { sql } = await import('drizzle-orm');
    const rows = pgRows<{
      total: number;
      success: number;
      recent_total: number;
      recent_success: number;
      avg_latency: number | null;
      last_seen: string | null;
    }>(await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE result_ok = true)::int AS success,
        count(*) FILTER (WHERE called_at > now() - interval '7 days')::int AS recent_total,
        count(*) FILTER (WHERE result_ok = true AND called_at > now() - interval '7 days')::int AS recent_success,
        avg(latency_ms)::float8 AS avg_latency,
        max(called_at)::text AS last_seen
      FROM tool_call_events
      WHERE tool_name = ${toolName}
        AND result_ok IS NOT NULL
        AND called_at > now() - interval '90 days'
    `));
    const row = rows[0];
    if (!row || row.total === 0) return neutral;

    return {
      successRate: row.success / row.total,
      totalAttempts: row.total,
      successCount: row.success,
      // Same formula as getHistoricalSuccessRateAsync, which recomputes it rather than reading this field. Change both together.
      confidence: 1 - 1 / (1 + row.total / 20),
      recentSuccessRate: row.recent_total > 0 ? row.recent_success / row.recent_total : 0.5,
      avgLatencyMs: row.avg_latency ?? 0,
      lastSeenAt: row.last_seen ? new Date(row.last_seen) : null
    };
  } catch (err) {
    return neutral;
  }
}

/**
 * Load state transition counts from telemetry
 */
async function loadTransitionCounts(
  currentState: string,
  targetState: string
): Promise<{ targetCount: number; totalCount: number }> {
  try {
    // Not persisted: no live table records state-to-state transitions (tool_call_events
    // has no state column). Returning zero counts is the honest value, not a pending query.
    return { targetCount: 0, totalCount: 0 };
  } catch (err) {
    return { targetCount: 0, totalCount: 0 };
  }
}

/**
 * Load cache statistics from Redis
 */
async function loadCacheStats(
  toolName: string
): Promise<{ hits: number; misses: number; totalLookups: number; avgAgeMinutes: number }> {
  try {
    // TODO: Implement actual Redis query
    // redis.hget('cache:stats:by_tool', toolName)
    return { hits: 0, misses: 0, totalLookups: 0, avgAgeMinutes: 0 };
  } catch (err) {
    return { hits: 0, misses: 0, totalLookups: 0, avgAgeMinutes: 0 };
  }
}
