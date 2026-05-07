/**
 * GET /api/admin/observability
 *
 * Read-only snapshot of the graph/search/ACE feedback spine.
 * Probes all subsystems in parallel with short timeouts.
 * Returns within ~5s even when some services are offline.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRedis } from '$lib/server/redis.js';
// @ts-expect-error tsgo pre-stable: $lib alias not resolved for named db export (tsc/svelte-check see it correctly)
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

// ── Paths ─────────────────────────────────────────────────────────────────────

const CWD         = process.cwd();
const DOCS_GRAPH  = resolve(CWD, 'docs/graph');
const LOGS_OUTPUT = resolve(CWD, 'logs/task-output');

// ── Service URLs ──────────────────────────────────────────────────────────────

const QDRANT_URL    = process.env.QDRANT_URL         ?? 'http://127.0.0.1:6333';
const NEO4J_HTTP    = process.env.NEO4J_HTTP_URL      ?? 'http://localhost:7474';
const NEO4J_USER    = process.env.NEO4J_USER          ?? 'neo4j';
const NEO4J_PASS    = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const MCP_URL       = process.env.TRACE_MCP_URL       ?? 'http://127.0.0.1:8788';
const GO_RETRIEVAL  = process.env.GO_RETRIEVAL_URL    ?? 'http://127.0.0.1:8100';
const GO_SEARCH     = process.env.GO_SEARCH_URL       ?? 'http://127.0.0.1:8096';
const TOPO_URL      = process.env.TOPOLOGY_SEARCH_URL ?? 'http://127.0.0.1:8101';
const TURBO_URL     = process.env.TURBO_QUANT_URL     ?? 'http://127.0.0.1:8090';

// ── Service probe helpers ─────────────────────────────────────────────────────

interface SvcStatus {
  up: boolean;
  latencyMs?: number;
  error?: string;
}

async function probeHttp(baseUrl: string, ms = 2000): Promise<SvcStatus> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(ms) });
    return { up: res.ok || res.status < 500, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { up: false, error: String(e).slice(0, 80) };
  }
}

async function probeRedis(): Promise<SvcStatus> {
  const t0 = Date.now();
  try {
    const redis = getRedis();
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 2000)),
    ]);
    return { up: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { up: false, error: String(e).slice(0, 80) };
  }
}

async function probePostgres(): Promise<SvcStatus> {
  const t0 = Date.now();
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_, r) => setTimeout(() => r(new Error('timeout')), 3000)),
    ]);
    return { up: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { up: false, error: String(e).slice(0, 80) };
  }
}

async function probeQdrant(): Promise<SvcStatus & { collections: string[] }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${QDRANT_URL}/collections`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, error: `HTTP ${res.status}`, collections: [] };
    const d = await res.json() as { result?: { collections?: { name: string }[] } };
    return { up: true, latencyMs: Date.now() - t0, collections: d.result?.collections?.map(c => c.name) ?? [] };
  } catch (e) {
    return { up: false, error: String(e).slice(0, 80), collections: [] };
  }
}

async function probeNeo4j(): Promise<SvcStatus> {
  const t0 = Date.now();
  try {
    const auth = Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64');
    const res = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ statements: [{ statement: 'RETURN 1 AS ok' }] }),
      signal: AbortSignal.timeout(3000),
    });
    return { up: res.ok, latencyMs: Date.now() - t0 };
  } catch (e) {
    return { up: false, error: String(e).slice(0, 80) };
  }
}

// ── File helpers ──────────────────────────────────────────────────────────────

function readDocJson<T>(filename: string): T | null {
  try {
    const p = resolve(DOCS_GRAPH, filename);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function fileAgeLabel(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const ms = Date.now() - statSync(path).mtimeMs;
    const h = Math.floor(ms / 3_600_000);
    if (h < 1) return '<1h ago';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch {
    return null;
  }
}

// ── ACE Redis stats ───────────────────────────────────────────────────────────

async function getAceRedisStats() {
  try {
    const redis = getRedis();
    const [topk, hits, auth] = await Promise.race([
      Promise.all([
        redis.keys('ace:topk:*').then(ks => ks.length).catch(() => 0),
        redis.keys('ace:hits:*').then(ks => ks.length).catch(() => 0),
        redis.exists('ace:authority:top').catch(() => 0),
      ]),
      new Promise<[number, number, number]>((_, r) =>
        setTimeout(() => r(new Error('timeout') as never), 2500)
      ),
    ]);
    return { aceTopkCount: topk, aceHitsCount: hits, aceAuthorityPresent: auth > 0 };
  } catch {
    return { aceTopkCount: 0, aceHitsCount: 0, aceAuthorityPresent: false };
  }
}

// ── Qdrant collection info ────────────────────────────────────────────────────

async function getCollectionInfo(name: string): Promise<number | null> {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const d = await res.json() as { result?: { points_count?: number; vectors_count?: number } };
    return d.result?.points_count ?? d.result?.vectors_count ?? null;
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const [redis, pg, qdrant, neo4j, mcp, goRetrieval, goSearch, topology, turboQuant, aceStats] =
    await Promise.all([
      probeRedis(),
      probePostgres(),
      probeQdrant(),
      probeNeo4j(),
      probeHttp(MCP_URL),
      probeHttp(GO_RETRIEVAL),
      probeHttp(GO_SEARCH),
      probeHttp(TOPO_URL),
      probeHttp(TURBO_URL),
      getAceRedisStats(),
    ]);

  // ── graphify state ──────────────────────────────────────────────────────────

  interface GraphifyHealth {
    generatedAt?: string;
    wikiNoteCount?: number;
    glyphCount?: number;
    agentsMdCount?: number;
    qdrantReachable?: boolean;
    gemma4Coverage?: number;
    bowClusterTiles?: number;
    aceSmokeWikiOk?: boolean;
    aceSmokeGlyphOk?: boolean;
  }

  const graphHealth = readDocJson<GraphifyHealth>('graphify-health.json');
  const dailyLogAge = fileAgeLabel(resolve(LOGS_OUTPUT, 'graphify-daily-latest.log'));
  const graphJsonAge = fileAgeLabel(resolve(DOCS_GRAPH, 'codebase-graph.json'));

  // ── Qdrant collections ──────────────────────────────────────────────────────

  const collections = qdrant.collections;
  const hasCodebaseChunks  = collections.includes('codebase_chunks_768');
  const hasSynthesisMemory = collections.includes('synthesis_memory_768');

  const [codebaseCount, synthesisCount] = await Promise.all([
    hasCodebaseChunks  ? getCollectionInfo('codebase_chunks_768')  : Promise.resolve(null),
    hasSynthesisMemory ? getCollectionInfo('synthesis_memory_768') : Promise.resolve(null),
  ]);

  // ── Stale recommendations ───────────────────────────────────────────────────

  interface RecsJson {
    totalRecommendations?: number;
    generatedAt?: string;
    recommendations?: Array<{ id: number; category: string; severity: string; title: string }>;
  }

  const recs = readDocJson<RecsJson>('recommendations.json');
  const topRecs = (recs?.recommendations ?? []).slice(0, 5).map(r => ({
    id:       r.id,
    category: r.category,
    severity: r.severity,
    title:    r.title,
  }));

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),

    services: {
      redis:       { up: redis.up,       latencyMs: redis.latencyMs,       ...(redis.error       ? { error: redis.error }       : {}) },
      postgres:    { up: pg.up,          latencyMs: pg.latencyMs,          ...(pg.error          ? { error: pg.error }          : {}) },
      qdrant:      { up: qdrant.up,      latencyMs: qdrant.latencyMs,      ...(qdrant.error      ? { error: qdrant.error }      : {}) },
      neo4j:       { up: neo4j.up,       latencyMs: neo4j.latencyMs,       ...(neo4j.error       ? { error: neo4j.error }       : {}) },
      mcp:         { up: mcp.up,         latencyMs: mcp.latencyMs,         ...(mcp.error         ? { error: mcp.error }         : {}) },
      goRetrieval: { up: goRetrieval.up, latencyMs: goRetrieval.latencyMs, ...(goRetrieval.error ? { error: goRetrieval.error } : {}) },
      goSearch:    { up: goSearch.up,    latencyMs: goSearch.latencyMs,    ...(goSearch.error    ? { error: goSearch.error }    : {}) },
      topology:    { up: topology.up,    latencyMs: topology.latencyMs,    ...(topology.error    ? { error: topology.error }    : {}) },
      turboQuant:  { up: turboQuant.up,  latencyMs: turboQuant.latencyMs,  ...(turboQuant.error  ? { error: turboQuant.error }  : {}) },
    },

    graphify: {
      codebaseGraphExists:   existsSync(resolve(DOCS_GRAPH, 'codebase-graph.json')),
      codebaseMapExists:     existsSync(resolve(DOCS_GRAPH, 'codebase-map.md')),
      authorityScoresExists: aceStats.aceAuthorityPresent,
      rerankPayloadsExists:  qdrant.up && hasCodebaseChunks,
      dailyLogAge,
      graphJsonAge,
      healthSnapshot: graphHealth
        ? {
            generatedAt:     graphHealth.generatedAt ?? null,
            wikiNoteCount:   graphHealth.wikiNoteCount ?? 0,
            glyphCount:      graphHealth.glyphCount ?? 0,
            agentsMdCount:   graphHealth.agentsMdCount ?? 0,
            gemma4Coverage:  graphHealth.gemma4Coverage ?? 0,
            bowClusterTiles: graphHealth.bowClusterTiles ?? 0,
            qdrantReachable: graphHealth.qdrantReachable ?? false,
            aceSmokeWikiOk:  graphHealth.aceSmokeWikiOk ?? false,
            aceSmokeGlyphOk: graphHealth.aceSmokeGlyphOk ?? false,
          }
        : null,
    },

    qdrantFeedback: {
      codebaseChunksPresent:  hasCodebaseChunks,
      codebaseChunkCount:     codebaseCount,
      authorityWritebackNote: aceStats.aceAuthorityPresent
        ? 'ace:authority:top key present in Redis'
        : 'ace:authority:top missing — run graphify:authority',
      rerankFeedbackNote: 'Populated by qdrant:rerank-feedback after chunk_hit_log accumulates hits',
      missingColumns: hasCodebaseChunks && codebaseCount === 0
        ? ['codebase_chunks_768 collection is empty']
        : [],
    },

    ace: {
      aceTopkCachedQueries: aceStats.aceTopkCount,
      aceHitsCachedQueries: aceStats.aceHitsCount,
      aceAuthorityPresent:  aceStats.aceAuthorityPresent,
      lanesAvailable: [
        'redis_ace', 'postgres_trigram', 'qdrant_vector',
        'ast_symbol', 'neo4j_graph', 'som_topology', 'web_research',
      ],
      glyphClusterLanePresent: existsSync(resolve(CWD, 'src/lib/server/ace/multi-lane-retrieval.ts')),
    },

    synthesisMemory: {
      collection:       'synthesis_memory_768',
      available:        hasSynthesisMemory,
      approximateCount: synthesisCount,
    },

    recommendations: topRecs,
    recsTotal:       recs?.totalRecommendations ?? 0,
    recsGeneratedAt: recs?.generatedAt ?? null,
  });
};
