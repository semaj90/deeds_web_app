/**
 * Trace Collector — lightweight runtime event recorder
 *
 * Records runs, spans, errors, and agent actions into the
 * trace_memory_graph tables (trace_runs, trace_events, agent_actions,
 * symbol_runtime_stats).  All writes are fire-and-forget: callers
 * never await and failures are swallowed so the hot path is never blocked.
 *
 * Memory tier: WARM — data lives in Postgres + Redis summary key.
 *
 * Usage:
 *   const runId = await traceCollector.startRun('vitest', 'npm test');
 *   await traceCollector.recordEvent(runId, 'error', { filePath, symbolName, errorHash });
 *   await traceCollector.finishRun(runId, { status: 'failed', failureCount: 3 });
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RunType =
  | 'vitest'
  | 'svelte-check'
  | 'playwright'
  | 'graphify'
  | 'agent'
  | 'ollama'
  | 'smoke'
  | 'tsc'
  | 'tsgo'
  | 'other';

export type EventType =
  | 'span'
  | 'error'
  | 'cache_hit'
  | 'cache_miss'
  | 'tool_call'
  | 'db_query'
  | 'qdrant_query'
  | 'hmm_analysis'
  | 'embedding'
  | 'gpu_kernel';

export type ActionType =
  | 'propose_patch'
  | 'run_test'
  | 'search_symbol'
  | 'read_file'
  | 'grep'
  | 'explain'
  | 'plan'
  | 'mcp_tool'
  | 'diagnose';

export interface TraceRunOpts {
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceEventOpts {
  filePath?: string;
  symbolName?: string;
  durationMs?: number;
  memoryMb?: number;
  errorHash?: string;
  cacheKey?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface FinishRunOpts {
  status: 'passed' | 'failed' | 'error';
  exitCode?: number;
  durationMs?: number;
  peakMemoryMb?: number;
  failureCount?: number;
  passCount?: number;
  errorSummary?: string;
}

export interface AgentActionOpts {
  sessionId?: string;
  userId?: string;
  toolName?: string;
  targetFile?: string;
  targetSymbol?: string;
  query?: string;
  resultSummary?: string;
  resultCode?: number;
  accepted?: boolean;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

// ── Redis summary key ─────────────────────────────────────────────────────────

const REDIS_LAST_RUN_KEY = 'trace:last_run';
const REDIS_HOT_ERRORS_KEY = 'trace:hot_errors';
const REDIS_TTL = 60 * 60 * 2; // 2h

// ── Core collector ────────────────────────────────────────────────────────────

/**
 * Start a new run record. Returns the run UUID for use in subsequent calls.
 * Non-blocking — failure returns a random UUID so callers always get an ID.
 */
