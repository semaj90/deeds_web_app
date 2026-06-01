import fs from 'fs';
import path from 'path';
import type { Redis } from 'ioredis';
import { pool } from '$lib/server/db/client';
import { traceCache } from '$lib/server/observability/langfuse.js';

export type CacheSource = 'redis' | 'postgres' | 'local-json' | 'miss' | 'no-cache';

export interface AceContextCacheMetrics {
  cacheKey: string;
  cacheSource: CacheSource;
  contextCacheHit?: boolean;
  reusedChunkCount?: number;
  skippedRetrievalLanes?: string[];
  promptTokensSavedEstimate?: number;
  timeSavedMsEstimate?: number;
  repoGitSha?: string;
  ragBundleHash?: string;
  graphSnapshotHash?: string;
  query?: string;
  intent?: string;
  mode?: string;
  model?: string;
  queryEmbeddingModel?: string;
  kvQuant?: string;
  draftModel?: boolean;
  contextBudgetTokens?: number;
  finalContextTokens?: number;
  packId?: string;
  // internal bookkeeping
  lastUsedAt?: string; // ISO
  // Benchmark / Phase 7 fields
  timeToFirstTokenMs?: number;
  tokensPerSecond?: number;
  promptTokens?: number;
  completionTokens?: number;
  // Detailed cache scenario string (e.g. "changed-repo-sha-miss")
  cacheScenario?: string;
}

const LOG_DIR = path.join(process.cwd(), 'logs', 'ace-context-cache');
const LOG_FILE = path.join(LOG_DIR, 'latest.json');

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

/**
 * Append a JSON line to the local cache log (rotating/archival is left to ops)
 */
export function appendLocalLog(entry: object) {
  ensureLogDir();
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(LOG_FILE, line, { encoding: 'utf8' });
  } catch (err) {
    // best-effort; do not throw
    console.error('ace-context-cache-metrics: failed to append log', err);
  }
}

/**
 * Record cache hit metadata in Redis hot keys and persist a local log + optional Langfuse/Postgres hooks.
 * - `ace:ctx:{cacheKey}` : compact pointer (can store short JSON)
 * - `ace:ctx:hits:{cacheKey}` : integer hit counter
 * - `ace:ctx:meta:{cacheKey}` : HMSET metadata about lastUsedAt, cacheSource, promptTokensSavedEstimate
 */
export async function recordContextCacheHit(redis: Redis | null, metrics: AceContextCacheMetrics) {
  return recordContextCacheAccess(redis, { ...metrics, contextCacheHit: true });
}

/**
 * Record cache access metadata in Redis hot keys and persist a local log + optional Langfuse/Postgres hooks.
 * Set `contextCacheHit=false` to record misses without incrementing the hot hit counter.
 */
export async function recordContextCacheAccess(redis: Redis | null, metrics: AceContextCacheMetrics) {
  const now = new Date().toISOString();
  metrics.lastUsedAt = now;

  // default TTL: 6 hours (21600s) — callers may re-set longer TTLs when repoSha is fresh
  const defaultTtlSeconds = 6 * 3600;
  const freshRepoTtlSeconds = 48 * 3600;
  const ttlSeconds = metrics.repoGitSha ? freshRepoTtlSeconds : defaultTtlSeconds;

  // Update Redis keys if a client is provided
  if (redis) {
    try {
      const metaKey = `ace:ctx:meta:${metrics.cacheKey}`;
      const hitsKey = `ace:ctx:hits:${metrics.cacheKey}`;

      // increment hits only for actual cache hits
      if (metrics.contextCacheHit !== false) {
        await redis.incr(hitsKey);
      }
      // set/update metadata hash
      const hm: Record<string, string> = {
        lastUsedAt: now,
        cacheSource: metrics.cacheSource || 'miss',
      };
      hm.contextCacheHit = metrics.contextCacheHit === false ? 'false' : 'true';
      if (typeof metrics.reusedChunkCount === 'number') hm.reusedChunkCount = String(metrics.reusedChunkCount);
      if (Array.isArray(metrics.skippedRetrievalLanes)) hm.skippedRetrievalLanes = JSON.stringify(metrics.skippedRetrievalLanes);
      if (typeof metrics.promptTokensSavedEstimate === 'number') hm.promptTokensSavedEstimate = String(metrics.promptTokensSavedEstimate);
      if (typeof metrics.timeSavedMsEstimate === 'number') hm.timeSavedMsEstimate = String(metrics.timeSavedMsEstimate);
      if (metrics.repoGitSha) hm.repoGitSha = metrics.repoGitSha;
      if (metrics.ragBundleHash) hm.ragBundleHash = metrics.ragBundleHash;
      if (metrics.graphSnapshotHash) hm.graphSnapshotHash = metrics.graphSnapshotHash;
      if (metrics.kvQuant) hm.kvQuant = metrics.kvQuant;
      if (typeof metrics.draftModel === 'boolean') hm.draftModel = metrics.draftModel ? 'true' : 'false';

      await redis.hset(metaKey, hm as any);
      // set TTLs conservatively; if callers want to extend, they can do so separately
      await redis.expire(metaKey, ttlSeconds);
      if (metrics.contextCacheHit !== false) {
        await redis.expire(hitsKey, ttlSeconds);
      }

      // keep `ace:ctx:{cacheKey}` as the pack pointer written by the pack cache;
      // access metrics only update `meta` + `hits` keys.
    } catch (err) {
      console.warn('ace-context-cache-metrics: Redis update failed', err);
    }
  }

  // Local log write (for offline inspection)
  appendLocalLog({ timestamp: now, metrics });

  // Emit to Langfuse (placeholder) and Postgres persist (placeholder)
  try {
    // best-effort non-blocking calls
    sendToLangfuse(metrics).catch((e) => console.warn('langfuse send failed', e));
    persistAceRetrievalRun(metrics).catch((e) => console.warn('persistAceRetrievalRun failed', e));
  } catch (e) {
    // noop
  }
}

