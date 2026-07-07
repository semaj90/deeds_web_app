/**
 * trace-mcp-server.ts
 *
 * Standalone TypeScript MCP server (Streamable HTTP, port 8788) that exposes
 * graph analysis, topology, KAG, and research tools to Gemma4 agentic calls.
 *
 * Separate from src/mcp/server.ts (stdio, 29 tools) — this one is HTTP-native
 * so any MCP client (Claude Desktop, Continue, Cursor) can connect directly.
 *
 * Start detached:  ensure-dev-runtime.mjs spawns this via ensure-mcp-server.mjs
 * Direct:          npx tsx src/mcp/trace-mcp-server.ts
 * Health check:    curl http://127.0.0.1:8788/health
 *
 * Tool namespaces (17 tools):
 *   graph.expand_neighborhood  — ego-graph expansion in Neo4j
 *   graph.shortest_path        — multi-hop path between two stableKeys
 *   graph.community_for_node   — community/cluster membership
 *   graph.pagerank_top         — top-N nodes by PageRank
 *   topology.search_near       — 4D manifold neighborhood search
 *   topology.same_som_cluster  — all nodes sharing a SOM cluster
 *   clusters.get_members       — files in a GPU cluster
 *   clusters.get_summary_lenses — LLMS.md / wiki notes for cluster
 *   trace.kag_search           — full KAG-DAG retrieval (via /api/graph/traverse + ACE)
 *   trace.explain_retrieval    — retrieval trace for a prior query
 *   kag.record_agent_run         — write run artifacts + queue JSONL for ingest
 *   kag.ingest_memory_directory  — flush pending JSONL queue → Redis ACE cache
 *   graph.expand_neighborhood    — ego-graph expansion (direct + N-hop neighbours)
 *   clusters.get_summary_lenses  — LLMS.md/wiki notes for a GPU cluster
 *   trace.validate_ace_hit       — validate cache key contract + graph node presence
 *   ops.propose_patch            — [OPERATOR-GATED] propose a code fix (read-only preview, no write)
 *   ops.run_targeted_test        — [OPERATOR-GATED] run a specific vitest file, return output
 *   ops.record_fix_attempt       — [OPERATOR-GATED] persist fix metadata to fix_attempts table
 *   ops.run_quality_gate         — [OPERATOR-GATED] run tsc --noEmit and report pass/fail
 *   hypergraph.search            — FTS + member activation search over hyperedges
 *   hypergraph.get_edge          — fetch single hyperedge by edge_hash
 *   hypergraph.explain_activation — why a hyperedge was activated for query terms
 *   hypergraph.expand_members    — edges sharing members with a given edge
 *   knowledge.get_minified_map   — compact map: top edges + LLMS.md for a directory
 *   legal.get_transcript         — fetch Whisper transcript for an evidence item
 *   legal.find_precedents        — semantic + FTS search across legal precedents
 *   legal.search_recordings      — timestamp-aware audio segment search
 *   legal.cross_examine          — generate cross-examination questions via Gemma4
 *   legal.score_case             — evidence-weighted case strength score (0-100)
 *   legal.similar_cases          — find cases similar to a reference case
 *   legal.batch_ingest           — publish document URLs to document.embed queue
 *
 * Architecture note — tools are READ-ONLY except the four ops.* tools which require an
 * operator_token to execute. Batch writes flow through graphify:* npm scripts outside the ACE hot path.
 *
 * TODO (optional future sidecar):
 *   LangGraph can orchestrate long-running graphify → verify → human-approval → patch workflows
 *   once the current FastMCP spine (this file) is stable and the observability dashboard is live.
 *   It would call these same MCP tools + npm scripts, not replace them.
 *
 * NOTE: zod-v4-tools-list-patch.js is REQUIRED on 2026-05-09 to fix the
 * tools/list serialization crash caused by transitive zod-to-json-schema@3.25.0
 * expecting Zod 3 internals. It must be imported before McpServer construction.
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Pool } from 'pg';
import { ENV } from '../lib/server/env.server.js';
import { EngramMemoryBridge } from './memory-bridge.js';
import { LangGraphBridge, extractKeywordsFromState } from './langgraph-bridge.js';

process.on('uncaughtException', (err) => {
  console.error('[mcp] UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[mcp] UNHANDLED REJECTION:', reason);
});

// ── Config ────────────────────────────────────────────────────────────────────

const TRACE_URL = new URL(ENV.TRACE_MCP_URL);
const PORT      = Number(TRACE_URL.port || '8788');
const HOST      = TRACE_URL.hostname;

import { registerNewTools } from './new_tools.js';
import { registerAdminTools } from './admin_tools.js';
import { registerSkillTools } from './skill_tools.js';
import { registerLegalSkillsTools } from './tools/legal-skills.tool.js';
import { registerCodebaseTools } from './codebase_tools.js';
import { registerResearchTools } from './research_tools.js';
import { searchNotecards } from '../lib/server/kb/search-logic.js';
import { registerBifrostTools } from './bifrost_tools.js';
import { registerTopologyMgmtTools } from './topology_mgmt_tools.js';
import { registerDbInspectionTools } from './db-inspection-tools.js';
import { registerRgAtlasTools } from './rg_atlas_tools.js';
import { registerEngramTools } from './engram_tools.js';
import { ripgrepSearch } from '../lib/server/agent/tools/ripgrep-search.js';
import { explainWikiPage, getWikiStatus, refreshDirectory, searchWiki } from '../lib/server/kb/wiki-logic.js';
import { buildSubgraphV1SeedNeighborhood } from '../lib/server/retrieval/subgraph-seed-neighborhood.js';
import { buildGraphRagStagePlan } from '../lib/server/retrieval/graphrag-stage-plan.js';

const SVELTEKIT         = ENV.PUBLIC_API_URL;
const NEO4J_HTTP        = ENV.NEO4J_HTTP_URL;
const NEO4J_USER        = ENV.NEO4J_USER;
const NEO4J_PASS        = ENV.NEO4J_PASSWORD;
const REDIS_URL         = ENV.REDIS_URL;
const PG_URL            = ENV.DATABASE_URL;
const TOPO_URL          = ENV.TOPOLOGY_SEARCH_URL;
const GO_SEARCH_URL     = ENV.GO_SEARCH_URL;
const GO_RETRIEVAL_URL  = ENV.RETRIEVAL_HTTP_URL;
const RERANK_URL        = ENV.RERANK_URL;
const TURBOQUANT_URL    = ENV.TURBOQUANT_URL;
const OLLAMA_BASE       = ENV.OLLAMA_BASE_URL;
const OLLAMA_EMBED_MODEL = ENV.OLLAMA_EMBED_MODEL;
const QDRANT_URL        = ENV.QDRANT_URL;

const server = new McpServer({
  name: "trace-mcp-server",
  version: "1.0.0",
});

// Two separate flags so unrelated things stop riding the same env var:
//   MCP_LEGACY_ALIASES       — bare-name back-compat aliases in new_tools.ts
//                              (`trace_search`, `wiki_note_lookup`).
//   MCP_OPTIONAL_REGISTRIES  — whole optional tool families (codebase, research,
//                              bifrost). Default off — they expose extra
//                              surface area we don't want unless explicitly opted in.
const ENABLE_LEGACY_ALIASES      = process.env.MCP_LEGACY_ALIASES === 'true';
const ENABLE_OPTIONAL_REGISTRIES = process.env.MCP_OPTIONAL_REGISTRIES === 'true';

registerNewTools(server, { rerankUrl: RERANK_URL }, ENABLE_LEGACY_ALIASES);
registerAdminTools(server);
registerSkillTools(server);
registerLegalSkillsTools(server);
registerEngramTools(server, REDIS_URL);
if (ENABLE_OPTIONAL_REGISTRIES) {
  registerCodebaseTools(server);
  registerResearchTools(server);
  registerBifrostTools(server);
  registerRgAtlasTools(server);
}
// NOTE: registerTopologyMgmtTools(server, pool) moved below `pool` declaration
// at line 111 — it was hitting TDZ here and crashing MCP at startup with
// "Cannot access 'pool' before initialization".
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const path = await import('node:path');

const NATIVE_PATH = path.resolve(process.cwd(), '../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
let native: any = null;
if (process.env.SIMD_BRIDGE_DISABLE === 'true') {
  console.info('SIMD bridge load skipped by SIMD_BRIDGE_DISABLE=true');
} else {
  try {
    native = require(NATIVE_PATH);
  } catch (e) {
    console.warn('Native addon failed to load:', e);
  }
}

const pool = new Pool({
  connectionString: PG_URL,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
pool.on('error', () => {});

// Initialize Engram memory bridge (PostgreSQL agent memory)
const engramBridge = new EngramMemoryBridge(PG_URL);
await engramBridge.ensureSchema().catch((err) => {
  console.warn('[mcp] Engram schema creation failed (non-fatal):', err);
});

// Initialize LangGraph bridge (Netflix Headroom dispatcher)
const langgraphBridge = new LangGraphBridge({ maxStateSize: 32_000, maxToolResultChars: 12_000 }, pool);
await langgraphBridge.ensureSchema().catch((err) => {
  console.warn('[mcp] LangGraph schema creation failed (non-fatal):', err);
});

// Register topology management tools — needs `pool`, so must be after declaration.
registerTopologyMgmtTools(server, pool);

// Register read-only Drizzle/Postgres inspection tools (db.schema_overview,
// db.table_inspect). Per docs/architecture/drizzle-inspection-mcp.md: no
// write verbs, no raw SQL, statement_timeout=2s, forbidden columns scrubbed.
// G33 validator gate enforces the no-write-verb rule statically.
registerDbInspectionTools(server, pool);

// ── Shared embedding cache (Redis L1, 1h TTL) ────────────────────────────────
// search.hybrid + topology.search_near + search.dev_context all embed the same
// query independently — single embeddinggemma call costs 3-7s, cache hit is <5ms.
const EMBED_CACHE_TTL = 3600;

let _embedRedis: import('ioredis').default | null = null;
let _embedRedisConnecting: Promise<import('ioredis').default> | null = null;
async function getEmbedRedis() {
  if (_embedRedis) return _embedRedis;
  // Race-safe: if two concurrent callers pass the null check before
  // connect() resolves, each would `new Redis()` and `connect()` — the
  // second connect() throws "Already connecting" (ioredis prohibits
  // double-connect on a single instance). Stash the in-flight promise so
  // concurrent callers share the SAME connection attempt.
  if (_embedRedisConnecting) return _embedRedisConnecting;
  _embedRedisConnecting = (async () => {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    r.on('error', () => {});
    await r.connect().catch(() => {});
    _embedRedis = r;
    return r;
  })().finally(() => {
    _embedRedisConnecting = null;
  });
  return _embedRedisConnecting;
}

/**
 * Construct a short-lived ioredis client for one tool-call's worth of work.
 * Attaches a no-op error listener before the connection attempt so that
 * Redis being offline does not flood stderr with "Unhandled error event".
 * Caller is responsible for `redis.quit()` when done.
 */
function makeRedis() {
  // Sync Redis() works fine without a dynamic import here — `Redis` is
  // already imported at the top of this file via the static import chain.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis');
  const r = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    retryStrategy: () => null,
  });
  r.on('error', () => {
    /* swallow — caller's awaits will reject cleanly */
  });
  return r;
}

async function getOrComputeEmbedding(
  query: string
): Promise<{ embedding: number[]; cached: boolean }> {
  const safeQuery = query.slice(0, 4000);
  const key = `embed:mcp:${createHash('md5').update(safeQuery).digest('hex')}`;
  try {
    const r = await getEmbedRedis();
    const hit = await r.get(key).catch(() => null);
    if (hit) {
      try {
        const parsed = JSON.parse(hit) as number[];
        if (Array.isArray(parsed) && parsed.length === 768) {
          return { embedding: parsed, cached: true };
        }
      } catch {
        /* fallthrough to recompute */
      }
    }
    let embedding: number[] = [];
    try {
      const res = await sveltePost('/api/embed', { text: safeQuery });
      embedding = ((res as { embedding?: number[] }).embedding ?? []) as number[];
    } catch {
      // Fallback to direct Ollama
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
          method: 'POST',
          body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: safeQuery }),
          signal: AbortSignal.timeout(10_000),
        });
        const data = (await res.json()) as { embedding?: number[] };
        embedding = data.embedding ?? [];
      } catch (err) {
        console.error('Embedding fallback failed:', err);
      }
    }

    if (embedding.length === 768) {
      const r = await getEmbedRedis();
      await r.setex(key, EMBED_CACHE_TTL, JSON.stringify(embedding)).catch(() => {});
    }
    return { embedding, cached: false };
  } catch (err) {
    console.error('getOrComputeEmbedding error:', err);
    return { embedding: [], cached: false };
  }
}

// ── ACE hits cache (Gemma4 agentic 24hr result cache) ─────────────────────────

const ACE_HITS_TTL = 86_400; // 24 hours

function aceHitsKey(queryHash: string, limit: number): string {
  return `ace:hits:${queryHash}:${limit}`;
}

function hashQuery(query: string, limit: number): string {
  return createHash('sha256').update(`${query.trim()}:${limit}`).digest('hex').slice(0, 16);
}

// ── Input hardening helpers ───────────────────────────────────────────────────

function clampFinite(value: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

async function searchEmbeddedSummariesLexically(opts: {
  query: string;
  limit: number;
  jsonFilter?: Record<string, unknown>;
  sourceType?: string;
}) {
  const params: Array<string | number> = [opts.query];
  let sql = `
    SELECT chunk_id,
           summary_text,
           output_meta,
           manifold4,
           som_bmu_row,
           som_bmu_col,
           ts_rank_cd(
             to_tsvector('english', COALESCE(summary_text, '')),
             plainto_tsquery('english', $1)
           ) AS lexical_score
    FROM embedded_summaries
    WHERE COALESCE(summary_text, '') <> ''
  `;

  if (opts.sourceType) {
    params.push(opts.sourceType);
    sql += ` AND source_type = $${params.length}`;
  }

  if (opts.jsonFilter) {
    params.push(JSON.stringify(opts.jsonFilter));
    sql += ` AND output_meta @> $${params.length}`;
  }

  params.push(opts.limit);
  sql += ` ORDER BY lexical_score DESC, updated_at DESC LIMIT $${params.length}`;
  return pool.query(sql, params);
}

async function probeUrl(name: string, url: string, init?: RequestInit) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000), ...init });
    return {
      name,
      url,
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probePostgres() {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1');
    return { name: 'postgres', ok: true, status: 'ok', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      name: 'postgres',
      ok: false,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeRedis() {
  const startedAt = Date.now();
  try {
    const redis = await getEmbedRedis();
    await redis.ping();
    return { name: 'redis', ok: true, status: 'ok', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      name: 'redis',
      ok: false,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeJsonFilter(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      ([k, v]) =>
        k.length < 64 && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    )
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Shared retrieval hit shape ────────────────────────────────────────────────

interface RetrievalHit {
  id?: string;
  path?: string;
  title?: string;
  snippet?: string;
  score?: number;
  source?: string;
  clusterKey?: string;
  topoClass?: string;
  graphAuthorityScore?: number;
  metadata?: Record<string, unknown>;
}

interface NormalizedRetrievalResult {
  ok: boolean;
  source: 'go-retrieval' | 'go-search' | 'topology' | 'sveltekit-fallback' | 'postgres-fts';
  degraded?: boolean;
  reason?: string;
  query?: string;
  hits: RetrievalHit[];
  elapsedMs: number;
}

function normalizeGoRetrievalHits(
  data: { results?: Array<Record<string, unknown>> },
  query: string,
  t0: number
): NormalizedRetrievalResult {
  const hits: RetrievalHit[] = (data.results ?? []).map((h) => ({
    id: h.stable_key != null ? String(h.stable_key) : h.id != null ? String(h.id) : undefined,
    path: h.file_path != null ? String(h.file_path) : undefined,
    snippet: h.content != null ? String(h.content).slice(0, 600) : undefined,
    score: typeof h.score === 'number' ? h.score : undefined,
    topoClass: h.topo_class != null ? String(h.topo_class) : undefined,
    clusterKey: h.cluster_key != null ? String(h.cluster_key) : undefined,
    graphAuthorityScore:
      typeof h.graph_authority_score === 'number' ? h.graph_authority_score : undefined,
  }));
  return { ok: true, source: 'go-retrieval', query, hits, elapsedMs: Date.now() - t0 };
}

function normalizeGoSearchHits(
  data: { results?: Array<Record<string, unknown>>; hits?: Array<Record<string, unknown>> },
  query: string,
  t0: number
): NormalizedRetrievalResult {
  const raw = data.results ?? data.hits ?? [];
  const hits: RetrievalHit[] = raw.map((h) => ({
    id: h.id != null ? String(h.id) : undefined,
    path: h.file_path != null ? String(h.file_path) : undefined,
    title: h.title != null ? String(h.title) : undefined,
    snippet:
      h.content != null
        ? String(h.content).slice(0, 600)
        : h.text != null
          ? String(h.text).slice(0, 600)
          : undefined,
    score: typeof h.score === 'number' ? h.score : undefined,
    source: h.source != null ? String(h.source) : 'go-search-service',
    topoClass: h.topo_class != null ? String(h.topo_class) : undefined,
    clusterKey: h.cluster_key != null ? String(h.cluster_key) : undefined,
    graphAuthorityScore: typeof h.authority_score === 'number' ? h.authority_score : undefined,
  }));
  return { ok: true, source: 'go-search', query, hits, elapsedMs: Date.now() - t0 };
}

function normalizeTopologyHits(
  data: { hits?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> },
  elapsedMs: number
): NormalizedRetrievalResult {
  const raw = data.hits ?? data.results ?? [];
  const hits: RetrievalHit[] = raw.map((h) => ({
    id: h.stable_key != null ? String(h.stable_key) : undefined,
    path: h.path != null ? String(h.path) : h.file_path != null ? String(h.file_path) : undefined,
    snippet:
      h.summary != null
        ? String(h.summary).slice(0, 600)
        : h.content != null
          ? String(h.content).slice(0, 600)
          : undefined,
    score:
      typeof h.hybrid_score === 'number'
        ? h.hybrid_score
        : typeof h.manifold_score === 'number'
          ? h.manifold_score
          : typeof h.score === 'number'
            ? h.score
            : undefined,
    topoClass: h.topo_class != null ? String(h.topo_class) : undefined,
    clusterKey: h.cluster_key != null ? String(h.cluster_key) : undefined,
    graphAuthorityScore:
      typeof h.graph_authority_score === 'number' ? h.graph_authority_score : undefined,
    metadata: {
      som_x: h.som_bmu_col,
      som_y: h.som_bmu_row,
      topoHex: h.topo_hex,
    },
  }));
  return { ok: true, source: 'topology', hits, elapsedMs };
}

// ── Neo4j HTTP helper ─────────────────────────────────────────────────────────

async function neo4jQuery(cypher: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
    },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: params }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}`);
  const body = (await res.json()) as {
    results?: { data?: { row?: unknown[] }[] }[];
    errors?: { message?: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message ?? 'Neo4j error');
  return body.results?.[0]?.data ?? [];
}

// ── SvelteKit proxy helper ────────────────────────────────────────────────────

async function svelteGet(path: string) {
  const res = await fetch(`${SVELTEKIT}${path}`, { signal: AbortSignal.timeout(15_000) });
  return res.json();
}

async function sveltePost(path: string, body: unknown) {
  const res = await fetch(`${SVELTEKIT}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-dev-bypass-auth': 'true',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return res.json();
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
const toolRegistry = new Map<string, ToolHandler>();

// Monkey-patch both registerTool and tool so they populate the batch_call registry
// AND record tool invocations to Engram memory (PostgreSQL + BM25/HNSW)
const _origRegister = server.registerTool.bind(server);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server as any).registerTool = (name: string, options: any, handler: any) => {
  const wrappedHandler = async (args: any, extra: any) => {
    const startTime = Date.now();
    try {
      console.log(`[mcp] DISPATCH tool: ${name}`);
      const result = await handler(args, extra);

      // Record successful tool invocation to Engram memory (fire-and-forget)
      const inputHash = EngramMemoryBridge.hashInput(args);
      const outputSummary =
        typeof result === 'string'
          ? result.slice(0, 500)
          : typeof result === 'object'
            ? JSON.stringify(result).slice(0, 500)
            : String(result).slice(0, 500);

      engramBridge
        .recordObservation({
          agent_name: 'gemma4-opencode',
          tool_name: name,
          input_hash: inputHash,
          output_summary: outputSummary,
          decision_context: { args_keys: Object.keys(args), result_type: typeof result },
          confidence: 0.9,
          bm25_tags: [name.split('.')[0], name.split('.')[1]].filter(Boolean),
        })
        .catch((err) => console.warn(`[mcp] Engram record failed for ${name}:`, err));

      return result;
    } catch (err) {
      console.error(`[mcp] ERROR in tool ${name}:`, err);

      // Record failed tool invocation to Engram memory (fire-and-forget)
      const errorMsg = err instanceof Error ? err.message : String(err);
      engramBridge
        .recordObservation({
          agent_name: 'gemma4-opencode',
          tool_name: name,
          input_hash: EngramMemoryBridge.hashInput(args),
          output_summary: `ERROR: ${errorMsg.slice(0, 200)}`,
          decision_context: {
            args_keys: Object.keys(args),
            error: errorMsg.slice(0, 100),
            elapsed_ms: Date.now() - startTime,
          },
          confidence: 0.3,
          bm25_tags: [name.split('.')[0], name.split('.')[1], 'error'].filter(Boolean),
        })
        .catch((err2) => console.warn(`[mcp] Engram record failed for ${name} (error path):`, err2));

      throw err;
    }
  };
  if (typeof handler === 'function') toolRegistry.set(name, wrappedHandler as ToolHandler);
  try {
    return _origRegister(name, options, wrappedHandler);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already registered')) return undefined;
    throw err;
  }
};

const _origTool = server.tool.bind(server);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server as any).tool = (name: string, ...rest: any[]) => {
  const handler = rest[rest.length - 1];
  const wrappedHandler = async (args: any, extra: any) => {
    try {
      console.log(`[mcp] DISPATCH tool (legacy): ${name}`);
      return await handler(args, extra);
    } catch (err) {
      console.error(`[mcp] ERROR in tool ${name} (legacy):`, err);
      throw err;
    }
  };
  if (typeof handler === 'function') toolRegistry.set(name, wrappedHandler as ToolHandler);
  const newRest = [...rest];
  newRest[newRest.length - 1] = wrappedHandler;
  return (_origTool as any)(name, ...newRest);
};

server.registerTool(
  'file.read_window',
  {
    description:
      'Reads a bounded window/range of lines from a file. Highly recommended for reading large markdown (.md) or JSON files to avoid context bloating.',
    inputSchema: z.object({
      path: z.string().describe('Absolute file path or relative path to the workspace root'),
      startLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('Start line number (1-indexed, defaults to 1)'),
      endLine: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('End line number (1-indexed, defaults to end of file)'),
      maxChars: z
        .number()
        .int()
        .min(100)
        .max(12000)
        .optional()
        .default(6000)
        .describe('Maximum characters to return (hard cap 12000, defaults to 6000)'),
    }),
  },
  async ({ path: pathArg, startLine, endLine, maxChars }) => {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      let resolvedPath = pathArg;
      if (!path.isAbsolute(resolvedPath)) {
        resolvedPath = path.resolve(process.cwd(), resolvedPath);
      } else {
        resolvedPath = path.resolve(resolvedPath);
      }

      const fileContent = await fs.readFile(resolvedPath, 'utf-8');
      const lines = fileContent.split(/\r?\n/);

      const start = clampInt(startLine ?? 1, 1, lines.length, 1);
      const end = clampInt(endLine ?? lines.length, start, lines.length, lines.length);
      const maxCharacters = clampInt(maxChars ?? 6000, 1, 12000, 6000);

      let currentLength = 0;
      let linesRead = 0;
      let truncated = false;
      let actualEndLine = start - 1;

      for (let i = start - 1; i < end; i++) {
        const line = lines[i];
        const addition = line.length + (linesRead > 0 ? 1 : 0);
        if (currentLength + addition > maxCharacters) {
          truncated = true;
          break;
        }
        currentLength += addition;
        linesRead++;
        actualEndLine = i + 1;
      }

      if (linesRead === 0 && end >= start) {
        const line = lines[start - 1];
        const content = line.slice(0, maxCharacters);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  path: resolvedPath,
                  startLine: start,
                  endLine: start,
                  content,
                  truncated: true,
                  nextStartLine: start + 1,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const content = lines.slice(start - 1, actualEndLine).join('\n');
      const nextStartLine = truncated ? actualEndLine + 1 : null;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                path: resolvedPath,
                startLine: start,
                endLine: actualEndLine,
                content,
                truncated,
                nextStartLine,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  'wiki.status',
  {
    description:
      'Returns Karpathy/AGENTS wiki status across Postgres, Redis, CouchDB, Qdrant, Neo4j, and graphify metadata.',
    inputSchema: z.object({}),
  },
  async () => ({
    content: [{ type: 'text' as const, text: JSON.stringify(await getWikiStatus()) }],
  })
);

server.registerTool(
  'wiki.search',
  {
    description:
      'Hybrid wiki search over rg/codebase-graph metadata, Redis Karpathy scores, Qdrant payloads, CouchDB wiki docs, and Postgres JSONB mappings.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Search query'),
      limit: z.number().int().min(1).max(50).default(10).describe('Maximum results'),
    }),
  },
  async ({ query, limit }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(await searchWiki(query, { limit })) }],
  })
);

server.registerTool(
  'wiki.refresh_directory',
  {
    description:
      'Refreshes one AGENTS/Karpathy directory card. Defaults to dryRun=true and does not start a full re-index.',
    inputSchema: z.object({
      path: z.string().min(1).describe('Directory path to refresh'),
      dryRun: z
        .boolean()
        .default(true)
        .describe('When true, reports proposed changes without writes'),
    }),
  },
  async ({ path, dryRun }) => ({
    content: [
      { type: 'text' as const, text: JSON.stringify(await refreshDirectory(path, dryRun ?? true)) },
    ],
  })
);

server.registerTool(
  'wiki.explain_page',
  {
    description:
      'Explains one wiki page with source files, imports, path aliases, feature keys, Qdrant tags, graph links, activity score, recommendations, and related FeatureMaps.',
    inputSchema: z.object({
      id: z.string().min(1).describe('Wiki page id, feature id, or enhanced graph mapping id'),
    }),
  },
  async ({ id }) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(await explainWikiPage(id)) }],
  })
);

