import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { createRedisConnection } from '$lib/server/redis';
import { sanitizeBrowserContext, emptyContext } from './browser-context-sanitizer.js';
import type { SanitizedBrowserContext } from '$lib/types/browser-context.js';
import { AgenticSearchService } from '$lib/server/vector/agentic-search.js';


const BROWSER_REDIS_KEY = (userId: string) => `browser-context:snapshot:${userId}`;

/** Fetch the latest sanitized browser snapshot for a user (Redis-only here —
 *  the API route owns the in-process fallback for dev). Returns null if none.
 *  Re-sanitizes defensively before returning so a stale Redis row from an
 *  older sanitizer version still passes the current rules. */
async function loadBrowserContext(userId: string): Promise<SanitizedBrowserContext | null> {
  if (!userId) return null;
  try {
    const r = createRedisConnection();
    const raw = await r.get(BROWSER_REDIS_KEY(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Re-sanitize on read — cheap, and protects against schema drift.
    const { context } = sanitizeBrowserContext(parsed);
    return context;
  } catch {
    return null;
  }
}

/**
 * Gathers system-wide context for the Admin Copilot.
 * Probes databases, queues, and caches to provide the LLM with real-time state.
 *
 * The optional `userId` parameter unlocks the Browser Context lane —
 * sanitized tab/snippet/history snapshot the operator's extension POSTed
 * to /api/browser-context/snapshot. Always attached as
 * `browserContext` with `trust: 'untrusted_user_visible'` so the prompt
 * builder can warn the model that this lane is NOT authoritative.
 */
export async function gatherAdminContext(query: string, currentPath?: string, userId?: string, intent?: string) {

  const t0 = Date.now();
  const redis = createRedisConnection();
  
  const [
    dbHealth,
    redisMetrics,
    indexingStatus,
    retrievalHealth,
    evidenceContext,
    caseContext,
    agenticResults
  ] = await Promise.all([
    // 1. DB Row Counts (Quick probe)
    pool.query(`
      SELECT 
        (SELECT count(*) FROM codebase_chunk_index) as chunks,
        (SELECT count(*) FROM embedded_summaries) as summaries,
        (SELECT count(*) FROM agent_context_files) as agent_files
    `).then(r => r.rows[0]).catch(() => ({})),

    // 2. Redis Stats
    redis.info('memory').then(info => {
      const match = info.match(/used_memory_human:(\S+)/);
      return { used_memory: match ? match[1] : 'unknown' };
    }).catch(() => ({})),

    // 3. Last Indexing Job
    pool.query(`
      SELECT job_id, status, progress, created_at 
      FROM indexing_jobs 
      ORDER BY created_at DESC 
      LIMIT 1
    `).then(r => r.rows[0]).catch(() => null),

    // 4. Trace MCP Health (Direct tool call simulation)
    fetch(`${ENV.TRACE_MCP_URL}/health`).then(r => r.json()).catch(() => ({ ok: false })),

    // 5. Intent-specific specialized context
    intent === 'evidence_retrieval' 
      ? pool.query(`SELECT count(*) as total, sum(file_size) as total_bytes FROM evidence`).then(r => r.rows[0]).catch(() => null)
      : Promise.resolve(null),
    
    intent === 'case_management'
      ? pool.query(`SELECT status, count(*) FROM cases GROUP BY status`).then(r => r.rows).catch(() => null)
      : Promise.resolve(null),

    // 6. Agentic Multi-Query Retrieval
    intent === 'agentic_multiquery'
      ? AgenticSearchService.search(query, { 
          collection: 'codebase_chunks', 
          tags: query.match(/#\w+/g)?.map(t => t.slice(1)) ?? [] 
        }).catch(() => null)
      : Promise.resolve(null)
  ]);

  await redis.quit();

  return {
    system: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - t0
    },
    metrics: {
      db: dbHealth,
      redis: redisMetrics,
      mcp: retrievalHealth
    },
    indexing: indexingStatus,
    agentic: agenticResults,
    request: {
      query,
      currentPath,
      intent
    },
    browserContext: userId ? (await loadBrowserContext(userId)) ?? null : null,
  };
}