async function sendToLangfuse(metrics: AceContextCacheMetrics) {
  try {
    await traceCache('context-pack', {
      hit: metrics.contextCacheHit !== false,
      cacheKey: metrics.cacheKey,
      cacheSource: metrics.cacheSource,
      cacheScenario: metrics.cacheScenario,
      contextCacheHit: metrics.contextCacheHit !== false,
      reusedChunkCount: metrics.reusedChunkCount ?? 0,
      skippedRetrievalLanes: metrics.skippedRetrievalLanes ?? [],
      promptTokensSavedEstimate: metrics.promptTokensSavedEstimate ?? 0,
      timeSavedMsEstimate: metrics.timeSavedMsEstimate ?? 0,
      repoGitSha: metrics.repoGitSha ?? null,
      ragBundleHash: metrics.ragBundleHash ?? null,
      graphSnapshotHash: metrics.graphSnapshotHash ?? null,
      packId: metrics.packId ?? null,
      lastUsedAt: metrics.lastUsedAt ?? null,
      timeToFirstTokenMs: metrics.timeToFirstTokenMs ?? null,
      tokensPerSecond: metrics.tokensPerSecond ?? null,
      promptTokens: metrics.promptTokens ?? null,
      completionTokens: metrics.completionTokens ?? null,
    }, async () => undefined);
  } catch (e) {
    // swallow, best-effort
  }
}

/**
 * Persist to Postgres `ace_retrieval_runs.metadata`.
 * This is intentionally best-effort: cache access should not fail because analytics is down.
 */
async function persistAceRetrievalRun(metrics: AceContextCacheMetrics) {
  const metadata = {
    cacheKey: metrics.cacheKey,
    cacheSource: metrics.cacheSource,
    cacheScenario: metrics.cacheScenario ?? null,
    contextCacheHit: metrics.contextCacheHit !== false,
    reusedChunkCount: metrics.reusedChunkCount ?? 0,
    skippedRetrievalLanes: metrics.skippedRetrievalLanes ?? [],
    promptTokensSavedEstimate: metrics.promptTokensSavedEstimate ?? 0,
    timeSavedMsEstimate: metrics.timeSavedMsEstimate ?? 0,
    // benchmark fields
    timeToFirstTokenMs: metrics.timeToFirstTokenMs ?? null,
    tokensPerSecond: metrics.tokensPerSecond ?? null,
    promptTokens: metrics.promptTokens ?? null,
    completionTokens: metrics.completionTokens ?? null,
    repoGitSha: metrics.repoGitSha ?? null,
    ragBundleHash: metrics.ragBundleHash ?? null,
    graphSnapshotHash: metrics.graphSnapshotHash ?? null,
    kvQuant: metrics.kvQuant ?? null,
    draftModel: typeof metrics.draftModel === 'boolean' ? metrics.draftModel : null,
    packId: metrics.packId ?? null,
    lastUsedAt: metrics.lastUsedAt ?? new Date().toISOString(),
  };

  const query = metrics.query ?? metrics.packId ?? metrics.cacheKey;
  try {
    await pool.query(
      `INSERT INTO ace_retrieval_runs
        (query, intent, mode, model, query_embedding_model, expanded_terms, context_budget_tokens, final_context_tokens, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        query,
        metrics.intent ?? null,
        metrics.mode ?? 'context-cache',
        metrics.model ?? 'ace-context-pack',
        metrics.queryEmbeddingModel ?? null,
        [],
        metrics.contextBudgetTokens ?? null,
        metrics.finalContextTokens ?? null,
        JSON.stringify(metadata),
      ],
    );
    return true;
  } catch (err) {
    console.warn('ace-context-cache-metrics: Postgres persist failed', err);
    return false;
  }
}

export default {
  recordContextCacheHit,
  recordContextCacheAccess,
  appendLocalLog,
};