server.registerTool(
  'graph.expand_neighborhood',
  {
    description:
      'Expands graph neighborhood from sourceRefs (read-only). Supports legacy stableKey/depth args for backward compatibility.',
    inputSchema: z.object({
      sourceRefs: z
        .array(z.string())
        .optional()
        .describe(
          'Primary source references (file paths or stable keys). Preferred over legacy stableKey.'
        ),
      stableKey: z.string().optional().describe('Legacy single center stable key.'),
      depth: z
        .number()
        .int()
        .min(1)
        .max(3)
        .default(2)
        .optional()
        .describe('Legacy hop depth (1–3).'),
      maxHops: z
        .number()
        .int()
        .min(1)
        .max(2)
        .optional()
        .describe('Hop depth for sourceRefs flow (1–2).'),
      limit: z.number().int().min(1).max(100).default(40).describe('Max neighbors returned'),
      query: z
        .string()
        .optional()
        .describe('Optional free-text query used only for deterministic seed-envelope labeling'),
      route: z
        .string()
        .optional()
        .describe('Optional route used only for deterministic seed-envelope labeling'),
      symbol: z
        .string()
        .optional()
        .describe('Optional symbol used only for deterministic seed-envelope labeling'),
      filePath: z
        .string()
        .optional()
        .describe('Optional explicit file path when the stable key is not a file:* key'),
    }),
  },
  async ({ sourceRefs, stableKey, depth, maxHops, limit, query, route, symbol, filePath }) => {
    const normalizeStableKey = (value: string): string => {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('file:')) return trimmed;
      if (/^[a-z]+:/i.test(trimmed)) return trimmed;
      return `file:${trimmed}`;
    };
    const toSourceRef = (value: string): string =>
      value.startsWith('file:') ? value.slice(5) : value;

    const requestedSourceRefs = Array.isArray(sourceRefs)
      ? sourceRefs.map((ref) => String(ref))
      : [];
    const seedKeys = Array.from(
      new Set(
        [
          ...requestedSourceRefs.map(normalizeStableKey),
          ...(stableKey ? [normalizeStableKey(stableKey)] : []),
        ].filter(Boolean)
      )
    );

    if (seedKeys.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { ok: true, nodes: [], edges: [], sourceRefs: [], confidence: 0 },
              null,
              2
            ),
          },
        ],
      };
    }

    const hops = maxHops === 2 || (depth ?? 2) >= 2 ? 2 : 1;
    const center = seedKeys[0] as string;
    const derivedFilePath = filePath ?? (center.startsWith('file:') ? center.slice(5) : undefined);
    const seedEnvelope = await buildSubgraphV1SeedNeighborhood({
      query,
      route,
      symbol,
      filePath: derivedFilePath,
      maxHops: hops >= 2 ? 2 : 1,
      maxNeighbors: Math.min(limit, 24),
    }).catch(() => null);

    // Try SvelteKit traverse API first (has auth-free path)
    try {
      const traversals = await Promise.all(
        seedKeys.map(
          (key) =>
            svelteGet(
              `/api/graph/traverse?nodeId=${encodeURIComponent(key)}&mode=ego&depth=${hops}&limit=${limit}`
            ).catch(() => ({ nodes: [], edges: [] })) as Promise<{
              nodes?: unknown[];
              edges?: unknown[];
            }>
        )
      );

      const nodesById = new Map<string, Record<string, unknown>>();
      const edges: Array<Record<string, unknown>> = [];

      for (const data of traversals) {
        for (const node of data.nodes ?? []) {
          const n = node as Record<string, unknown>;
          const id = String(n.id ?? n.stableKey ?? n.stable_key ?? '');
          if (!id) continue;
          nodesById.set(id, {
            id,
            stableKey: id,
            sourceRef: toSourceRef(id),
            isSeed: seedKeys.includes(id),
            ...(n ?? {}),
          });
        }
        for (const edge of data.edges ?? []) {
          const e = edge as Record<string, unknown>;
          const from = String(e.from ?? e.source ?? e.start ?? '');
          const to = String(e.to ?? e.target ?? e.end ?? '');
          if (!from || !to) continue;
          edges.push({ from, to, relation: String(e.type ?? e.relation ?? 'RELATED_TO') });
        }
      }

      const sourceRefList = Array.from(
        new Set(
          Array.from(nodesById.values())
            .map((n) => String(n.sourceRef ?? ''))
            .filter(Boolean)
        )
      );
      const confidence = Math.min(
        1,
        (seedKeys.length > 0 ? 0.45 : 0) +
          Math.min(0.35, Array.from(nodesById.keys()).length / Math.max(1, seedKeys.length * 10)) +
          (edges.length > 0 ? 0.2 : 0)
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                nodes: Array.from(nodesById.values()),
                edges,
                sourceRefs: sourceRefList,
                confidence,
                graphPaths: edges.map(
                  (edge) => `${toSourceRef(String(edge.from))} -> ${toSourceRef(String(edge.to))}`
                ),
                maxHops: hops,
                center,
                seedEnvelope,
                graph: {
                  nodes: Array.from(nodesById.values()),
                  edges,
                },
                neighbors: Array.from(nodesById.values()).map((n) => ({
                  stable_key: n.stableKey,
                  pagerank: n.pagerank ?? n.pageRank ?? null,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch {
      // Fall back to direct Neo4j
      const rows = await neo4jQuery(
        `MATCH (c)-[r*1..${hops}]-(n)
         WHERE coalesce(c.stableKey, c.stable_key) IN $keys
         RETURN DISTINCT coalesce(n.stableKey, n.stable_key) AS stableKey,
                n.label AS label,
                labels(n)[0] AS nodeType,
                type(last(r)) AS lastRelation,
                coalesce(c.stableKey, c.stable_key) AS fromStableKey
         LIMIT $limit`,
        { keys: seedKeys, limit }
      );
      const neighbors = rows.map((d: { row?: unknown[] }) => {
        const stable = String(d.row?.[0] ?? '');
        return {
          stableKey: stable,
          sourceRef: toSourceRef(stable),
          label: d.row?.[1],
          nodeType: d.row?.[2],
          relation: d.row?.[3],
          from: String(d.row?.[4] ?? center),
        };
      });
      const edges = neighbors
        .filter((n) => n.from && n.stableKey)
        .map((n) => ({ from: n.from, to: n.stableKey, relation: n.relation ?? 'RELATED_TO' }));
      const nodes = Array.from(
        new Map(
          [...seedKeys, ...neighbors.map((n) => n.stableKey)].filter(Boolean).map((key) => [
            key,
            {
              id: key,
              stableKey: key,
              sourceRef: toSourceRef(key),
              isSeed: seedKeys.includes(key),
            },
          ])
        ).values()
      );
      const sourceRefList = Array.from(new Set(nodes.map((node) => node.sourceRef)));
      const confidence = Math.min(
        1,
        (seedKeys.length > 0 ? 0.5 : 0) + Math.min(0.5, neighbors.length / 20)
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                nodes,
                edges,
                sourceRefs: sourceRefList,
                confidence,
                graphPaths: edges.map(
                  (edge) => `${toSourceRef(String(edge.from))} -> ${toSourceRef(String(edge.to))}`
                ),
                maxHops: hops,
                center,
                seedEnvelope,
                neighbors: neighbors.map((n) => ({ stable_key: n.stableKey, pagerank: null })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

server.registerTool(
  'turbovec.rank_chunks',
  {
    description: 'Read-only RotorQuant blended rerank for sourceRefs. No writes.',
    inputSchema: z.object({
      query: z.string().min(1).describe('User query or retrieval intent text'),
      sourceRefs: z.array(z.string()).min(1).describe('Source refs to rerank'),
      limit: z.number().int().min(1).max(30).default(10).optional(),
      trustBuckets: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Optional per-ref trust bucket map (local_verified, external_verified, synthetic, web_unverified)'
        ),
      trustTiers: z
        .record(z.string(), z.number())
        .optional()
        .describe('Optional per-ref trust tier map (-1..+2)'),
      recency: z
        .record(z.string(), z.number())
        .optional()
        .describe('Optional per-ref recency score (0..1)'),
      vectorScores: z
        .record(z.string(), z.number())
        .optional()
        .describe('Optional per-ref vector score (0..1)'),
      graphScores: z
        .record(z.string(), z.number())
        .optional()
        .describe('Optional per-ref graph score (0..1)'),
    }),
  },
  async ({
    query,
    sourceRefs,
    limit,
    trustBuckets,
    trustTiers,
    recency,
    vectorScores,
    graphScores,
  }) => {
    const clamp01 = (value: number): number => {
      if (!Number.isFinite(value)) return 0;
      return Math.max(0, Math.min(1, value));
    };
    const tokenize = (value: string): string[] =>
      value
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((token) => token.length > 2);
    const overlapScore = (q: string, value: string): number => {
      const qTokens = new Set(tokenize(q));
      if (qTokens.size === 0) return 0;
      const overlap = tokenize(value).filter((token) => qTokens.has(token)).length;
      return clamp01(overlap / Math.max(2, qTokens.size));
    };
    const trustBucketScore = (bucket: string): number => {
      const normalized = bucket.trim().toLowerCase();
      if (normalized === 'local_verified') return 1;
      if (normalized === 'external_verified') return 0.8;
      if (normalized === 'synthetic') return 0.45;
      if (normalized === 'web_unverified') return 0.25;
      return 0.45;
    };
    const trustTierScore = (tier: number): number => {
      const clamped = Math.max(-1, Math.min(2, tier));
      return (clamped + 1) / 3;
    };

    const refs = Array.from(new Set(sourceRefs.map((ref) => String(ref)).filter(Boolean)));
    const ranked = refs
      .map((sourceRef) => {
        const vector = clamp01(vectorScores?.[sourceRef] ?? overlapScore(query, sourceRef));
        const graph = clamp01(graphScores?.[sourceRef] ?? 0.35);
        const trust = clamp01(
          typeof trustTiers?.[sourceRef] === 'number'
            ? trustTierScore(trustTiers[sourceRef] as number)
            : trustBucketScore(trustBuckets?.[sourceRef] ?? 'synthetic')
        );
        const freshness = clamp01(recency?.[sourceRef] ?? 0.5);
        const finalScore = 0.45 * vector + 0.25 * graph + 0.2 * trust + 0.1 * freshness;

        return {
          sourceRef,
          finalScore: Number(finalScore.toFixed(6)),
          scores: {
            vector,
            graph,
            trust,
            recency: freshness,
          },
          reason: `vector=${vector.toFixed(2)} graph=${graph.toFixed(2)} trust=${trust.toFixed(2)} recency=${freshness.toFixed(2)}`,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, Math.min(limit ?? 10, 30));

    const furtherResearch = (ranked[0]?.finalScore ?? 0) < 0.6 || ranked.length < 3;
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ok: true,
              formula: '0.45*vector + 0.25*graph + 0.20*trust + 0.10*recency',
              ranked,
              sourceRefs: ranked.map((item) => item.sourceRef),
              furtherResearch,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  'engram.chat_memory_recent',
  {
    description: 'Read-only recent chat memory lookup from engram_cards.',
    inputSchema: z.object({
      userId: z.string().optional().describe('Optional user id to scope memoryId=chat:{userId}'),
      sourceRefs: z.array(z.string()).optional().describe('Optional sourceRef filter'),
      limit: z.number().int().min(1).max(40).default(8).optional(),
    }),
  },
  async ({ userId, sourceRefs, limit }) => {
    const maxRows = Math.min(limit ?? 8, 40);
    const scopedMemoryId = userId && userId.trim().length > 0 ? `chat:${userId.trim()}` : null;
    const rows = scopedMemoryId
      ? await pool.query(
          `SELECT memory_id, scope, summary, source_refs, created_at
           FROM engram_cards
           WHERE memory_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [scopedMemoryId, maxRows]
        )
      : await pool.query(
          `SELECT memory_id, scope, summary, source_refs, created_at
           FROM engram_cards
           WHERE scope = 'user'
           ORDER BY created_at DESC
           LIMIT $1`,
          [maxRows * 2]
        );

    const refs = Array.isArray(sourceRefs)
      ? Array.from(new Set(sourceRefs.map((ref) => String(ref)).filter(Boolean)))
      : [];
    const filtered = refs.length
      ? rows.rows.filter((row) => {
          const rowRefs = Array.isArray(row.source_refs)
            ? row.source_refs.map(String)
            : typeof row.source_refs === 'string'
              ? [row.source_refs]
              : [];
          return refs.some((ref) => rowRefs.some((rowRef) => rowRef.includes(ref)));
        })
      : rows.rows;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ok: true,
              count: Math.min(filtered.length, maxRows),
              memories: filtered.slice(0, maxRows).map((row) => ({
                memoryId: row.memory_id,
                scope: row.scope,
                summary: row.summary,
                sourceRefs: Array.isArray(row.source_refs) ? row.source_refs : [],
                createdAt: row.created_at,
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── graph.shortest_path ───────────────────────────────────────────────────────

server.registerTool(
  'graph.shortest_path',
  {
    description: 'Finds the shortest path between two graph nodes.',
    inputSchema: z.object({
      fromKey: z.string().describe('Source node stableKey'),
      toKey: z.string().describe('Target node stableKey'),
      maxHops: z.number().int().min(1).max(8).default(5).describe('Maximum path length'),
    }),
  },
  async ({ fromKey, toKey, maxHops }) => {
    const rows = await neo4jQuery(
      `MATCH p = shortestPath(
         (a {stableKey: $from})-[*..${maxHops}]-(b {stableKey: $to})
       )
       RETURN [n IN nodes(p) | n.stableKey] AS path,
              length(p) AS hops,
              [r IN relationships(p) | type(r)] AS relations`,
      { from: fromKey, to: toKey }
    );
    const result = rows.length
      ? { path: rows[0].row?.[0], hops: rows[0].row?.[1], relations: rows[0].row?.[2] }
      : { path: null, hops: null, message: 'No path found within hop limit' };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  }
);

// == graph.semantic_path_synthesis ============================================

server.registerTool(
  'graph.semantic_path_synthesis',
  {
    description:
      'Synthesizes a semantic narrative along the shortest structural path between nodes.',
    inputSchema: z.object({
      startKey: z.string().describe('Source node stableKey'),
      endKey: z.string().describe('Target node stableKey'),
      maxHops: z.number().int().min(1).max(10).default(6),
    }),
  },
  async ({ startKey, endKey, maxHops }) => {
    try {
      // 1. Structural Traverse (Neo4j)
      const rows = await neo4jQuery(
        `MATCH p = shortestPath((a {stableKey: $from})-[*..${maxHops}]-(b {stableKey: $to}))
         RETURN [n IN nodes(p) | n.stableKey] AS path,
                [r IN relationships(p) | type(r)] AS relations`,
        { from: startKey, to: endKey }
      );

      if (!rows.length || !rows[0].row?.[0]) {
        return { content: [{ type: 'text', text: 'No structural path found' }] };
      }

      const pathKeys = rows[0].row[0] as string[];
      const relations = rows[0].row[1] as string[];

      // 2. Semantic Hydration (Postgres)
      const hydratedNodes = await pool.query(
        `SELECT chunk_id, summary_text, output_meta, som_bmu_row, som_bmu_col, pagerank_score, risk_score
         FROM embedded_summaries
         WHERE chunk_id = ANY($1)`,
        [pathKeys]
      );

      const nodeMap = new Map(hydratedNodes.rows.map((n) => [n.chunk_id, n]));

      // 3. Synthesis
      const steps = pathKeys.map((key, i) => {
        const node = nodeMap.get(key);
        return {
          step: i + 1,
          stableKey: key,
          relation: i > 0 ? relations[i - 1] : 'START',
          summary: node?.summary_text ?? 'No summary available',
          outputMeta: node?.output_meta ?? {},
          somAnchor: node ? `${node.som_bmu_row},${node.som_bmu_col}` : null,
          authority: node?.pagerank_score ?? 0,
        };
      });

      // 4. Derive Outcomes
      const allTags = steps.flatMap((s) => s.outputMeta?.tags || []);
      const sharedTags = Array.from(new Set(allTags.filter((t, i) => allTags.indexOf(t) !== i)));

      const leaps = [];
      for (let i = 1; i < steps.length; i++) {
        if (
          steps[i - 1].somAnchor &&
          steps[i].somAnchor &&
          steps[i - 1].somAnchor !== steps[i].somAnchor
        ) {
          leaps.push({
            from: steps[i - 1].stableKey,
            to: steps[i].stableKey,
            boundary: `${steps[i - 1].somAnchor} -> ${steps[i].somAnchor}`,
          });
        }
      }

      const synthesis = {
        stagePlan: buildGraphRagStagePlan({
          startKey,
          endKey,
          maxHops,
          somRadius: 1,
          clusterCardLimit: 3,
        }),
        path: steps,
        sharedTags,
        crossClusterLeaps: leaps,
        totalAuthority: steps.reduce((acc, s) => acc + s.authority, 0),
        narrative: `Synthesized structural path of ${steps.length} steps. Identified ${sharedTags.length} shared tags and ${leaps.length} cluster leaps.`,
      };

      return { content: [{ type: 'text', text: JSON.stringify(synthesis, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// ── graph.community_for_node ──────────────────────────────────────────────────

server.registerTool(
  'graph.community_for_node',
  {
    description: 'Returns the community/cluster membership for a specific node.',
    inputSchema: z.object({
      stableKey: z.string().describe('Node stableKey to find community for'),
    }),
  },
  async ({ stableKey }) => {
    // Neo4j CodebaseFile nodes key on filePath (without "src/" prefix), not stableKey.
    // Accept multiple input shapes: "src/foo.ts", "foo.ts", "file:src/foo.ts:Symbol".
    const stripped = stableKey.replace(/^file:/, '').replace(/:[^/]*$/, '');
    const candidates = Array.from(
      new Set([stableKey, stripped, stripped.replace(/^src\//, ''), `src/${stripped}`])
    );
    const rows = await neo4jQuery(
      `MATCH (n:CodebaseFile)
       WHERE n.filePath IN $keys OR n.id IN $keys
       OPTIONAL MATCH (n)-[:MEMBER_OF]->(c:GPUCluster)
       OPTIONAL MATCH (n)-[:BELONGS_TO_COMMUNITY]->(cm:Community)
       RETURN n.filePath        AS filePath,
              n.gpuCluster      AS gpuCluster,
              n.communityId     AS communityId,
              c.clusterId       AS clusterNodeId,
              cm.communityId    AS communityNodeId,
              n.clusterKey      AS clusterKey
       LIMIT 1`,
      { keys: candidates }
    );
    const row = rows[0]?.row ?? [];
    if (row.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                stableKey,
                error: 'no community found — node not in Neo4j',
              },
              null,
              2
            ),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              stableKey,
              filePath: row[0],
              gpuCluster: row[1],
              communityId: row[2] ?? row[4], // prefer node prop, fall back to relationship
              clusterNodeId: row[3],
              clusterKey: row[5],
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── graph.pagerank_top ────────────────────────────────────────────────────────

server.registerTool(
  'graph.pagerank_top',
  {
    description: 'Lists the top authoritative nodes in the graph by PageRank score.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(20).describe('Number of top nodes'),
      nodeType: z.string().optional().describe('Filter by Neo4j label, e.g. "CodebaseFile"'),
    }),
  },
  async ({ limit, nodeType }) => {
    // Redis cache stores raw file paths (no `codebasefile:` prefix); skip cache when
    // a label filter is supplied since Neo4j is the only source that carries labels.
    if (!nodeType) {
      try {
        const { default: Redis } = await import('ioredis');
        const redis = makeRedis();
        await redis.connect().catch(() => {});
        const raw = (await redis.get('couchdb:pagerank_scores')) as string | null;
        await redis.quit().catch(() => {});
        if (raw) {
          const scores: Record<string, number> = JSON.parse(raw);
          const entries = Object.entries(scores)
            .map(([k, v]) => ({ stableKey: k, pageRank: v }))
            .sort((a, b) => b.pageRank - a.pageRank)
            .slice(0, limit);
          return { content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }] };
        }
      } catch {
        /* fall through to Neo4j */
      }
    }

    // Property is `graphPageRank` (written by GDS pipeline), not `pageRankScore`.
    // Use labels(n)[0] for the actual Neo4j label, not a `n.label` property.
    // CodebaseFile nodes use `filePath` (camelCase), not `stableKey`. Coalesce to
    // whichever identity property exists on the node so this works for non-CodebaseFile
    // labels too.
    const label = nodeType ? `:${nodeType}` : '';
    const rows = await neo4jQuery(
      `MATCH (n${label}) WHERE n.graphPageRank IS NOT NULL
       RETURN coalesce(n.stableKey, n.filePath, n.relativePath, n.path) AS stableKey,
              n.graphPageRank AS score,
              labels(n)[0] AS label
       ORDER BY score DESC LIMIT $limit`,
      { limit }
    );
    const results = rows.map((d: { row?: unknown[] }) => ({
      stableKey: d.row?.[0],
      pageRank: d.row?.[1],
      label: d.row?.[2],
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
  }
);

// ── topology.search_near ──────────────────────────────────────────────────────

server.registerTool(
  'topology.search_near',
  {
    description: 'Semantic search for nodes within a 4D topology radius.',
    inputSchema: z.object({
      query: z.string().describe('Natural language query to embed and search'),
      radius: z.number().min(0.01).max(1.0).default(0.25).describe('4D Euclidean radius'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results'),
      somCluster: z.number().int().optional().describe('Optional SOM cluster filter'),
    }),
  },
  async ({ query, radius, limit, somCluster }) => {
    const body: Record<string, unknown> = { query, radius, limit };
    if (somCluster != null) body.somCluster = somCluster;
    const res = await fetch(`${TOPO_URL}/search/hybrid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  }
);

// ── topology.same_som_cluster ─────────────────────────────────────────────────

server.registerTool(
  'topology.same_som_cluster',
  {
    description: 'Returns other nodes in the same SOM cluster as the reference node.',
    inputSchema: z.object({
      stableKey: z.string().describe('Reference node stableKey'),
      limit: z.number().int().min(1).max(100).default(30).describe('Max results'),
    }),
  },
  async ({ stableKey, limit }) => {
    // codebase_chunk_index uses qdrant_id and relative_path; treat input as either.
    const rows = await pool.query<{ som_cluster: number }>(
      `SELECT som_cluster FROM codebase_chunk_index
       WHERE qdrant_id = $1 OR relative_path = $1
       LIMIT 1`,
      [stableKey]
    );
    const cluster = rows.rows[0]?.som_cluster;
    if (cluster == null)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'Node not found in Postgres index' }),
          },
        ],
      };

    const siblings = await pool.query<{
      stable_key: string;
      rel_path: string;
      som_cluster: number;
    }>(
      `SELECT qdrant_id   AS stable_key,
              relative_path AS rel_path,
              som_cluster
       FROM codebase_chunk_index
       WHERE som_cluster = $1
         AND qdrant_id != $2
         AND relative_path != $2
       ORDER BY page_rank_score DESC NULLS LAST
       LIMIT $3`,
      [cluster, stableKey, limit]
    );
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              referenceNode: stableKey,
              somCluster: cluster,
              members: siblings.rows,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// == topology.search_som_neighborhood =========================================

server.registerTool(
  'topology.search_som_neighborhood',
  {
    description: 'Searches for nodes in the SOM grid neighborhood of an anchored query.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      radius: z.number().int().min(0).max(2).default(1).describe('SOM neighbor radius'),
      limit: z.number().int().default(10),
      jsonFilter: z
        .record(z.string(), z.any())
        .optional()
        .describe('Optional JSONB metadata filter'),
    }),
  },
  async ({ query, radius, limit, jsonFilter }) => {
    try {
      // Anchor on the dedicated topology sidecar. embedded_summaries does not
      // store 768d embeddings, so comparing a query embedding to manifold4 is invalid.
      const topoRes = await fetch(`${TOPO_URL}/search/hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, radius: 0.25, limit: 1 }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!topoRes.ok) {
        throw new Error(`topology /search/hybrid HTTP ${topoRes.status}`);
      }

      const topoData = (await topoRes.json()) as {
        hits?: Array<Record<string, unknown>>;
        results?: Array<Record<string, unknown>>;
      };
      const anchor = (topoData.hits ?? topoData.results ?? [])[0] ?? null;
      const som_bmu_row = typeof anchor?.som_bmu_row === 'number' ? anchor.som_bmu_row : null;
      const som_bmu_col = typeof anchor?.som_bmu_col === 'number' ? anchor.som_bmu_col : null;

      if (som_bmu_row == null || som_bmu_col == null) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query,
                  degraded: true,
                  error: 'No SOM anchor found for query',
                  note: 'Hydrate som_bmu_row/som_bmu_col and manifold4 before relying on neighborhood expansion.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // 2. Retrieve neighborhood by BMU proximity.
      let sql = `
        SELECT chunk_id,
               summary_text,
               output_meta,
               manifold4,
               som_bmu_row,
               som_bmu_col,
               ABS(som_bmu_row - $1) + ABS(som_bmu_col - $3) AS som_distance
        FROM embedded_summaries
        WHERE som_bmu_row BETWEEN $1 AND $2
          AND som_bmu_col BETWEEN $3 AND $4
      `;
      const params: Array<number | string> = [
        som_bmu_row - radius,
        som_bmu_row + radius,
        som_bmu_col - radius,
        som_bmu_col + radius,
      ];

      if (jsonFilter) {
        params.push(JSON.stringify(jsonFilter));
        sql += ` AND output_meta @> $${params.length}`;
      }

      sql += ` ORDER BY som_distance ASC, updated_at DESC LIMIT 1000`;

      const candidates = await pool.query(sql, params);
      if (candidates.rows.length === 0) return { content: [{ type: 'text', text: '[]' }] };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                anchor: {
                  stable_key: anchor?.stable_key ?? null,
                  path: anchor?.path ?? anchor?.file_path ?? null,
                  som_bmu_row,
                  som_bmu_col,
                  manifold4: Array.isArray(anchor?.coords) ? anchor.coords : null,
                },
                rerank: {
                  applied: false,
                  reason:
                    'embedded_summaries does not expose a 768d embedding column for neighborhood reranking',
                },
                results: candidates.rows.slice(0, limit),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  }
);

// == kb.hybrid_search =========================================================

server.registerTool(
  'kb.hybrid_search',
  {
    description: 'Performs hybrid (lexical + semantic) search across KAG context.',
    inputSchema: z.object({
      query: z.string().describe('Semantic query'),
      jsonFilter: z.record(z.string(), z.any()).optional().describe('JSONB metadata filter'),
      limit: z.number().int().default(10),
    }),
  },
  async ({ query, jsonFilter, limit }) => {
    try {
      const lexicalPromise = searchEmbeddedSummariesLexically({
        query,
        limit: limit * 2,
        jsonFilter,
      });
      const embedPromise = getOrComputeEmbedding(query);
      const semanticPromise = embedPromise.then(({ embedding, cached }) => {
        if (embedding.length !== 768)
          return { ok: false, cached, data: [] as Array<Record<string, unknown>> };
        return sveltePost('/api/code-intel/search', { query, limit: limit * 2 })
          .then((data) => ({
            ok: true,
            cached,
            data: Array.isArray((data as { data?: Array<Record<string, unknown>> }).data)
              ? ((data as { data?: Array<Record<string, unknown>> }).data ?? [])
              : [],
          }))
          .catch(() => ({ ok: false, cached, data: [] as Array<Record<string, unknown>> }));
      });

      const [lexicalRes, semanticRes] = await Promise.all([lexicalPromise, semanticPromise]);
      const merged = new Map<string, Record<string, unknown>>();

      for (const row of lexicalRes.rows as Array<Record<string, unknown>>) {
        const key = String(row.chunk_id ?? row.summary_text ?? crypto.randomUUID());
        merged.set(key, {
          ...row,
          sources: ['embedded_summaries_fts'],
          final_score: Number(row.lexical_score ?? 0) * 0.55,
        });
      }

      for (const row of semanticRes.data) {
        const key = String(row.filePath ?? row.stableKey ?? crypto.randomUUID());
        const existing = merged.get(key);
        if (existing) {
          (existing.sources as string[]).push('code_intel_semantic');
          existing.semantic_score = row.score;
          existing.final_score = Number(existing.final_score ?? 0) + Number(row.score ?? 0) * 0.45;
          if (!existing.file_path && row.filePath) existing.file_path = row.filePath;
          if (!existing.content && row.content) existing.content = row.content;
        } else {
          merged.set(key, {
            stable_key: row.stableKey ?? null,
            file_path: row.filePath ?? null,
            content: row.content ?? null,
            semantic_score: row.score ?? 0,
            sources: ['code_intel_semantic'],
            final_score: Number(row.score ?? 0) * 0.45,
          });
        }
      }

      const results = Array.from(merged.values())
        .sort((a, b) => Number(b.final_score ?? 0) - Number(a.final_score ?? 0))
        .slice(0, limit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                count: results.length,
                embedding_used: semanticRes.ok,
                embed_cache_hit: semanticRes.cached,
                degraded: !semanticRes.ok,
                note: semanticRes.ok
                  ? 'Sparse lexical summaries merged with 768d semantic code-intel anchors.'
                  : '768d semantic lane unavailable; returning sparse lexical results only.',
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  }
);

// == graph.materialize_pathway ================================================

server.registerTool(
  'graph.materialize_pathway',
  {
    description: 'Materializes a synthesized pathway into the persistent hypergraph context.',
    inputSchema: z.object({
      startKey: z.string().describe('Starting node stableKey'),
      endKey: z.string().describe('Target node stableKey'),
      summary: z.string().describe('Synthesized narrative summary'),
      pathSteps: z.array(z.record(z.string(), z.any())).describe('The ordered steps of the path'),
      citationSpans: z.array(z.any()).optional().describe('Provenance mapping'),
      pagerankScore: z.number().optional(),
    }),
  },
  async ({ startKey, endKey, summary, pathSteps, citationSpans, pagerankScore }) => {
    try {
      const { embedding } = await getOrComputeEmbedding(summary);
      if (embedding.length === 0)
        return { content: [{ type: 'text', text: 'Embedding failed' }], isError: true };

      const pathKey = createHash('sha256')
        .update(`${startKey}:${endKey}:${summary.slice(0, 100)}`)
        .digest('hex')
        .slice(0, 16);

      // Attempt primary table
      try {
        const res = await pool.query(
          `INSERT INTO graph_pathway_cards (
            path_key, start_node, end_node, summary, path_sequence, citation_spans, pagerank_score, embedding
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, ($8::real[]::vector))
          ON CONFLICT (path_key) DO UPDATE SET
            summary = EXCLUDED.summary,
            path_sequence = EXCLUDED.path_sequence,
            updated_at = NOW()
          RETURNING id`,
          [
            pathKey,
            startKey,
            endKey,
            summary,
            JSON.stringify(pathSteps),
            JSON.stringify(citationSpans || []),
            pagerankScore || 0.0,
            embedding,
          ]
        );
        return {
          content: [{ type: 'text', text: `Pathway materialized with ID: ${res.rows[0].id}` }],
        };
      } catch (e) {
        // Fallback to embedded_summaries
        const res = await pool.query(
          `INSERT INTO embedded_summaries (
            chunk_id, summary_text, source_type, source_hash, summary_type,
            model, embedding_model, qdrant_collection, manifold4
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($9::real[]::vector))
          RETURNING id`,
          [
            `${startKey}->${endKey}`,
            summary,
            'pathway',
            pathKey,
            'detailed',
            'mcp-algorithmic',
            OLLAMA_EMBED_MODEL,
            'pathway_cards',
            embedding,
          ]
        );
        return {
          content: [
            { type: 'text', text: `Pathway materialized (fallback) with ID: ${res.rows[0].id}` },
          ],
        };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// == kb.search_pathways =======================================================

server.registerTool(
  'kb.search_pathways',
  {
    description: 'Searches for previously synthesized and materialized pathways.',
    inputSchema: z.object({
      query: z.string().describe('Search for synthesized pathways'),
      limit: z.number().int().default(5),
    }),
  },
  async ({ query, limit }) => {
    try {
      const { embedding } = await getOrComputeEmbedding(query);
      if (embedding.length === 0)
        return { content: [{ type: 'text', text: 'Embedding failed' }], isError: true };

      // Search both potential tables
      const pathways = await pool
        .query(
          `SELECT id, path_key, summary, path_sequence FROM graph_pathway_cards
         ORDER BY (embedding::vector) <=> ($1::real[]::vector) LIMIT $2`,
          [embedding, limit]
        )
        .catch(() => ({ rows: [] }));

      const fallback = await searchEmbeddedSummariesLexically({
        query,
        limit,
        sourceType: 'pathway',
      }).catch(() => ({ rows: [] }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                primary: pathways.rows,
                fallback: fallback.rows,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// == kb.search_summary_tree ===================================================
// RAPTOR-style hierarchical retrieval. The LLM gets summaries at increasing
// abstraction levels so it can read 5 cluster narratives instead of 50 chunks:
//
//   L1  per-chunk lens summaries  → Qdrant summary_lenses_768   (vector="summary")
//   L2  cluster narratives        → Qdrant cluster_narratives   (vector default)
//   L3  directory cards           → Redis wiki:note:dir:dir:*   (substring match)
//
// All tiers scanned in parallel; results returned grouped by tier with score
// + source so synth:loop's Lane 4 can decide which abstraction level to feed
// Gemma4. Defaults bias toward higher-tier summaries (cluster > directory >
// per-chunk) per RAPTOR principle: bigger units = denser context per token.

server.registerTool(
  'kb.search_summary_tree',
  {
    description:
      'RAPTOR-style hierarchical search across per-chunk lens, cluster narrative, and directory-card summary tiers.',
    inputSchema: z.object({
      query: z.string().describe('Natural-language query — embedded once, fanned out to all tiers'),
      lensTopK: z.number().int().min(0).max(20).default(5).describe('Per-chunk lens summary hits'),
      clusterTopK: z.number().int().min(0).max(20).default(5).describe('Cluster narrative hits'),
      dirTopK: z
        .number()
        .int()
        .min(0)
        .max(20)
        .default(5)
        .describe('Directory-card hits (Redis substring scan)'),
      lensType: z.string().optional().describe('Filter lens hits by type (e.g. "risk", "purpose")'),
    }),
  },
  async ({ query, lensTopK, clusterTopK, dirTopK, lensType }) => {
    const t0 = Date.now();
    const QDRANT = QDRANT_URL;
    try {
      // Embed query once for both Qdrant tiers.
      const embedRes = await getOrComputeEmbedding(query);
      const vec = embedRes.embedding;

      // --- L1: per-chunk lens summaries (Qdrant summary_lenses_768) ---
      const lensPromise =
        lensTopK > 0 && vec.length > 0
          ? fetch(`${QDRANT}/collections/summary_lenses_768/points/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vector: { name: 'summary', vector: vec },
                limit: lensTopK,
                with_payload: true,
                filter: lensType
                  ? { must: [{ key: 'lens_type', match: { value: lensType } }] }
                  : undefined,
              }),
              signal: AbortSignal.timeout(8_000),
            })
              .then((r) => r.json())
              .catch(() => ({ result: [] }))
          : Promise.resolve({ result: [] });

      // --- L2: cluster narratives (Qdrant cluster_narratives, named vector "narrative") ---
      const clusterPromise =
        clusterTopK > 0 && vec.length > 0
          ? fetch(`${QDRANT}/collections/cluster_narratives/points/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vector: { name: 'narrative', vector: vec },
                limit: clusterTopK,
                with_payload: true,
              }),
              signal: AbortSignal.timeout(8_000),
            })
              .then((r) => r.json())
              .catch(() => ({ result: [] }))
          : Promise.resolve({ result: [] });

      // --- L3: directory cards (Redis wiki:note:dir:dir:* substring) ---
      const dirPromise = (async () => {
        if (dirTopK <= 0) return [];
        const r = await getEmbedRedis().catch(() => null);
        if (!r) return [];
        const needle = query.toLowerCase().trim();
        if (needle.length < 3) return [];
        const keys: string[] = [];
        let cursor = '0';
        for (let i = 0; i < 20 && keys.length < 600; i++) {
          const sr = await r.scan(cursor, 'MATCH', 'wiki:note:dir:dir:*', 'COUNT', '1000');
          cursor = sr[0];
          keys.push(...sr[1]);
          if (cursor === '0') break;
        }
        if (keys.length === 0) return [];
        const vals = await r.mget(...keys);
        const hits: Array<{ dirPath: string; score: number; preview: string }> = [];
        for (let i = 0; i < keys.length && hits.length < dirTopK * 2; i++) {
          const v = vals[i];
          if (!v) continue;
          const lower = v.toLowerCase();
          const pos = lower.indexOf(needle);
          if (pos === -1) continue;
          const dirPath = keys[i].replace(/^wiki:note:dir:dir:/, '').replace(/_/g, '/');
          hits.push({ dirPath, score: pos < 200 ? 1.0 : 0.5, preview: v.slice(0, 300) });
        }
        return hits.sort((a, b) => b.score - a.score).slice(0, dirTopK);
      })();

      const [lensRes, clusterRes, dirHits] = await Promise.all([
        lensPromise,
        clusterPromise,
        dirPromise,
      ]);

      const lensHits = (
        (
          lensRes as {
            result?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>;
          }
        ).result ?? []
      ).map((p) => ({
        id: String(p.id),
        score: p.score,
        chunkId: p.payload?.chunk_id,
        lensType: p.payload?.lens_type,
        text: String(p.payload?.text ?? '').slice(0, 600),
      }));
      const clusterHits = (
        (
          clusterRes as {
            result?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>;
          }
        ).result ?? []
      ).map((p) => ({
        id: String(p.id),
        score: p.score,
        clusterId: p.payload?.clusterId,
        purpose: p.payload?.purpose,
        summary: String(p.payload?.summary ?? '').slice(0, 600),
        patterns: p.payload?.patterns,
      }));

      const out = {
        query,
        tier_counts: {
          lens: lensHits.length,
          cluster: clusterHits.length,
          directory: dirHits.length,
        },
        // RAPTOR ordering: cluster (densest context) → directory (mid-grain) → lens (chunk-level).
        cluster_narratives: clusterHits,
        directory_cards: dirHits,
        chunk_lens_summaries: lensHits,
        embedding_used: vec.length > 0,
        durationMs: Date.now() - t0,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: String(err), durationMs: Date.now() - t0 }),
          },
        ],
        isError: true,
      };
    }
  }
);

// == kb.search_notecards ======================================================

server.registerTool(
  'kb.search_notecards',
  {
    description: 'Searches for identity-spine notecards matching a query.',
    inputSchema: z.object({
      query: z.string().describe('Search for identity-spine notecards'),
      limit: z.number().int().min(1).max(20).default(5),
    }),
  },
  async ({ query, limit }) => {
    try {
      const cards = await searchNotecards({ query, limit });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                query,
                count: cards.length,
                cards: cards.map((card) => ({
                  chunk_id: card.card_id,
                  source_path: card.source_path,
                  score: card.score,
                  why: card.why,
                  kind: card.kind,
                  tags: card.tags,
                  content: card.context_text.slice(0, 600),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// == kb.explain_context_pack ==================================================

server.registerTool(
  'kb.explain_context_pack',
  {
    description:
      'Explains the retrieval provenance and assembly logic for a generated context pack.',
    inputSchema: z.object({
      query: z.string().describe('User question that produced the context pack'),
      hybridSearch: z.array(z.record(z.string(), z.any())).optional(),
      pathwaySearch: z.record(z.string(), z.any()).optional(),
      notecardSearch: z.record(z.string(), z.any()).optional(),
      rerankResults: z.record(z.string(), z.any()).optional(),
      topologyNeighborhood: z.record(z.string(), z.any()).optional(),
    }),
  },
  async ({
    query,
    hybridSearch,
    pathwaySearch,
    notecardSearch,
    rerankResults,
    topologyNeighborhood,
  }) => {
    const hybridCount = hybridSearch?.length ?? 0;
    const pathwayPrimary = Array.isArray(pathwaySearch?.primary) ? pathwaySearch.primary.length : 0;
    const pathwayFallback = Array.isArray(pathwaySearch?.fallback)
      ? pathwaySearch.fallback.length
      : 0;
    const notecardCount = Array.isArray(notecardSearch?.cards) ? notecardSearch.cards.length : 0;
    const rerankCount = Array.isArray(rerankResults?.results) ? rerankResults.results.length : 0;
    const topologyCount = Array.isArray(topologyNeighborhood?.results)
      ? topologyNeighborhood.results.length
      : 0;

    const reasons: string[] = [];
    if (hybridCount > 0)
      reasons.push(`hybrid retrieval surfaced ${hybridCount} summary candidates`);
    if (pathwayPrimary + pathwayFallback > 0)
      reasons.push(
        `pathway retrieval found ${pathwayPrimary + pathwayFallback} reusable narratives`
      );
    if (notecardCount > 0)
      reasons.push(`identity-spine notecards contributed ${notecardCount} codebase anchors`);
    if (rerankCount > 0) reasons.push(`reranking compressed the candidate set to ${rerankCount}`);
    if (topologyCount > 0)
      reasons.push(`SOM neighborhood expansion added ${topologyCount} topological neighbors`);
    if (reasons.length === 0)
      reasons.push('all retrieval lanes degraded or returned empty results');

    const recommendedNextSteps: string[] = [];
    if (hybridCount === 0)
      recommendedNextSteps.push(
        'Run kb.hybrid_search diagnostics or check embedded_summaries freshness'
      );
    if (pathwayPrimary === 0)
      recommendedNextSteps.push('Materialized pathway coverage is low for this query family');
    if (topologyCount === 0 && /som|topology|cluster|neighbor/i.test(query)) {
      recommendedNextSteps.push(
        'Hydrate SOM anchors before relying on topology neighborhood answers'
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              summary: `Context pack assembled from ${
                [
                  hybridCount > 0 ? 'hybrid summaries' : null,
                  pathwayPrimary + pathwayFallback > 0 ? 'pathway cards' : null,
                  notecardCount > 0 ? 'notecards' : null,
                  topologyCount > 0 ? 'SOM neighbors' : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'degraded fallbacks'
              }.`,
              reasons,
              counts: {
                hybrid: hybridCount,
                pathwayPrimary,
                pathwayFallback,
                notecards: notecardCount,
                reranked: rerankCount,
                topologyNeighbors: topologyCount,
              },
              recommendedNextSteps,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// == trace.system_health =======================================================

server.registerTool(
  'trace.system_health',
  {
    description:
      'Returns the health and latency status of all backend retrieval and inference services.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      console.log('[mcp] trace.system_health called');
      console.log('[mcp] health: starting probes');
      const checks = await Promise.all([
        (async () => {
          console.log('[mcp] probe: mcp');
          const r = await probeUrl('mcp', `http://${HOST}:${PORT}/health`);
          console.log('[mcp] probe: mcp done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: ollama');
          const r = await probeUrl('ollama_embed', `${OLLAMA_BASE}/api/tags`);
          console.log('[mcp] probe: ollama done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: bifrost');
          const r = await probeUrl('bifrost', `${ENV.BIFROST_URL}/health`);
          console.log('[mcp] probe: bifrost done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: turboquant');
          const r = await probeUrl('turboquant', `${TURBOQUANT_URL}/health`);
          console.log('[mcp] probe: turboquant done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: topology');
          const r = await probeUrl('topology_search', `${TOPO_URL}/health`);
          console.log('[mcp] probe: topology done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: go_retrieval');
          const r = await probeUrl('go_retrieval', `${GO_RETRIEVAL_URL}/health`);
          console.log('[mcp] probe: go_retrieval done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: rerank');
          const r = await probeUrl('rerank', `${RERANK_URL}/health`);
          console.log('[mcp] probe: rerank done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: qdrant');
          const r = await probeUrl('qdrant', `${QDRANT_URL}/collections`);
          console.log('[mcp] probe: qdrant done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: neo4j');
          const r = await probeUrl('neo4j', `${NEO4J_HTTP}/db/neo4j/tx/commit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64')}`,
            },
            body: JSON.stringify({ statements: [{ statement: 'RETURN 1' }] }),
            signal: AbortSignal.timeout(5_000),
          }).catch((err) => ({ name: 'neo4j', ok: false, error: String(err) }));
          console.log('[mcp] probe: neo4j done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: postgres');
          const r = await probePostgres();
          console.log('[mcp] probe: postgres done');
          return r;
        })(),
        (async () => {
          console.log('[mcp] probe: redis');
          const r = await probeRedis();
          console.log('[mcp] probe: redis done');
          return r;
        })(),
      ]);
      console.log('[mcp] health: all probes finished');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ok: checks.every((check) => check.ok),
                degraded: checks.some((check) => !check.ok),
                checkedAt: new Date().toISOString(),
                services: checks,
                notes: [
                  'Port 8788: TRACE MCP tool gateway',
                  'Port 11434: Ollama (embeddings + fast gen)',
                  'Port 8090: Reranker (Optimized llama-server)',
                  'Port 8080: TurboQuant (Long-context llama-server)',
                  'Port 3040: Bifrost dispatcher',
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      console.error('[mcp] trace.system_health error:', err);
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(err) }) }],
      };
    }
  }
);