export async function startRun(
  runType: RunType,
  command?: string,
  opts: TraceRunOpts = {}
): Promise<string> {
  try {
    const rows = await db.execute(sql`
      INSERT INTO trace_runs (run_type, command, status, triggered_by, metadata)
      VALUES (
        ${runType},
        ${command ?? null},
        'running',
        ${opts.triggeredBy ?? 'unknown'},
        ${JSON.stringify(opts.metadata ?? {})}::jsonb
      )
      RETURNING id
    `);
    const runId = (rows.rows[0] as { id: string }).id;

    // Write hot summary to Redis
    try {
      const redis = getRedis();
      await redis.setex(
        REDIS_LAST_RUN_KEY,
        REDIS_TTL,
        JSON.stringify({ runId, runType, command, startedAt: new Date().toISOString() })
      );
    } catch { /* non-fatal */ }

    return runId;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Record a single trace event. run_id is optional — pass null for ad-hoc
 * events (e.g. individual search calls not tied to a named test run).
 * Fire-and-forget.
 */
export function recordEvent(
  runId: string | null,
  eventType: EventType,
  opts: TraceEventOpts = {}
): void {
  db.execute(sql`
    INSERT INTO trace_events
      (run_id, event_type, file_path, symbol_name, duration_ms, memory_mb,
       error_hash, cache_key, score, metadata)
    VALUES (
      ${runId ? sql`${runId}::uuid` : sql`NULL`},
      ${eventType},
      ${opts.filePath ?? null},
      ${opts.symbolName ?? null},
      ${opts.durationMs ?? null},
      ${opts.memoryMb ?? null},
      ${opts.errorHash ?? null},
      ${opts.cacheKey ?? null},
      ${opts.score ?? null},
      ${JSON.stringify(opts.metadata ?? {})}::jsonb
    )
  `).catch(() => {});

  // Track hot errors in Redis for fast agent:diagnose lookups
  if (eventType === 'error' && opts.errorHash) {
    try {
      const redis = getRedis();
      redis.zadd(REDIS_HOT_ERRORS_KEY, Date.now(), opts.errorHash).catch(() => {});
      redis.expire(REDIS_HOT_ERRORS_KEY, REDIS_TTL).catch(() => {});
    } catch { /* non-fatal */ }
  }
}

/**
 * Mark a run as finished. Fire-and-forget.
 */
export function finishRun(runId: string, opts: FinishRunOpts): void {
  db.execute(sql`
    UPDATE trace_runs SET
      status          = ${opts.status},
      exit_code       = ${opts.exitCode ?? null},
      duration_ms     = ${opts.durationMs ?? null},
      peak_memory_mb  = ${opts.peakMemoryMb ?? null},
      failure_count   = ${opts.failureCount ?? 0},
      pass_count      = ${opts.passCount ?? 0},
      error_summary   = ${opts.errorSummary ?? null},
      finished_at     = now()
    WHERE id = ${runId}::uuid
  `).catch(() => {});
}

/**
 * Record an agent tool call or proposal. Fire-and-forget.
 */
export function recordAgentAction(
  actionType: ActionType,
  opts: AgentActionOpts = {}
): void {
  db.execute(sql`
    INSERT INTO agent_actions
      (session_id, user_id, action_type, tool_name, target_file, target_symbol,
       query, result_summary, result_code, accepted, duration_ms, metadata)
    VALUES (
      ${opts.sessionId ?? null},
      ${opts.userId ?? null},
      ${actionType},
      ${opts.toolName ?? null},
      ${opts.targetFile ?? null},
      ${opts.targetSymbol ?? null},
      ${opts.query ?? null},
      ${opts.resultSummary ?? null},
      ${opts.resultCode ?? null},
      ${opts.accepted ?? null},
      ${opts.durationMs ?? null},
      ${JSON.stringify(opts.metadata ?? {})}::jsonb
    )
  `).catch(() => {});
}

/**
 * Rebuild symbol_runtime_stats for a given file from recent trace_events.
 * Runs on-demand — e.g. after a test run. Fire-and-forget.
 */
export function rebuildSymbolStats(filePath: string, periodHours = 24): void {
  db.execute(sql`
    INSERT INTO symbol_runtime_stats
      (file_path, symbol_name, period_hours, call_count, error_count,
       p50_latency_ms, p95_latency_ms, max_memory_mb, last_seen_at)
    SELECT
      file_path,
      symbol_name,
      ${periodHours},
      count(*)                                                        AS call_count,
      count(*) FILTER (WHERE event_type = 'error')                   AS error_count,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)      AS p50_latency_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)      AS p95_latency_ms,
      max(memory_mb)                                                  AS max_memory_mb,
      max(created_at)                                                 AS last_seen_at
    FROM trace_events
    WHERE file_path = ${filePath}
      AND symbol_name IS NOT NULL
      AND created_at > now() - interval '1 hour' * ${periodHours}
    GROUP BY file_path, symbol_name
    ON CONFLICT (file_path, symbol_name, period_hours)
    DO UPDATE SET
      call_count      = EXCLUDED.call_count,
      error_count     = EXCLUDED.error_count,
      p50_latency_ms  = EXCLUDED.p50_latency_ms,
      p95_latency_ms  = EXCLUDED.p95_latency_ms,
      max_memory_mb   = EXCLUDED.max_memory_mb,
      last_seen_at    = EXCLUDED.last_seen_at,
      rebuilt_at      = now()
  `).catch(() => {});
}

/**
 * Record a static import/call edge in code_relations. Idempotent.
 */
export function recordCodeRelation(
  sourceFile: string,
  targetFile: string,
  relationType: string,
  sourceKind: 'static' | 'dynamic' | 'runtime' | 'inferred' = 'static',
  weight = 1.0
): void {
  db.execute(sql`
    INSERT INTO code_relations (source_file, target_file, relation_type, source_kind, weight)
    VALUES (${sourceFile}, ${targetFile}, ${relationType}, ${sourceKind}, ${weight})
    ON CONFLICT (source_file, target_file, relation_type, source_kind)
    DO UPDATE SET
      weight       = EXCLUDED.weight,
      last_seen_at = now()
  `).catch(() => {});
}

// ── Query helpers (used by agent:diagnose) ────────────────────────────────────

export async function getRecentFailedRuns(limit = 5): Promise<{
  id: string;
  runType: string;
  command: string | null;
  errorSummary: string | null;
  failureCount: number;
  createdAt: string;
}[]> {
  try {
    const rows = await db.execute(sql`
      SELECT id, run_type, command, error_summary, failure_count, created_at
      FROM trace_runs
      WHERE status IN ('failed', 'error')
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return (rows.rows as {
      id: string; run_type: string; command: string | null;
      error_summary: string | null; failure_count: number; created_at: string;
    }[]).map(r => ({
      id: r.id,
      runType: r.run_type,
      command: r.command,
      errorSummary: r.error_summary,
      failureCount: r.failure_count,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getHotFilesFromErrors(limit = 10): Promise<{
  filePath: string;
  errorCount: number;
  lastSeen: string;
}[]> {
  try {
    const rows = await db.execute(sql`
      SELECT file_path, count(*) AS error_count, max(created_at) AS last_seen
      FROM trace_events
      WHERE event_type = 'error'
        AND file_path IS NOT NULL
        AND created_at > now() - interval '48 hours'
      GROUP BY file_path
      ORDER BY error_count DESC
      LIMIT ${limit}
    `);
    return (rows.rows as { file_path: string; error_count: string; last_seen: string }[]).map(r => ({
      filePath: r.file_path,
      errorCount: parseInt(r.error_count, 10),
      lastSeen: r.last_seen,
    }));
  } catch {
    return [];
  }
}
