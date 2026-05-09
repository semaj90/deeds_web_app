import { pool } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { makeRedis } from '$lib/server/redis/client.js';

/**
 * Gathers system-wide context for the Admin Copilot.
 * Probes databases, queues, and caches to provide the LLM with real-time state.
 */
export async function gatherAdminContext(query: string, currentPath?: string) {
  const t0 = Date.now();
  const redis = makeRedis();
  
  const [
    dbHealth,
    redisMetrics,
    indexingStatus,
    retrievalHealth
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
    fetch(`${ENV.TRACE_MCP_URL}/health`).then(r => r.json()).catch(() => ({ ok: false }))
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
    request: {
      query,
      currentPath
    }
  };
}