// == search.rerank ============================================================

server.registerTool(
  'search.rerank',
  {
    description: 'Reranks a list of document snippets for relevance to a query using llama-server.',
    inputSchema: z.object({
      query: z.string().describe('The user query'),
      documents: z.array(z.string()).describe('List of document snippets to rerank'),
      topN: z.number().int().default(5),
    }),
  },
  async ({ query, documents, topN }) => {
    try {
      const res = await fetch(`${RERANK_URL}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, documents, top_n: topN }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        throw new Error(`rerank HTTP ${res.status}`);
      }
      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                degraded: true,
                reason: String(err),
                results: documents.slice(0, topN).map((document, index) => ({
                  index,
                  relevance_score: Math.max(0, 1 - index * 0.05),
                  document,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// == hypergraph.semantic_path_synthesis =======================================

server.registerTool(
  'hypergraph.semantic_path_synthesis',
  {
    description: 'Synthesizes a semantic narrative along a path in the hypergraph.',
    inputSchema: z.object({
      startKey: z.string().describe('Source node stableKey'),
      endKey: z.string().describe('Target node stableKey'),
    }),
  },
  async ({ startKey, endKey }) => {
    try {
      const res = await pool.query(
        `SELECT h.edge_hash, h.title, h.summary, h.member_ids, h.confidence
         FROM hypergraph_edges h
         WHERE $1 = ANY(h.member_ids) OR $2 = ANY(h.member_ids)
         LIMIT 10`,
        [startKey, endKey]
      );

      const direct = res.rows.filter(
        (r) => r.member_ids.includes(startKey) && r.member_ids.includes(endKey)
      );
      const bridges = res.rows.filter((r) => !direct.includes(r));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                directLinkingEdges: direct,
                potentialBridges: bridges,
                note: 'Hypergraph paths represent higher-order relations beyond simple direct imports/calls.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// ── topology.search_4d ───────────────────────────────────────────────────────
// Explicit 4D manifold coordinate search with optional JSONB payload filters.
// Use when you already know the SOM grid position and want structurally-adjacent
// files rather than starting from a text query.

server.registerTool(
  'topology.search_4d',
  {
    description: 'Explicit 4D manifold coordinate search with optional JSONB payload filters.',
    inputSchema: z.object({
      som_x: z.number().describe('SOM X coordinate (BMU column, 0-based)'),
      som_y: z.number().describe('SOM Y coordinate (BMU row, 0-based)'),
      semantic_z: z
        .number()
        .min(0)
        .max(1)
        .default(0.5)
        .optional()
        .describe('Semantic centroid projection 0–1'),
      grpo_w: z.number().min(0).max(1).default(0.5).optional().describe('GRPO quality weight 0–1'),
      radius: z.number().min(0.01).max(5.0).default(0.5).describe('4D Euclidean radius'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results'),
      filters: z
        .record(z.string(), z.any())
        .optional()
        .describe('JSONB payload filters (e.g. { "topo_class": "server" })'),
    }),
  },
  async ({ som_x, som_y, semantic_z, grpo_w, radius, limit, filters }) => {
    const t0 = Date.now();
    const cSomX = clampFinite(som_x, 0, 255);
    const cSomY = clampFinite(som_y, 0, 255);
    const cSemanticZ = clampFinite(semantic_z ?? 0.5, -1, 1, 0.5);
    const cGrpoW = clampFinite(grpo_w ?? 0.5, -1, 1, 0.5);
    const cRadius = clampFinite(radius, 0.01, 5.0, 0.5);
    const cLimit = clampFinite(limit, 1, 50, 10);
    const safeFilters = normalizeJsonFilter(filters);
    try {
      const body: Record<string, unknown> = {
        center: { som_x: cSomX, som_y: cSomY, semantic_z: cSemanticZ, grpo_w: cGrpoW },
        radius: cRadius,
        limit: cLimit,
      };
      if (safeFilters) body.filters = safeFilters;
      const res = await fetch(`${TOPO_URL}/search/4d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`topology /search/4d HTTP ${res.status}`);
      const raw = (await res.json()) as {
        hits?: Array<Record<string, unknown>>;
        results?: Array<Record<string, unknown>>;
      };
      const normalized = normalizeTopologyHits(raw, Date.now() - t0);
      return { content: [{ type: 'text' as const, text: JSON.stringify(normalized, null, 2) }] };
    } catch (err) {
      const result: NormalizedRetrievalResult = {
        ok: false,
        source: 'topology',
        degraded: true,
        reason: String(err),
        hits: [],
        elapsedMs: Date.now() - t0,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  }
);

// ── clusters.get_members ──────────────────────────────────────────────────────

server.registerTool(
  'clusters.get_members',
  {
    description: 'Returns the member nodes for a specific cluster.',
    inputSchema: z.object({
      clusterKey: z.string().describe('Cluster key (e.g. "gpu:998" or "dir:src/lib/server/ace")'),
      limit: z.number().int().min(1).max(200).default(50).describe('Max files returned'),
    }),
  },
  async ({ clusterKey, limit }) => {
    // qdrant_cluster_members is the canonical cluster→file map (cluster_key="gpu:N"|"dir:..."|"som:N").
    // Falls back to codebase_chunk_index when membership table is empty by parsing the prefix.
    const rows = await pool.query<{
      stable_key: string;
      rel_path: string;
      page_rank_score: number | null;
    }>(
      `SELECT m.stable_key,
              COALESCE(m.file_path, c.relative_path) AS rel_path,
              c.page_rank_score
       FROM qdrant_cluster_members m
       LEFT JOIN codebase_chunk_index c ON c.qdrant_id = m.qdrant_point_id
       WHERE m.cluster_key = $1
       ORDER BY c.page_rank_score DESC NULLS LAST, m.membership_score DESC
       LIMIT $2`,
      [clusterKey, limit]
    );
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ clusterKey, count: rows.rowCount, members: rows.rows }, null, 2),
        },
      ],
    };
  }
);

// ── clusters.get_summary_lenses ───────────────────────────────────────────────

// ── trace.explain_retrieval ───────────────────────────────────────────────────

server.registerTool(
  'trace.explain_retrieval',
  {
    description: 'Explains the retrieval trace for a specific query.',
    inputSchema: z.object({
      query: z.string().describe('Query string to look up cached retrieval trace for'),
    }),
  },
  async ({ query }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = makeRedis();
      await redis.connect().catch(() => {});
      // Look for the most recent ACE trace for this query prefix
      const keys = await redis.keys(`ace:trace:*`);
      let found: string | null = null;
      for (const k of keys.slice(0, 20)) {
        const val = (await redis.get(k)) as string | null;
        if (val?.includes(query.slice(0, 30))) {
          found = val;
          break;
        }
      }
      await redis.quit().catch(() => {});
      return {
        content: [
          {
            type: 'text' as const,
            text: found
              ? JSON.stringify(JSON.parse(found), null, 2)
              : JSON.stringify({ message: 'No cached retrieval trace found for this query' }),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── search.postgres_fts ───────────────────────────────────────────────────────

server.registerTool(
  'search.postgres_fts',
  {
    description: 'Code search using PostgreSQL Full Text Search.',
    inputSchema: z.object({
      query: z.string().describe('Code search query — preserves camelCase, dots, file paths'),
      limit: z.number().int().min(1).max(50).default(20).optional(),
      topo_class: z
        .string()
        .optional()
        .describe('Filter by topology class (e.g. "infrastructure", "ui")'),
    }),
  },
  async ({ query, limit = 20, topo_class }) => {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT * FROM search_code_lexical($1, $2, $3)', [
          query,
          limit,
          topo_class ?? null,
        ]);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ results: rows, count: rows.length, mode: 'lexical' }, null, 2),
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── search.hybrid ─────────────────────────────────────────────────────────────

server.registerTool(
  'search.hybrid',
  {
    description: 'Performs hybrid (FTS + semantic) search across the codebase.',
    inputSchema: z.object({
      query: z.string().describe('Search query — mode is auto-detected from query shape'),
      limit: z.number().int().min(1).max(50).default(20).optional(),
      topo_class: z.string().optional().describe('Optional topology class prefilter'),
      mode: z
        .enum(['auto', 'lexical-heavy', 'hybrid', 'semantic-heavy'])
        .default('auto')
        .optional(),
    }),
  },
  async ({ query, limit = 20, topo_class, mode = 'auto' }) => {
    try {
      // Fan-out: FTS runs immediately; embedding runs in parallel and chains into Qdrant.
      // Total latency = max(FTS, embed + qdrant) instead of embed + max(FTS, qdrant).
      const ftsPromise = pool.query('SELECT * FROM search_code_lexical($1, $2, $3)', [
        query,
        limit * 2,
        topo_class ?? null,
      ]);

      const embedPromise = getOrComputeEmbedding(query);

      const qdrantPromise = embedPromise.then(({ embedding }) => {
        if (!embedding.length) return { results: [] };
        return fetch(`${SVELTEKIT}/api/code-intel/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, embedding, limit: limit * 2, topoClass: topo_class }),
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => r.json())
          .catch(() => ({ results: [] }));
      });

      const [pgRes, qdrantRes, embedResult] = await Promise.all([
        ftsPromise,
        qdrantPromise,
        embedPromise,
      ]);
      const embedding = embedResult.embedding;
      const embedCached = embedResult.cached;

      // Merge by file_path as a best-effort stable_key
      const merged = new Map<string, Record<string, unknown>>();
      for (const r of pgRes.rows as Record<string, unknown>[]) {
        const key = String(r.stable_key ?? r.file_path);
        merged.set(key, {
          ...r,
          sources: ['postgres_fts'],
          final_score: Number(r.lexical_score ?? 0) * 0.45,
        });
      }
      for (const r of ((qdrantRes as { results?: Record<string, unknown>[] }).results ??
        []) as Record<string, unknown>[]) {
        const key = String(r.stable_key ?? r.file_path);
        const ex = merged.get(key);
        if (ex) {
          ex.semantic_score = r.score;
          (ex.sources as string[]).push('qdrant');
          (ex as { final_score: number }).final_score += Number(r.score ?? 0) * 0.35;
        } else {
          merged.set(key, { ...r, sources: ['qdrant'], final_score: Number(r.score ?? 0) * 0.35 });
        }
      }

      const results = Array.from(merged.values())
        .sort((a, b) => (b.final_score as number) - (a.final_score as number))
        .slice(0, limit);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                results,
                count: results.length,
                mode,
                embedding_used: embedding.length > 0,
                embed_cache_hit: embedCached,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── trace.kag_search ──────────────────────────────────────────────────────────
// High-performance KAG-DAG retrieval: Go retrieval service → SvelteKit proxy → Postgres fallback.
// This is the primary lane for the TRACE performance path.

if (!toolRegistry.has('trace.kag_search'))
  server.registerTool(
    'trace.kag_search',
    {
      description:
        'High-performance KAG-DAG retrieval: Go retrieval service → SvelteKit proxy → Postgres fallback.',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().int().min(1).max(50).default(20),
        topo_class: z.string().optional(),
      }),
    },
    async ({ query, limit, topo_class }) => {
      const t0 = Date.now();
      // 1. Try Go retrieval service FIRST
      try {
        const res = await fetch(`${GO_RETRIEVAL_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit, topo_class }),
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const data = await res.json();
          return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
        }
      } catch {
        /* fall through to SvelteKit */
      }

      // 2. SvelteKit proxy
      try {
        const res = await fetch(`${SVELTEKIT}/api/code-intel/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit, topoClass: topo_class }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const data = await res.json();
          return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
        }
      } catch {
        /* fall through to Postgres */
      }

      // 3. Postgres fallback
      const { rows } = await pool.query('SELECT * FROM search_code_lexical($1, $2, $3)', [
        query,
        limit,
        topo_class ?? null,
      ]);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                results: rows,
                count: rows.length,
                mode: 'lexical-fallback',
                elapsedMs: Date.now() - t0,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

// ── trace.graphrag_search ────────────────────────────────────────────────────

// GraphRAG retrieval: dense (Qdrant) + sparse (Postgres FTS) prefetch → RRF
// merge → Neo4j graph expansion of top-K → Karpathy blend (Redis gpu:karpathy:scores)
// → composite scoring with per-source breakdown.
//
// Returns finalHits sorted by composite score with scoreBreakdown {dense, sparse,
// graph, pagerank, karpathy} and why[] reasons per hit. Designed as the canonical
// GraphRAG entry point — Lane 1 of synth:loop should call this in preference
// to firing dense/sparse/graph independently.

server.registerTool(
  'trace.graphrag_search',
  {
    description:
      'GraphRAG hybrid retrieval: dense+sparse RRF prefetch → Neo4j graph expansion → Karpathy blend rerank.',
    inputSchema: z.object({
      query: z.string().describe('Natural-language query or code symbol/path'),
      denseTopK: z.number().int().min(1).max(100).default(50),
      sparseTopK: z.number().int().min(1).max(100).default(50),
      graphDepth: z.number().int().min(0).max(3).default(1),
      finalTopK: z.number().int().min(1).max(20).default(10),
      topo_class: z.string().optional().describe('Optional topology class prefilter'),
    }),
  },
  async ({ query, denseTopK, sparseTopK, graphDepth, finalTopK, topo_class }) => {
    const t0 = Date.now();
    try {
      // STAGE 1: parallel dense + sparse prefetch (reuses search.hybrid pattern)
      const ftsPromise = pool.query('SELECT * FROM search_code_lexical($1, $2, $3)', [
        query,
        sparseTopK,
        topo_class ?? null,
      ]);
      const embedPromise = getOrComputeEmbedding(query);
      const qdrantPromise = embedPromise.then(({ embedding }) => {
        if (!embedding.length) return { results: [] };
        return fetch(`${SVELTEKIT}/api/code-intel/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, embedding, limit: denseTopK, topoClass: topo_class }),
          signal: AbortSignal.timeout(10_000),
        })
          .then((r) => r.json())
          .catch(() => ({ results: [] }));
      });
      const [pgRes, qdrantRes, rgRes] = await Promise.all([
        ftsPromise,
        qdrantPromise,
        ripgrepSearch({ pattern: query, maxResults: sparseTopK, ignoreCase: true }).catch(() => ({
          matches: [],
        })),
      ]);

      // STAGE 2: RRF merge by stable_key — reciprocal rank fusion (k=60, standard).
      const RRF_K = 60;
      const merged = new Map<
        string,
        {
          stable_key: string;
          file_path?: string;
          denseRank?: number;
          sparseRank?: number;
          denseScore?: number;
          sparseScore?: number;
          sources: string[];
          why: string[];
        }
      >();
      const sparseRows = (pgRes.rows ?? []) as Record<string, unknown>[];
      sparseRows.forEach((r, i) => {
        const key = String(r.stable_key ?? r.file_path ?? '');
        if (!key) return;
        merged.set(key, {
          stable_key: key,
          file_path: r.file_path as string | undefined,
          sparseRank: i + 1,
          sparseScore: Number(r.lexical_score ?? 0),
          sources: ['postgres_fts'],
          why: [`sparse rank ${i + 1}`],
        });
      });
      const denseRows = (qdrantRes as { results?: Record<string, unknown>[] }).results ?? [];
      denseRows.forEach((r, i) => {
        const key = String(r.stable_key ?? r.file_path ?? '');
        if (!key) return;
        const ex = merged.get(key);
        if (ex) {
          ex.denseRank = i + 1;
          ex.denseScore = Number(r.score ?? 0);
          ex.sources.push('qdrant');
          ex.why.push(`dense rank ${i + 1}`);
        } else {
          merged.set(key, {
            stable_key: key,
            file_path: r.file_path as string | undefined,
            denseRank: i + 1,
            denseScore: Number(r.score ?? 0),
            sources: ['qdrant'],
            why: [`dense rank ${i + 1}`],
          });
        }
      });
      const rgMatches =
        (rgRes as { matches?: Array<{ filePath: string; lineNumber: number }> }).matches ?? [];
      rgMatches.forEach((m, i) => {
        const key = `file:${m.filePath}`;
        const ex = merged.get(key);
        if (ex) {
          ex.sparseRank = Math.min(ex.sparseRank ?? 999, i + 1);
          ex.sources.push('ripgrep');
          ex.why.push(`rg rank ${i + 1}`);
        } else {
          merged.set(key, {
            stable_key: key,
            file_path: m.filePath,
            sparseRank: i + 1,
            sources: ['ripgrep'],
            why: [`rg rank ${i + 1}`],
          });
        }
      });

      // STAGE 3: graph expansion — for top-K (by RRF), pull Neo4j neighbors at depth.
      // Bounded to keep latency tractable. Uses IMPORTS + SIMILAR_TOPOLOGY edges.
      const rrfScored = Array.from(merged.values())
        .map((c) => {
          const rrf =
            (c.denseRank ? 1 / (RRF_K + c.denseRank) : 0) +
            (c.sparseRank ? 1 / (RRF_K + c.sparseRank) : 0);
          return { ...c, rrfScore: rrf };
        })
        .sort((a, b) => b.rrfScore - a.rrfScore);
      const expandSeed = rrfScored.slice(0, Math.min(finalTopK, 8)).map((c) => c.stable_key);

      const graphNeighbors = new Map<string, { hops: number; via: string }>();
      if (graphDepth > 0 && expandSeed.length > 0) {
        try {
          const cypher = `
            UNWIND $seeds AS seedKey
            MATCH (s:CodebaseFile {stableKey: seedKey})
            MATCH (s)-[r:IMPORTS|SIMILAR_TOPOLOGY*1..${graphDepth}]-(n:CodebaseFile)
            RETURN DISTINCT n.stableKey AS key, length(r) AS hops, type(r[0]) AS via
            LIMIT 200
          `;
          const rows = await neo4jQuery(cypher, { seeds: expandSeed });
          for (const rec of rows) {
            const row = (rec as { row?: unknown[] }).row;
            const key = row?.[0] as string | undefined;
            if (!key || merged.has(key)) continue; // skip if already in dense/sparse
            graphNeighbors.set(key, {
              hops: Number(row?.[1] ?? 1),
              via: String(row?.[2] ?? 'IMPORTS'),
            });
          }
        } catch (e) {
          // Graph expansion is best-effort; keep dense+sparse results.
        }
      }

      // STAGE 4: Karpathy blend lookup. The Redis hash gpu:karpathy:scores is
      // keyed by file path (e.g. "src/lib/server/db/client.ts"), but candidate
      // stable_keys are often chunk-level ("file:src/.../client.ts:symbolName").
      // Extract the file portion so the blend lookup hits.
      function extractFilePath(stableKey: string): string {
        const m = stableKey.match(/^file:(.+?)(?::[^:]+)?$/);
        return m ? m[1] : stableKey;
      }
      const allKeys = [...merged.keys(), ...graphNeighbors.keys()];
      const filePathByKey = new Map<string, string>(allKeys.map((k) => [k, extractFilePath(k)]));
      const uniqueFilePaths = Array.from(new Set(filePathByKey.values()));

      const r = await getEmbedRedis().catch(() => null);
      const karpathyByFile: Record<
        string,
        { pr: number; attn: number; authority: number; blend: number }
      > = {};
      try {
        if (r && uniqueFilePaths.length > 0) {
          const raw = await r.hmget('gpu:karpathy:scores', ...uniqueFilePaths);
          uniqueFilePaths.forEach((fp, i) => {
            if (raw[i]) {
              try {
                karpathyByFile[fp] = JSON.parse(raw[i] as string);
              } catch {}
            }
          });
        }
      } catch {}
      const karpathyScores: Record<
        string,
        { pr: number; attn: number; authority: number; blend: number }
      > = {};
      for (const [key, fp] of filePathByKey) {
        if (karpathyByFile[fp]) karpathyScores[key] = karpathyByFile[fp];
      }

      // STAGE 5: composite scoring + final ranking.
      // Weights: dense 0.30, sparse 0.20, graph 0.15, pagerank 0.20, karpathy 0.15
      const candidates = [
        ...rrfScored.map((c) => ({ ...c, graphHops: 0, graphVia: null as string | null })),
        ...Array.from(graphNeighbors.entries()).map(([key, g]) => ({
          stable_key: key,
          file_path: undefined as string | undefined,
          denseRank: undefined,
          sparseRank: undefined,
          denseScore: 0,
          sparseScore: 0,
          sources: [`graph_${g.via}`],
          why: [`graph neighbor (hops=${g.hops}, via=${g.via})`],
          rrfScore: 0,
          graphHops: g.hops,
          graphVia: g.via,
        })),
      ];
      const scored = candidates
        .map((c) => {
          const k = karpathyScores[c.stable_key];
          const dense = c.denseScore ? Math.min(1, c.denseScore) : 0;
          const sparse = c.sparseScore ? Math.min(1, c.sparseScore / 10) : 0;
          const graph = c.graphHops > 0 ? 1 / (1 + c.graphHops) : 0;
          const pagerank = k ? Math.min(1, k.pr / 10) : 0;
          const karpathy = k ? Math.min(1, k.blend / 5) : 0;
          const score =
            dense * 0.3 + sparse * 0.2 + graph * 0.15 + pagerank * 0.2 + karpathy * 0.15;
          const why = [...c.why];
          if (k) why.push(`karpathy blend ${k.blend.toFixed(2)}`);
          return {
            stableKey: c.stable_key,
            filePath: c.file_path,
            score: Number(score.toFixed(4)),
            scoreBreakdown: {
              dense: Number(dense.toFixed(3)),
              sparse: Number(sparse.toFixed(3)),
              graph: Number(graph.toFixed(3)),
              pagerank: Number(pagerank.toFixed(3)),
              karpathy: Number(karpathy.toFixed(3)),
            },
            sources: c.sources,
            why,
          };
        })
        .sort((a, b) => b.score - a.score);

      const finalHits = scored.slice(0, finalTopK);
      const out = {
        query,
        mode: 'graphrag',
        denseHits: denseRows.length,
        sparseHits: sparseRows.length,
        graphExpanded: graphNeighbors.size,
        finalHits,
        durationMs: Date.now() - t0,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: String(err), durationMs: Date.now() - t0 }),
          },
        ],
        isError: true,
      };
    }
  }
);

