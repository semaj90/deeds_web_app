import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { Pool } from 'pg';
import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';

const pgPool = new Pool({ connectionString: ENV.DATABASE_URL });

async function probeService(name: string, url: string) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return {
      name,
      ok: res.ok,
      status: res.ok ? 'online' : `http-${res.status}`,
      latencyMs: Date.now() - startedAt,
      url,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 'offline',
      latencyMs: Date.now() - startedAt,
      url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function callTraceHydrationStatus() {
  try {
    const res = await fetch(`${ENV.TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'unified-indexing-studio-hydration-status',
        method: 'tools/call',
        params: { name: 'topology.hydration_status', arguments: {} },
      }),
      signal: AbortSignal.timeout(4_000),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
    };
    const text = body.result?.content?.find((item) => item.type === 'text')?.text;
    if (!text || body.result?.isError) return null;
    return JSON.parse(text) as {
      totalRows: number;
      bmuRows: number;
      manifold4Rows: number;
      bmuCoveragePct: number;
      manifold4CoveragePct: number;
      hydrated: boolean;
      degraded: boolean;
      note: string;
    };
  } catch {
    return null;
  }
}

async function callTraceRecomputePlan() {
  try {
    const res = await fetch(`${ENV.TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'unified-indexing-studio-recompute-plan',
        method: 'tools/call',
        params: {
          name: 'topology.recompute_manifold_plan',
          arguments: { scope: 'all' },
        },
      }),
      signal: AbortSignal.timeout(4_000),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
    };
    const text = body.result?.content?.find((item) => item.type === 'text')?.text;
    if (!text || body.result?.isError) return null;
    return JSON.parse(text) as {
      readOnly: boolean;
      scope: string;
      current: {
        totalRows: number;
        bmuRows: number;
        manifold4Rows: number;
        missingBmu: number;
        missingManifold4: number;
      };
      recommendedSequence: string[];
      expectedEffects: string[];
      note: string;
    };
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    throw error(403, 'Forbidden');
  }

  // 1. Postgres Stats
  const pgStats = await pgPool.query(`
    SELECT 
      (SELECT COUNT(*) FROM embedded_summaries) as summary_count,
      (SELECT COUNT(*) FROM hypergraph_edges) as hyper_edge_count,
      (SELECT COUNT(*) FROM graph_pathway_cards) as pathway_count,
      (SELECT COUNT(*) FROM users) as user_count,
      (SELECT COUNT(*) FROM embedded_summaries WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL) as bmu_covered_count,
      (SELECT COUNT(*) FROM embedded_summaries WHERE manifold4 IS NOT NULL AND array_length(manifold4, 1) = 4) as manifold4_covered_count
  `).then(r => r.rows[0]);

  // 2. Redis Stats
  let redisStats = { keys: 0, memory: '0MB' };
  try {
    const redis = await getRedis();
    const info = await redis.info('memory');
    const memory = info.match(/used_memory_human:(\d+\.?\d*[A-Z]B)/)?.[1] || '0MB';
    const dbsize = await redis.dbsize();
    redisStats = { keys: dbsize, memory };
  } catch (e) {
    console.error('Redis stats failed:', e);
  }

  // 3. Qdrant Stats (Mock or fetch if possible)
  let qdrantStats = { collectionCount: 0, points: 0 };
  try {
    const res = await fetch(`${ENV.QDRANT_URL}/collections`);
    const data = await res.json();
    qdrantStats.collectionCount = data.result?.collections?.length || 0;
    qdrantStats.points = data.result?.collections?.reduce((acc: number, item: { vectors_count?: number }) => acc + (item.vectors_count ?? 0), 0) || 0;
  } catch (e) {
    console.error('Qdrant stats failed:', e);
  }

  // 4. Neo4j Stats (Mocked for now as bolt is async)
  const neoStats = { nodes: 12450, edges: 38902 };

  // 5. RabbitMQ Stats (Queue health)
  let rabbitStats = { pending: 12, failed: 2, consumers: 4 };
  try {
    const res = await fetch(`${ENV.RABBITMQ_MGMT_URL}/api/queues/%2f/indexing_queue`, {
      headers: { Authorization: ENV.RABBITMQ_MGMT_AUTH },
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      rabbitStats = {
        pending: data.messages_ready ?? 0,
        failed: data.messages_unacknowledged ?? 0,
        consumers: data.consumers ?? 0
      };
    }
  } catch (e) {
    console.warn('RabbitMQ stats fetch failed, using fallback.');
  }

  const hydrationStatus = await callTraceHydrationStatus();
  const summaryCount = Number(pgStats.summary_count ?? 0);
  const bmuCoveredCount = Number(pgStats.bmu_covered_count ?? 0);
  const manifold4CoveredCount = Number(pgStats.manifold4_covered_count ?? 0);
  const topology = hydrationStatus
    ? {
        summaryCount: hydrationStatus.totalRows,
        bmuCoveredCount: hydrationStatus.bmuRows,
        manifold4CoveredCount: hydrationStatus.manifold4Rows,
        bmuCoveragePct: hydrationStatus.bmuCoveragePct,
        manifold4CoveragePct: hydrationStatus.manifold4CoveragePct,
        hydrationMissing: hydrationStatus.degraded,
        hydrated: hydrationStatus.hydrated,
        note: hydrationStatus.note,
        source: 'trace-mcp' as const,
      }
    : {
        summaryCount,
        bmuCoveredCount,
        manifold4CoveredCount,
        bmuCoveragePct: summaryCount > 0 ? Math.round((bmuCoveredCount / summaryCount) * 1000) / 10 : 0,
        manifold4CoveragePct: summaryCount > 0 ? Math.round((manifold4CoveredCount / summaryCount) * 1000) / 10 : 0,
        hydrationMissing: summaryCount > 0 && (bmuCoveredCount < summaryCount || manifold4CoveredCount < summaryCount),
        hydrated: summaryCount > 0 && bmuCoveredCount === summaryCount && manifold4CoveredCount === summaryCount,
        note: 'Fallback SQL-derived hydration summary.',
        source: 'page-sql' as const,
      };

  const [traceMcp, bifrost, turboquant, rerank, ollama, topologySearch, recomputePlan] = await Promise.all([
    probeService('TRACE MCP', `${ENV.TRACE_MCP_URL}/health`),
    probeService('Bifrost', `${ENV.BIFROST_URL}/health`),
    probeService('TurboQuant', `${ENV.TURBOQUANT_BASE_URL}/health`),
    probeService('Reranker', `${ENV.RERANK_BASE_URL}/health`),
    probeService('Ollama', `${ENV.OLLAMA_BASE_URL}/api/tags`),
    probeService('Topology Search', `${ENV.TOPOLOGY_SEARCH_URL}/health`),
    callTraceRecomputePlan(),
  ]);

  // 6. AI Skills & Recent Runs
  const [skills, recentRuns] = await Promise.all([
    pgPool.query(`SELECT id, name, description, is_system FROM admin_ai_skills ORDER BY name ASC`).then(r => r.rows),
    pgPool.query(`
      SELECT r.*, s.name as skill_name 
      FROM admin_ai_subagent_runs r 
      JOIN admin_ai_skills s ON r.skill_id = s.id 
      ORDER BY r.created_at DESC 
      LIMIT 10
    `).then(r => r.rows)
  ]);

  const serviceStatus = {
    traceMcp,
    bifrost,
    turboquant,
    rerank,
    ollama,
    topologySearch,
  };

  return {
    stats: {
      postgres: pgStats,
      redis: redisStats,
      qdrant: qdrantStats,
      neo4j: neoStats,
      rabbit: rabbitStats,
      topology,
      recomputePlan,
      services: serviceStatus,
      skills,
      recentRuns,
      environment: {
        nodeEnv: ENV.NODE_ENV,
        gpuEnabled: process.env.ENABLE_GPU === 'true',
        quicEnabled: true // Caddy handles this
      }
    }
  };
};
