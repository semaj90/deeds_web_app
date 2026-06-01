import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { createRedisConnection } from '$lib/server/redis';
import { sanitizeBrowserContext, emptyContext } from '../../../admin/browser-context-sanitizer.js';
import type { SanitizedBrowserContext } from '$lib/types/browser-context.js';
import { HyperRagFusionService } from '$lib/server/retrieval/hyperrag-fusion-service.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';



const BROWSER_REDIS_KEY = (userId: string) => `browser-context:snapshot:${userId}`;

export const ALLOWED_ADMIN_TOOLS = [
  'kb.hybrid_search',
  'kb.search_pathways',
  'kb.search_notecards',
  'kb.explain_context_pack',
  'search.rerank',
  'graph.semantic_path_synthesis',
  'topology.search_som_neighborhood',
];

// Relative to the sveltekit-frontend package (dev) or repo root (production node)
const SOAK_HISTORY_PATH = resolve(process.cwd(), '../docs/reports/workstation-soak-history.jsonl');
const SOAK_REPORT_PATH  = resolve(process.cwd(), '../docs/reports/workstation-soak-report.json');

interface SoakHistoryRow {
  ts: string;
  runId: string;
  cycles: number;
  isDryRun: boolean;
  overallStatus: string;
  latencyP50Ms: number;
  latencyP95Ms: number;
  vramBaselineMb: number;
  vramPeakDeltaMb: number;
  sourceRefCoveragePct: number;
  forbiddenFields: number;
  acePassRate: number;
  synthesisPassRate: number;
}

function loadSoakStatus(): { latest: SoakHistoryRow | null; trend: { runsTotal: number; lastPassTs: string | null; avgP50: number; avgP95: number; vramDrift: number } } {
  try {
    if (!existsSync(SOAK_HISTORY_PATH)) {
      return { latest: null, trend: { runsTotal: 0, lastPassTs: null, avgP50: 0, avgP95: 0, vramDrift: 0 } };
    }
    const lines = readFileSync(SOAK_HISTORY_PATH, 'utf8')
      .split('\n').filter(l => l.trim())
      .map(l => JSON.parse(l) as SoakHistoryRow);
    if (!lines.length) return { latest: null, trend: { runsTotal: 0, lastPassTs: null, avgP50: 0, avgP95: 0, vramDrift: 0 } };

    const latest = lines[lines.length - 1];
    const passes = lines.filter(r => r.overallStatus === 'PASS');
    const avgP50 = lines.reduce((s, r) => s + r.latencyP50Ms, 0) / lines.length;
    const avgP95 = lines.reduce((s, r) => s + r.latencyP95Ms, 0) / lines.length;
    const baselines = lines.map(r => r.vramBaselineMb).filter(Boolean);
    const vramDrift = baselines.length > 1 ? baselines[baselines.length - 1] - baselines[0] : 0;

    return {
      latest,
      trend: {
        runsTotal: lines.length,
        lastPassTs: passes.length ? passes[passes.length - 1].ts : null,
        avgP50: Math.round(avgP50),
        avgP95: Math.round(avgP95),
        vramDrift,
      },
    };
  } catch {
    return { latest: null, trend: { runsTotal: 0, lastPassTs: null, avgP50: 0, avgP95: 0, vramDrift: 0 } };
  }
}

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
    agenticResults,
    commandSuggestions
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
    intent === 'agentic_multiquery' || intent === 'general'
      ? HyperRagFusionService.getInstance().search({ query, mode: 'codebase', topK: 10 }).catch(() => null)
      : Promise.resolve(null),

    // 7. Command Suggestions (Phase 76 MCP)
    fetch(`${ENV.TRACE_MCP_URL}/function-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'trace.command_suggest', arguments: { task: query } })
    }).then(r => r.json()).then(j => j.suggestions).catch(() => [])
  ]);

  await redis.quit();

  const soakStatus = loadSoakStatus();

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
    suggestedCommands: commandSuggestions,
    soak: soakStatus,
    request: {
      query,
      currentPath,
      intent
    },
    browserContext: userId ? (await loadBrowserContext(userId)) ?? null : null,
  };
}