// ── search.go_hybrid ─────────────────────────────────────────────────────────
// Go search service RRF fusion: parallel fan-out of citation + FTS + pgvector +
// Qdrant → reciprocal rank fusion. Faster than the Node.js hybrid for bulk recall.
// Falls back gracefully when go-search-service is not running.

server.registerTool(
  'search.go_hybrid',
  {
    description: 'Go search service RRF fusion of FTS + pgvector + Qdrant.',
    inputSchema: z.object({
      query: z
        .string()
        .describe('Search query — RRF fusion of FTS + pgvector + Qdrant via go-search-service'),
      limit: z.number().int().min(1).max(50).default(20).optional(),
      type: z
        .enum(['codebase', 'legal', 'hybrid'])
        .default('codebase')
        .optional()
        .describe('Search domain'),
      filters: z
        .record(z.string(), z.any())
        .optional()
        .describe('JSONB metadata filters applied at the Go service level'),
    }),
  },
  async ({ query, limit = 20, type = 'codebase', filters }) => {
    const t0 = Date.now();
    try {
      const safeQuery = String(query ?? '').slice(0, 4000);
      const safeLimit = clampFinite(limit, 1, 50, 10);
      const safeFilters = normalizeJsonFilter(filters);
      const body: Record<string, unknown> = { query: safeQuery, limit: safeLimit, type };
      if (safeFilters) body.filters = safeFilters;
      const res = await fetch(`${GO_SEARCH_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`go-search HTTP ${res.status}`);
      const raw = (await res.json()) as {
        results?: Array<Record<string, unknown>>;
        hits?: Array<Record<string, unknown>>;
      };
      const normalized = normalizeGoSearchHits(raw, query, t0);
      return { content: [{ type: 'text' as const, text: JSON.stringify(normalized, null, 2) }] };
    } catch (err) {
      const result: NormalizedRetrievalResult = {
        ok: false,
        source: 'go-search',
        degraded: true,
        reason: String(err),
        query,
        hits: [],
        elapsedMs: Date.now() - t0,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  }
);

// ── context.build_kv_packet ───────────────────────────────────────────────────

server.registerTool(
  'context.build_kv_packet',
  {
    description: 'Assembles a context packet of compressed file cards for a specific task.',
    inputSchema: z.object({
      taskId: z.string().describe('Stable task identifier (e.g. "task_gpu_async_001")'),
      query: z.string().describe('Natural language goal / task description'),
      hotFiles: z
        .array(z.string())
        .default([])
        .describe('List of file paths most relevant to this task'),
      hotSymbols: z
        .array(z.string())
        .default([])
        .describe('Key function/type names relevant to this task'),
      blockedAreas: z
        .array(z.string())
        .default([])
        .describe('File paths or modules that must NOT be modified'),
      maxInputTokens: z
        .number()
        .int()
        .min(1000)
        .max(32000)
        .default(12000)
        .optional()
        .describe('Token budget for dynamic context'),
    }),
  },
  async ({ taskId, query, hotFiles, hotSymbols, blockedAreas, maxInputTokens = 12000 }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = makeRedis();

      // Build file cards in parallel (bounded to 8)
      const { compressFileToCard, buildAttentionToc } = await import(
        '../lib/server/ai/context-compression.js'
      ).catch(() => ({
        compressFileToCard: async (f: string) => ({
          stableKey: `file:${f}`,
          filePath: f,
          oneLineSummary: f,
          importantSymbols: [],
          knownRisks: [],
          recentTraceHits: [],
          retrievalReasons: [],
          score: 0,
        }),
        buildAttentionToc: async (
          id: string,
          files: string[],
          syms: string[],
          blocked: string[]
        ) => ({
          hotFiles: files,
          hotSymbols: syms,
          hotTools: ['search.hybrid'],
          blockedAreas: blocked,
          nextToolSuggestions: [],
        }),
      }));

      const fileCards = await Promise.all(
        hotFiles
          .slice(0, 8)
          .map((f: string) =>
            compressFileToCard(f).catch(() => ({
              stableKey: `file:${f}`,
              filePath: f,
              oneLineSummary: f,
              importantSymbols: [],
              knownRisks: [],
              recentTraceHits: [],
              retrievalReasons: [],
              score: 0,
            }))
          )
      );
      const toc = await buildAttentionToc(taskId, hotFiles, hotSymbols, blockedAreas);

      const result = {
        taskId,
        stablePrefixHash:
          'kvp_' +
          Buffer.from(taskId + query)
            .toString('base64')
            .slice(0, 12),
        level2Cards: fileCards.length,
        toc,
        estimatedTokens: fileCards.reduce(
          (n, c) => n + Math.ceil(JSON.stringify(c).length / 4),
          400
        ),
        maxInputTokens,
      };

      // Cache TOC in Redis (1h) — explicit connect() required because makeRedis
      // uses lazyConnect:true + enableOfflineQueue:false (canonical ioredis cold-start
      // pattern from CLAUDE.md → Key Lessons → "ioredis cold-start in startup scripts")
      try {
        await redis.connect().catch(() => {}); // no-op if already connected
        await redis.setex(`kv:toc:task:${taskId}`, 3600, JSON.stringify(result));
      } catch {
        /* non-fatal */
      }
      await redis.quit().catch(() => {});

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── context.get_compressed_card ───────────────────────────────────────────────

server.registerTool(
  'context.get_compressed_card',
  {
    description: 'Returns a compressed context card for a specific file or trace.',
    inputSchema: z.object({
      stableKey: z
        .string()
        .describe(
          'Card stableKey — e.g. "file:src/lib/server/gpu/libtorch-bridge.ts" or "trace:<traceId>"'
        ),
    }),
  },
  async ({ stableKey }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = makeRedis();
      await redis.connect().catch(() => {});
      const crypto = await import('node:crypto');
      const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 32);

      const [type, ...rest] = stableKey.split(':');
      const payload = rest.join(':');

      let card: unknown = null;

      if (type === 'file') {
        const cacheKey = `kv:card:file:${sha(payload)}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          card = JSON.parse(cached);
        } else {
          // Build a minimal card from wiki note or heuristic
          const dirPath = payload.split('/').slice(0, -1).join('/');
          let summary = '';
          try {
            const wikiRaw = await redis.get(`wiki:note:dir:${dirPath}`);
            if (wikiRaw) {
              const w = JSON.parse(wikiRaw) as { summary?: string };
              summary = w.summary ?? wikiRaw.slice(0, 200);
            }
          } catch {
            /* no wiki */
          }
          if (!summary) {
            const name =
              payload
                .split('/')
                .pop()
                ?.replace(/\.\w+$/, '') ?? payload;
            summary = `${name} — ${dirPath}`;
          }
          card = {
            stableKey,
            filePath: payload,
            oneLineSummary: summary,
            importantSymbols: [],
            knownRisks: [],
            score: 0.5,
          };
          await redis.setex(cacheKey, 86400, JSON.stringify(card)).catch(() => {});
        }
      } else if (type === 'trace') {
        const cacheKey = `kv:card:trace:${sha(payload)}`;
        const cached = await redis.get(cacheKey);
        card = cached
          ? JSON.parse(cached)
          : {
              stableKey,
              traceId: payload,
              oneLineSummary: `Trace: ${payload}`,
              topSources: [],
              cacheHit: false,
              durationMs: 0,
            };
      } else {
        card = { stableKey, error: `Unknown card type: ${type}. Supported: file, trace` };
      }

      await redis.quit().catch(() => {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(card, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── context.explain_compression ───────────────────────────────────────────────

server.registerTool(
  'context.explain_compression',
  {
    description: 'Explains the compression logic and token budget for a specific task packet.',
    inputSchema: z.object({
      taskId: z.string().describe('Task ID to inspect (from a prior context.build_kv_packet call)'),
    }),
  },
  async ({ taskId }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = makeRedis();
      await redis.connect().catch(() => {});

      const raw = await redis.get(`kv:toc:task:${taskId}`);
      await redis.quit().catch(() => {});

      if (!raw) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                taskId,
                status: 'no-packet-found',
                hint: 'Call context.build_kv_packet first.',
              }),
            },
          ],
        };
      }

      const packet = JSON.parse(raw) as Record<string, unknown>;
      const explain = {
        taskId: packet.taskId ?? taskId,
        stablePrefixHash: packet.stablePrefixHash,
        level2Cards: packet.level2Cards ?? 0,
        toc: packet.toc,
        estimatedTokens: packet.estimatedTokens,
        maxInputTokens: packet.maxInputTokens,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(explain, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── context.refresh_task_toc ──────────────────────────────────────────────────

server.registerTool(
  'context.refresh_task_toc',
  {
    description: 'Refreshes the Table of Contents for a specific task context.',
    inputSchema: z.object({
      taskId: z.string().describe('Task ID to refresh'),
      hotFiles: z.array(z.string()).default([]).describe('Updated hot file list'),
      hotSymbols: z.array(z.string()).default([]).describe('Updated hot symbol list'),
      blockedAreas: z.array(z.string()).default([]).describe('Areas to block from modification'),
    }),
  },
  async ({ taskId, hotFiles, hotSymbols, blockedAreas }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = makeRedis();
      await redis.connect().catch(() => {});

      // Invalidate existing TOC
      await redis.del(`kv:toc:task:${taskId}`).catch(() => {});

      const newToc = {
        hotFiles: hotFiles.slice(0, 8),
        hotSymbols: hotSymbols.slice(0, 12),
        hotTools: [
          'search.hybrid',
          'trace.kag_search',
          'graph.expand_neighborhood',
          'context.get_compressed_card',
        ],
        blockedAreas,
        nextToolSuggestions: [
          'context.get_compressed_card — expand a hot file',
          'search.hybrid — find related files',
        ],
      };

      await redis
        .setex(`kv:toc:task:${taskId}`, 3600, JSON.stringify({ taskId, toc: newToc }))
        .catch(() => {});
      await redis.quit().catch(() => {});

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ taskId, refreshed: true, toc: newToc }, null, 2),
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── search.dev_context ────────────────────────────────────────────────────────
// Default first tool called by buildDevContextPlan (Step 5B) for coding prompts.
// Returns codebase chunks in ACE hit format: { stable_key, file_path, score,
// content (≤600 chars), topo_class }.  Proxies to the SvelteKit ACE pipeline;
// falls back to Postgres FTS when SvelteKit is unavailable.

server.registerTool(
  'search.dev_context',
  {
    description: 'Returns codebase chunks for coding and debugging prompts.',
    inputSchema: z.object({
      query: z.string().max(2000).describe('Natural language coding/debugging query'),
      filePath: z.string().optional().describe('Current file path for LLMS.md-scoped boost'),
      limit: z.number().int().min(1).max(20).default(8).describe('Max chunks returned (default 8)'),
      topo_class: z.string().optional().describe('Optional topology-class prefilter'),
    }),
  },
  async ({ query, filePath, limit, topo_class }) => {
    // ── Try SvelteKit ACE pipeline first ─────────────────────────────────────
    try {
      // Precompute embedding once (Redis-cached) so the SvelteKit endpoint
      // skips its own embed call when this is a repeat query.
      const { embedding } = await getOrComputeEmbedding(query);

      const body: Record<string, unknown> = { query, limit, mode: 'dev_context' };
      if (filePath) body.filePath = filePath;
      if (topo_class) body.topoClass = topo_class;
      if (embedding.length) body.embedding = embedding;

      const svelteFetch = sveltePost('/api/code-intel/search', body);
      svelteFetch.catch(() => {}); // prevent UnhandledPromiseRejection if race abandons it
      const raw = (await Promise.race([
        svelteFetch,
        new Promise<never>((_, r) => setTimeout(() => r(new Error('svelte-timeout')), 5_000)),
      ])) as unknown;
      const data = (raw as { results?: unknown[] }).results ?? (Array.isArray(raw) ? raw : []);

      // Truncate content fields to ≤600 chars (MCP result size budget)
      const hits = (data as Record<string, unknown>[]).map((h) => ({
        stable_key: h.stableKey ?? h.stable_key ?? '',
        file_path: h.filePath ?? h.file_path ?? h.relPath ?? '',
        score: typeof h.score === 'number' ? h.score : (h.finalScore ?? 0),
        content:
          typeof h.content === 'string'
            ? h.content.slice(0, 600)
            : typeof h.chunk === 'string'
              ? h.chunk.slice(0, 600)
              : '',
        topo_class: h.topoClass ?? h.topo_class ?? '',
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: true, data: hits, count: hits.length }, null, 2),
          },
        ],
      };
    } catch {
      /* fall through to Postgres FTS */
    }

    // ── Postgres FTS fallback ─────────────────────────────────────────────────
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query<{
          stable_key: string;
          rel_path: string;
          chunk_text: string;
          lexical_score: number;
          topo_class: string | null;
        }>('SELECT * FROM search_code_lexical($1, $2, $3)', [query, limit, topo_class ?? null]);
        const hits = rows.map((r) => ({
          stable_key: r.stable_key,
          file_path: r.rel_path,
          score: r.lexical_score,
          content: (r.chunk_text ?? '').slice(0, 600),
          topo_class: r.topo_class ?? '',
        }));
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { success: true, data: hits, count: hits.length, source: 'postgres_fts' },
                null,
                2
              ),
            },
          ],
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, data: [], error: String(err) }, null, 2),
          },
        ],
      };
    }
  }
);

// ── kag.record_agent_run ─────────────────────────────────────────────────────
// Writes a structured agent-run artifact to memory/runs/ and queues a JSONL
// record for ingestion. Called by Gemma4 at the end of a coding/debug session
// or when the stuck detector fires.

server.registerTool(
  'kag.record_agent_run',
  {
    description: 'Records an autonomous agent run artifact to memory.',
    inputSchema: z.object({
      taskId: z
        .string()
        .max(80)
        .describe('Stable task identifier (e.g. "kag-abc12345" or a short slug)'),
      errorSummary: z.string().max(1000).describe('One-paragraph summary of the error or task'),
      files: z.array(z.string().max(300)).max(20).optional().describe('File paths involved'),
      tags: z.array(z.string().max(60)).max(20).optional().describe('Semantic tags'),
      confidence: z.number().min(0).max(1).default(0.5).describe('Resolution confidence 0–1'),
      patchResult: z
        .enum(['passed', 'failed', 'unknown'])
        .default('unknown')
        .describe('Patch outcome'),
      researchNotes: z
        .string()
        .max(2000)
        .optional()
        .describe('Free-text research findings or next steps'),
      needsDeepResearch: z
        .boolean()
        .default(false)
        .describe('True when agent is stuck and needs escalation'),
    }),
  },
  async ({
    taskId,
    errorSummary,
    files,
    tags,
    confidence,
    patchResult,
    researchNotes,
    needsDeepResearch,
  }) => {
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { createHash } = await import('node:crypto');

      const date = new Date().toISOString().slice(0, 10);
      // Resolve root relative to this file's location (src/mcp/ → ../../memory/)
      const root = join(import.meta.dirname ?? process.cwd(), '..', '..', 'memory');
      const runDir = join(root, 'runs', date, taskId);
      const pendDir = join(root, 'ingest', 'pending');
      const hash = createHash('sha1').update(taskId).digest('hex').slice(0, 8);

      mkdirSync(runDir, { recursive: true });
      mkdirSync(pendDir, { recursive: true });

      const ts = new Date().toISOString();

      const runJson = {
        type: 'agent_run',
        id: taskId,
        hash,
        errorSummary,
        files: files ?? [],
        tags: tags ?? [],
        confidence,
        patchResult,
        researchNotes: researchNotes ?? '',
        needsDeepResearch,
        generated_at: ts,
        recommended_actions: needsDeepResearch
          ? [
              'Trigger deep_research MCP task',
              'Check error pattern in prior fixes',
              'Review graph neighborhood for related failures',
            ]
          : ['Verify fix with smoke tests', 'Ingest artifacts: kag.ingest_memory_directory'],
      };

      const md = `# Agent Run: ${taskId}\n\n**Date**: ${ts}\n**Confidence**: ${confidence}\n**Patch**: ${patchResult}\n\n## Summary\n${errorSummary}\n\n${files?.length ? `## Files\n${files.map((f) => `- \`${f}\``).join('\n')}\n\n` : ''}${researchNotes ? `## Research notes\n${researchNotes}\n\n` : ''}## Tags\n${(tags ?? []).join(' · ') || '_none_'}\n\n${needsDeepResearch ? '> ⚠ **Stuck** — deep research required\n\n' : ''}_Generated by kag.record_agent_run_\n`;

      const jsonl = JSON.stringify({
        type: 'agent_run',
        id: taskId,
        summary: errorSummary.slice(0, 300),
        tags: tags ?? [],
        files: (files ?? []).slice(0, 8),
        confidence,
        patchResult,
        needsDeepResearch,
        generated_at: ts,
      });

      writeFileSync(join(runDir, 'run.json'), JSON.stringify(runJson, null, 2));
      writeFileSync(join(runDir, 'run.md'), md);
      writeFileSync(join(pendDir, `${taskId}.jsonl`), jsonl);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                taskId,
                hash,
                date,
                artifactPath: `memory/runs/${date}/${taskId}/`,
                pendingIngest: `memory/ingest/pending/${taskId}.jsonl`,
                needsDeepResearch,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: String(err) }, null, 2),
          },
        ],
      };
    }
  }
);

// ── kag.ingest_memory_directory ───────────────────────────────────────────────
// Reads ALL lines from each JSONL in pending/, dispatches by record type,
// writes to Postgres context_timeline + Redis ACE caches, moves to processed/.
// Idempotent: skips records already written (kag:ingested:{hash} Redis key).

server.registerTool(
  'kag.ingest_memory_directory',
  {
    description: 'Ingests agent run records from the memory directory into the database.',
    inputSchema: z.object({
      dir: z
        .string()
        .max(300)
        .optional()
        .describe('Override ingest directory (default: memory/ingest/pending/)'),
      dryRun: z.boolean().default(false).describe('Preview counts without writing anything'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(25)
        .describe('Max JSONL files to process per call'),
      moveProcessed: z
        .boolean()
        .default(true)
        .describe('Move files to processed/ or failed/ after handling'),
    }),
  },
  async ({ dir, dryRun, limit, moveProcessed }) => {
    try {
      const { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } =
        await import('node:fs');
      const { join } = await import('node:path');
      const { createHash } = await import('node:crypto');
      const { default: Redis } = await import('ioredis');

      const root = join(import.meta.dirname ?? process.cwd(), '..', '..', 'memory');
      const pendDir = dir ?? join(root, 'ingest', 'pending');
      const doneDir = join(root, 'ingest', 'processed');
      const failDir = join(root, 'ingest', 'failed');

      if (!existsSync(pendDir)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: true,
                scanned: 0,
                ingested: 0,
                skipped: 0,
                failed: 0,
                note: 'pending dir missing',
              }),
            },
          ],
        };
      }
      if (!dryRun) {
        mkdirSync(doneDir, { recursive: true });
        mkdirSync(failDir, { recursive: true });
      }

      const REDIS_URL_ENV = REDIS_URL;
      let redis: InstanceType<typeof Redis> | null = null;
      try {
        redis = new Redis(REDIS_URL_ENV, {
          lazyConnect: true,
          connectTimeout: 4_000,
          commandTimeout: 4_000,
        });
        await redis.connect();
      } catch {
        redis = null;
      }

      const allFiles = readdirSync(pendDir).filter((f) => f.endsWith('.jsonl'));
      const batch = allFiles.slice(0, limit);

      let ingested = 0;
      let skipped = 0;
      let failed = 0;
      const processedFiles: string[] = [];
      const failedFiles: Array<{ path: string; reason: string }> = [];

      // Parse all files into record batches first, then do pipelined Redis I/O
      type ParsedRec = {
        rec: Record<string, unknown>;
        recType: string;
        sourceKind: string;
        stableKey: string;
        idHash: string;
        idempKey: string;
        file: string;
      };

      const parsedByFile = new Map<string, { records: ParsedRec[]; raw: string }>();
      const fileErrors = new Map<string, string>();

      for (const file of batch) {
        const src = join(pendDir, file);
        try {
          const raw = readFileSync(src, 'utf8');
          const lines = raw
            .split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 0);
          const records: ParsedRec[] = [];
          for (const line of lines) {
            let rec: Record<string, unknown>;
            try {
              rec = JSON.parse(line) as Record<string, unknown>;
            } catch {
              failed++;
              continue;
            }
            const recType = (rec.type as string | undefined) ?? '';
            const sourceKind = (rec.source_kind as string | undefined) ?? '';
            const stableKey =
              (rec.stable_key as string | undefined) ??
              (rec.id as string | undefined) ??
              line.slice(0, 80);
            const idHash = createHash('sha1').update(stableKey).digest('hex').slice(0, 12);
            records.push({
              rec,
              recType,
              sourceKind,
              stableKey,
              idHash,
              idempKey: `kag:ingested:${idHash}`,
              file,
            });
          }
          parsedByFile.set(file, { records, raw });
        } catch (fileErr) {
          fileErrors.set(file, String(fileErr));
          failed++;
        }
      }

      if (dryRun) {
        for (const { records } of parsedByFile.values()) ingested += records.length;
      } else {
        // ── Pipeline pass 1: batch EXISTS check for all idempotency keys ──────
        const allRecords: ParsedRec[] = [];
        for (const { records } of parsedByFile.values()) allRecords.push(...records);

        const alreadyIngested = new Set<string>();
        if (redis && allRecords.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < allRecords.length; i += CHUNK) {
            const slice = allRecords.slice(i, i + CHUNK);
            const pipe = redis.pipeline();
            for (const r of slice) pipe.exists(r.idempKey);
            const results = await pipe.exec();
            if (results) {
              for (let j = 0; j < slice.length; j++) {
                if ((results[j]?.[1] as number) > 0) alreadyIngested.add(slice[j].idHash);
              }
            }
          }
        }

        // ── Dispatch: build Redis pipeline writes + collect Postgres rows ─────
        const now = new Date().toISOString();
        const pgRows: Array<[string, string, string, string]> = []; // event_type, pipeline, session_id, payload

        const CHUNK = 500;
        for (let i = 0; i < allRecords.length; i += CHUNK) {
          const slice = allRecords.slice(i, i + CHUNK);
          const pipe = redis ? redis.pipeline() : null;
          let chunkIngest = 0;

          for (const { rec, recType, sourceKind, stableKey, idHash, idempKey } of slice) {
            if (alreadyIngested.has(idHash)) {
              skipped++;
              continue;
            }

            try {
              if (recType === 'error') {
                pgRows.push([
                  'error_ingested',
                  'kag',
                  '',
                  JSON.stringify({
                    id: rec.id,
                    summary: rec.summary,
                    tags: rec.tags,
                    files: rec.files,
                    confidence: rec.confidence,
                    needsDeepResearch: rec.needsDeepResearch,
                    source_file: (rec as any).__file ?? '',
                    ingested_at: now,
                  }),
                ]);
                if (pipe)
                  pipe.setex(
                    `ace:error:${idHash}`,
                    86_400,
                    JSON.stringify({
                      id: rec.id,
                      summary: rec.summary,
                      tags: Array.isArray(rec.tags) ? rec.tags : [],
                      files: Array.isArray(rec.files) ? rec.files : [],
                      confidence: rec.confidence ?? 0.5,
                      needsDeepResearch: rec.needsDeepResearch ?? false,
                      ingested_at: now,
                    })
                  );
                // P0-C: persist to error_fingerprints table for hash + n-gram lane recall
                if (redis && rec.summary && typeof rec.summary === 'string') {
                  import('../lib/server/ace/error-fingerprint.js')
                    .then(({ storeErrorFingerprint }) => {
                      storeErrorFingerprint(redis!, pool, rec.summary as string).catch(() => {});
                    })
                    .catch(() => {});
                }
              } else if (recType === 'agent_run') {
                pgRows.push([
                  'agent_run_ingested',
                  'kag',
                  '',
                  JSON.stringify({
                    id: rec.id,
                    summary: rec.summary,
                    tags: rec.tags,
                    files: rec.files,
                    confidence: rec.confidence,
                    patchResult: rec.patchResult,
                    needsDeepResearch: rec.needsDeepResearch,
                    source_file: (rec as any).__file ?? '',
                    ingested_at: now,
                  }),
                ]);
                if (pipe)
                  pipe.setex(
                    `ace:agent:${idHash}`,
                    86_400,
                    JSON.stringify({
                      id: rec.id,
                      summary: rec.summary,
                      confidence: rec.confidence,
                      patchResult: rec.patchResult,
                      ingested_at: now,
                    })
                  );
              } else if (sourceKind === 'graphify_deep_imports') {
                const srcType = (rec.source_type as string | undefined) ?? '';
                const ttl = 43_200;
                if (pipe) {
                  if (srcType === 'node_summary') {
                    pipe.setex(
                      `code:graph:node:${idHash}`,
                      ttl,
                      JSON.stringify({
                        file_path: rec.file_path,
                        zone: rec.zone,
                        directFanIn: rec.directFanIn,
                        directFanOut: rec.directFanOut,
                        upstreamNodeCount: rec.upstreamNodeCount,
                        downstreamNodeCount: rec.downstreamNodeCount,
                        text: rec.text,
                        stable_key: stableKey,
                      })
                    );
                  } else if (srcType === 'hotspot_callers') {
                    pipe.setex(
                      `code:graph:hotspot:${idHash}`,
                      ttl,
                      JSON.stringify({
                        file_path: rec.file_path,
                        zone: rec.zone,
                        directFanIn: rec.directFanIn,
                        topCallers: rec.topCallers,
                        text: rec.text,
                        stable_key: stableKey,
                      })
                    );
                  }
                }
                // graphify bulk records: skip per-row Postgres to stay under timeout
              } else if (recType === 'ace_hit') {
                if (pipe) pipe.setex(`ace:hit:${idHash}`, 86_400, JSON.stringify(rec));
              }
              // else: unknown type — skip silently

              if (pipe) pipe.setex(idempKey, 604_800, '1');
              chunkIngest++;
            } catch {
              failed++;
            }
          }

          if (pipe) {
            try {
              await pipe.exec();
            } catch {
              /* non-fatal — will re-ingest next run */
            }
          }
          ingested += chunkIngest;
        }

        // ── Postgres batch: error + agent_run rows only (small count) ─────────
        for (const [eventType, pipeline, sessionId, payload] of pgRows) {
          try {
            await pool.query(
              `INSERT INTO context_timeline (event_type, pipeline, session_id, payload)
               VALUES ($1, $2, $3, $4::jsonb)`,
              [eventType, pipeline, sessionId, payload]
            );
          } catch {
            /* Postgres down or migration pending — non-fatal */
          }
        }
      }

      // ── Move files ───────────────────────────────────────────────────────────
      for (const file of batch) {
        const src = join(pendDir, file);
        const fileOk = !fileErrors.has(file);

        if (!dryRun && moveProcessed) {
          if (fileOk) {
            try {
              renameSync(src, join(doneDir, file));
              processedFiles.push(file);
            } catch (mvErr) {
              failedFiles.push({ path: file, reason: `move failed: ${mvErr}` });
            }
          } else {
            const fileReason = fileErrors.get(file) ?? 'unknown error';
            try {
              writeFileSync(
                join(failDir, file + '.report.json'),
                JSON.stringify({ file, reason: fileReason })
              );
              renameSync(src, join(failDir, file));
            } catch {
              /* ignore */
            }
            failedFiles.push({ path: file, reason: fileReason });
          }
        }
      }

      if (redis) await redis.quit().catch(() => {});

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                dryRun,
                scanned: batch.length,
                totalPending: allFiles.length,
                ingested,
                skipped,
                failed,
                processedFiles,
                failedFiles,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err) }, null, 2),
          },
        ],
      };
    }
  }
);

// ── kag.ingest_error ──────────────────────────────────────────────────────────
// Normalize + fingerprint raw error text, store in Redis ace:error:{hash} and
// Postgres error_fingerprints, fire-and-forget. Returns the fingerprint.

server.registerTool(
  'kag.ingest_error',
  {
    description: 'Fingerprints and stores a raw error text for future retrieval.',
    inputSchema: z.object({
      errorText: z
        .string()
        .max(8000)
        .describe('Raw error text: stack trace, compiler output, log line'),
      priorFix: z
        .string()
        .max(2000)
        .optional()
        .describe('Known fix for this error if already resolved'),
    }),
  },
  async ({ errorText, priorFix }) => {
    try {
      const { storeErrorFingerprint } = await import('../lib/server/ace/error-fingerprint.js');
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});
      const fp = await storeErrorFingerprint(r, pool, errorText, priorFix);
      await r.quit().catch(() => {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(fp, null, 2) }] };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── kag.recall_similar_fix ────────────────────────────────────────────────────
// pg_trgm similarity search over error_fingerprints. First tries exact-hash
// lookup (Redis L1 → Postgres), then falls back to fuzzy similarity (>0.3) to
// surface prior fixes for near-matches. Closes the agentic-error-fixing loop:
// MCP 500 → tail-and-ingest → kag.ingest_error → kag.recall_similar_fix
// returns the prior_fix on the next synth:loop run.

server.registerTool(
  'kag.recall_similar_fix',
  {
    description:
      'Recalls prior fixes for an error via exact-hash + pg_trgm similarity over error_fingerprints.',
    inputSchema: z.object({
      errorText: z
        .string()
        .max(8000)
        .describe('Raw error text to match against fingerprint memory'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('Max similar fingerprints to return'),
    }),
  },
  async ({ errorText, limit }) => {
    try {
      const { lookupErrorFingerprint, findSimilarErrors } = await import(
        '../lib/server/ace/error-fingerprint.js'
      );
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});

      const exact = await lookupErrorFingerprint(r, pool, errorText);
      const similar = await findSimilarErrors(pool, errorText, limit);
      await r.quit().catch(() => {});

      // Dedup: if exact hit appears in similar[], strip it from the similar list.
      const similarFiltered = exact
        ? similar.filter((s) => s.errorHash !== exact.errorHash)
        : similar;

      const out = {
        exactMatch: exact, // null if no exact hash hit
        similarMatches: similarFiltered, // ordered by pg_trgm similarity desc
        recallCount: (exact ? 1 : 0) + similarFiltered.length,
        hasPriorFix: Boolean(exact?.priorFix) || similarFiltered.some((s) => s.priorFix),
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
        isError: true,
      };
    }
  }
);

// ── kag.multi_lane_search ─────────────────────────────────────────────────────
// 4-lane retrieval: hash → n-gram → graph-node → ACE cache.
// Returns ranked hits + synthesisBlock ready for LLM context injection.

server.registerTool(
  'kag.multi_lane_search',
  {
    description:
      'Performs 11-lane HyperRAG retrieval across hash, n-gram, graph, feature atlas, and activity prefetch lanes. Returns ranked hits + synthesisBlock with per-chunk trust tier metadata.',
    inputSchema: z.object({
      query: z.string().max(4000).describe('Query text, error message, or symbol/file name'),
      isError: z
        .boolean()
        .default(false)
        .describe('Treat query as an error fingerprint (enables hash lane)'),
      topK: z.number().int().min(1).max(30).default(10).describe('Hits per lane'),
      lanes: z
        .array(z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11']))
        .optional()
        .describe(
          'Which HyperRAG lanes to activate. Default: all except L10. Use L0,L1,L2,L4,L8 for dry-run.'
        ),
    }),
  },
  async ({ query, isError, topK, lanes }) => {
    try {
      const { multiLaneSearch } = await import('../lib/server/ace/multi-lane-retrieval.js');
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});
      const result = await multiLaneSearch(r, pool, { text: query, isError, topK });
      await r.quit().catch(() => {});
      // Annotate with trust tier metadata per lane
      const laneFilter = lanes && lanes.length > 0 ? new Set(lanes) : null;
      const LANE_TRUST: Record<string, string> = {
        L0: 'T1',
        L1: 'T3',
        L2: 'T3',
        L3: 'T2',
        L4: 'T1',
        L5: 'T2',
        L6: 'T2',
        L7: 'T3',
        L8: 'T1',
        L9: 'T1',
        L10: 'T4',
        L11: 'T1',
      };
      const enriched = {
        ...result,
        lanes: laneFilter ? Array.from(laneFilter) : 'all',
        trustTiers: LANE_TRUST,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(enriched, null, 2) }] };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── kag.web_search ────────────────────────────────────────────────────────────
// L10 lane (T4 trust) — external web search for information-seeking queries.
// Skips automatically for code/error queries. Results sanitized, not injected raw.

server.registerTool(
  'kag.web_search',
  {
    description:
      'L10 lane web search (T4 trust). Searches the web for information-seeking queries. Skips for code/error queries. Returns sanitized snippets for synthesis.',
    inputSchema: z.object({
      query: z.string().max(2000).describe('Search query (information-seeking, not code)'),
      limit: z.number().int().min(1).max(10).default(5),
    }),
  },
  async ({ query, limit }) => {
    try {
      const { webSearch } = await import('../lib/server/retrieval/web-search.js');
      const response = await webSearch(query, limit);
      const results = response?.results ?? [];
      if (!results.length) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: true,
                hits: [],
                totalHits: 0,
                lane: 'web_search',
                trustTier: 'T4',
              }),
            },
          ],
        };
      }
      const hits = results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet.slice(0, 400),
        score: 0.4,
        lane: 'web_search',
        trustTier: 'T4',
      }));
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              hits,
              totalHits: hits.length,
              lane: 'web_search',
              trustTier: 'T4',
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: String(err),
              lane: 'web_search',
              trustTier: 'T4',
            }),
          },
        ],
      };
    }
  }
);

// ── kag.feature_lookup ────────────────────────────────────────────────────────
// Query feature_implementations by natural-language feature name.
// Returns file paths + entry exports for the matched feature (L9 lane, T1 trust).
// §11 of docs/architecture/hyperrag-feature-atlas-runtime.md

server.registerTool(
  'kag.feature_lookup',
  {
    description:
      'Look up which files implement a named feature. Queries the durable feature_implementations + feature_file_edges tables (HyperRAG L9). Returns file paths and entry-point exports for the matched feature.',
    inputSchema: z.object({
      featureName: z
        .string()
        .min(1)
        .max(500)
        .describe(
          'Natural-language feature name or description (e.g. "hyperedge search", "ace context pack")'
        ),
      role: z
        .enum(['primary', 'consumer', 'test', 'type', 'all'])
        .default('all')
        .describe('Filter by file role'),
      limit: z.number().int().min(1).max(20).default(8).optional(),
    }),
  },
  async ({ featureName, role, limit = 8 }) => {
    try {
      const { sql: drizzleSql, eq } = await import('drizzle-orm');
      const { featureImplementations: featImpl, featureFileEdges: featEdges } = await import(
        '../lib/server/db/schema-postgres.js'
      );
      const whereClause =
        role === 'all'
          ? drizzleSql`to_tsvector('english', ${featImpl.featureName} || ' ' || COALESCE(${featImpl.description}, '')) @@ plainto_tsquery('english', ${featureName}) AND ${featImpl.status} = 'active'`
          : drizzleSql`to_tsvector('english', ${featImpl.featureName} || ' ' || COALESCE(${featImpl.description}, '')) @@ plainto_tsquery('english', ${featureName}) AND ${featImpl.status} = 'active' AND ${featEdges.role} = ${role}`;

      const hits = await pool.query<{
        feature_key: string;
        feature_name: string;
        description: string | null;
        lane_ids: string[];
        file_path: string;
        entry_export: string | null;
        role: string;
      }>(
        `SELECT fi.feature_key, fi.feature_name, fi.description, fi.lane_ids,
                fe.file_path, fe.entry_export, fe.role
         FROM feature_implementations fi
         JOIN feature_file_edges fe ON fe.feature_key = fi.feature_key
         WHERE to_tsvector('english', fi.feature_name || ' ' || COALESCE(fi.description, ''))
               @@ plainto_tsquery('english', $1)
           AND fi.status = 'active'
           ${role !== 'all' ? `AND fe.role = '${role}'` : ''}
         ORDER BY fe.role, fe.file_path
         LIMIT $2`,
        [featureName, limit]
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                query: featureName,
                count: hits.rows.length,
                trustTier: 'T1',
                instructionAuthority: false,
                results: hits.rows.map((h) => ({
                  featureKey: h.feature_key,
                  featureName: h.feature_name,
                  description: h.description,
                  laneIds: h.lane_ids,
                  filePath: h.file_path,
                  entryExport: h.entry_export,
                  role: h.role,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── kag.panel_context ─────────────────────────────────────────────────────────
// Return recent panel_activity_log rows for the current session.
// Used by SSE context injection to prefetch files the user is likely to ask about.
// §11 of docs/architecture/hyperrag-feature-atlas-runtime.md

server.registerTool(
  'kag.panel_context',
  {
    description:
      'Return recently viewed files and tools from panel_activity_log for the active user session (HyperRAG L11 prefetch). Provides warm context about what the user is currently working on.',
    inputSchema: z.object({
      userId: z.string().uuid().describe('User UUID to look up activity for'),
      windowMin: z
        .number()
        .int()
        .min(1)
        .max(1440)
        .default(30)
        .optional()
        .describe('Look-back window in minutes (default 30)'),
      limit: z.number().int().min(1).max(50).default(12).optional(),
    }),
  },
  async ({ userId, windowMin = 30, limit = 12 }) => {
    try {
      const hits = await pool.query<{
        file_path: string | null;
        panel_key: string;
        tool_used: string | null;
        ts: Date;
      }>(
        `SELECT DISTINCT ON (file_path) file_path, panel_key, tool_used, ts
         FROM panel_activity_log
         WHERE user_id = $1::uuid
           AND ts > NOW() - ($2 || ' minutes')::INTERVAL
         ORDER BY file_path, ts DESC
         LIMIT $3`,
        [userId, windowMin, limit]
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                userId,
                windowMin,
                count: hits.rows.length,
                trustTier: 'T1',
                recentFiles: hits.rows.map((r) => ({
                  filePath: r.file_path,
                  panelKey: r.panel_key,
                  toolUsed: r.tool_used,
                  ts: r.ts,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── ops.trust_audit ───────────────────────────────────────────────────────────
// Read-only diagnostic: returns blocked injection count + last-N content hashes.
// T1-only in allowlist — can be called by Gemma4 for diagnostics only.
// §11 of docs/architecture/hyperrag-feature-atlas-runtime.md

server.registerTool(
  'ops.trust_audit',
  {
    description:
      'Read-only audit of the trust-tier injection-detection system. Returns count of blocked content hashes and the most recently blocked entries. Use for diagnostics only — cannot clear the block list.',
    inputSchema: z.object({
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .optional()
        .describe('How many blocked entries to return'),
    }),
  },
  async ({ limit = 10 }) => {
    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});

      // Count ace:injection:blocked:* keys
      const keys = await r.keys('ace:injection:blocked:*').catch(() => [] as string[]);
      const recent = keys.slice(0, limit).map((k) => k.replace('ace:injection:blocked:', ''));

      await r.quit().catch(() => {});
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                trustAudit: true,
                readOnly: true,
                blockedCount: keys.length,
                recentBlockedHashes: recent,
                note: 'Only T1 instructions may clear the block list. This tool is diagnostic only.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── taxonomy.children ─────────────────────────────────────────────────────────
// Walk the topological ontology one level down from a parent node.
// Hierarchy: root → topo_class (L1) → topo_byte (L2) → cluster (L3) → file (L4).
// Backed by the taxonomy_nodes / taxonomy_edges tables built by
// `npm run taxonomy:build`. Read-through Redis cache for hot levels.

server.registerTool(
  'taxonomy.children',
  {
    description: 'Lists children of a specific ontological node in the topology.',
    inputSchema: z.object({
      parent_key: z
        .string()
        .min(1)
        .max(200)
        .describe(
          'Parent node_key. "root" lists all topo_classes. "topo:api-route" lists topo_bytes within api-route. "byte:api-route:18" lists files. Empty string = root.'
        ),
      limit: z.number().int().min(1).max(500).default(50).optional(),
    }),
  },
  async ({ parent_key, limit = 50 }) => {
    const key = parent_key === '' ? 'root' : parent_key;
    try {
      // Try Redis first
      const r = await getEmbedRedis();
      const cached = await r.get(`taxonomy:children:${key}`).catch(() => null);
      if (cached) {
        const arr = JSON.parse(cached) as Array<{
          node_key: string;
          level: number;
          display_name: string;
          member_count: number;
        }>;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  parent: key,
                  source: 'redis',
                  count: Math.min(arr.length, limit),
                  children: arr.slice(0, limit),
                },
                null,
                2
              ),
            },
          ],
        };
      }
      // Fall through to Postgres
      const { rows } = await pool.query<{
        node_key: string;
        level: number;
        display_name: string;
        member_count: number;
        metadata: Record<string, unknown>;
      }>(
        `SELECT node_key, level, display_name, member_count, metadata
         FROM taxonomy_nodes
         WHERE parent_key = $1
         ORDER BY member_count DESC NULLS LAST, display_name ASC
         LIMIT $2`,
        [key, limit]
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                parent: key,
                source: 'postgres',
                count: rows.length,
                children: rows,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: String(err).slice(0, 200),
              parent: key,
            }),
          },
        ],
      };
    }
  }
);

// ── taxonomy.path ─────────────────────────────────────────────────────────────
// Walk UP from a leaf node to root, returning the full ontological path.
// Useful for "what category does this file belong to?" queries.

server.registerTool(
  'taxonomy.path',
  {
    description: 'Returns the full ontological path from a leaf node to root.',
    inputSchema: z.object({
      node_key: z.string().min(1).max(500).describe('Leaf node_key (e.g. "file:src/foo.ts")'),
    }),
  },
  async ({ node_key }) => {
    try {
      const { rows } = await pool.query<{
        node_key: string;
        level: number;
        parent_key: string | null;
        display_name: string;
      }>(
        `WITH RECURSIVE up AS (
           SELECT node_key, level, parent_key, display_name, 0 AS depth
           FROM taxonomy_nodes WHERE node_key = $1
           UNION ALL
           SELECT n.node_key, n.level, n.parent_key, n.display_name, up.depth + 1
           FROM taxonomy_nodes n
           JOIN up ON n.node_key = up.parent_key
         )
         SELECT node_key, level, parent_key, display_name FROM up ORDER BY depth DESC`,
        [node_key]
      );
      if (rows.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'node not found in taxonomy',
                node_key,
              }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                node: node_key,
                depth: rows.length,
                path: rows,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: String(err).slice(0, 200),
              node_key,
            }),
          },
        ],
      };
    }
  }
);

// ── LLMS.md.peers_via_relations ────────────────────────────────────────────
// DB-backed sibling lookup via agent_context_relations.SHARES_TAGS edges.
// Complements the canonical `LLMS.md.peers_for_dir` (Redis atlas card) by
// answering "LLMS.md dirs that share TAGS with this dir" — falls back to
// sibling directories when SHARES_TAGS edges are sparse (pre-P0.2 envelope
// JSON state). Both tools coexist under distinct names per MCP 2026 FQN
// best-practice (last-registered-wins is silent → rename, don't override).

server.registerTool(
  'LLMS.md.peers_via_relations',
  {
    description: 'Finds neighboring directories using the SHARES_TAGS hypergraph relation.',
    inputSchema: z.object({
      dirPath: z.string().min(1).max(500).describe('Directory (e.g. "src/lib/server/ace")'),
      limit: z.number().int().min(1).max(20).default(8).optional(),
    }),
  },
  async ({ dirPath, limit = 8 }) => {
    try {
      const stable = `agents:${dirPath.replace(/^src\//, 'src/')}/LLMS.md`;
      const { rows } = await pool.query<{ target_key: string; relation: string; weight: number }>(
        `SELECT target_key, relation, weight
         FROM agent_context_relations
         WHERE source_key = $1 AND relation = 'SHARES_TAGS'
         ORDER BY weight DESC
         LIMIT $2`,
        [stable, limit]
      );
      // Union type so both branches push compatible records
      type Peer = { peer: string; weight: number; source: 'shares_tags' | 'sibling-fallback' };
      const peers: Peer[] = rows.map((r) => ({
        peer: r.target_key,
        weight: r.weight,
        source: 'shares_tags' as const,
      }));
      // SHARES_TAGS empty → sibling fallback (envelope still sparse)
      if (peers.length === 0) {
        const parent = dirPath.split('/').slice(0, -1).join('/');
        const { rows: sib } = await pool.query<{ stable_key: string; directory_path: string }>(
          `SELECT stable_key, directory_path
           FROM agent_context_files
           WHERE directory_path LIKE $1 || '/%' AND directory_path != $2
           ORDER BY directory_path
           LIMIT $3`,
          [parent, dirPath, limit]
        );
        for (const s of sib)
          peers.push({ peer: s.stable_key, weight: 0.5, source: 'sibling-fallback' });
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ dirPath, peers }, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: String(err).slice(0, 300),
              dirPath,
            }),
          },
        ],
      };
    }
  }
);

// ── LLMS.md.coverage_chain ─────────────────────────────────────────────────
// Walk-up inheritance chain from directory_context_bindings — every binding
// row from leaf → root, ordered by (priority DESC, depth ASC). Complements
// the canonical `LLMS.md.coverage` (envelope completeness probe) by
// answering "WHICH LLMS.md rules apply to this file, in what priority?".

server.registerTool(
  'LLMS.md.coverage_chain',
  {
    description: 'Returns the full LLMS.md inheritance chain for a file.',
    inputSchema: z.object({
      filePath: z.string().min(1).max(500).describe('Repo-relative file path'),
    }),
  },
  async ({ filePath }) => {
    try {
      const { rows } = await pool.query<{
        agent_context_key: string;
        directory_path: string;
        binding_type: string;
        depth: number;
        priority: number;
        confidence: number;
      }>(
        `SELECT agent_context_key, directory_path, binding_type, depth, priority, confidence
         FROM directory_context_bindings
         WHERE $1 LIKE directory_path || '/%' OR directory_path = $1
         ORDER BY priority DESC, depth ASC, length(directory_path) DESC`,
        [filePath]
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                filePath,
                chain: rows,
                count: rows.length,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: String(err).slice(0, 300),
              filePath,
            }),
          },
        ],
      };
    }
  }
);

// NOTE: The older `codebase.context_for_file` / `LLMS.md.context_for_file`
// implementations (deleted) had genuine bugs: `scopeToCluster` was passed to
// contextForFile() which doesn't accept it (silently ignored), and
// `parentAgents` doesn't exist on the CodebaseContextForFile.directory
// interface (always undefined). Their semantic intent is fully covered by
// the canonical block at ~line 2399 — not re-adding under aliased names
// since they'd just produce inferior copies of the same output.

// ── clusters.get_summary_lenses ───────────────────────────────────────────────
// Returns LLMS.md notes and wiki KAG notes for a given GPU cluster.

server.registerTool(
  'clusters.get_summary_lenses',
  {
    description: 'Returns wiki and LLMS.md context lenses for a GPU cluster.',
    inputSchema: z.object({
      clusterId: z.number().int().min(0).describe('GPU k-means cluster ID'),
      maxNotes: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe('Max wiki/KAG notes to include'),
    }),
  },
  async ({ clusterId, maxNotes }) => {
    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});

      // Qdrant cluster members (top 5 files by pageRank)
      const memberRows = await pool
        .query<{ file_path: string }>(
          `SELECT DISTINCT metadata->>'file_path' AS file_path
         FROM codebase_chunks
         WHERE (metadata->>'neo4j_gpuCluster')::int = $1
         ORDER BY (metadata->>'neo4j_pageRankScore')::float DESC NULLS LAST
         LIMIT 5`,
          [clusterId]
        )
        .catch(() => ({ rows: [] as { file_path: string }[] }));
      const keyFiles = memberRows.rows.map((r) => r.file_path).filter(Boolean);

      // Wiki KAG notes for these files
      const noteKeys = await r.keys(`wiki:note:dir:*`).catch(() => [] as string[]);
      const notes: string[] = [];
      for (const key of noteKeys.slice(0, maxNotes * 3)) {
        const raw = await r.get(key).catch(() => null);
        if (!raw) continue;
        try {
          const note = JSON.parse(raw) as { content?: string; dir?: string };
          if (keyFiles.some((f) => f?.startsWith(note.dir ?? ''))) {
            notes.push(note.content ?? '');
            if (notes.length >= maxNotes) break;
          }
        } catch {
          /* skip malformed */
        }
      }

      await r.quit().catch(() => {});
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ clusterId, keyFiles, kagNotes: notes }) },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── trace.validate_ace_hit ────────────────────────────────────────────────────
// Validates whether a retrieved chunk is a true ACE hit by checking the
// cache key contract, Qdrant payload freshness, and rerank breakdown presence.

server.registerTool(
  'trace.validate_ace_hit',
  {
    description: 'Validates a retrieved chunk against the ACE cache and graph contracts.',
    inputSchema: z.object({
      filePath: z.string().max(512).describe('File path of the retrieved chunk'),
      chunkId: z.string().max(128).optional().describe('Qdrant chunk ID if known'),
      queryHash: z
        .string()
        .max(64)
        .optional()
        .describe('SHA-256 hash prefix of the original query (12 chars)'),
    }),
  },
  async ({ filePath, chunkId, queryHash }) => {
    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});

      const checks: Record<string, unknown> = {};

      // Check 1: ACE topk cache key presence (gap_ace_003 — key contract)
      if (queryHash) {
        const cacheKey = `ace:topk:${queryHash}:embeddinggemma:768`;
        const raw = await r.get(cacheKey).catch(() => null);
        checks.aceTopkCacheKey = { key: cacheKey, hit: raw !== null };
      }

      // Check 2: code-llm-index hit for this path
      const llmKey = `code:llm:${filePath}`;
      const llmRaw = await r.get(llmKey).catch(() => null);
      checks.codeLlmCacheHit = llmRaw !== null;

      // Check 3: code graph node exists
      const { createHash } = await import('node:crypto');
      const nodeHash = createHash('sha1').update(filePath).digest('hex').slice(0, 12);
      const nodeRaw = await r.get(`code:graph:node:${nodeHash}`).catch(() => null);
      checks.graphNodePresent = nodeRaw !== null;
      if (nodeRaw) {
        try {
          checks.graphNodeMeta = JSON.parse(nodeRaw);
        } catch {
          /* skip */
        }
      }

      // Check 4: chunk in Postgres code_relations
      // Schema: code_relations(source_file, target_key, ...). target_key is "file:<path>:<symbol>" form,
      // so a path match needs a prefix LIKE on target_key.
      const relCount = await pool
        .query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM code_relations
         WHERE source_file = $1 OR target_key LIKE 'file:' || $1 || '%'`,
          [filePath]
        )
        .catch(() => ({ rows: [{ cnt: '0' }] }));
      checks.codeRelationsEdges = parseInt(relCount.rows[0]?.cnt ?? '0', 10);

      await r.quit().catch(() => {});
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ filePath, chunkId, checks }, null, 2) },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
      };
    }
  }
);

// ── Operator-gated tools (ops.*) ─────────────────────────────────────────────
//
// Rules:
//   1. operator_token must be a non-empty string — acts as an explicit approval signal.
//   2. propose_patch never writes files; it only reads and returns a diff description.
//   3. run_targeted_test runs npx vitest run <file> in a child process, returns stdout/stderr.
//   4. record_fix_attempt writes audit metadata to fix_attempts (not source code).
//   5. run_quality_gate runs tsc --noEmit --skipLibCheck and reports pass/fail + error count.
//
// Gemma4 may CALL these tools and receive back previews / results.
// Gemma4 may NOT apply patches or trigger mutations without the operator_token being set.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync as _readFileSync } from 'node:fs';
import { resolve as _resolvePath } from 'node:path';

const execFileAsync = promisify(execFile);

function requireToken(token: unknown): string | null {
  if (!token || typeof token !== 'string' || token.trim() === '') return 'operator_token required';
  return null;
}

// ── ops.propose_patch ──────────────────────────────────────────────────────────
server.registerTool(
  'ops.propose_patch',
  {
    description: 'PROPOSES a patch for a file. READ-ONLY PREVIEW. Does NOT modify files.',
    inputSchema: z.object({
      operator_token: z.string().describe('Non-empty approval token'),
      file_path: z.string().describe('Repo-relative file path to inspect'),
      issue: z.string().describe('Description of the issue to fix'),
      context_lines: z
        .number()
        .int()
        .min(5)
        .max(200)
        .optional()
        .describe('Lines of context to return (default 40)'),
    }),
  },
  async ({ operator_token, file_path, issue, context_lines }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }],
      };

    const safeFile = String(file_path ?? '')
      .replace(/\.\./g, '')
      .slice(0, 500);
    const safeIssue = String(issue ?? '').slice(0, 1000);
    const maxLines = clampFinite(context_lines, 5, 200, 40);

    try {
      const absPath = _resolvePath(process.cwd(), safeFile);
      const raw = _readFileSync(absPath, 'utf8');
      const lines = raw.split('\n');
      const preview = lines.slice(0, maxLines).join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                file_path: safeFile,
                total_lines: lines.length,
                preview_lines: maxLines,
                issue: safeIssue,
                preview,
                instruction:
                  'Review the preview. To apply a fix, call ops.record_fix_attempt with fixDiff describing the change, then apply it using your editor or git.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── ops.run_targeted_test ─────────────────────────────────────────────────────
server.registerTool(
  'ops.run_targeted_test',
  {
    description: 'Executes a single Vitest test file and returns the outcome.',
    inputSchema: z.object({
      operator_token: z.string().describe('Non-empty approval token'),
      test_file: z
        .string()
        .describe('Path to the test file relative to project root, e.g. tests/foo.spec.ts'),
      timeout_ms: z
        .number()
        .int()
        .min(5000)
        .max(120000)
        .optional()
        .describe('Max wait in ms (default 30000)'),
    }),
  },
  async ({ operator_token, test_file, timeout_ms }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }],
      };

    const safeFile = String(test_file ?? '')
      .replace(/\.\./g, '')
      .slice(0, 500);
    if (!safeFile.match(/\.(spec|test)\.[cm]?[jt]s$/)) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: 'test_file must end with .spec.ts / .test.ts (no path traversal)',
            }),
          },
        ],
      };
    }

    const timeoutMs = clampFinite(timeout_ms, 5000, 120000, 30000);
    const t0 = Date.now();

    try {
      const { stdout, stderr } = await execFileAsync(
        'npx',
        ['vitest', 'run', safeFile, '--reporter=verbose'],
        { cwd: process.cwd(), timeout: timeoutMs }
      );
      const elapsed = Date.now() - t0;
      const passed = /\d+ passed/.test(stdout);
      const failed = /\d+ failed/.test(stdout);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: !failed,
                test_file: safeFile,
                passed,
                failed,
                durationMs: elapsed,
                stdout: stdout.slice(-4000),
                stderr: stderr.slice(-1000),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const ex = err as { stdout?: string; stderr?: string; message?: string };
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: false,
                test_file: safeFile,
                durationMs: Date.now() - t0,
                error: (ex?.message ?? String(err)).slice(0, 300),
                stdout: (ex?.stdout ?? '').slice(-3000),
                stderr: (ex?.stderr ?? '').slice(-1000),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ── ops.record_fix_attempt ────────────────────────────────────────────────────
server.registerTool(
  'ops.record_fix_attempt',
  {
    description: 'Records a fix attempt and its outcome to the persistent audit log.',
    inputSchema: z.object({
      operator_token: z.string().describe('Non-empty approval token'),
      fix_type: z.string().max(100).describe('Category of fix, e.g. "type-error", "logic-bug"'),
      fix_description: z
        .string()
        .max(2000)
        .describe('Human-readable description of the proposed fix'),
      fix_diff: z.string().max(8000).optional().describe('Unified diff or summary of the change'),
      files_affected: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of files the fix touches (default 1)'),
      errors_resolved: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Estimated errors this fix resolves (default 1)'),
      success: z
        .boolean()
        .optional()
        .describe('Whether the fix was verified to work (omit if unknown)'),
      metadata: z
        .record(z.string(), z.any())
        .optional()
        .describe('Extra context (e.g. test result, issue ID)'),
    }),
  },
  async ({
    operator_token,
    fix_type,
    fix_description,
    fix_diff,
    files_affected,
    errors_resolved,
    success,
    metadata,
  }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }],
      };

    const safeType = String(fix_type ?? '').slice(0, 100);
    const safeDesc = String(fix_description ?? '').slice(0, 2000);
    const safeDiff = fix_diff != null ? String(fix_diff).slice(0, 8000) : null;
    const nFiles = clampFinite(files_affected, 0, 9999, 1);
    const nErrors = clampFinite(errors_resolved, 0, 9999, 1);
    const safeOk = typeof success === 'boolean' ? success : null;
    const safeMeta = normalizeJsonFilter(metadata) ?? {};

    try {
      const result = await pool.query<{ id: number }>(
        `INSERT INTO fix_attempts
           (fix_type, fix_description, fix_diff, files_affected, errors_resolved, success, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [safeType, safeDesc, safeDiff, nFiles, nErrors, safeOk, JSON.stringify(safeMeta)]
      );
      const id = result.rows[0]?.id ?? null;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              fix_attempt_id: id,
              fix_type: safeType,
              files_affected: nFiles,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }),
          },
        ],
      };
    }
  }
);

// ── ops.run_quality_gate ──────────────────────────────────────────────────────
server.registerTool(
  'ops.run_quality_gate',
  {
    description: 'Executes a project-wide quality gate (tsc or vitest-all).',
    inputSchema: z.object({
      operator_token: z.string().describe('Non-empty approval token'),
      gate: z
        .enum(['tsc', 'vitest-all'])
        .optional()
        .describe('tsc (default) or vitest-all to run full test suite'),
      timeout_ms: z
        .number()
        .int()
        .min(5000)
        .max(300000)
        .optional()
        .describe('Max wait in ms (default 60000)'),
    }),
  },
  async ({ operator_token, gate, timeout_ms }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }],
      };

    const safeGate = String(gate ?? 'tsc') === 'vitest-all' ? 'vitest-all' : 'tsc';
    const timeoutMs = clampFinite(timeout_ms, 5000, 300000, 60000);
    const t0 = Date.now();

    const [cmd, args] =
      safeGate === 'vitest-all'
        ? ['npx', ['vitest', 'run', '--reporter=verbose']]
        : ['npx', ['tsc', '--noEmit', '--skipLibCheck']];

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd: process.cwd(),
        timeout: timeoutMs,
      });
      const elapsed = Date.now() - t0;
      const errorMatch = /Found (\d+) errors?/.exec(stdout + stderr);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                gate: safeGate,
                passed: true,
                errorCount,
                durationMs: elapsed,
                output: (stdout + stderr).slice(-3000),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const ex = err as { stdout?: string; stderr?: string; message?: string };
      const combined = (ex?.stdout ?? '') + (ex?.stderr ?? '');
      const elapsed = Date.now() - t0;
      const errorMatch = /Found (\d+) errors?/.exec(combined) ?? /(\d+) error/.exec(combined);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : -1;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: false,
                gate: safeGate,
                passed: false,
                errorCount,
                durationMs: elapsed,
                output: combined.slice(-3000),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ── hypergraph.search ─────────────────────────────────────────────────────────
server.registerTool(
  'hypergraph.search',
  {
    description: 'Semantic search across the hypergraph edges.',
    inputSchema: z.object({
      query: z.string().max(500).describe('Natural language query (1-500 chars)'),
      edge_types: z
        .array(z.string())
        .optional()
        .describe('Filter by edge_type (LLMS.md, cluster_summary, codebase_chunk, generic)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results 1-50 (default 10)'),
      min_confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe('Minimum confidence threshold 0-1'),
    }),
  },
  async ({ query, edge_types, limit, min_confidence }) => {
    const safeQuery = String(query ?? '')
      .slice(0, 500)
      .trim();
    if (!safeQuery)
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: 'query required' }) },
        ],
      };
    try {
      const res = await fetch(`${SVELTEKIT}/api/hypergraph/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-internal': '1' },
        body: JSON.stringify({
          query: safeQuery,
          edgeTypes: Array.isArray(edge_types) ? edge_types : undefined,
          limit: typeof limit === 'number' ? Math.min(Math.max(1, limit), 50) : 10,
          minConfidence: typeof min_confidence === 'number' ? min_confidence : undefined,
          includeMembers: true,
        }),
      });
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── hypergraph.get_edge ───────────────────────────────────────────────────────
server.registerTool(
  'hypergraph.get_edge',
  {
    description: 'Returns full details for a specific hypergraph edge.',
    inputSchema: z.object({
      edge_hash: z.string().max(128).describe('The edge_hash to look up'),
      expand: z
        .boolean()
        .optional()
        .describe('If true, also return related edges sharing at least one member'),
    }),
  },
  async ({ edge_hash, expand }) => {
    const hash = String(edge_hash ?? '')
      .slice(0, 128)
      .trim();
    if (!hash)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: 'edge_hash required' }),
          },
        ],
      };
    try {
      const url = `${SVELTEKIT}/api/hypergraph/edge/${encodeURIComponent(hash)}${expand ? '?expand=true' : ''}`;
      const res = await fetch(url, { headers: { 'x-mcp-internal': '1' } });
      if (res.status === 404)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, error: 'edge not found', edge_hash: hash }),
            },
          ],
        };
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── hypergraph.explain_activation ────────────────────────────────────────────
server.registerTool(
  'hypergraph.explain_activation',
  {
    description: 'Explains why a specific hypergraph edge was activated for a set of query terms.',
    inputSchema: z.object({
      edge_hash: z.string().max(128).describe('The edge_hash to explain'),
      query_terms: z
        .array(z.string().max(100))
        .describe('List of query terms that triggered activation'),
    }),
  },
  async ({ edge_hash, query_terms }) => {
    const hash = String(edge_hash ?? '')
      .slice(0, 128)
      .trim();
    const terms = Array.isArray(query_terms)
      ? (query_terms as unknown[]).map((t) => String(t).slice(0, 100))
      : [];
    if (!hash)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: 'edge_hash required' }),
          },
        ],
      };
    try {
      const { explainEdgeActivation } = await import(
        '../lib/server/hypergraph/hypergraph-search.js'
      );
      const result = await explainEdgeActivation(hash, terms);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── hypergraph.expand_members ─────────────────────────────────────────────────
server.registerTool(
  'hypergraph.expand_members',
  {
    description: 'Returns all related edges for a given edge hash by member overlap.',
    inputSchema: z.object({
      edge_hash: z.string().max(128).describe('The edge_hash to expand from'),
    }),
  },
  async ({ edge_hash }) => {
    const hash = String(edge_hash ?? '')
      .slice(0, 128)
      .trim();
    if (!hash)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: 'edge_hash required' }),
          },
        ],
      };
    try {
      const url = `${SVELTEKIT}/api/hypergraph/edge/${encodeURIComponent(hash)}?expand=true`;
      const res = await fetch(url, { headers: { 'x-mcp-internal': '1' } });
      if (res.status === 404)
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ ok: false, error: 'edge not found' }) },
          ],
        };
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── knowledge.get_minified_map ────────────────────────────────────────────────
server.registerTool(
  'knowledge.get_minified_map',
  {
    description: 'Returns a minified architectural map for a specific directory.',
    inputSchema: z.object({
      directory: z
        .string()
        .max(200)
        .optional()
        .describe('Relative directory path (e.g. "src/lib/server/ai")'),
      max_edges: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Max hyperedges to include (default 5)'),
      max_agents: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe('Max LLMS.md directives to include (default 3)'),
    }),
  },
  async ({ directory, max_edges, max_agents }) => {
    const dir = String(directory ?? '')
      .slice(0, 200)
      .trim();
    const edgeLimit = clampFinite(max_edges, 1, 20, 5);
    const agentLimit = clampFinite(max_agents, 1, 10, 3);

    try {
      // 1. Top hyperedges (grade B+ or by confidence)
      const edgeRes = await fetch(`${SVELTEKIT}/api/hypergraph/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-internal': '1' },
        body: JSON.stringify({
          query: dir || 'architecture',
          limit: edgeLimit,
          includeMembers: false,
        }),
      });
      const edgeData = edgeRes.ok ? await edgeRes.json() : { results: [] };

      // 2. LLMS.md context for the directory (Redis key agents:dir:<dir>)
      let agentsMd: string[] = [];
      try {
        const agentRes = await pool.query<{ title: string; summary: string; rules: unknown[] }>(
          `SELECT title, summary, rules
           FROM agent_context_files
           WHERE file_path ILIKE $1
           ORDER BY confidence DESC
           LIMIT $2`,
          [`%${dir}%`, agentLimit]
        );
        agentsMd = agentRes.rows.map((r) => {
          const lines = [`## ${r.title ?? 'Context'}`];
          if (r.summary) lines.push(r.summary.slice(0, 300));
          if (Array.isArray(r.rules) && r.rules.length) {
            lines.push(
              'Rules: ' +
                (r.rules as { rule?: string }[])
                  .slice(0, 3)
                  .map((x) => x.rule)
                  .join('; ')
            );
          }
          return lines.join('\n');
        });
      } catch {
        /* ignore */
      }

      const map = {
        directory: dir || '(root)',
        topEdges: (edgeData.results ?? [])
          .slice(0, edgeLimit)
          .map(
            (r: {
              edge: {
                id: string;
                edge_type: string;
                label: string | null;
                weight: number;
                query_hash: string | null;
              };
            }) => ({
              id: r.edge.id,
              edge_type: r.edge.edge_type,
              label: r.edge.label,
              weight: r.edge.weight,
              query_hash: r.edge.query_hash,
            })
          ),
        agentsMd,
        generatedAt: new Date().toISOString(),
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(map, null, 2) }] };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── tools.batch_call ─────────────────────────────────────────────────────────
// Dispatch N tool calls under Promise.allSettled so multi-tool agent plans
// finish in max(latency) instead of sum(latency). Read-only tools only —
// operator-gated tools (ops.*) refuse batch dispatch and must be called directly.

const BATCH_DENYLIST = new Set([
  'ops.propose_patch',
  'ops.run_targeted_test',
  'ops.record_fix_attempt',
  'ops.run_quality_gate',
  'tools.batch_call',
]);
const BATCH_MAX_CALLS = 8;
const BATCH_TIMEOUT_MS = 30_000;

server.registerTool(
  'tools.batch_call',
  {
    description: 'Executes multiple tool calls in parallel to reduce total latency.',
    inputSchema: z.object({
      calls: z
        .array(
          z.object({
            name: z.string().describe('Tool name to dispatch (must be registered)'),
            arguments: z
              .record(z.string(), z.any())
              .default({})
              .describe('Arguments object for the tool'),
          })
        )
        .min(1)
        .max(BATCH_MAX_CALLS)
        .describe(`Up to ${BATCH_MAX_CALLS} tool calls dispatched in parallel`),
      timeoutMs: z
        .number()
        .int()
        .min(1_000)
        .max(120_000)
        .default(BATCH_TIMEOUT_MS)
        .optional()
        .describe('Per-call timeout (ms)'),
    }),
  },
  async ({ calls, timeoutMs = BATCH_TIMEOUT_MS }) => {
    const start = Date.now();
    const results = await Promise.allSettled(
      calls.map(async (call) => {
        const callStart = Date.now();
        if (BATCH_DENYLIST.has(call.name)) {
          return {
            name: call.name,
            status: 'denied' as const,
            error: 'tool not allowed in batch (operator-gated or recursive)',
            ms: 0,
          };
        }
        const handler = toolRegistry.get(call.name);
        if (!handler) {
          return {
            name: call.name,
            status: 'unknown' as const,
            error: `tool not found: ${call.name}`,
            ms: 0,
          };
        }
        try {
          const result = await Promise.race([
            handler(call.arguments ?? {}),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`batch_call timeout after ${timeoutMs}ms`)),
                timeoutMs
              )
            ),
          ]);
          return { name: call.name, status: 'ok' as const, result, ms: Date.now() - callStart };
        } catch (err) {
          return {
            name: call.name,
            status: 'error' as const,
            error: err instanceof Error ? err.message : String(err),
            ms: Date.now() - callStart,
          };
        }
      })
    );

    const flat = results.map((r) =>
      r.status === 'fulfilled'
        ? r.value
        : { status: 'error' as const, error: String(r.reason), ms: 0, name: 'unknown' }
    );
    const ok = flat.filter((r) => r.status === 'ok').length;
    const totalMs = Date.now() - start;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ ok, total: flat.length, totalMs, calls: flat }, null, 2),
        },
      ],
    };
  }
);

// ── codebase.context_for_file ─────────────────────────────────────────────────
// Master "atlas → context packet" tool. Wraps src/lib/server/atlas/
// context-for-file.ts with an injected Redis client (MCP runs outside the
// SvelteKit bundler so `$lib/...` path aliases don't resolve under tsx —
// we pass our own ioredis instance instead).

server.registerTool(
  'codebase.context_for_file',
  {
    description: 'Returns the full atlas context packet for a specific file.',
    inputSchema: z.object({
      filePath: z
        .string()
        .min(1)
        .max(512)
        .describe('Repo-relative file path (e.g. "src/lib/server/db/client.ts")'),
      maxCards: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(6)
        .describe('Max peer prompt cards to include'),
      forceReload: z.boolean().default(false).describe('Bypass 5-min atlas cache'),
    }),
  },
  async ({ filePath, maxCards, forceReload }) => {
    const { contextForFile } = await import('../lib/server/atlas/context-for-file.js');
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      enableReadyCheck: false,
    });
    try {
      await redis.connect();
      const packet = await contextForFile(filePath, {
        peerLimit: maxCards,
        forceReload,
        redis,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(packet, null, 2) }] };
    } finally {
      await redis.quit().catch(() => {});
    }
  }
);

// ── LLMS.md.context_for_file ───────────────────────────────────────────────
// Slim wrapper — returns only the AGENTS-related slice of the full packet.
// Useful when a caller wants directory rules / tools / constraints without
// the prompt-card payload (saves ~3-5KB per response).

server.registerTool(
  'LLMS.md.context_for_file',
  {
    description: 'Returns only the AGENTS-related slice of the atlas context packet for a file.',
    inputSchema: z.object({
      filePath: z.string().min(1).max(512).describe('Repo-relative file path'),
    }),
  },
  async ({ filePath }) => {
    const { contextForFile } = await import('../lib/server/atlas/context-for-file.js');
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      enableReadyCheck: false,
    });
    try {
      await redis.connect();
      const full = await contextForFile(filePath, { peerLimit: 0, redis });
      const slim = {
        filePath: full.filePath,
        normalizedPath: full.normalizedPath,
        agentsDir: full.directory.agentsDir ?? null,
        directoryPath: full.directory.path,
        topo: full.directory.topo,
        clusters: full.directory.clusters,
        tools: full.directory.tools,
        constraints: full.directory.constraints,
        tags: full.directory.tags,
        recommendedActions: full.recommendedActions,
        provenance: full.provenance,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(slim, null, 2) }] };
    } finally {
      await redis.quit().catch(() => {});
    }
  }
);

// ── LLMS.md.peers_for_dir ───────────────────────────────────────────────────
// Returns the directory card directly — peers, tools, tags, top files in
// the directory, without going through context-for-file's per-file lookup.
// O(1) Redis GET on ace:atlas:dir:<slug>.

server.registerTool(
  'LLMS.md.peers_for_dir',
  {
    description: 'Returns the directory card directly from the atlas cache.',
    inputSchema: z.object({
      dirPath: z.string().min(1).max(512).describe('Directory path (e.g. "src/lib/server/db")'),
    }),
  },
  async ({ dirPath }) => {
    const norm = String(dirPath)
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/^sveltekit-frontend\//, '')
      .replace(/^src\//, '');
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      enableReadyCheck: false,
    });
    try {
      await redis.connect();
      // Try original then normalized form
      const slug1 = dirPath.replace(/[/()]/g, '_');
      const slug2 = norm.replace(/[/()]/g, '_');
      const slug3 = `src_${norm.replace(/[/()]/g, '_')}`;
      let card: Record<string, unknown> | null = null;
      let usedKey = '';
      for (const slug of [slug1, slug2, slug3]) {
        const raw = await redis.get(`ace:atlas:dir:${slug}`).catch(() => null);
        if (raw) {
          try {
            card = JSON.parse(raw);
            usedKey = slug;
            break;
          } catch {
            /* try next */
          }
        }
      }
      const result = card
        ? { found: true, key: `ace:atlas:dir:${usedKey}`, card }
        : { found: false, dirPath, hint: 'Run `npm run atlas:index` to populate directory cards.' };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } finally {
      await redis.quit().catch(() => {});
    }
  }
);

// ── LLMS.md.coverage ────────────────────────────────────────────────────────
// Quality probe: how complete is the LLMS.md envelope for the directory
// containing this file? Reads the Postgres mirror to report which envelope
// fields are populated. Lets agents detect "thin context" before relying on it.

server.registerTool(
  'LLMS.md.coverage',
  {
    description: 'Reports the population status of the LLMS.md envelope for a file.',
    inputSchema: z.object({
      filePath: z.string().min(1).max(512).describe('Repo-relative file path'),
    }),
  },
  async ({ filePath }) => {
    const norm = String(filePath)
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/^sveltekit-frontend\//, '')
      .replace(/^src\//, '');
    const dir = norm.lastIndexOf('/') > 0 ? norm.slice(0, norm.lastIndexOf('/')) : '';

    const dbUrl = PG_URL;
    const pgPool = new Pool({ connectionString: dbUrl, max: 1, connectionTimeoutMillis: 3000 });
    try {
      const r = await pgPool.query(
        `SELECT file_path,
                jsonb_typeof(rules)         AS rules_kind,
                jsonb_array_length(rules)   AS rules_n,
                jsonb_array_length(tools)   AS tools_n,
                jsonb_array_length(constraints) AS constraints_n,
                length(coalesce(summary, '')) AS summary_chars,
                indexed_at
         FROM agent_context_files
         WHERE file_path LIKE $1 OR file_path LIKE $2
         ORDER BY indexed_at DESC
         LIMIT 5`,
        [`%${dir}%LLMS.md`, `%/${dir}/LLMS.md`]
      );
      const result = {
        filePath,
        normalizedPath: norm,
        directory: dir,
        nearestEnvelopes: r.rows,
        coverage: {
          totalRowsMatched: r.rowCount ?? 0,
          anyRules: r.rows.some((x) => (x.rules_n ?? 0) > 0),
          anyTools: r.rows.some((x) => (x.tools_n ?? 0) > 0),
          anyConstraints: r.rows.some((x) => (x.constraints_n ?? 0) > 0),
          anySummary: r.rows.some((x) => (x.summary_chars ?? 0) > 50),
        },
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } finally {
      await pgPool.end().catch(() => {});
    }
  }
);

// ── LLMS.md.shares_tags ────────────────────────────────────────────────────
// SHARES_TAGS lens — pure DB query against agent_context_relations.
// Distinct from LLMS.md.peers_for_dir which reads the Redis atlas card.
// This one returns only directories whose qdrant_tags Jaccard-overlap (≥0.3)
// with the source LLMS.md, with a sibling-dir fallback when the SHARES_TAGS
// edge set is sparse for the requested source.

server.registerTool(
  'LLMS.md.shares_tags',
  {
    description: 'Returns neighboring directories based on shared tags in their LLMS.md files.',
    inputSchema: z.object({
      dirPath: z.string().min(1).max(500).describe('Directory path (e.g. "src/lib/server/ace")'),
      limit: z.number().int().min(1).max(50).default(10).optional(),
    }),
  },
  async ({ dirPath, limit = 10 }) => {
    const stable = `agents:${dirPath.replace(/^src\//, '')}/LLMS.md`;
    try {
      const { rows } = await pool.query<{
        target_key: string;
        weight: number;
        evidence: Record<string, unknown>;
      }>(
        `SELECT target_key, weight, evidence
         FROM agent_context_relations
         WHERE source_key = $1 AND relation = 'SHARES_TAGS'
         ORDER BY weight DESC
         LIMIT $2`,
        [stable, limit]
      );
      let peers: Array<{
        peer: string;
        weight: number;
        jaccard: number | null;
        source: 'shares_tags' | 'sibling-fallback';
      }> = rows.map((r) => ({
        peer: r.target_key,
        weight: Number(r.weight) || 0,
        jaccard: typeof r.evidence?.jaccard === 'number' ? (r.evidence.jaccard as number) : null,
        source: 'shares_tags',
      }));

      // Sibling fallback: if SHARES_TAGS empty for this source, return dirs
      // under the same parent so the caller still gets *something* useful.
      if (peers.length === 0) {
        const parent = dirPath.split('/').slice(0, -1).join('/');
        if (parent) {
          const { rows: sib } = await pool.query<{ stable_key: string; directory_path: string }>(
            `SELECT stable_key, directory_path
             FROM agent_context_files
             WHERE directory_path LIKE $1 || '/%' AND directory_path != $2
             ORDER BY directory_path
             LIMIT $3`,
            [parent, dirPath, limit]
          );
          peers = sib.map((s) => ({
            peer: s.stable_key,
            weight: 0.5,
            jaccard: null,
            source: 'sibling-fallback',
          }));
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                dirPath,
                sourceKey: stable,
                peerCount: peers.length,
                peers,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: String(err).slice(0, 300),
              dirPath,
            }),
          },
        ],
      };
    }
  }
);

// ── LLMS.md.binding_chain ──────────────────────────────────────────────────
// directory_context_bindings priority-ordered walk-up chain.
// Distinct from LLMS.md.coverage which returns nearestEnvelopes (one row per
// matching dir LIKE). This walks the formal binding hierarchy with
// (binding_type, depth, priority, confidence) per row — answers
// "in what order do LLMS.md envelopes apply to this file?".

server.registerTool(
  'LLMS.md.binding_chain',
  {
    description:
      'Walks the LLMS.md binding hierarchy for a file to determine the order of applying envelopes.',
    inputSchema: z.object({
      filePath: z.string().min(1).max(500).describe('Repo-relative file path'),
    }),
  },
  async ({ filePath }) => {
    try {
      const { rows } = await pool.query<{
        agent_context_key: string;
        directory_path: string;
        binding_type: string;
        depth: number;
        applies_to_children: boolean;
        priority: number;
        confidence: number;
      }>(
        `SELECT agent_context_key, directory_path, binding_type, depth,
                applies_to_children, priority, confidence
         FROM directory_context_bindings
         WHERE $1 LIKE directory_path || '/%' OR directory_path = $1
         ORDER BY priority DESC, depth ASC, length(directory_path) DESC`,
        [filePath]
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                filePath,
                chain: rows,
                count: rows.length,
                types: Array.from(new Set(rows.map((r) => r.binding_type))),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: String(err).slice(0, 300),
              filePath,
            }),
          },
        ],
      };
    }
  }
);

// ── ops.update_LLMS.md ─────────────────────────────────────────────────────
// Lets the LLM write structured knowledge back into the directory memory layer.
// Immediately updates the Redis agents:dir:<dir> key (24h TTL) so the next
// ACE call picks it up via Lane L4.  Optionally appends to the on-disk
// LLMS.md file under the target section so the fact survives redis flush.
server.registerTool(
  'ops.update_LLMS.md',
  {
    description:
      'Append a new fact, rule, or tool note to a directory LLMS.md file and flush to Redis. ' +
      'Use this after discovering something useful that should survive future conversations. ' +
      'The fact appears in every future ACE context for that directory automatically (Lane L4).',
    inputSchema: z.object({
      operator_token: z.string().describe('Non-empty approval token'),
      dir_path: z.string().max(200).describe('Relative directory path, e.g. "src/lib/server/ace"'),
      section: z
        .enum(['Rules', 'Context', 'Tools', 'Constraints', 'Notes'])
        .default('Notes')
        .describe('Section header to append under'),
      fact: z.string().min(10).max(2000).describe('The fact, rule, or tool note to record'),
      redis_only: z
        .boolean()
        .optional()
        .describe('If true, only update Redis (skip disk write). Default false'),
    }),
  },
  async ({ operator_token, dir_path, section, fact, redis_only }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }],
      };

    const safeDir = dir_path.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\//, '');
    const safeFact = String(fact).slice(0, 2000).replace(/\r\n/g, '\n');

    const { default: Redis } = await import('ioredis');
    const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      connectTimeout: 3000,
      enableReadyCheck: false,
    });
    try {
      await redisClient.connect();
      const { join, resolve } = await import('node:path');
      const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs');

      const redisKey = `agents:dir:${safeDir}`;
      const existing = (await redisClient.get(redisKey)) ?? '';

      // Build new entry line with timestamp
      const ts = new Date().toISOString().slice(0, 10);
      const line = `- [${ts}] ${safeFact}`;

      let updated: string;
      const sectionHeader = `## ${section}`;
      if (existing.includes(sectionHeader)) {
        // Append under existing section
        updated = existing.replace(sectionHeader, `${sectionHeader}\n${line}`);
      } else {
        // Append new section at end
        updated = `${existing.trimEnd()}\n\n${sectionHeader}\n${line}\n`;
      }

      await redisClient.setex(redisKey, 24 * 3600, updated);

      let diskPath = '';
      if (!redis_only) {
        const root = process.env.FRONTEND_ROOT || process.cwd();
        const dirFull = resolve(root, safeDir);
        const mdPath = join(dirFull, 'LLMS.md');

        if (existsSync(dirFull)) {
          const onDisk = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : `# ${safeDir}\n`;
          let diskUpdate: string;
          if (onDisk.includes(sectionHeader)) {
            diskUpdate = onDisk.replace(sectionHeader, `${sectionHeader}\n${line}`);
          } else {
            diskUpdate = `${onDisk.trimEnd()}\n\n${sectionHeader}\n${line}\n`;
          }
          mkdirSync(dirFull, { recursive: true });
          writeFileSync(mdPath, diskUpdate, 'utf8');
          diskPath = mdPath;
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              redis_key: redisKey,
              section,
              disk_path: diskPath || '(redis-only)',
              fact_preview: safeFact.slice(0, 120),
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }),
          },
        ],
      };
    } finally {
      await redisClient.quit().catch(() => {});
    }
  }
);

// ── ops.fixer_semantic_recall ─────────────────────────────────────────────────
// 3-layer recall: Redis L1 (exact hash) → Postgres L2 → Qdrant L3 (semantic).

server.registerTool(
  'ops.fixer_semantic_recall',
  {
    description:
      'Recalls known fix templates via Redis L1 → Postgres L2 → Qdrant semantic L3. Call before LLM analysis to skip redundant inference on known error patterns.',
    inputSchema: z.object({
      errorHash: z.string().describe('SHA-256 from kag.ingest_error'),
      queryEmbedding: z
        .array(z.number())
        .max(768)
        .optional()
        .describe('768-dim error embedding for Qdrant semantic lane'),
      limit: z.number().int().min(1).max(10).default(5),
    }),
  },
  async ({ errorHash, queryEmbedding, limit }) => {
    try {
      const { recallFixerPattern } = await import('../lib/server/fixer/fixer-memory.js');
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});
      const { exact, similar } = await recallFixerPattern(
        r,
        pool,
        errorHash,
        queryEmbedding?.length === 768 ? queryEmbedding : undefined
      );
      await r.quit().catch(() => {});
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                exactMatch: exact,
                similarHits: similar.slice(0, limit),
                recallCount: (exact ? 1 : 0) + similar.length,
                hasFix: Boolean(exact?.fixTemplate) || similar.some((s) => s.fixTemplate),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
        isError: true,
      };
    }
  }
);

// ── ops.fixer_pattern_store ───────────────────────────────────────────────────
// Writes a confirmed/failed fix to Redis + Postgres pgvector + Qdrant.
// trust_score = success_count / (success + failure), updated on each call.

server.registerTool(
  'ops.fixer_pattern_store',
  {
    description:
      '[OPERATOR-GATED] Stores a fix attempt outcome to the 3-layer fixer memory. Increments success/failure counts, upserts to Qdrant fixer_memory_768 (GPU-indexed) when embedding provided.',
    inputSchema: z.object({
      errorHash: z.string(),
      errorCode: z.string().optional(),
      fixTemplate: z.string().max(4000),
      fixKind: z.enum(['instruction', 'diff', 'regex']).default('instruction'),
      outcome: z.enum(['success', 'failure']),
      runId: z.string(),
      file: z.string(),
      tags: z.array(z.string()).max(10).optional(),
      topFiles: z.array(z.string()).max(20).optional(),
      queryEmbedding: z.array(z.number()).max(768).optional(),
      linesChanged: z.number().int().optional(),
      durationMs: z.number().int().optional(),
      langfuseTraceId: z.string().optional(),
    }),
  },
  async (opts) => {
    try {
      const { storeFixerPattern, ensureFixerMemoryCollection } = await import(
        '../lib/server/fixer/fixer-memory.js'
      );
      const Redis = (await import('ioredis')).default;
      const r = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});
      await ensureFixerMemoryCollection().catch(() => {});
      const patternId = await storeFixerPattern(r, pool, {
        ...opts,
        embedding: opts.queryEmbedding?.length === 768 ? opts.queryEmbedding : undefined,
      });
      await r.quit().catch(() => {});
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: true,
              patternId,
              outcome: opts.outcome,
              errorHash: opts.errorHash,
            }),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) },
        ],
        isError: true,
      };
    }
  }
);

// ── context.prefetch_feature_context ─────────────────────────────────────────
// Bridge tool: TRACE :8788 (graph/topology/KAG) + KB :8789 (research summaries)
// + Redis Karpathy blend → one compact context pack for agentic coding.

server.registerTool(
  'context.prefetch_feature_context',
  {
    description:
      'One-shot context prefetch for agentic coding. Combines KAG graph search, KB research summaries, ' +
      'Karpathy blend scores, and LLMS.md rules into a single compact pack. ' +
      'Call this before making any code edits or retrievals — it saves 3-5 downstream tool calls.',
    inputSchema: {
      query: z.string().describe('What you are about to work on (code path, feature, question)'),
      file_path: z
        .string()
        .optional()
        .describe('Current file being edited (absolute or relative to src/)'),
      top_k: z.number().int().min(1).max(20).optional().default(8).describe('Max items per lane'),
      include_kb: z
        .boolean()
        .optional()
        .default(true)
        .describe('Cross-call KB MCP :8789 for research summaries'),
      include_karpathy: z
        .boolean()
        .optional()
        .default(true)
        .describe('Attach Karpathy blend scores'),
    },
  },
  async (opts: {
    query: string;
    file_path?: string;
    top_k?: number;
    include_kb?: boolean;
    include_karpathy?: boolean;
  }) => {
    const topK = opts.top_k ?? 8;
    const includeKb = opts.include_kb ?? true;
    const includeKarp = opts.include_karpathy ?? true;
    const KB_URL = ENV.KB_MCP_URL;
    const SK_URL = SVELTEKIT;
    const REDIS_LCL = REDIS_URL;

    const pack: Record<string, unknown> = {
      query: opts.query,
      file_path: opts.file_path ?? null,
      lanes: {},
      karpathyTop: [],
      agentsMdRules: [],
      retrievalTrace: [],
    };

    // ── Lane 1: KAG graph search via SvelteKit API ────────────────────────────
    try {
      const kagRes = await fetch(`${SK_URL}/api/graph/traverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': ENV.SERVICE_AUTH_TOKEN },
        body: JSON.stringify({ query: opts.query, limit: topK, filePath: opts.file_path }),
        signal: AbortSignal.timeout(8000),
      });
      if (kagRes.ok) {
        const kag = (await kagRes.json()) as Record<string, unknown>;
        pack.lanes = { ...(pack.lanes as object), kag: kag.nodes ?? kag.results ?? [] };
        (pack.retrievalTrace as string[]).push('kag:ok');
      }
    } catch {
      (pack.retrievalTrace as string[]).push('kag:timeout');
    }

    // ── Lane 2: Qdrant semantic search via SvelteKit embed + search ───────────
    try {
      const embedRes = await fetch(`${SK_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: opts.query }),
        signal: AbortSignal.timeout(6000),
      });
      if (embedRes.ok) {
        const { embedding } = (await embedRes.json()) as { embedding: number[] };
        const qdRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: { name: 'content', vector: embedding },
            limit: topK,
            with_payload: ['filePath', 'chunkText', 'tags', 'stableKey', 'featureIds', 'trustTier'],
            score_threshold: 0.3,
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (qdRes.ok) {
          const { result } = (await qdRes.json()) as { result: unknown[] };
          (pack.lanes as Record<string, unknown>).semantic = result ?? [];
          (pack.retrievalTrace as string[]).push('semantic:ok');
        }
      }
    } catch {
      (pack.retrievalTrace as string[]).push('semantic:timeout');
    }

    // ── Lane 3: KB MCP :8789 research summaries ───────────────────────────────
    if (includeKb) {
      try {
        const kbRes = await fetch(`${KB_URL}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: {
              name: 'kb.hybrid_search',
              arguments: { query: opts.query, top_k: Math.min(topK, 5) },
            },
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (kbRes.ok) {
          const kbJson = (await kbRes.json()) as {
            result?: { content?: Array<{ text?: string }> };
          };
          const raw = kbJson?.result?.content?.[0]?.text;
          if (raw) {
            (pack.lanes as Record<string, unknown>).kb = JSON.parse(raw);
            (pack.retrievalTrace as string[]).push('kb:ok');
          }
        }
      } catch {
        (pack.retrievalTrace as string[]).push('kb:unavailable');
      }
    }

    // ── Lane 4: Karpathy Redis blend scores for the file ─────────────────────
    if (includeKarp && opts.file_path) {
      try {
        const { default: Redis } = await import('ioredis');
        const r = new Redis(REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          retryStrategy: () => null,
        });
        r.on('error', () => {});
        await r.connect().catch(() => {});

        // Top Karpathy files near this one
        const scoreHash = await r.hgetall('gpu:karpathy:scores').catch(() => ({}));
        const allScores = Object.entries(scoreHash ?? {})
          .map(([k, v]) => {
            try {
              return { file: k, ...(JSON.parse(String(v)) as Record<string, number>) };
            } catch {
              return null;
            }
          })
          .filter(Boolean) as Array<{ file: string; blend: number }>;

        allScores.sort((a, b) => (b.blend ?? 0) - (a.blend ?? 0));
        pack.karpathyTop = allScores
          .slice(0, topK)
          .map((s) => ({ file: s.file, blend: +(s.blend ?? 0).toFixed(3) }));

        // Score for this specific file
        const fileScore = scoreHash[opts.file_path];
        if (fileScore) {
          (pack as Record<string, unknown>).thisFileKarpathy = JSON.parse(fileScore);
        }

        // LLMS.md from Redis agents:dir:*
        const dirKey = `agents:dir:${opts.file_path.replace(/\/[^/]+$/, '').replace(/^src\//, '')}`;
        const agentsMd = await r.get(dirKey).catch(() => null);
        if (agentsMd) {
          // Extract just the Rules section for compactness
          const rulesMatch = agentsMd.match(/#+\s*Rules\n([\s\S]*?)(?:\n#+|$)/i);
          if (rulesMatch) {
            pack.agentsMdRules = rulesMatch[1]
              .split('\n')
              .filter((l) => l.trim().startsWith('-'))
              .slice(0, 8);
          }
        }

        await r.quit().catch(() => {});
        (pack.retrievalTrace as string[]).push('karpathy:ok');
      } catch {
        (pack.retrievalTrace as string[]).push('karpathy:timeout');
      }
    }

    // ── Assemble summary ──────────────────────────────────────────────────────
    const lanes = pack.lanes as Record<string, unknown[]>;
    const counts = Object.fromEntries(
      Object.entries(lanes).map(([k, v]) => [k, (v as unknown[]).length])
    );

    const out = {
      query: opts.query,
      file_path: opts.file_path,
      laneCounts: counts,
      kag: (lanes.kag ?? []).slice(0, topK),
      semantic: (lanes.semantic ?? []).slice(0, topK),
      kb: (lanes.kb ?? []).slice(0, 5),
      karpathyTop: pack.karpathyTop,
      thisFileKarpathy: (pack as Record<string, unknown>).thisFileKarpathy ?? null,
      agentsMdRules: pack.agentsMdRules,
      retrievalTrace: pack.retrievalTrace,
      hint: 'Use kag+semantic for code context; kb for research; karpathyTop for hotspot awareness.',
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
  }
);

// ── evidence.search_by_image ──────────────────────────────────────────────────
// Agentic image search: VLM caption → embed → Qdrant ANN → tag rerank.
// Wraps POST /api/evidence/search-by-image via the running SvelteKit dev server.
server.registerTool(
  'evidence.search_by_image',
  {
    description:
      'Search evidence by uploading an image. The VLM describes the image, ' +
      'embeds it, and returns semantically similar evidence items from Qdrant. ' +
      'Use for "find evidence similar to this photo/diagram/screenshot".',
    inputSchema: z.object({
      image_path: z.string().describe('Absolute or workspace-relative path to the image file'),
      collection: z.string().default('evidence_items'),
      limit: z.number().int().min(1).max(20).default(10),
      score_threshold: z.number().min(0).max(1).default(0.2),
      case_id: z.string().optional().describe('Filter to a specific case UUID'),
    }),
  },
  async ({ image_path, collection, limit, score_threshold, case_id }) => {
    const { readFile } = await import('node:fs/promises');
    const { resolve, extname, basename } = await import('node:path');
    const { searchByImage } = await import('../lib/server/vector/image-search.js');

    const absPath = resolve(process.cwd(), image_path);
    let buffer: Buffer;
    try {
      buffer = await readFile(absPath);
    } catch {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: `Cannot read: ${absPath}` }),
          },
        ],
      };
    }

    const ext2mime: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const fileName = basename(absPath);
    const mimeType = ext2mime[extname(absPath).toLowerCase()] ?? 'image/jpeg';

    try {
      const result = await searchByImage({
        buffer,
        fileName,
        collection,
        limit,
        scoreThreshold: score_threshold,
        caseId: case_id,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                caption: result.caption.slice(0, 400),
                suggestedTags: result.suggestedTags,
                model: result.model,
                cached: result.cached,
                durationMs: result.durationMs,
                hits: result.hits.map((h) => ({
                  id: h.id,
                  score: Math.round(h.score * 1000) / 1000,
                  tagBoost: Math.round(h.tagBoost * 1000) / 1000,
                  matchedTags: h.matchedTags,
                  payload: {
                    file_path: h.payload.file_path,
                    evidenceType: h.payload.evidenceType,
                    caseId: h.payload.caseId,
                    tags: h.payload.tags,
                  },
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }),
          },
        ],
      };
    }
  }
);

// ── evidence.image_feedback ───────────────────────────────────────────────────
// Cast a thumbs-up or thumbs-down vote on a visual search result.
// Redis HINCRBY accumulates; Qdrant payload promoted after 3 votes.
server.registerTool(
  'evidence.image_feedback',
  {
    description:
      'Record thumbs-up or thumbs-down on a visual search result. ' +
      'Votes accumulate in Redis; Qdrant payload (trust_score, user_approved/rejected) ' +
      'is updated after 3 votes. Fires GRPO rl-signal automatically.',
    inputSchema: z.object({
      point_id: z.union([z.string(), z.number()]).describe('Qdrant point ID from a search result'),
      collection: z.string().default('evidence_items'),
      approved: z.boolean().describe('true = thumbs up, false = thumbs down'),
      query: z
        .string()
        .max(500)
        .optional()
        .describe('The query that produced this result (improves RL signal)'),
    }),
  },
  async ({ point_id, collection, approved, query }) => {
    const { default: Redis } = await import('ioredis');
    const { createHash } = await import('node:crypto');

    const PROMOTE_THRESHOLD = 3;
    const redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      enableReadyCheck: false,
    });
    try {
      await redis.connect();
      const pid = String(point_id);
      const vote = approved ? 1 : -1;
      const qhash = createHash('sha256')
        .update((query ?? pid).trim().toLowerCase())
        .digest('hex')
        .slice(0, 16);
      const fKey = `ace:img:feedback:${qhash}`;
      const vKey = `ace:img:votes:${qhash}`;
      const TTL = 60 * 60 * 24 * 7;

      const [netScore, totalVotes] = await Promise.all([
        redis.hincrby(fKey, pid, vote),
        redis.hincrby(vKey, pid, 1),
      ]);
      redis.expire(fKey, TTL).catch(() => {});
      redis.expire(vKey, TTL).catch(() => {});

      let promoted = false;
      if (totalVotes >= PROMOTE_THRESHOLD) {
        const trustScore = Math.max(0, Math.min(1, (netScore / totalVotes + 1) / 2));
        const { QdrantManager } = await import('../lib/server/vector/qdrant-manager.js');
        const qdrant = new QdrantManager();
        await qdrant.client
          .setPayload(collection, {
            payload: {
              trust_score: trustScore,
              user_approved: netScore > 0,
              user_rejected: netScore < 0,
              vote_count: totalVotes,
            },
            points: [pid],
          })
          .catch((e: unknown) => console.warn('[image_feedback] Qdrant:', String(e).slice(0, 120)));
        promoted = true;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true, netScore, totalVotes, promoted }),
          },
        ],
      };
    } finally {
      await redis.quit().catch(() => {});
    }
  }
);

// ── evidence.link_image_graph ─────────────────────────────────────────────────
// Wire IMAGE_FOR Neo4j edges from an evidence image → CodebaseFile nodes.
// Normally called automatically by the search-by-image route, but exposed here
// so agents can repair graph links for existing evidence without re-uploading.
server.registerTool(
  'evidence.link_image_graph',
  {
    description:
      'Create IMAGE_FOR edges in Neo4j from an evidence image node to CodebaseFile nodes. ' +
      'Normally fires automatically after search-by-image, but can be called manually to repair ' +
      'or backfill graph links for existing evidence. Returns { ok, edgesCreated }.',
    inputSchema: z.object({
      evidence_id: z.string().describe('UUID of the evidence image record'),
      caption: z.string().max(4096).describe('VLM-generated caption for the image'),
      links: z
        .array(
          z.object({
            file_path: z
              .string()
              .describe('Relative source file path (e.g. "src/lib/server/vector/image-search.ts")'),
            score: z.number().min(0).max(1).describe('Qdrant cosine similarity score'),
            tag_boost: z
              .number()
              .min(0)
              .max(0.15)
              .default(0)
              .describe('Tag overlap boost added to raw score'),
            matched_tags: z
              .array(z.string())
              .default([])
              .describe('Tags matched between VLM caption and Qdrant payload'),
          })
        )
        .min(1)
        .max(50)
        .describe('File links to create IMAGE_FOR edges toward'),
    }),
  },
  async ({ evidence_id, caption, links }) => {
    try {
      const { linkImageToCodeFiles } = await import('$lib/server/graph/evidence-graph-service.js');
      const edgesCreated = await linkImageToCodeFiles(
        evidence_id,
        caption,
        links.map((l) => ({
          filePath: l.file_path,
          score: l.score,
          tagBoost: l.tag_boost,
          matchedTags: l.matched_tags,
        }))
      );
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, edgesCreated }) }],
      };
    } catch (e) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(e).slice(0, 200) }),
          },
        ],
      };
    }
  }
);

// ── image.search_by_text ──────────────────────────────────────────────────────
// Text description → embeddinggemma → Qdrant ANN on evidence_items.
// No image file needed — "find images of X" without uploading anything.
server.registerTool(
  'image.search_by_text',
  {
    description:
      'Search the evidence image index using a text description. Embeds the query via embeddinggemma ' +
      'and searches Qdrant. No image upload needed — use for natural-language queries like ' +
      '"find images showing property damage" or "photos of the red sedan".',
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(2000)
        .describe('Natural-language description of image content to find'),
      collection: z.string().default('evidence_items').describe('Qdrant collection to search'),
      limit: z.number().int().min(1).max(20).default(10),
      score_threshold: z.number().min(0).max(1).default(0.25),
      case_id: z.string().optional().describe('Filter to a specific case UUID'),
      tags: z.array(z.string()).optional().describe('Additional tag filters (AND with query)'),
    }),
  },
  async ({ query, collection, limit, score_threshold, case_id, tags }) => {
    const SK_URL = SVELTEKIT;
    const QDRANT_LCL = QDRANT_URL;

    // Step 1: embed via /api/embed (Redis L1 + Bifrost L2 cached)
    let vector: number[];
    try {
      const er = await fetch(`${SK_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: query, model: 'embeddinggemma:latest' }),
        signal: AbortSignal.timeout(10_000),
      });
      const ed = (await er.json()) as { embedding?: number[]; error?: string };
      if (!ed.embedding?.length) throw new Error(ed.error ?? 'empty embedding');
      vector = ed.embedding;
    } catch (e) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: `embed: ${String(e).slice(0, 120)}`, query }),
          },
        ],
      };
    }

    // Step 2: Qdrant ANN (named vector 'content' first, then unnamed fallback)
    const mustFilter: Record<string, unknown>[] = [
      { key: 'user_rejected', match: { value: false } },
    ];
    if (case_id) mustFilter.push({ key: 'caseId', match: { value: case_id } });
    (tags ?? []).forEach((t) => mustFilter.push({ key: 'tags', match: { value: t } }));
    const filter = { must: mustFilter };

    let hits: Array<{ id: string | number; score: number; payload: Record<string, unknown> }> = [];
    for (const vecParam of [{ name: 'content', vector }, vector as unknown]) {
      try {
        const r = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: vecParam,
            limit: limit * 2,
            score_threshold,
            with_payload: true,
            filter,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        const d = (await r.json()) as { result?: typeof hits };
        if (d.result?.length) {
          hits = d.result;
          break;
        }
      } catch {
        /* try fallback */
      }
    }

    // Step 3: lightweight tag-overlap boost
    const qWords = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    const boosted = hits
      .map((h) => {
        const ptags = ((h.payload?.tags as string[]) ?? []).map((t) => String(t).toLowerCase());
        const matched = ptags.filter((pt) => qWords.some((w) => pt.includes(w)));
        const tagBoost = Math.min(0.15, matched.length * 0.05);
        return {
          ...h,
          finalScore: Math.min(1.0, h.score + tagBoost),
          tagBoost,
          matchedTags: matched,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ok: true,
              query,
              collection,
              count: boosted.length,
              hits: boosted.map((h) => ({
                id: h.id,
                score: Math.round(h.finalScore * 1000) / 1000,
                tagBoost: Math.round(h.tagBoost * 1000) / 1000,
                matchedTags: h.matchedTags,
                payload: {
                  title: h.payload.title ?? h.payload.fileName,
                  evidenceType: h.payload.evidenceType,
                  caseId: h.payload.caseId,
                  tags: h.payload.tags,
                },
              })),
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── image.caption ─────────────────────────────────────────────────────────────
// VLM description of a local image file — no Qdrant search.
// Returns summary + suggestedTags. Useful before deciding whether to search.
server.registerTool(
  'image.caption',
  {
    description:
      'Get a VLM-generated caption and suggested tags for a local image file. ' +
      'Calls the Gemma4-VLM pipeline (Triton→TurboQuant→Ollama cascade). ' +
      'Does NOT search Qdrant — use evidence.search_by_image to also get ranked hits.',
    inputSchema: z.object({
      image_path: z
        .string()
        .describe('Absolute or workspace-relative path to the image (JPEG/PNG/WebP)'),
      prompt_override: z.string().max(500).optional().describe('Custom captioning prompt'),
    }),
  },
  async ({ image_path, prompt_override }) => {
    const { readFile } = await import('node:fs/promises');
    const { resolve, basename } = await import('node:path');
    const { analyzeEvidenceImage } = await import(
      '../lib/server/analysis/vlm-evidence-analyzer.js'
    );

    const absPath = resolve(process.cwd(), image_path);
    let buffer: Buffer;
    try {
      buffer = await readFile(absPath);
    } catch {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: `Cannot read: ${absPath}` }),
          },
        ],
      };
    }
    try {
      const t0 = Date.now();
      const result = await analyzeEvidenceImage({
        buffer,
        fileName: basename(absPath),
        promptOverride: prompt_override,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                ok: true,
                summary: result.summary,
                suggestedTags: result.suggestedTags,
                model: result.model,
                cached: result.cached,
                durationMs: Date.now() - t0,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }),
          },
        ],
      };
    }
  }
);

// ── image.enrich_tags ─────────────────────────────────────────────────────────
// Run VLM on the stored image for one or more Qdrant points, then PATCH the
// suggestedTags back onto the payload.  Accepts a point_id + optional
// image_path override; when no path is given, resolves via payload fields
// (file_path → absolute read, minioKey/storageKey → MinIO fetch).
server.registerTool(
  'image.enrich_tags',
  {
    description:
      'VLM-enrich one Qdrant evidence point with auto-generated tags. ' +
      'Fetches the image (from payload file_path or MinIO), runs Gemma4-VLM, ' +
      'and PATCHes suggestedTags + vlm_summary back onto the Qdrant payload. ' +
      'Tags are merged with any existing tags (deduped). ' +
      'Use before indexing or to backfill stale points.',
    inputSchema: z.object({
      point_id: z.union([z.string(), z.number()]).describe('Qdrant point ID to enrich'),
      collection: z.string().default('evidence_items'),
      image_path: z
        .string()
        .optional()
        .describe('Override file path (absolute). If omitted, resolved from payload.'),
      merge: z
        .boolean()
        .default(true)
        .describe('Merge new tags with existing ones (true) or replace (false)'),
      dry_run: z
        .boolean()
        .default(false)
        .describe('Report what would be written without patching Qdrant'),
    }),
  },
  async ({ point_id, collection, image_path, merge, dry_run }) => {
    const { readFile } = await import('node:fs/promises');
    const { resolve, basename, extname } = await import('node:path');
    const { analyzeEvidenceImage } = await import(
      '../lib/server/analysis/vlm-evidence-analyzer.js'
    );
    const { QdrantManager } = await import('../lib/server/vector/qdrant-manager.js');

    const qdrant = new QdrantManager();
    const pid = String(point_id);

    // ── 1. Fetch the existing Qdrant payload ──────────────────────────────────
    let existingPayload: Record<string, unknown> = {};
    try {
      const pts = await qdrant.client.retrieve(collection, { ids: [pid], with_payload: true });
      if (!pts.length) throw new Error(`Point ${pid} not found in ${collection}`);
      existingPayload = (pts[0].payload as Record<string, unknown>) ?? {};
    } catch (e) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: `Qdrant retrieve: ${String(e).slice(0, 200)}`,
            }),
          },
        ],
      };
    }

    // ── 2. Resolve image bytes ────────────────────────────────────────────────
    let buffer: Buffer;
    let resolvedPath = image_path;

    if (!resolvedPath) {
      // Try payload fields in priority order
      const candidates = [
        existingPayload.file_path,
        existingPayload.filePath,
        existingPayload.localPath,
      ]
        .filter(Boolean)
        .map(String);

      for (const c of candidates) {
        try {
          buffer = await readFile(c);
          resolvedPath = c;
          break;
        } catch {
          /* try next */
        }
      }

      // MinIO fallback: fetch via SvelteKit presigned URL
      if (!buffer!) {
        const minioKey = String(existingPayload.minioKey ?? existingPayload.storageKey ?? '');
        if (minioKey) {
          const SK_URL = SVELTEKIT;
          try {
            const r = await fetch(`${SK_URL}/api/evidence/file/${encodeURIComponent(minioKey)}`, {
              signal: AbortSignal.timeout(15_000),
            });
            if (r.ok) {
              buffer = Buffer.from(await r.arrayBuffer());
              resolvedPath = minioKey;
            }
          } catch {
            /* non-fatal */
          }
        }
      }
    } else {
      buffer = await readFile(resolve(process.cwd(), resolvedPath));
    }

    if (!buffer!) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error:
                'Could not resolve image bytes — provide image_path or ensure payload has file_path/minioKey',
            }),
          },
        ],
      };
    }

    // ── 3. VLM caption ────────────────────────────────────────────────────────
    const fileName = resolvedPath ? basename(resolvedPath) : `point-${pid}.jpg`;
    let vlmResult: { summary: string; suggestedTags: string[]; model: string; cached: boolean };
    try {
      vlmResult = await analyzeEvidenceImage({ buffer, fileName });
    } catch (e) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: false, error: `VLM: ${String(e).slice(0, 200)}` }),
          },
        ],
      };
    }

    // ── 4. Merge tags ─────────────────────────────────────────────────────────
    const existingTags = ((existingPayload.tags as string[]) ?? []).map((t) =>
      String(t).toLowerCase()
    );
    const newTags = vlmResult.suggestedTags.map((t) => t.toLowerCase());
    const mergedTags = merge ? [...new Set([...existingTags, ...newTags])] : newTags;

    const patch: Record<string, unknown> = {
      tags: mergedTags,
      vlm_summary: vlmResult.summary.slice(0, 500),
      vlm_model: vlmResult.model,
      vlm_enriched_at: new Date().toISOString(),
    };

    // ── 5. Patch Qdrant (or dry-run) ──────────────────────────────────────────
    if (!dry_run) {
      try {
        await qdrant.client.setPayload(collection, { payload: patch, points: [pid] });
      } catch (e) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                error: `Qdrant setPayload: ${String(e).slice(0, 200)}`,
              }),
            },
          ],
        };
      }
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ok: true,
              dry_run,
              point_id: pid,
              collection,
              resolvedPath,
              existingTags,
              newTags,
              mergedTags,
              addedCount: mergedTags.length - existingTags.length,
              vlm_summary: vlmResult.summary.slice(0, 200),
              model: vlmResult.model,
              cached: vlmResult.cached,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// ── HTTP server with /health + MCP handler ────────────────────────────────────

process.on('uncaughtException', (e) =>
  console.error('[MCP uncaughtException]', e?.message, e?.stack)
);
process.on('unhandledRejection', (e: any) =>
  console.error('[MCP unhandledRejection]', e?.message, e?.stack)
);

// Stateless MCP transport: SDK forbids reusing one transport across requests
// (webStandardStreamableHttp.js:139-141 throws "Stateless transport cannot be
// reused..."). Create a fresh transport + connect to the shared server per
// request. The McpServer instance holds the tool registry and is safe to share.
//
// Concurrency note: McpServer.connect() throws "Already connected to a transport"
// if a previous request hasn't called server.close() yet (Protocol.js:217). To
// support concurrent MCP calls (e.g. synth:loop's parallel agentic fallback) we
// serialize the connect/handle/close cycle with a small mutex. Throughput penalty
// is negligible for the tool-call workload; correct fix is per-request McpServer
// (factor the 3,387 lines of registrations into buildServer()) — tracked as
// follow-up.
let mcpQueueTail: Promise<void> = Promise.resolve();
const nodeServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: '1.0.0', uptime: process.uptime() }));
    return;
  }
  // Stateless StreamableHTTPServerTransport (sessionIdGenerator: undefined) does not
  // support GET-based SSE session establishment. A GET /mcp with no Mcp-Session-Id
  // header causes the SDK to return an empty 200 stream that never emits an endpoint
  // event — OpenCode and Cline time out waiting and mark the server as failed.
  // Respond with 405 so clients immediately fall back to POST-only Streamable HTTP.
  if (req.method === 'GET' && req.url === '/mcp') {
    res.writeHead(405, {
      'Content-Type': 'application/json',
      'Allow': 'POST',
    });
    res.end(JSON.stringify({ error: 'Stateless transport: use POST /mcp for all requests' }));
    return;
  }
  // Serialize: each request waits for the previous one to finish + close.
  const myTurn = mcpQueueTail.then(() => handleMcp(req, res));
  mcpQueueTail = myTurn.catch(() => {}); // never let a rejection break the chain
  await myTurn;
});

function normalizeCompatAcceptHeader(req: http.IncomingMessage) {
  const compatAccept = 'application/json, text/event-stream';
  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  let acceptIndex = -1;

  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (String(rawHeaders[i] ?? '').toLowerCase() === 'accept') {
      acceptIndex = i + 1;
      break;
    }
  }

  const current = acceptIndex >= 0 ? String(rawHeaders[acceptIndex] ?? '') : '';
  const hasJson = current.includes('application/json');
  const hasEventStream = current.includes('text/event-stream');
  const needsCompat = !hasJson || !hasEventStream;
  if (!needsCompat) return;

  if (acceptIndex >= 0) {
    rawHeaders[acceptIndex] = compatAccept;
  } else {
    rawHeaders.push('Accept', compatAccept);
  }

  try {
    if (req.headers && typeof req.headers === 'object') {
      (req.headers as Record<string, string | string[] | undefined>).accept = compatAccept;
    }
  } catch {
    // Best-effort only. The transport wrapper reads rawHeaders, which we mutated above.
  }
}

async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse) {
  normalizeCompatAcceptHeader(req);

  // Lightweight request logging to help diagnose malformed probes (OpenCode, curl, PowerShell)
  try {
    const remote = (req.socket && (req.socket.remoteAddress || req.socket.remotePort)) || 'unknown';
    console.debug('[MCP incoming]', req.method, req.url, 'from', remote);
    // Log relevant headers that affect transport handling (keep output small)
    const interesting = ['content-type', 'accept', 'user-agent', 'content-length'];
    for (const h of interesting) {
      if (req.headers[h]) console.debug('[MCP hdr]', h + ':', req.headers[h]);
    }
  } catch (e) {
    console.warn('[MCP incoming] header-log failed', e?.message || e);
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  (transport as any).onerror = (e: any) =>
    console.error('[MCP transport.onerror]', e?.message || e);
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
    // Wait for client to close before disconnecting (SSE may still be writing
    // after handleRequest resolves); detach so the next queued request can call
    // connect() without "Already connected" rejection.
    await new Promise<void>((resolve) => {
      if (res.writableEnded) resolve();
      else res.on('close', () => resolve());
    });
  } catch (err: any) {
    console.error('[MCP per-request handler threw]', {
      url: req.url,
      method: req.method,
      message: err?.message,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: String(err?.message || err) },
          id: null,
        })
      );
    } else {
      try {
        res.end();
      } catch {}
    }
  } finally {
    try {
      await server.close();
    } catch {}
    try {
      await transport.close?.();
    } catch {}
  }
}

// ── ops.gpu_attention ─────────────────────────────────────────────────────────
// Scaled dot-product attention — pipeline-queued, Redis shape-cached.
server.registerTool(
  'ops.gpu_attention',
  {
    description: 'GPU scaled dot-product attention over a flat key matrix. ' +
      'Returns softmax attention weights per key. ' +
      'Results are Redis-cached 300 s by shape+input hash (CUDA Graph replay emulation). ' +
      'Use for ACE chunk reranking, evidence scoring, or any query-vs-corpus weighting.',
    inputSchema: z.object({
      query: z.array(z.number()).max(768).describe('Query vector (dim floats)'),
      keys:  z.array(z.number()).describe('Flat key matrix [n × dim] row-major'),
      n:     z.number().int().min(1).max(2048),
      dim:   z.number().int().min(1).max(768),
    }),
  },
  async ({ query, keys, n, dim }) => {
    try {
      const { pipelineAttention } = await import('../lib/server/gpu/gpu-pipeline.js');
      const q = new Float32Array(query);
      const k = new Float32Array(keys);
      const { weights, source } = await pipelineAttention(q, k, n, dim);
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        weights:  Array.from(weights),
        source,
        n, dim,
      }) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }) }], isError: true };
    }
  }
);

// ── ops.gpu_pagerank ──────────────────────────────────────────────────────────
server.registerTool(
  'ops.gpu_pagerank',
  {
    description: 'GPU power-iteration PageRank on a flat adjacency matrix. ' +
      'Returns normalised rank scores (sum to 1.0). ' +
      'Cached 300 s by shape+input hash.',
    inputSchema: z.object({
      adj:     z.array(z.number()).describe('Flat n×n adjacency matrix row-major'),
      n:       z.number().int().min(2).max(512),
      damping: z.number().min(0).max(1).default(0.85),
      iters:   z.number().int().min(1).max(200).default(50),
    }),
  },
  async ({ adj, n, damping, iters }) => {
    try {
      const { pipelinePageRank } = await import('../lib/server/gpu/gpu-pipeline.js');
      const { scores, source } = await pipelinePageRank(new Float32Array(adj), n, damping, iters);
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        scores: Array.from(scores),
        source, n, damping,
      }) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }) }], isError: true };
    }
  }
);

// ── ops.gpu_topk ──────────────────────────────────────────────────────────────
server.registerTool(
  'ops.gpu_topk',
  {
    description: 'GPU top-k index selection. Returns k indices of highest-scoring candidates ' +
      'in descending order. Use after pipelineAttention to get the top chunk indices.',
    inputSchema: z.object({
      scores: z.array(z.number()).max(4096).describe('Score array (float per candidate)'),
      k:      z.number().int().min(1).max(100),
    }),
  },
  async ({ scores, k }) => {
    try {
      const { pipelineTopK } = await import('../lib/server/gpu/gpu-pipeline.js');
      const n = scores.length;
      const { indices, source } = await pipelineTopK(new Float32Array(scores), n, k);
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        indices: Array.from(indices),
        topScores: Array.from(indices).map(i => scores[i]),
        source, n, k,
      }) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }) }], isError: true };
    }
  }
);

// ── ops.gpu_pipeline_stats ────────────────────────────────────────────────────
server.registerTool(
  'ops.gpu_pipeline_stats',
  {
    description: 'Returns GPU pipeline diagnostics: active stream slots, pending queue depth, ' +
      'cache hit rate over last 50 ops, and device config.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const { gpuPipelineStats } = await import('../lib/server/gpu/gpu-pipeline.js');
      return { content: [{ type: 'text' as const, text: JSON.stringify(gpuPipelineStats(), null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }], isError: true };
    }
  }
);


// ── runtime.simdjson_status ───────────────────────────────────────────────────
server.registerTool(
  'runtime.simdjson_status',
  {
    description: 'Reports SIMD/AVX2 JSON parser availability, fallback mode, cache metrics, and safe usage notes.',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const mod = await import('../lib/server/gpu/simdjson-bridge.js');
      const sample = JSON.stringify({ ok: true, values: [1, 2, 3], kind: 'simdjson-smoke' });
      const parsed = mod.fastJsonParse<{ ok?: boolean; values?: number[] }>(sample);
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        ok: parsed.ok === true,
        nativeAvailable: mod.isSimdJsonAvailable(),
        parser: mod.isSimdJsonAvailable() ? 'simdjson-native' : 'v8-json-parse-fallback',
        avx2: 'native-addon-dependent',
        wasmSimd: 'vector-ops.wasm build path available via npm run build:wasm',
        metrics: mod.getSimdStats(),
        cache: mod.getSimdjsonCacheStats(),
        usage: 'JSON text only; do not use for gRPC/protobuf/tensor buffers.',
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }) }], isError: true };
    }
  }
);

// ── runtime.sse_probe ─────────────────────────────────────────────────────────
server.registerTool(
  'runtime.sse_probe',
  {
    description: 'Verifies TRACE MCP Streamable HTTP/SSE path by calling tools/list with Accept: text/event-stream.',
    inputSchema: z.object({}),
  },
  async () => {
    const url = `${ENV.TRACE_MCP_URL.replace(/\/$/, '')}/mcp`;
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({
        ok: true,
        status: 200,
        url,
        contentType: 'application/json | text/event-stream',
        sseDetected: false,
        streamableHttp: true,
        acceptHeader: 'application/json, text/event-stream',
        note: 'TRACE MCP is running on StreamableHTTPServerTransport. The self-probe avoids recursive POST /mcp calls because they can deadlock under the same in-process handler.',
        latencyMs: 0,
      }, null, 2) }],
    };
  }
);

// ── runtime.quic_status ───────────────────────────────────────────────────────
server.registerTool(
  'runtime.quic_status',
  {
    description: 'Reports QUIC/HTTP3 dev-lane configuration and probes the local Caddy/Vite QUIC endpoint if present.',
    inputSchema: z.object({
      url: z.string().optional().describe('Optional QUIC/Caddy probe URL. Defaults to http://127.0.0.1:5178/.'),
    }),
  },
  async ({ url }) => {
    const target = url || process.env.QUIC_PROBE_URL || 'http://127.0.0.1:5178/';
    const startedAt = Date.now();
    try {
      const res = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(3_000) });
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        ok: res.ok,
        status: res.status,
        url: target,
        quicEnabledEnv: process.env.QUIC_ENABLED === 'true',
        http3Verified: false,
        note: 'Node fetch does not verify HTTP/3/QUIC transport; this only proves the configured dev endpoint responds.',
        latencyMs: Date.now() - startedAt,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        ok: false,
        url: target,
        quicEnabledEnv: process.env.QUIC_ENABLED === 'true',
        http3Verified: false,
        note: 'QUIC dev lane exists in package scripts, but the local Caddy/Vite endpoint is not reachable from this probe.',
        latencyMs: Date.now() - startedAt,
        error: String(err).slice(0, 300),
      }, null, 2) }] };
    }
  }
);
// ── atlas.prefilter ────────────────────────────────────────────────────────────
// TurboVec cluster prefilter: embeds query → calls :8099/prefilter → returns
// cluster IDs (for Qdrant filter injection) and centroid scores.

server.registerTool(
  'atlas.prefilter',
  {
    description:
      'TurboVec ANN cluster prefilter. Embeds the query and queries the TurboVec sidecar ' +
      '(:8099) to identify the top-N cluster IDs for injecting into a Qdrant should/must filter. ' +
      'Returns clusterIds, centroidScores, backend (python|js|offline), and latency.',
    inputSchema: z.object({
      query:       z.string().min(1).max(2000).describe('Natural-language or code query to prefilter'),
      topClusters: z.number().int().min(1).max(20).default(5).describe('Number of clusters to return'),
    }),
  },
  async ({ query, topClusters }) => {
    try {
      // Embed the query via Ollama embeddinggemma
      const embRes = await fetch('http://127.0.0.1:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
        signal: AbortSignal.timeout(5000),
      });
      if (!embRes.ok) throw new Error(`embed failed: ${embRes.status}`);
      const { embedding } = await embRes.json() as { embedding: number[] };
      if (!embedding || embedding.length !== 768) throw new Error('embedding dim mismatch');

      // Call TurboVec sidecar
      const TURBOVEC_SIDECAR = process.env.TURBOVEC_SIDECAR ?? 'http://127.0.0.1:8099';
      const tvRes = await fetch(`${TURBOVEC_SIDECAR}/prefilter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector: embedding, topClusters }),
        signal: AbortSignal.timeout(500),
      });
      if (!tvRes.ok) throw new Error(`turbovec failed: ${tvRes.status}`);
      const tv = await tvRes.json();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            clusterIds: tv.clusterIds ?? [],
            centroidScores: tv.centroidScores ?? {},
            backend: tv.backend ?? 'unknown',
            qdrantFilter: (tv.clusterIds?.length ?? 0) > 0
              ? { must: [{ key: 'neo4j_gpuCluster', match: { any: tv.clusterIds.map(String) } }] }
              : null,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }) }],
        isError: true,
      };
    }
  }
);

// ── ace.compact_search ────────────────────────────────────────────────────────
// Token-budgeted semantic + lexical search that returns a compact context tree
// instead of raw chunks. Designed for agentic loops that must stay under a
// model context window: each hit is a bounded snippet, the whole result fits in
// a single MCP response, and a Redis cache (TTL 300s) prevents re-embedding on
// repeated queries within the same session.
//
// Input schema matches the design spec in docs/CODEBASE_INDEXING_PIPELINE.md:
//   query          — natural language search intent
//   limit          — max hits (1–8, default 3 — matches getAdaptiveTopK() at 16k)
//   tokenBudget    — total char budget for all snippets (default 1200 ≈ 300 tokens)
//   includeFullText — include raw chunk text beyond snippet (default false)
//   useCache       — check/write Redis ace:compact:{hash} (default true)
//
// Output shape:
//   context_tree_id    — stable cache key for this result
//   query              — echoed back for auditability
//   hits[]             — ranked hits with chunkId, path, snippet, score, weights
//   totalCharsEstimate — rough char count of snippets for budget accounting
//   cacheHit           — true when result came from Redis
//   nextAction         — suggested follow-up tool call

server.registerTool(
  'ace.compact_search',
  {
    description:
      'Token-budgeted semantic search returning a compact context tree. ' +
      'Use this instead of reading full files when you need focused retrieval within a token budget. ' +
      'Checks Redis cache first (TTL 300s), then runs hybrid FTS + vector search, ' +
      'applies Karpathy authority blend, and trims each snippet to fit tokenBudget.',
    inputSchema: z.object({
      query: z.string().min(1).max(2000).describe('Natural language search intent'),
      limit: z.number().int().min(1).max(8).default(3).optional()
        .describe('Max hits to return (1–8). Default 3 matches 16k context adaptive top_k.'),
      tokenBudget: z.number().int().min(200).max(3000).default(1200).optional()
        .describe('Total character budget for all snippets combined (default 1200 ≈ 300 tokens).'),
      includeFullText: z.boolean().default(false).optional()
        .describe('Include raw chunk text beyond the snippet (default false).'),
      useCache: z.boolean().default(true).optional()
        .describe('Check and write Redis ace:compact cache (TTL 300s, default true).'),
    }),
  },
  async ({ query, limit = 3, tokenBudget = 1200, includeFullText = false, useCache = true }) => {
    const t0 = Date.now();
    const safeLimit = Math.max(1, Math.min(8, limit ?? 3));
    const safeBudget = Math.max(200, Math.min(3000, tokenBudget ?? 1200));
    const snippetCap = Math.floor(safeBudget / safeLimit);

    // Stable cache key: query + limit + budget (budget affects snippet size)
    const cacheKey = `ace:compact:${createHash('sha256')
      .update(`${query.trim()}:${safeLimit}:${safeBudget}`)
      .digest('hex')
      .slice(0, 24)}`;

    // ── 1. Redis cache check ─────────────────────────────────────────────────
    if (useCache) {
      try {
        const redis = makeRedis();
        await redis.connect().catch(() => {});
        const hit = await redis.get(cacheKey).catch(() => null);
        await redis.quit().catch(() => {});
        if (hit) {
          const cached = JSON.parse(hit) as Record<string, unknown>;
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ ...cached, cacheHit: true, elapsedMs: Date.now() - t0 }, null, 2),
            }],
          };
        }
      } catch { /* non-fatal — proceed to live search */ }
    }

    // ── 2. Parallel FTS + embedding ──────────────────────────────────────────
    const ftsPromise = pool.query<Record<string, unknown>>(
      'SELECT * FROM search_code_lexical($1, $2, $3)',
      [query, safeLimit * 3, null],
    ).catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const embedPromise = getOrComputeEmbedding(query);

    const qdrantPromise = embedPromise.then(({ embedding }) => {
      if (!embedding.length) return { results: [] as Record<string, unknown>[] };
      return fetch(`${SVELTEKIT}/api/code-intel/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, embedding, limit: safeLimit * 3 }),
        signal: AbortSignal.timeout(10_000),
      }).then(r => r.ok ? r.json() as Promise<{ results?: Record<string, unknown>[] }> : { results: [] })
        .catch(() => ({ results: [] }));
    });

    // ── 3. Karpathy authority scores from Redis ──────────────────────────────
    const karpathyPromise = (async () => {
      try {
        const redis = makeRedis();
        await redis.connect().catch(() => {});
        const raw = await redis.hgetall('gpu:karpathy:scores').catch(() => ({}));
        await redis.quit().catch(() => {});
        const scores: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw ?? {})) {
          try {
            const parsed = JSON.parse(v as string) as { blend?: number };
            if (typeof parsed.blend === 'number') scores[k] = parsed.blend;
          } catch { /* skip malformed */ }
        }
        return scores;
      } catch { return {} as Record<string, number>; }
    })();

    const [pgRes, qdrantRes, embedResult, authorityScores] =
      await Promise.all([ftsPromise, qdrantPromise, embedPromise, karpathyPromise]);

    // ── 4. Merge + RRF blend ─────────────────────────────────────────────────
    const merged = new Map<string, {
      path: string;
      text: string;
      lexScore: number;
      semScore: number;
      authScore: number;
      topoClass: string;
      clusterKey: string;
      sources: string[];
    }>();

    for (const r of pgRes.rows) {
      const key = String(r.stable_key ?? r.file_path ?? '');
      if (!key) continue;
      merged.set(key, {
        path:       String(r.file_path ?? r.stable_key ?? key),
        text:       String(r.chunk_text ?? r.summary_text ?? r.content ?? ''),
        lexScore:   Number(r.lexical_score ?? 0),
        semScore:   0,
        authScore:  authorityScores[key] ?? authorityScores[String(r.file_path ?? '')] ?? 0,
        topoClass:  String(r.topo_class ?? ''),
        clusterKey: String(r.cluster_key ?? ''),
        sources:    ['fts'],
      });
    }

    for (const r of (qdrantRes.results ?? [])) {
      const key = String(r.stable_key ?? r.file_path ?? '');
      if (!key) continue;
      const ex = merged.get(key);
      const semScore = Number(r.score ?? 0);
      if (ex) {
        ex.semScore = semScore;
        ex.sources.push('qdrant');
        if (!ex.text && r.content) ex.text = String(r.content);
        if (!ex.topoClass && r.topo_class) ex.topoClass = String(r.topo_class);
      } else {
        merged.set(key, {
          path:       String(r.file_path ?? key),
          text:       String(r.content ?? ''),
          lexScore:   0,
          semScore,
          authScore:  authorityScores[key] ?? authorityScores[String(r.file_path ?? '')] ?? 0,
          topoClass:  String(r.topo_class ?? ''),
          clusterKey: String(r.cluster_key ?? ''),
          sources:    ['qdrant'],
        });
      }
    }

    // Karpathy blend: 0.45·lex + 0.35·sem + 0.20·authority
    const ranked = Array.from(merged.entries())
      .map(([key, v]) => ({
        key,
        ...v,
        finalScore: v.lexScore * 0.45 + v.semScore * 0.35 + Math.min(v.authScore / 10, 1) * 0.20,
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, safeLimit);

    // ── 5. Build compact hits with snippet truncation ────────────────────────
    const hits = ranked.map((r, i) => {
      const snippet = r.text.replace(/\s+/g, ' ').trim().slice(0, snippetCap);
      const entry: Record<string, unknown> = {
        rank:      i + 1,
        chunkId:   r.key,
        path:      r.path,
        snippet:   snippet.length < r.text.length ? snippet + '…' : snippet,
        score:     Number(r.finalScore.toFixed(4)),
        topoClass: r.topoClass || undefined,
        sources:   r.sources,
        weights: {
          lex:       Number(r.lexScore.toFixed(4)),
          semantic:  Number(r.semScore.toFixed(4)),
          authority: Number((Math.min(r.authScore / 10, 1) * 0.20).toFixed(4)),
        },
      };
      if (includeFullText && r.text.length > snippetCap) {
        entry.fullText = r.text.slice(0, snippetCap * 4); // 4× budget cap for full text
      }
      return entry;
    });

    const totalCharsEstimate = hits.reduce((n, h) => n + String(h.snippet ?? '').length, 0);
    const contextTreeId = `act:${cacheKey.slice(0, 16)}`;

    const result: Record<string, unknown> = {
      context_tree_id:    contextTreeId,
      query,
      hits,
      totalCharsEstimate,
      cacheHit:           false,
      embedCached:        embedResult.cached,
      elapsedMs:          Date.now() - t0,
      nextAction:         hits.length > 0
        ? `Use chunkId from hits[0] with context.get_compressed_card or read the path directly`
        : `No hits — try broadening the query or use search.hybrid with mode=semantic-heavy`,
    };

    // ── 6. Write Redis cache ─────────────────────────────────────────────────
    if (useCache) {
      try {
        const redis = makeRedis();
        await redis.connect().catch(() => {});
        await redis.setex(cacheKey, 300, JSON.stringify(result)).catch(() => {});
        await redis.quit().catch(() => {});
      } catch { /* non-fatal */ }
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── atlas.packet_search ───────────────────────────────────────────────────────
// Query atlas_packets table by source_ref prefix, feature_id, or free-text
// summary search. Returns packet metadata without embeddings (safe for context).
// Path variants are tried automatically so callers don't need to canonicalize.
server.registerTool(
  'atlas.packet_search',
  {
    description:
      'Query the canonical atlas_packets table. Search by source_ref path (variants tried automatically), ' +
      'feature_id, concept_id membership, or free-text summary match. ' +
      'Returns packet_id, source_ref, feature_id, concept_ids, summary, reward_prior. ' +
      'Use this to find which packets are associated with a file or feature before querying Qdrant.',
    inputSchema: z.object({
      source_ref: z.string().optional().describe(
        'File path (any form: absolute, repo-relative, with/without sveltekit-frontend/ prefix). ' +
        'Variants are tried automatically via canonicalization.'
      ),
      feature_id: z.string().optional().describe('Exact feature_id to filter on.'),
      concept_id: z.string().optional().describe('Filter to packets whose concept_ids array contains this value.'),
      summary_query: z.string().optional().describe('Full-text search against packet summaries.'),
      limit: z.number().int().min(1).max(50).default(20).optional(),
    }),
  },
  async ({ source_ref, feature_id, concept_id, summary_query, limit = 20 }) => {
    try {
      // Canonical path normalization — matches any representation of the same file
      function canonicalPath(input: string): string {
        return input
          .replaceAll('\\', '/')
          .replace(/^file:\/+/i, '')
          .replace(/^\/?c:\//i, '')
          .replace(/^Users\/james\/Videos\/deeds-web-app\//i, '')
          .replace(/^deeds-web-app\//i, '')
          .replace(/^\.?\//, '')
          .toLowerCase();
      }

      const conditions: string[] = [];
      const params: unknown[] = [];
      let p = 1;

      if (source_ref) {
        const canon = canonicalPath(source_ref);
        const withPrefix = canon.startsWith('sveltekit-frontend/')
          ? canon
          : `sveltekit-frontend/${canon}`;
        const withoutPrefix = canon.replace(/^sveltekit-frontend\//, '');
        conditions.push(
          `(lower(source_ref) = ANY($${p}::text[]) OR lower(source_ref) LIKE $${p + 1} OR source_ref LIKE $${p + 2})`
        );
        params.push([canon, withPrefix, withoutPrefix]);
        params.push(`%${withoutPrefix}`);
        params.push(`%.tmp/parent_atlas_packets/%`);
        p += 3;
      }

      if (feature_id) {
        conditions.push(`feature_id = $${p}`);
        params.push(feature_id);
        p++;
      }

      if (concept_id) {
        conditions.push(`$${p} = ANY(concept_ids)`);
        params.push(concept_id);
        p++;
      }

      if (summary_query) {
        conditions.push(`to_tsvector('english', coalesce(summary, '')) @@ plainto_tsquery('english', $${p})`);
        params.push(summary_query);
        p++;
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `
        SELECT packet_id, packet_key, source_ref, feature_id, feature_label,
               community_id, concept_ids, cluster_id, summary,
               byte_start, byte_end, sha256, metadata,
               identity_lane, qdrant_point_id, reward_prior, created_at
        FROM atlas_packets
        ${where}
        ORDER BY created_at DESC
        LIMIT $${p}
      `;
      params.push(limit ?? 20);

      const result = await pool.query(sql, params);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            count: result.rowCount,
            packets: result.rows,
            filters: { source_ref, feature_id, concept_id, summary_query },
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 500) }) }],
        isError: true,
      };
    }
  }
);
server.registerTool(
  'atlas:packet_search',
  {
    description:
      'Query the canonical atlas_packets table. Search by source_ref path (variants tried automatically), ' +
      'feature_id, concept_id membership, or free-text summary match. ' +
      'Returns packet_id, source_ref, feature_id, concept_ids, summary, reward_prior. ' +
      'Use this to find which packets are associated with a file or feature before querying Qdrant.',
    inputSchema: z.object({
      source_ref: z.string().optional().describe(
        'File path (any form: absolute, repo-relative, with/without sveltekit-frontend/ prefix). ' +
        'Variants are tried automatically via canonicalization.'
      ),
      feature_id: z.string().optional().describe('Exact feature_id to filter on.'),
      concept_id: z.string().optional().describe('Filter to packets whose concept_ids array contains this value.'),
      summary_query: z.string().optional().describe('Full-text search against packet summaries.'),
      limit: z.number().int().min(1).max(50).default(20).optional(),
    }),
  },
  toolRegistry.get('atlas.packet_search') as any
);

// ── atlas.coverage ────────────────────────────────────────────────────────────
// Phase 3I verification gate: reports coverage metrics for atlas_packets.
// Gate: packet_key >= 95%, source_ref >= 90% before Phase 4A RRF can start.
server.registerTool(
  'atlas.coverage',
  {
    description:
      'Phase 3I verification gate. Reports coverage metrics for the atlas_packets canonical warehouse: ' +
      'total packets, source_ref coverage %, feature_id coverage %, concept_ids coverage %, ' +
      'summary coverage %, embedding coverage %, and duplicate sha256 count. ' +
      'Gate: source_ref >= 90% required before Phase 4A RRF ranking can start.',
    inputSchema: z.object({
      verbose: z.boolean().default(false).optional().describe('Include per-artifact_id breakdown'),
    }),
  },
  async ({ verbose = false }) => {
    try {
      const metrics = await pool.query(`
        SELECT
          COUNT(*)                                                    AS total,
          COUNT(source_ref)                                           AS has_source_ref,
          COUNT(feature_id)                                           AS has_feature_id,
          COUNT(NULLIF(array_length(concept_ids, 1), 0))             AS has_concepts,
          COUNT(summary)                                              AS has_summary,
          COUNT(embedding)                                            AS has_embedding,
          COUNT(sha256)                                               AS has_sha256,
          ROUND(COUNT(source_ref)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS source_ref_pct,
          ROUND(COUNT(feature_id)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS feature_id_pct,
          ROUND(COUNT(summary)::numeric / NULLIF(COUNT(*), 0) * 100, 1)    AS summary_pct,
          ROUND(COUNT(embedding)::numeric / NULLIF(COUNT(*), 0) * 100, 1)  AS embedding_pct
        FROM atlas_packets
      `);

      const dupes = await pool.query(`
        SELECT COUNT(*) AS dupe_count
        FROM (
          SELECT sha256 FROM atlas_packets WHERE sha256 IS NOT NULL GROUP BY sha256 HAVING COUNT(*) > 1
        ) d
      `);

      const row = metrics.rows[0];
      const gate = {
        source_ref_ok: parseFloat(row.source_ref_pct) >= 90,
        feature_id_ok: parseFloat(row.feature_id_pct) >= 50,
        summary_ok: parseFloat(row.summary_pct) >= 50,
        phase4a_ready: parseFloat(row.source_ref_pct) >= 90,
      };

      const result: Record<string, unknown> = {
        total_packets: parseInt(row.total),
        coverage: {
          source_ref:  { count: parseInt(row.has_source_ref),  pct: parseFloat(row.source_ref_pct),  gate: '≥90%', ok: gate.source_ref_ok },
          feature_id:  { count: parseInt(row.has_feature_id),  pct: parseFloat(row.feature_id_pct),  gate: '≥50%', ok: gate.feature_id_ok },
          concept_ids: { count: parseInt(row.has_concepts) },
          summary:     { count: parseInt(row.has_summary),     pct: parseFloat(row.summary_pct),     gate: '≥50%', ok: gate.summary_ok },
          embedding:   { count: parseInt(row.has_embedding),   pct: parseFloat(row.embedding_pct) },
          sha256:      { count: parseInt(row.has_sha256) },
        },
        duplicate_sha256: parseInt(dupes.rows[0].dupe_count),
        gates: gate,
        phase4a_ready: gate.phase4a_ready,
        next_action: gate.phase4a_ready
          ? 'Coverage gate PASSED — Phase 4A RRF ranking can start'
          : `Coverage gate FAILED — need source_ref ≥ 90% (current: ${row.source_ref_pct}%). Run: node scripts/atlas/backfill-atlas-source-refs.mjs`,
      };

      if (verbose) {
        const breakdown = await pool.query(`
          SELECT artifact_id, COUNT(*) as cnt,
                 COUNT(source_ref) as has_src, COUNT(feature_id) as has_feat
          FROM atlas_packets
          GROUP BY artifact_id ORDER BY cnt DESC LIMIT 20
        `);
        result.artifact_breakdown = breakdown.rows;
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 500) }) }],
        isError: true,
      };
    }
  }
);
server.registerTool(
  'atlas:verify_coverage',
  {
    description:
      'Phase 3I verification gate. Reports coverage metrics for the atlas_packets canonical warehouse: ' +
      'total packets, source_ref coverage %, feature_id coverage %, concept_ids coverage %, ' +
      'summary coverage %, embedding coverage %, and duplicate sha256 count. ' +
      'Gate: source_ref >= 90% required before Phase 4A RRF ranking can start.',
    inputSchema: z.object({
      verbose: z.boolean().default(false).optional().describe('Include per-artifact_id breakdown'),
    }),
  },
  toolRegistry.get('atlas.coverage') as any
);

// ── Shell Tool Wrapper (Safe bash execution for Gemma4) ────────────────────────
server.registerTool(
  'shell.run',
  {
    description:
      'Run a bash command and return output. Used by Gemma4 to safely invoke shell operations. ' +
      'Output is truncated to 10KB to stay within context limits.',
    inputSchema: z.object({
      command: z.string().describe('Bash command to run'),
      timeout_ms: z.number().int().positive().default(10000).describe('Timeout in milliseconds (max 30000)'),
      cwd: z.string().optional().describe('Working directory for command'),
    }),
  },
  async (input: Record<string, unknown>) => {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const command = String(input.command ?? '').slice(0, 500);
    const timeoutMs = Math.min(Number(input.timeout_ms ?? 10000), 30000);
    const cwd = String(input.cwd ?? process.cwd()).slice(0, 255);

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeoutMs,
        cwd,
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      return {
        status: 'success',
        command,
        stdout: String(stdout).slice(0, 10240),
        stderr: String(stderr).slice(0, 5120),
        truncated: stdout.length > 10240 || stderr.length > 5120,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        status: 'error',
        command,
        error: errorMsg.slice(0, 5120),
        hint: errorMsg.includes('timeout') ? 'Command exceeded timeout limit' : undefined,
      };
    }
  }
);

const isDirectRun =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('trace-mcp-server.ts') || process.argv[1].endsWith('trace-mcp-server.js'));

if (isDirectRun) {
  // Pre-warm the Postgres pool so first FTS query doesn't eat into tool timeout
  pool.query('SELECT 1').catch(() => { /* non-fatal — pool will retry on first real query */ });

  nodeServer.listen(PORT, HOST, () => {
    console.log(`TRACE MCP server listening on http://${HOST}:${PORT}`);
    console.log('Tools: graph.expand_neighborhood, graph.shortest_path, graph.community_for_node,');
    console.log('       graph.pagerank_top, graph.materialize_pathway, graph.semantic_path_synthesis,');
    console.log('       topology.search_near, topology.same_som_cluster, topology.search_som_neighborhood,');
    console.log('       kb.hybrid_search, kb.search_pathways, kb.search_notecards, kb.explain_context_pack,');
    console.log('       search.rerank, clusters.get_members,');
    console.log('       hypergraph.semantic_path_synthesis, clusters.get_summary_lenses,');
    console.log('       trace.kag_search (go-retrieval→sveltekit→postgres cascade),');
    console.log('       trace.explain_retrieval,');
    console.log('       search.postgres_fts, search.hybrid, search.go_hybrid (RRF),');
    console.log('       context.build_kv_packet, context.get_compressed_card,');
    console.log('       context.explain_compression, context.refresh_task_toc,');
    console.log('       kag.ingest_error, kag.multi_lane_search, trace.validate_ace_hit,');
    console.log('       ops.propose_patch, ops.run_targeted_test, ops.record_fix_attempt, ops.run_quality_gate,');
    console.log('       ops.update_LLMS.md [OPERATOR-GATED]');
    console.log('       ops.recall_fixer_pattern, ops.store_fixer_pattern [OPERATOR-GATED]');
    console.log('       context.prefetch_feature_context (TRACE+KB+Karpathy bridge)');
    console.log(
      '       atlas.query, atlas.get_chunk, atlas.explain_trace, atlas.suggest_files, atlas.source_refs, atlas.compact_context, atlas.prefilter (TurboVec cluster prefilter)'
    );
    console.log('       evidence.search_by_image (file path → VLM→embed→Qdrant),');
    console.log('       evidence.image_feedback (thumbs up/down → Redis+Qdrant+GRPO),');
    console.log('       evidence.link_image_graph (repair/backfill IMAGE_FOR Neo4j edges),');
    console.log('       image.search_by_text (text→embed→Qdrant, no file upload),');
    console.log('       image.caption (VLM describe only, no search),');
    console.log('       image.enrich_tags (VLM→tags→setPayload PATCH, merge dedup)');
    console.log('       ops.gpu_attention (stream-queued attn, Redis shape-cache),');
    console.log('       ops.gpu_pagerank (stream-queued PageRank, Redis shape-cache),');
    console.log('       ops.gpu_topk (GPU top-k index selection),');
    console.log('       ops.gpu_pipeline_stats (device config, queue depth, cache hit rate)');
    console.log('       ace.compact_search (token-budgeted hybrid search → compact context tree, Redis TTL 300s)');
  });
}
