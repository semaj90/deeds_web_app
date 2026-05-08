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
 *   clusters.get_summary_lenses — AGENTS.md / wiki notes for cluster
 *   trace.kag_search           — full KAG-DAG retrieval (via /api/graph/traverse + ACE)
 *   trace.explain_retrieval    — retrieval trace for a prior query
 *   kag.record_agent_run         — write run artifacts + queue JSONL for ingest
 *   kag.ingest_memory_directory  — flush pending JSONL queue → Redis ACE cache
 *   graph.expand_neighborhood    — ego-graph expansion (direct + N-hop neighbours)
 *   clusters.get_summary_lenses  — AGENTS.md/wiki notes for a GPU cluster
 *   trace.validate_ace_hit       — validate cache key contract + graph node presence
 *   ops.propose_patch            — [OPERATOR-GATED] propose a code fix (read-only preview, no write)
 *   ops.run_targeted_test        — [OPERATOR-GATED] run a specific vitest file, return output
 *   ops.record_fix_attempt       — [OPERATOR-GATED] persist fix metadata to fix_attempts table
 *   ops.run_quality_gate         — [OPERATOR-GATED] run tsc --noEmit and report pass/fail
 *   hypergraph.search            — FTS + member activation search over hyperedges
 *   hypergraph.get_edge          — fetch single hyperedge by edge_hash
 *   hypergraph.explain_activation — why a hyperedge was activated for query terms
 *   hypergraph.expand_members    — edges sharing members with a given edge
 *   knowledge.get_minified_map   — compact map: top edges + AGENTS.md for a directory
 *
 * Architecture note — tools are READ-ONLY except the four ops.* tools which require an
 * operator_token to execute. Batch writes flow through graphify:* npm scripts outside the ACE hot path.
 *
 * TODO (optional future sidecar):
 *   LangGraph can orchestrate long-running graphify → verify → human-approval → patch workflows
 *   once the current FastMCP spine (this file) is stable and the observability dashboard is live.
 *   It would call these same MCP tools + npm scripts, not replace them.
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { Pool } from 'pg';

// ── Config ────────────────────────────────────────────────────────────────────

const PORT     = Number(process.env.TRACE_MCP_PORT  ?? 8788);
const HOST     = process.env.TRACE_MCP_HOST         ?? '127.0.0.1';
const SVELTEKIT = process.env.SVELTEKIT_URL         ?? 'http://127.0.0.1:5173';
const NEO4J_HTTP = process.env.NEO4J_HTTP_URL       ?? 'http://localhost:7474';
const NEO4J_USER = process.env.NEO4J_USER           ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const REDIS_URL  = process.env.REDIS_URL             ?? 'redis://127.0.0.1:6379';
const PG_URL     = process.env.DATABASE_URL          ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const TOPO_URL          = process.env.TOPOLOGY_SEARCH_URL  ?? 'http://127.0.0.1:8101';
const GO_SEARCH_URL     = process.env.GO_SEARCH_URL         ?? 'http://127.0.0.1:8096';
const GO_RETRIEVAL_URL  = process.env.GO_RETRIEVAL_URL      ?? 'http://127.0.0.1:8100';

const pool = new Pool({ connectionString: PG_URL, max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
pool.on('error', () => {});

// ── Shared embedding cache (Redis L1, 1h TTL) ────────────────────────────────
// search.hybrid + topology.search_near + search.dev_context all embed the same
// query independently — single embeddinggemma call costs 3-7s, cache hit is <5ms.
const EMBED_CACHE_TTL = 3600;

let _embedRedis: import('ioredis').default | null = null;
async function getEmbedRedis() {
  if (_embedRedis) return _embedRedis;
  const { default: Redis } = await import('ioredis');
  _embedRedis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  _embedRedis.on('error', () => {});
  await _embedRedis.connect().catch(() => {});
  return _embedRedis;
}

async function getOrComputeEmbedding(query: string): Promise<{ embedding: number[]; cached: boolean }> {
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
      } catch { /* fallthrough to recompute */ }
    }
    const res = await sveltePost('/api/embed', { text: safeQuery });
    const embedding = ((res as { embedding?: number[] }).embedding ?? []) as number[];
    if (embedding.length === 768) {
      await r.setex(key, EMBED_CACHE_TTL, JSON.stringify(embedding)).catch(() => {});
    }
    return { embedding, cached: false };
  } catch {
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

function clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function normalizeJsonFilter(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out = Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .filter(([k, v]) => k.length < 64 && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
  );
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Shared retrieval hit shape ────────────────────────────────────────────────

interface RetrievalHit {
  id?:                  string;
  path?:                string;
  title?:               string;
  snippet?:             string;
  score?:               number;
  source?:              string;
  clusterKey?:          string;
  topoClass?:           string;
  graphAuthorityScore?: number;
  metadata?:            Record<string, unknown>;
}

interface NormalizedRetrievalResult {
  ok:        boolean;
  source:    'go-retrieval' | 'go-search' | 'topology' | 'sveltekit-fallback' | 'postgres-fts';
  degraded?: boolean;
  reason?:   string;
  query?:    string;
  hits:      RetrievalHit[];
  elapsedMs: number;
}

function normalizeGoRetrievalHits(
  data: { results?: Array<Record<string, unknown>> },
  query: string,
  t0: number,
): NormalizedRetrievalResult {
  const hits: RetrievalHit[] = (data.results ?? []).map(h => ({
    id:                  h.stable_key != null ? String(h.stable_key) : h.id != null ? String(h.id) : undefined,
    path:                h.file_path  != null ? String(h.file_path)  : undefined,
    snippet:             h.content    != null ? String(h.content).slice(0, 600) : undefined,
    score:               typeof h.score === 'number' ? h.score : undefined,
    topoClass:           h.topo_class   != null ? String(h.topo_class)   : undefined,
    clusterKey:          h.cluster_key  != null ? String(h.cluster_key)  : undefined,
    graphAuthorityScore: typeof h.graph_authority_score === 'number' ? h.graph_authority_score : undefined,
  }));
  return { ok: true, source: 'go-retrieval', query, hits, elapsedMs: Date.now() - t0 };
}

function normalizeGoSearchHits(
  data: { results?: Array<Record<string, unknown>>; hits?: Array<Record<string, unknown>> },
  query: string,
  t0: number,
): NormalizedRetrievalResult {
  const raw = data.results ?? data.hits ?? [];
  const hits: RetrievalHit[] = raw.map(h => ({
    id:                  h.id          != null ? String(h.id)          : undefined,
    path:                h.file_path   != null ? String(h.file_path)   : undefined,
    title:               h.title       != null ? String(h.title)       : undefined,
    snippet:             h.content     != null ? String(h.content).slice(0, 600)
                       : h.text        != null ? String(h.text).slice(0, 600) : undefined,
    score:               typeof h.score === 'number' ? h.score : undefined,
    source:              h.source      != null ? String(h.source)      : 'go-search-service',
    topoClass:           h.topo_class  != null ? String(h.topo_class)  : undefined,
    clusterKey:          h.cluster_key != null ? String(h.cluster_key) : undefined,
    graphAuthorityScore: typeof h.authority_score === 'number' ? h.authority_score : undefined,
  }));
  return { ok: true, source: 'go-search', query, hits, elapsedMs: Date.now() - t0 };
}

function normalizeTopologyHits(
  data: { hits?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> },
  elapsedMs: number,
): NormalizedRetrievalResult {
  const raw = data.hits ?? data.results ?? [];
  const hits: RetrievalHit[] = raw.map(h => ({
    id:                  h.stable_key   != null ? String(h.stable_key)  : undefined,
    path:                h.path         != null ? String(h.path)
                       : h.file_path    != null ? String(h.file_path)   : undefined,
    snippet:             h.summary      != null ? String(h.summary).slice(0, 600)
                       : h.content      != null ? String(h.content).slice(0, 600) : undefined,
    score:               typeof h.hybrid_score   === 'number' ? h.hybrid_score
                       : typeof h.manifold_score === 'number' ? h.manifold_score
                       : typeof h.score          === 'number' ? h.score : undefined,
    topoClass:           h.topo_class   != null ? String(h.topo_class)  : undefined,
    clusterKey:          h.cluster_key  != null ? String(h.cluster_key) : undefined,
    graphAuthorityScore: typeof h.graph_authority_score === 'number' ? h.graph_authority_score : undefined,
    metadata:            {
      som_x:    h.som_bmu_col,
      som_y:    h.som_bmu_row,
      topoHex:  h.topo_hex,
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
  const body = await res.json() as { results?: { data?: { row?: unknown[] }[] }[]; errors?: { message?: string }[] };
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

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'trace-kag-tools', version: '1.0.0' });

// ── Tool registry for tools.batch_call ────────────────────────────────────────
// Capture every tool handler keyed by name so batch_call can dispatch by name
// without re-routing through MCP transport. Preserves the SDK's tool() API.
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
const toolRegistry = new Map<string, ToolHandler>();
const _origTool = server.tool.bind(server);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server as any).tool = (name: string, ...rest: any[]) => {
  const handler = rest[rest.length - 1];
  if (typeof handler === 'function') toolRegistry.set(name, handler as ToolHandler);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_origTool as any)(name, ...rest);
};

// ── graph.expand_neighborhood ─────────────────────────────────────────────────

server.tool(
  'graph.expand_neighborhood',
  {
    stableKey: z.string().describe('Stable key of the center node (e.g. "file:src/lib/server/ace/context-assembler.ts")'),
    depth:     z.number().int().min(1).max(3).default(2).describe('Hop depth (1–3)'),
    limit:     z.number().int().min(1).max(100).default(40).describe('Max neighbors returned'),
  },
  async ({ stableKey, depth, limit }) => {
    // Try SvelteKit traverse API first (has auth-free path)
    try {
      const data = await svelteGet(
        `/api/graph/traverse?nodeId=${encodeURIComponent(stableKey)}&mode=ego&depth=${depth}&limit=${limit}`
      ) as { nodes?: unknown[]; edges?: unknown[] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch {
      // Fall back to direct Neo4j
      const rows = await neo4jQuery(
        `MATCH (c {stableKey: $key})-[r*1..${depth}]-(n)
         RETURN DISTINCT n.stableKey AS stableKey, n.label AS label,
                labels(n)[0] AS nodeType, type(last(r)) AS lastRelation
         LIMIT $limit`,
        { key: stableKey, limit }
      );
      const neighbors = rows.map((d: { row?: unknown[] }) => ({
        stableKey: d.row?.[0],
        label:     d.row?.[1],
        nodeType:  d.row?.[2],
        relation:  d.row?.[3],
      }));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ center: stableKey, neighbors }, null, 2) }] };
    }
  }
);

// ── graph.shortest_path ───────────────────────────────────────────────────────

server.tool(
  'graph.shortest_path',
  {
    fromKey: z.string().describe('Source node stableKey'),
    toKey:   z.string().describe('Target node stableKey'),
    maxHops: z.number().int().min(1).max(8).default(5).describe('Maximum path length'),
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

// ── graph.community_for_node ──────────────────────────────────────────────────

server.tool(
  'graph.community_for_node',
  {
    stableKey: z.string().describe('Node stableKey to find community for'),
  },
  async ({ stableKey }) => {
    // Neo4j CodebaseFile nodes key on filePath (without "src/" prefix), not stableKey.
    // Accept multiple input shapes: "src/foo.ts", "foo.ts", "file:src/foo.ts:Symbol".
    const stripped = stableKey.replace(/^file:/, '').replace(/:[^/]*$/, '');
    const candidates = Array.from(new Set([
      stableKey,
      stripped,
      stripped.replace(/^src\//, ''),
      `src/${stripped}`,
    ]));
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
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        stableKey, error: 'no community found — node not in Neo4j',
      }, null, 2) }] };
    }
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          stableKey,
          filePath:        row[0],
          gpuCluster:      row[1],
          communityId:     row[2] ?? row[4],  // prefer node prop, fall back to relationship
          clusterNodeId:   row[3],
          clusterKey:      row[5],
        }, null, 2),
      }],
    };
  }
);

// ── graph.pagerank_top ────────────────────────────────────────────────────────

server.tool(
  'graph.pagerank_top',
  {
    limit:     z.number().int().min(1).max(50).default(20).describe('Number of top nodes'),
    nodeType:  z.string().optional().describe('Filter by Neo4j label, e.g. "CodebaseFile"'),
  },
  async ({ limit, nodeType }) => {
    // Redis cache stores raw file paths (no `codebasefile:` prefix); skip cache when
    // a label filter is supplied since Neo4j is the only source that carries labels.
    if (!nodeType) {
      try {
        const { default: Redis } = await import('ioredis');
        const redis = new Redis(REDIS_URL);
        const raw = (await redis.get('couchdb:pagerank_scores')) as string | null;
        await redis.quit();
        if (raw) {
          const scores: Record<string, number> = JSON.parse(raw);
          const entries = Object.entries(scores)
            .map(([k, v]) => ({ stableKey: k, pageRank: v }))
            .sort((a, b) => b.pageRank - a.pageRank)
            .slice(0, limit);
          return { content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }] };
        }
      } catch { /* fall through to Neo4j */ }
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
      pageRank:  d.row?.[1],
      label:     d.row?.[2],
    }));
    return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
  }
);

// ── topology.search_near ──────────────────────────────────────────────────────

server.tool(
  'topology.search_near',
  {
    query:      z.string().describe('Natural language query to embed and search'),
    radius:     z.number().min(0.01).max(1.0).default(0.25).describe('4D Euclidean radius'),
    limit:      z.number().int().min(1).max(50).default(20).describe('Max results'),
    somCluster: z.number().int().optional().describe('Optional SOM cluster filter'),
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

server.tool(
  'topology.same_som_cluster',
  {
    stableKey: z.string().describe('Reference node stableKey'),
    limit:     z.number().int().min(1).max(100).default(30).describe('Max results'),
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
    if (cluster == null) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Node not found in Postgres index' }) }] };

    const siblings = await pool.query<{ stable_key: string; rel_path: string; som_cluster: number }>(
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
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          referenceNode: stableKey,
          somCluster: cluster,
          members: siblings.rows,
        }, null, 2),
      }],
    };
  }
);

// ── topology.search_4d ───────────────────────────────────────────────────────
// Explicit 4D manifold coordinate search with optional JSONB payload filters.
// Use when you already know the SOM grid position and want structurally-adjacent
// files rather than starting from a text query.

server.tool(
  'topology.search_4d',
  {
    som_x:      z.number().describe('SOM X coordinate (BMU column, 0-based)'),
    som_y:      z.number().describe('SOM Y coordinate (BMU row, 0-based)'),
    semantic_z: z.number().min(0).max(1).default(0.5).optional().describe('Semantic centroid projection 0–1'),
    grpo_w:     z.number().min(0).max(1).default(0.5).optional().describe('GRPO quality weight 0–1'),
    radius:     z.number().min(0.01).max(5.0).default(0.5).describe('4D Euclidean radius'),
    limit:      z.number().int().min(1).max(50).default(20).describe('Max results'),
    filters:    z.record(z.string(), z.unknown()).optional().describe('JSONB payload filters (e.g. { "topo_class": "server" })'),
  },
  async ({ som_x, som_y, semantic_z, grpo_w, radius, limit, filters }) => {
    const t0 = Date.now();
    const cSomX      = clampNumber(som_x,           0,    255);
    const cSomY      = clampNumber(som_y,           0,    255);
    const cSemanticZ = clampNumber(semantic_z ?? 0.5, -1,    1, 0.5);
    const cGrpoW     = clampNumber(grpo_w     ?? 0.5, -1,    1, 0.5);
    const cRadius    = clampNumber(radius,         0.01,  5.0, 0.5);
    const cLimit     = clampNumber(limit,             1,   50, 10);
    const safeFilters = normalizeJsonFilter(filters);
    try {
      const body: Record<string, unknown> = {
        center: { som_x: cSomX, som_y: cSomY, semantic_z: cSemanticZ, grpo_w: cGrpoW },
        radius:  cRadius,
        limit:   cLimit,
      };
      if (safeFilters) body.filters = safeFilters;
      const res = await fetch(`${TOPO_URL}/search/4d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`topology /search/4d HTTP ${res.status}`);
      const raw = await res.json() as { hits?: Array<Record<string, unknown>>; results?: Array<Record<string, unknown>> };
      const normalized = normalizeTopologyHits(raw, Date.now() - t0);
      return { content: [{ type: 'text' as const, text: JSON.stringify(normalized, null, 2) }] };
    } catch (err) {
      const result: NormalizedRetrievalResult = {
        ok: false, source: 'topology', degraded: true,
        reason: String(err), hits: [], elapsedMs: Date.now() - t0,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  }
);

// ── clusters.get_members ──────────────────────────────────────────────────────

server.tool(
  'clusters.get_members',
  {
    clusterKey: z.string().describe('Cluster key (e.g. "gpu:998" or "dir:src/lib/server/ace")'),
    limit:      z.number().int().min(1).max(200).default(50).describe('Max files returned'),
  },
  async ({ clusterKey, limit }) => {
    // qdrant_cluster_members is the canonical cluster→file map (cluster_key="gpu:N"|"dir:..."|"som:N").
    // Falls back to codebase_chunk_index when membership table is empty by parsing the prefix.
    const rows = await pool.query<{ stable_key: string; rel_path: string; page_rank_score: number | null }>(
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
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ clusterKey, count: rows.rowCount, members: rows.rows }, null, 2),
      }],
    };
  }
);

// ── clusters.get_summary_lenses ───────────────────────────────────────────────

// ── trace.kag_search ──────────────────────────────────────────────────────────

server.tool(
  'trace.kag_search',
  {
    query:    z.string().max(4000).describe('Natural language question or search'),
    filePath: z.string().optional().describe('Optional file path for AGENTS.md-scoped context'),
    limit:    z.number().int().min(1).max(50).default(10).describe('Max chunks returned'),
  },
  async ({ query, filePath, limit }) => {
    const safeQuery = String(query ?? '').slice(0, 4000);
    const safeLimit = clampInt(limit, 1, 50, 10);
    const qHash     = hashQuery(safeQuery, safeLimit);
    const cacheKey  = aceHitsKey(qHash, safeLimit);

    // ── L1: Redis 24hr hit cache ──────────────────────────────────────────────
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);
      const cached = await redis.get(cacheKey).catch(() => null);
      await redis.quit();
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, unknown>;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ...parsed, cached: true }, null, 2),
          }],
        };
      }
    } catch { /* Redis unavailable — proceed to live retrieval */ }

    // ── L2: Go retrieval service (GPU embedding + JSONB cache, 5s budget) ────
    try {
      const goT0  = Date.now();
      const goRes = await fetch(`${GO_RETRIEVAL_URL}/search/codebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: safeQuery, limit: safeLimit }),
        signal: AbortSignal.timeout(5_000),
      });
      if (goRes.ok) {
        const goData = await goRes.json() as { results?: Array<Record<string, unknown>> };
        if (goData.results?.length) {
          const normalized = normalizeGoRetrievalHits(goData, safeQuery, goT0);
          import('ioredis').then(({ default: Redis }) => {
            const r = new Redis(REDIS_URL);
            r.setex(cacheKey, ACE_HITS_TTL, JSON.stringify(normalized)).catch(() => {});
            r.quit().catch(() => {});
          }).catch(() => {});
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify(normalized, null, 2),
            }],
          };
        }
      }
    } catch { /* fall through to SvelteKit */ }

    // ── L3: SvelteKit KAG-DAG pipeline (3s budget — fast-path only) ──────────
    try {
      const body: Record<string, unknown> = { query: safeQuery, limit: safeLimit };
      if (filePath) body.filePath = filePath;
      const svelteFetch = sveltePost('/api/code-intel/search', body);
      svelteFetch.catch(() => {}); // prevent UnhandledPromiseRejection if race abandons it
      const raw = await Promise.race([
        svelteFetch,
        new Promise<never>((_, r) => setTimeout(() => r(new Error('svelte-timeout')), 3_000)),
      ]) as unknown;
      const data = (raw as { data?: unknown[] }).data
        ?? (Array.isArray(raw) ? raw : []);
      const hits = (data as Record<string, unknown>[]).map(h => ({
        stable_key: h.stableKey ?? h.stable_key ?? '',
        file_path:  h.filePath  ?? h.file_path  ?? '',
        score:      typeof h.score === 'number' ? h.score : 0,
        content:    typeof h.content === 'string' ? h.content.slice(0, 600) : '',
        topo_class: h.topoClass ?? h.topo_class ?? '',
      }));
      const svelteResult = { success: true, data: hits, count: hits.length };
      import('ioredis').then(({ default: Redis }) => {
        const r = new Redis(REDIS_URL);
        r.setex(cacheKey, ACE_HITS_TTL, JSON.stringify(svelteResult)).catch(() => {});
        r.quit().catch(() => {});
      }).catch(() => {});
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(svelteResult, null, 2),
        }],
      };
    } catch { /* fall through to Postgres FTS */ }

    // ── L4: Postgres FTS fallback ─────────────────────────────────────────────
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query<{
          stable_key: string; rel_path: string; chunk_text: string;
          lexical_score: number; topo_class: string | null;
        }>(
          'SELECT * FROM search_code_lexical($1, $2, $3)',
          [safeQuery, safeLimit, null]
        );
        const hits = rows.map(r => ({
          stable_key: r.stable_key,
          file_path:  r.rel_path,
          score:      r.lexical_score,
          content:    (r.chunk_text ?? '').slice(0, 600),
          topo_class: r.topo_class ?? '',
        }));
        const ftsResult = { success: true, data: hits, count: hits.length, source: 'postgres_fts' };
        import('ioredis').then(({ default: Redis }) => {
          const r = new Redis(REDIS_URL);
          r.setex(cacheKey, ACE_HITS_TTL, JSON.stringify(ftsResult)).catch(() => {});
          r.quit().catch(() => {});
        }).catch(() => {});
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(ftsResult, null, 2),
          }],
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, data: [], error: String(err) }, null, 2),
        }],
      };
    }
  }
);

// ── trace.explain_retrieval ───────────────────────────────────────────────────

server.tool(
  'trace.explain_retrieval',
  {
    query: z.string().describe('Query string to look up cached retrieval trace for'),
  },
  async ({ query }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);
      // Look for the most recent ACE trace for this query prefix
      const keys = await redis.keys(`ace:trace:*`);
      let found: string | null = null;
      for (const k of keys.slice(0, 20)) {
        const val = await redis.get(k) as string | null;
        if (val?.includes(query.slice(0, 30))) { found = val; break; }
      }
      await redis.quit();
      return {
        content: [{
          type: 'text' as const,
          text: found
            ? JSON.stringify(JSON.parse(found), null, 2)
            : JSON.stringify({ message: 'No cached retrieval trace found for this query' }),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── search.postgres_fts ───────────────────────────────────────────────────────

server.tool(
  'search.postgres_fts',
  {
    query:      z.string().describe('Code search query — preserves camelCase, dots, file paths'),
    limit:      z.number().int().min(1).max(50).default(20).optional(),
    topo_class: z.string().optional().describe('Filter by topology class (e.g. "infrastructure", "ui")'),
  },
  async ({ query, limit = 20, topo_class }) => {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          'SELECT * FROM search_code_lexical($1, $2, $3)',
          [query, limit, topo_class ?? null]
        );
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ results: rows, count: rows.length, mode: 'lexical' }, null, 2),
          }],
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

server.tool(
  'search.hybrid',
  {
    query:      z.string().describe('Search query — mode is auto-detected from query shape'),
    limit:      z.number().int().min(1).max(50).default(20).optional(),
    topo_class: z.string().optional().describe('Optional topology class prefilter'),
    mode:       z.enum(['auto', 'lexical-heavy', 'hybrid', 'semantic-heavy']).default('auto').optional(),
  },
  async ({ query, limit = 20, topo_class, mode = 'auto' }) => {
    try {
      // Fan-out: FTS runs immediately; embedding runs in parallel and chains into Qdrant.
      // Total latency = max(FTS, embed + qdrant) instead of embed + max(FTS, qdrant).
      const ftsPromise = pool.query(
        'SELECT * FROM search_code_lexical($1, $2, $3)',
        [query, limit * 2, topo_class ?? null],
      );

      const embedPromise = getOrComputeEmbedding(query);

      const qdrantPromise = embedPromise.then(({ embedding }) => {
        if (!embedding.length) return { results: [] };
        return fetch(`${SVELTEKIT}/api/code-intel/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, embedding, limit: limit * 2, topoClass: topo_class }),
          signal: AbortSignal.timeout(10_000),
        }).then((r) => r.json()).catch(() => ({ results: [] }));
      });

      const [pgRes, qdrantRes, embedResult] = await Promise.all([ftsPromise, qdrantPromise, embedPromise]);
      const embedding = embedResult.embedding;
      const embedCached = embedResult.cached;

      // Merge by file_path as a best-effort stable_key
      const merged = new Map<string, Record<string, unknown>>();
      for (const r of pgRes.rows as Record<string, unknown>[]) {
        const key = String(r.stable_key ?? r.file_path);
        merged.set(key, { ...r, sources: ['postgres_fts'], final_score: Number(r.lexical_score ?? 0) * 0.45 });
      }
      for (const r of ((qdrantRes as { results?: Record<string, unknown>[] }).results ?? []) as Record<string, unknown>[]) {
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
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ results, count: results.length, mode, embedding_used: embedding.length > 0, embed_cache_hit: embedCached }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── search.go_hybrid ─────────────────────────────────────────────────────────
// Go search service RRF fusion: parallel fan-out of citation + FTS + pgvector +
// Qdrant → reciprocal rank fusion. Faster than the Node.js hybrid for bulk recall.
// Falls back gracefully when go-search-service is not running.

server.tool(
  'search.go_hybrid',
  {
    query:   z.string().describe('Search query — RRF fusion of FTS + pgvector + Qdrant via go-search-service'),
    limit:   z.number().int().min(1).max(50).default(20).optional(),
    type:    z.enum(['codebase', 'legal', 'hybrid']).default('codebase').optional().describe('Search domain'),
    filters: z.record(z.string(), z.unknown()).optional().describe('JSONB metadata filters applied at the Go service level'),
  },
  async ({ query, limit = 20, type = 'codebase', filters }) => {
    const t0 = Date.now();
    try {
      const safeQuery   = String(query ?? '').slice(0, 4000);
      const safeLimit   = clampNumber(limit, 1, 50, 10);
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
      const raw = await res.json() as { results?: Array<Record<string, unknown>>; hits?: Array<Record<string, unknown>> };
      const normalized = normalizeGoSearchHits(raw, query, t0);
      return { content: [{ type: 'text' as const, text: JSON.stringify(normalized, null, 2) }] };
    } catch (err) {
      const result: NormalizedRetrievalResult = {
        ok: false, source: 'go-search', degraded: true,
        reason: String(err), query, hits: [], elapsedMs: Date.now() - t0,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  }
);

// ── context.build_kv_packet ───────────────────────────────────────────────────

server.tool(
  'context.build_kv_packet',
  {
    taskId:         z.string().describe('Stable task identifier (e.g. "task_gpu_async_001")'),
    query:          z.string().describe('Natural language goal / task description'),
    hotFiles:       z.array(z.string()).default([]).describe('List of file paths most relevant to this task'),
    hotSymbols:     z.array(z.string()).default([]).describe('Key function/type names relevant to this task'),
    blockedAreas:   z.array(z.string()).default([]).describe('File paths or modules that must NOT be modified'),
    maxInputTokens: z.number().int().min(1000).max(32000).default(12000).optional().describe('Token budget for dynamic context'),
  },
  async ({ taskId, query, hotFiles, hotSymbols, blockedAreas, maxInputTokens = 12000 }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);

      // Build file cards in parallel (bounded to 8)
      const { compressFileToCard, buildAttentionToc } = await import('../lib/server/ai/context-compression.js').catch(() =>
        ({ compressFileToCard: async (f: string) => ({ stableKey: `file:${f}`, filePath: f, oneLineSummary: f, importantSymbols: [], knownRisks: [], recentTraceHits: [], retrievalReasons: [], score: 0 }),
           buildAttentionToc: async (id: string, files: string[], syms: string[], blocked: string[]) => ({ hotFiles: files, hotSymbols: syms, hotTools: ['search.hybrid'], blockedAreas: blocked, nextToolSuggestions: [] }) })
      );

      const fileCards = await Promise.all(hotFiles.slice(0, 8).map((f: string) => compressFileToCard(f).catch(() => ({ stableKey: `file:${f}`, filePath: f, oneLineSummary: f, importantSymbols: [], knownRisks: [], recentTraceHits: [], retrievalReasons: [], score: 0 }))));
      const toc       = await buildAttentionToc(taskId, hotFiles, hotSymbols, blockedAreas);

      const result = {
        taskId,
        stablePrefixHash: 'kvp_' + Buffer.from(taskId + query).toString('base64').slice(0, 12),
        level2Cards:      fileCards.length,
        toc,
        estimatedTokens:  fileCards.reduce((n, c) => n + Math.ceil(JSON.stringify(c).length / 4), 400),
        maxInputTokens,
      };

      // Cache TOC in Redis (1h)
      try {
        await redis.setex(`kv:toc:task:${taskId}`, 3600, JSON.stringify(result));
      } catch { /* non-fatal */ }
      await redis.quit();

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── context.get_compressed_card ───────────────────────────────────────────────

server.tool(
  'context.get_compressed_card',
  {
    stableKey: z.string().describe('Card stableKey — e.g. "file:src/lib/server/gpu/libtorch-bridge.ts" or "trace:<traceId>"'),
  },
  async ({ stableKey }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);
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
          const dirPath  = payload.split('/').slice(0, -1).join('/');
          let summary    = '';
          try {
            const wikiRaw = await redis.get(`wiki:note:dir:${dirPath}`);
            if (wikiRaw) {
              const w = JSON.parse(wikiRaw) as { summary?: string };
              summary = w.summary ?? wikiRaw.slice(0, 200);
            }
          } catch { /* no wiki */ }
          if (!summary) {
            const name = payload.split('/').pop()?.replace(/\.\w+$/, '') ?? payload;
            summary = `${name} — ${dirPath}`;
          }
          card = { stableKey, filePath: payload, oneLineSummary: summary, importantSymbols: [], knownRisks: [], score: 0.5 };
          await redis.setex(cacheKey, 86400, JSON.stringify(card)).catch(() => {});
        }
      } else if (type === 'trace') {
        const cacheKey = `kv:card:trace:${sha(payload)}`;
        const cached = await redis.get(cacheKey);
        card = cached ? JSON.parse(cached) : { stableKey, traceId: payload, oneLineSummary: `Trace: ${payload}`, topSources: [], cacheHit: false, durationMs: 0 };
      } else {
        card = { stableKey, error: `Unknown card type: ${type}. Supported: file, trace` };
      }

      await redis.quit();
      return { content: [{ type: 'text' as const, text: JSON.stringify(card, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── context.explain_compression ───────────────────────────────────────────────

server.tool(
  'context.explain_compression',
  {
    taskId: z.string().describe('Task ID to inspect (from a prior context.build_kv_packet call)'),
  },
  async ({ taskId }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);

      const raw = await redis.get(`kv:toc:task:${taskId}`);
      await redis.quit();

      if (!raw) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ taskId, status: 'no-packet-found', hint: 'Call context.build_kv_packet first.' }),
          }],
        };
      }

      const packet = JSON.parse(raw) as Record<string, unknown>;
      const explain = {
        taskId:           packet.taskId ?? taskId,
        stablePrefixHash: packet.stablePrefixHash,
        level2Cards:      packet.level2Cards ?? 0,
        toc:              packet.toc,
        estimatedTokens:  packet.estimatedTokens,
        maxInputTokens:   packet.maxInputTokens,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(explain, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── context.refresh_task_toc ──────────────────────────────────────────────────

server.tool(
  'context.refresh_task_toc',
  {
    taskId:       z.string().describe('Task ID to refresh'),
    hotFiles:     z.array(z.string()).default([]).describe('Updated hot file list'),
    hotSymbols:   z.array(z.string()).default([]).describe('Updated hot symbol list'),
    blockedAreas: z.array(z.string()).default([]).describe('Areas to block from modification'),
  },
  async ({ taskId, hotFiles, hotSymbols, blockedAreas }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);

      // Invalidate existing TOC
      await redis.del(`kv:toc:task:${taskId}`).catch(() => {});

      const newToc = {
        hotFiles:   hotFiles.slice(0, 8),
        hotSymbols: hotSymbols.slice(0, 12),
        hotTools:   ['search.hybrid', 'trace.kag_search', 'graph.expand_neighborhood', 'context.get_compressed_card'],
        blockedAreas,
        nextToolSuggestions: ['context.get_compressed_card — expand a hot file', 'search.hybrid — find related files'],
      };

      await redis.setex(`kv:toc:task:${taskId}`, 3600, JSON.stringify({ taskId, toc: newToc })).catch(() => {});
      await redis.quit();

      return { content: [{ type: 'text' as const, text: JSON.stringify({ taskId, refreshed: true, toc: newToc }, null, 2) }] };
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

server.tool(
  'search.dev_context',
  {
    query:      z.string().max(2000).describe('Natural language coding/debugging query'),
    filePath:   z.string().optional().describe('Current file path for AGENTS.md-scoped boost'),
    limit:      z.number().int().min(1).max(20).default(8).describe('Max chunks returned (default 8)'),
    topo_class: z.string().optional().describe('Optional topology-class prefilter'),
  },
  async ({ query, filePath, limit, topo_class }) => {
    // ── Try SvelteKit ACE pipeline first ─────────────────────────────────────
    try {
      // Precompute embedding once (Redis-cached) so the SvelteKit endpoint
      // skips its own embed call when this is a repeat query.
      const { embedding } = await getOrComputeEmbedding(query);

      const body: Record<string, unknown> = { query, limit, mode: 'dev_context' };
      if (filePath)         body.filePath  = filePath;
      if (topo_class)       body.topoClass = topo_class;
      if (embedding.length) body.embedding = embedding;

      const svelteFetch = sveltePost('/api/code-intel/search', body);
      svelteFetch.catch(() => {}); // prevent UnhandledPromiseRejection if race abandons it
      const raw = await Promise.race([
        svelteFetch,
        new Promise<never>((_, r) => setTimeout(() => r(new Error('svelte-timeout')), 5_000)),
      ]) as unknown;
      const data = (raw as { results?: unknown[] }).results
        ?? (Array.isArray(raw) ? raw : []);

      // Truncate content fields to ≤600 chars (MCP result size budget)
      const hits = (data as Record<string, unknown>[]).map(h => ({
        stable_key: h.stableKey ?? h.stable_key ?? '',
        file_path:  h.filePath  ?? h.file_path  ?? h.relPath ?? '',
        score:      typeof h.score === 'number' ? h.score : (h.finalScore ?? 0),
        content:    typeof h.content === 'string' ? h.content.slice(0, 600)
                  : typeof h.chunk  === 'string' ? h.chunk.slice(0, 600)  : '',
        topo_class: h.topoClass ?? h.topo_class ?? '',
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, data: hits, count: hits.length }, null, 2),
        }],
      };
    } catch { /* fall through to Postgres FTS */ }

    // ── Postgres FTS fallback ─────────────────────────────────────────────────
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query<{
          stable_key: string; rel_path: string; chunk_text: string;
          lexical_score: number; topo_class: string | null;
        }>(
          'SELECT * FROM search_code_lexical($1, $2, $3)',
          [query, limit, topo_class ?? null]
        );
        const hits = rows.map(r => ({
          stable_key: r.stable_key,
          file_path:  r.rel_path,
          score:      r.lexical_score,
          content:    (r.chunk_text ?? '').slice(0, 600),
          topo_class: r.topo_class ?? '',
        }));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, data: hits, count: hits.length, source: 'postgres_fts' }, null, 2),
          }],
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, data: [], error: String(err) }, null, 2),
        }],
      };
    }
  }
);

// ── kag.record_agent_run ─────────────────────────────────────────────────────
// Writes a structured agent-run artifact to memory/runs/ and queues a JSONL
// record for ingestion. Called by Gemma4 at the end of a coding/debug session
// or when the stuck detector fires.

server.tool(
  'kag.record_agent_run',
  {
    taskId:           z.string().max(80).describe('Stable task identifier (e.g. "kag-abc12345" or a short slug)'),
    errorSummary:     z.string().max(1000).describe('One-paragraph summary of the error or task'),
    files:            z.array(z.string().max(300)).max(20).optional().describe('File paths involved'),
    tags:             z.array(z.string().max(60)).max(20).optional().describe('Semantic tags'),
    confidence:       z.number().min(0).max(1).default(0.5).describe('Resolution confidence 0–1'),
    patchResult:      z.enum(['passed', 'failed', 'unknown']).default('unknown').describe('Patch outcome'),
    researchNotes:    z.string().max(2000).optional().describe('Free-text research findings or next steps'),
    needsDeepResearch: z.boolean().default(false).describe('True when agent is stuck and needs escalation'),
  },
  async ({ taskId, errorSummary, files, tags, confidence, patchResult, researchNotes, needsDeepResearch }) => {
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const { join }  = await import('node:path');
      const { createHash } = await import('node:crypto');

      const date    = new Date().toISOString().slice(0, 10);
      // Resolve root relative to this file's location (src/mcp/ → ../../memory/)
      const root    = join(import.meta.dirname ?? process.cwd(), '..', '..', 'memory');
      const runDir  = join(root, 'runs', date, taskId);
      const pendDir = join(root, 'ingest', 'pending');
      const hash    = createHash('sha1').update(taskId).digest('hex').slice(0, 8);

      mkdirSync(runDir,  { recursive: true });
      mkdirSync(pendDir, { recursive: true });

      const ts = new Date().toISOString();

      const runJson = {
        type: 'agent_run', id: taskId, hash, errorSummary,
        files: files ?? [], tags: tags ?? [], confidence, patchResult,
        researchNotes: researchNotes ?? '',
        needsDeepResearch, generated_at: ts,
        recommended_actions: needsDeepResearch
          ? ['Trigger deep_research MCP task', 'Check error pattern in prior fixes', 'Review graph neighborhood for related failures']
          : ['Verify fix with smoke tests', 'Ingest artifacts: kag.ingest_memory_directory'],
      };

      const md = `# Agent Run: ${taskId}\n\n**Date**: ${ts}\n**Confidence**: ${confidence}\n**Patch**: ${patchResult}\n\n## Summary\n${errorSummary}\n\n${files?.length ? `## Files\n${files.map(f => `- \`${f}\``).join('\n')}\n\n` : ''}${researchNotes ? `## Research notes\n${researchNotes}\n\n` : ''}## Tags\n${(tags ?? []).join(' · ') || '_none_'}\n\n${needsDeepResearch ? '> ⚠ **Stuck** — deep research required\n\n' : ''}_Generated by kag.record_agent_run_\n`;

      const jsonl = JSON.stringify({
        type: 'agent_run', id: taskId, summary: errorSummary.slice(0, 300),
        tags: tags ?? [], files: (files ?? []).slice(0, 8), confidence, patchResult,
        needsDeepResearch, generated_at: ts,
      });

      writeFileSync(join(runDir, 'run.json'),  JSON.stringify(runJson, null, 2));
      writeFileSync(join(runDir, 'run.md'),    md);
      writeFileSync(join(pendDir, `${taskId}.jsonl`), jsonl);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true, taskId, hash, date,
            artifactPath: `memory/runs/${date}/${taskId}/`,
            pendingIngest: `memory/ingest/pending/${taskId}.jsonl`,
            needsDeepResearch,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, error: String(err) }, null, 2),
        }],
      };
    }
  }
);

// ── kag.ingest_memory_directory ───────────────────────────────────────────────
// Reads ALL lines from each JSONL in pending/, dispatches by record type,
// writes to Postgres context_timeline + Redis ACE caches, moves to processed/.
// Idempotent: skips records already written (kag:ingested:{hash} Redis key).

server.tool(
  'kag.ingest_memory_directory',
  {
    dir:           z.string().max(300).optional().describe('Override ingest directory (default: memory/ingest/pending/)'),
    dryRun:        z.boolean().default(false).describe('Preview counts without writing anything'),
    limit:         z.number().int().min(1).max(200).default(25).describe('Max JSONL files to process per call'),
    moveProcessed: z.boolean().default(true).describe('Move files to processed/ or failed/ after handling'),
  },
  async ({ dir, dryRun, limit, moveProcessed }) => {
    try {
      const { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { createHash } = await import('node:crypto');
      const { default: Redis } = await import('ioredis');

      const root    = join(import.meta.dirname ?? process.cwd(), '..', '..', 'memory');
      const pendDir = dir ?? join(root, 'ingest', 'pending');
      const doneDir = join(root, 'ingest', 'processed');
      const failDir = join(root, 'ingest', 'failed');

      if (!existsSync(pendDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, scanned: 0, ingested: 0, skipped: 0, failed: 0, note: 'pending dir missing' }) }] };
      }
      if (!dryRun) {
        mkdirSync(doneDir, { recursive: true });
        mkdirSync(failDir, { recursive: true });
      }

      const REDIS_URL_ENV = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
      let redis: InstanceType<typeof Redis> | null = null;
      try {
        redis = new Redis(REDIS_URL_ENV, { lazyConnect: true, connectTimeout: 4_000, commandTimeout: 4_000 });
        await redis.connect();
      } catch { redis = null; }

      const allFiles = readdirSync(pendDir).filter(f => f.endsWith('.jsonl'));
      const batch    = allFiles.slice(0, limit);

      let ingested = 0;
      let skipped  = 0;
      let failed   = 0;
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
      const fileErrors   = new Map<string, string>();

      for (const file of batch) {
        const src = join(pendDir, file);
        try {
          const raw   = readFileSync(src, 'utf8');
          const lines = raw.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
          const records: ParsedRec[] = [];
          for (const line of lines) {
            let rec: Record<string, unknown>;
            try { rec = JSON.parse(line) as Record<string, unknown>; }
            catch { failed++; continue; }
            const recType    = (rec.type as string | undefined) ?? '';
            const sourceKind = (rec.source_kind as string | undefined) ?? '';
            const stableKey  = (rec.stable_key as string | undefined) ?? (rec.id as string | undefined) ?? line.slice(0, 80);
            const idHash     = createHash('sha1').update(stableKey).digest('hex').slice(0, 12);
            records.push({ rec, recType, sourceKind, stableKey, idHash, idempKey: `kag:ingested:${idHash}`, file });
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
            const pipe  = redis.pipeline();
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
          const slice   = allRecords.slice(i, i + CHUNK);
          const pipe    = redis ? redis.pipeline() : null;
          let chunkIngest = 0;

          for (const { rec, recType, sourceKind, stableKey, idHash, idempKey } of slice) {
            if (alreadyIngested.has(idHash)) { skipped++; continue; }

            try {
              if (recType === 'error') {
                pgRows.push(['error_ingested', 'kag', '',
                  JSON.stringify({ id: rec.id, summary: rec.summary, tags: rec.tags,
                    files: rec.files, confidence: rec.confidence,
                    needsDeepResearch: rec.needsDeepResearch,
                    source_file: (rec as any).__file ?? '', ingested_at: now })]);
                if (pipe) pipe.setex(`ace:error:${idHash}`, 86_400, JSON.stringify({
                  id: rec.id, summary: rec.summary,
                  tags:  Array.isArray(rec.tags)  ? rec.tags  : [],
                  files: Array.isArray(rec.files) ? rec.files : [],
                  confidence: rec.confidence ?? 0.5,
                  needsDeepResearch: rec.needsDeepResearch ?? false,
                  ingested_at: now,
                }));
                // P0-C: persist to error_fingerprints table for hash + n-gram lane recall
                if (redis && rec.summary && typeof rec.summary === 'string') {
                  import('../lib/server/ace/error-fingerprint.js').then(({ storeErrorFingerprint }) => {
                    storeErrorFingerprint(redis!, pool, rec.summary as string).catch(() => {});
                  }).catch(() => {});
                }

              } else if (recType === 'agent_run') {
                pgRows.push(['agent_run_ingested', 'kag', '',
                  JSON.stringify({ id: rec.id, summary: rec.summary, tags: rec.tags,
                    files: rec.files, confidence: rec.confidence, patchResult: rec.patchResult,
                    needsDeepResearch: rec.needsDeepResearch,
                    source_file: (rec as any).__file ?? '', ingested_at: now })]);
                if (pipe) pipe.setex(`ace:agent:${idHash}`, 86_400, JSON.stringify({
                  id: rec.id, summary: rec.summary, confidence: rec.confidence,
                  patchResult: rec.patchResult, ingested_at: now,
                }));

              } else if (sourceKind === 'graphify_deep_imports') {
                const srcType = (rec.source_type as string | undefined) ?? '';
                const ttl = 43_200;
                if (pipe) {
                  if (srcType === 'node_summary') {
                    pipe.setex(`code:graph:node:${idHash}`, ttl, JSON.stringify({
                      file_path: rec.file_path, zone: rec.zone,
                      directFanIn: rec.directFanIn, directFanOut: rec.directFanOut,
                      upstreamNodeCount: rec.upstreamNodeCount,
                      downstreamNodeCount: rec.downstreamNodeCount,
                      text: rec.text, stable_key: stableKey,
                    }));
                  } else if (srcType === 'hotspot_callers') {
                    pipe.setex(`code:graph:hotspot:${idHash}`, ttl, JSON.stringify({
                      file_path: rec.file_path, zone: rec.zone,
                      directFanIn: rec.directFanIn, topCallers: rec.topCallers,
                      text: rec.text, stable_key: stableKey,
                    }));
                  }
                }
                // graphify bulk records: skip per-row Postgres to stay under timeout

              } else if (recType === 'ace_hit') {
                if (pipe) pipe.setex(`ace:hit:${idHash}`, 86_400, JSON.stringify(rec));
              }
              // else: unknown type — skip silently

              if (pipe) pipe.setex(idempKey, 604_800, '1');
              chunkIngest++;
            } catch { failed++; }
          }

          if (pipe) {
            try { await pipe.exec(); } catch { /* non-fatal — will re-ingest next run */ }
          }
          ingested += chunkIngest;
        }

        // ── Postgres batch: error + agent_run rows only (small count) ─────────
        for (const [eventType, pipeline, sessionId, payload] of pgRows) {
          try {
            await pool.query(
              `INSERT INTO context_timeline (event_type, pipeline, session_id, payload)
               VALUES ($1, $2, $3, $4::jsonb)`,
              [eventType, pipeline, sessionId, payload],
            );
          } catch { /* Postgres down or migration pending — non-fatal */ }
        }
      }

      // ── Move files ───────────────────────────────────────────────────────────
      for (const file of batch) {
        const src   = join(pendDir, file);
        const fileOk = !fileErrors.has(file);

        if (!dryRun && moveProcessed) {
          if (fileOk) {
            try { renameSync(src, join(doneDir, file)); processedFiles.push(file); }
            catch (mvErr) { failedFiles.push({ path: file, reason: `move failed: ${mvErr}` }); }
          } else {
            const fileReason = fileErrors.get(file) ?? 'unknown error';
            try {
              writeFileSync(join(failDir, file + '.report.json'), JSON.stringify({ file, reason: fileReason }));
              renameSync(src, join(failDir, file));
            } catch { /* ignore */ }
            failedFiles.push({ path: file, reason: fileReason });
          }
        }
      }

      if (redis) await redis.quit().catch(() => {});

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true, dryRun,
            scanned: batch.length,
            totalPending: allFiles.length,
            ingested,
            skipped,
            failed,
            processedFiles,
            failedFiles,
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: false, error: String(err) }, null, 2),
        }],
      };
    }
  }
);

// ── kag.ingest_error ──────────────────────────────────────────────────────────
// Normalize + fingerprint raw error text, store in Redis ace:error:{hash} and
// Postgres error_fingerprints, fire-and-forget. Returns the fingerprint.

server.tool(
  'kag.ingest_error',
  {
    errorText: z.string().max(8000).describe('Raw error text: stack trace, compiler output, log line'),
    priorFix:  z.string().max(2000).optional().describe('Known fix for this error if already resolved'),
  },
  async ({ errorText, priorFix }) => {
    try {
      const { storeErrorFingerprint } = await import('../lib/server/ace/error-fingerprint.js');
      const Redis = (await import('ioredis')).default;
      const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
        lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});
      const fp = await storeErrorFingerprint(r, pool, errorText, priorFix);
      await r.quit().catch(() => {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(fp, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }] };
    }
  }
);

// ── kag.multi_lane_search ─────────────────────────────────────────────────────
// 4-lane retrieval: hash → n-gram → graph-node → ACE cache.
// Returns ranked hits + synthesisBlock ready for LLM context injection.

server.tool(
  'kag.multi_lane_search',
  {
    query:   z.string().max(4000).describe('Query text, error message, or symbol/file name'),
    isError: z.boolean().default(false).describe('Treat query as an error fingerprint (enables hash lane)'),
    topK:    z.number().int().min(1).max(30).default(10).describe('Hits per lane'),
  },
  async ({ query, isError, topK }) => {
    try {
      const { multiLaneSearch } = await import('../lib/server/ace/multi-lane-retrieval.js');
      const Redis = (await import('ioredis')).default;
      const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
        lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});
      const result = await multiLaneSearch(r, pool, { text: query, isError, topK });
      await r.quit().catch(() => {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }] };
    }
  }
);

// ── taxonomy.children ─────────────────────────────────────────────────────────
// Walk the topological ontology one level down from a parent node.
// Hierarchy: root → topo_class (L1) → topo_byte (L2) → cluster (L3) → file (L4).
// Backed by the taxonomy_nodes / taxonomy_edges tables built by
// `npm run taxonomy:build`. Read-through Redis cache for hot levels.

server.tool(
  'taxonomy.children',
  {
    parent_key: z.string().min(1).max(200).describe(
      'Parent node_key. "root" lists all topo_classes. "topo:api-route" lists topo_bytes within api-route. "byte:api-route:18" lists files. Empty string = root.',
    ),
    limit: z.number().int().min(1).max(500).default(50).optional(),
  },
  async ({ parent_key, limit = 50 }) => {
    const key = parent_key === '' ? 'root' : parent_key;
    try {
      // Try Redis first
      const r = await getEmbedRedis();
      const cached = await r.get(`taxonomy:children:${key}`).catch(() => null);
      if (cached) {
        const arr = JSON.parse(cached) as Array<{ node_key: string; level: number; display_name: string; member_count: number }>;
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          parent: key, source: 'redis', count: Math.min(arr.length, limit),
          children: arr.slice(0, limit),
        }, null, 2) }] };
      }
      // Fall through to Postgres
      const { rows } = await pool.query<{ node_key: string; level: number; display_name: string; member_count: number; metadata: Record<string, unknown> }>(
        `SELECT node_key, level, display_name, member_count, metadata
         FROM taxonomy_nodes
         WHERE parent_key = $1
         ORDER BY member_count DESC NULLS LAST, display_name ASC
         LIMIT $2`,
        [key, limit],
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        parent: key, source: 'postgres', count: rows.length, children: rows,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: String(err).slice(0, 200), parent: key,
      }) }] };
    }
  },
);

// ── taxonomy.path ─────────────────────────────────────────────────────────────
// Walk UP from a leaf node to root, returning the full ontological path.
// Useful for "what category does this file belong to?" queries.

server.tool(
  'taxonomy.path',
  {
    node_key: z.string().min(1).max(500).describe('Leaf node_key (e.g. "file:src/foo.ts")'),
  },
  async ({ node_key }) => {
    try {
      const { rows } = await pool.query<{ node_key: string; level: number; parent_key: string | null; display_name: string }>(
        `WITH RECURSIVE up AS (
           SELECT node_key, level, parent_key, display_name, 0 AS depth
           FROM taxonomy_nodes WHERE node_key = $1
           UNION ALL
           SELECT n.node_key, n.level, n.parent_key, n.display_name, up.depth + 1
           FROM taxonomy_nodes n
           JOIN up ON n.node_key = up.parent_key
         )
         SELECT node_key, level, parent_key, display_name FROM up ORDER BY depth DESC`,
        [node_key],
      );
      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({
          error: 'node not found in taxonomy', node_key,
        }) }] };
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        node: node_key, depth: rows.length, path: rows,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: String(err).slice(0, 200), node_key,
      }) }] };
    }
  },
);

// ── agents_md.peers_via_relations ────────────────────────────────────────────
// DB-backed sibling lookup via agent_context_relations.SHARES_TAGS edges.
// Complements the canonical `agents_md.peers_for_dir` (Redis atlas card) by
// answering "AGENTS.md dirs that share TAGS with this dir" — falls back to
// sibling directories when SHARES_TAGS edges are sparse (pre-P0.2 envelope
// JSON state). Both tools coexist under distinct names per MCP 2026 FQN
// best-practice (last-registered-wins is silent → rename, don't override).

server.tool(
  'agents_md.peers_via_relations',
  {
    dirPath: z.string().min(1).max(500).describe('Directory (e.g. "src/lib/server/ace")'),
    limit:   z.number().int().min(1).max(20).default(8).optional(),
  },
  async ({ dirPath, limit = 8 }) => {
    try {
      const stable = `agents:${dirPath.replace(/^src\//, 'src/')}/AGENTS.md`;
      const { rows } = await pool.query<{ target_key: string; relation: string; weight: number }>(
        `SELECT target_key, relation, weight
         FROM agent_context_relations
         WHERE source_key = $1 AND relation = 'SHARES_TAGS'
         ORDER BY weight DESC
         LIMIT $2`,
        [stable, limit],
      );
      const peers = rows.map(r => ({ peer: r.target_key, weight: r.weight, source: 'shares_tags' as const }));
      // SHARES_TAGS empty → sibling fallback (envelope still sparse)
      if (peers.length === 0) {
        const parent = dirPath.split('/').slice(0, -1).join('/');
        const { rows: sib } = await pool.query<{ stable_key: string; directory_path: string }>(
          `SELECT stable_key, directory_path
           FROM agent_context_files
           WHERE directory_path LIKE $1 || '/%' AND directory_path != $2
           ORDER BY directory_path
           LIMIT $3`,
          [parent, dirPath, limit],
        );
        for (const s of sib) peers.push({ peer: s.stable_key, weight: 0.5, source: 'sibling-fallback' as const });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ dirPath, peers }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: String(err).slice(0, 300), dirPath,
      }) }] };
    }
  },
);

// ── agents_md.coverage_chain ─────────────────────────────────────────────────
// Walk-up inheritance chain from directory_context_bindings — every binding
// row from leaf → root, ordered by (priority DESC, depth ASC). Complements
// the canonical `agents_md.coverage` (envelope completeness probe) by
// answering "WHICH AGENTS.md rules apply to this file, in what priority?".

server.tool(
  'agents_md.coverage_chain',
  {
    filePath: z.string().min(1).max(500).describe('Repo-relative file path'),
  },
  async ({ filePath }) => {
    try {
      const { rows } = await pool.query<{ agent_context_key: string; directory_path: string; binding_type: string; depth: number; priority: number; confidence: number }>(
        `SELECT agent_context_key, directory_path, binding_type, depth, priority, confidence
         FROM directory_context_bindings
         WHERE $1 LIKE directory_path || '/%' OR directory_path = $1
         ORDER BY priority DESC, depth ASC, length(directory_path) DESC`,
        [filePath],
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        filePath,
        chain: rows,
        count: rows.length,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: String(err).slice(0, 300), filePath,
      }) }] };
    }
  },
);

// NOTE: The older `codebase.context_for_file` / `agents_md.context_for_file`
// implementations (deleted) had genuine bugs: `scopeToCluster` was passed to
// contextForFile() which doesn't accept it (silently ignored), and
// `parentAgents` doesn't exist on the CodebaseContextForFile.directory
// interface (always undefined). Their semantic intent is fully covered by
// the canonical block at ~line 2399 — not re-adding under aliased names
// since they'd just produce inferior copies of the same output.

// ── clusters.get_summary_lenses ───────────────────────────────────────────────
// Returns AGENTS.md notes and wiki KAG notes for a given GPU cluster.

server.tool(
  'clusters.get_summary_lenses',
  {
    clusterId: z.number().int().min(0).describe('GPU k-means cluster ID'),
    maxNotes:  z.number().int().min(1).max(20).default(5).describe('Max wiki/KAG notes to include'),
  },
  async ({ clusterId, maxNotes }) => {
    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
        lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: () => null,
      });
      r.on('error', () => {});
      await r.connect().catch(() => {});

      // Qdrant cluster members (top 5 files by pageRank)
      const memberRows = await pool.query<{ file_path: string }>(
        `SELECT DISTINCT metadata->>'file_path' AS file_path
         FROM codebase_chunks
         WHERE (metadata->>'neo4j_gpuCluster')::int = $1
         ORDER BY (metadata->>'neo4j_pageRankScore')::float DESC NULLS LAST
         LIMIT 5`,
        [clusterId]
      ).catch(() => ({ rows: [] as { file_path: string }[] }));
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
        } catch { /* skip malformed */ }
      }

      await r.quit().catch(() => {});
      return { content: [{ type: 'text' as const, text: JSON.stringify({ clusterId, keyFiles, kagNotes: notes }) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }] };
    }
  }
);

// ── trace.validate_ace_hit ────────────────────────────────────────────────────
// Validates whether a retrieved chunk is a true ACE hit by checking the
// cache key contract, Qdrant payload freshness, and rerank breakdown presence.

server.tool(
  'trace.validate_ace_hit',
  {
    filePath:  z.string().max(512).describe('File path of the retrieved chunk'),
    chunkId:   z.string().max(128).optional().describe('Qdrant chunk ID if known'),
    queryHash: z.string().max(64).optional().describe('SHA-256 hash prefix of the original query (12 chars)'),
  },
  async ({ filePath, chunkId, queryHash }) => {
    try {
      const Redis = (await import('ioredis')).default;
      const r = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
        lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2000, retryStrategy: () => null,
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
        try { checks.graphNodeMeta = JSON.parse(nodeRaw); } catch { /* skip */ }
      }

      // Check 4: chunk in Postgres code_relations
      // Schema: code_relations(source_file, target_key, ...). target_key is "file:<path>:<symbol>" form,
      // so a path match needs a prefix LIKE on target_key.
      const relCount = await pool.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM code_relations
         WHERE source_file = $1 OR target_key LIKE 'file:' || $1 || '%'`,
        [filePath]
      ).catch(() => ({ rows: [{ cnt: '0' }] }));
      checks.codeRelationsEdges = parseInt(relCount.rows[0]?.cnt ?? '0', 10);

      await r.quit().catch(() => {});
      return { content: [{ type: 'text' as const, text: JSON.stringify({ filePath, chunkId, checks }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err) }) }] };
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
server.tool(
  'ops.propose_patch',
  {
    operator_token: z.string().describe('Non-empty approval token'),
    file_path:      z.string().describe('Repo-relative file path to inspect'),
    issue:          z.string().describe('Description of the issue to fix'),
    context_lines:  z.number().int().min(5).max(200).optional().describe('Lines of context to return (default 40)'),
  },
  async ({ operator_token, file_path, issue, context_lines }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }] };

    const safeFile = String(file_path ?? '').replace(/\.\./g, '').slice(0, 500);
    const safeIssue = String(issue ?? '').slice(0, 1000);
    const maxLines  = clampNumber(context_lines, 5, 200, 40);

    try {
      const absPath = _resolvePath(process.cwd(), safeFile);
      const raw = _readFileSync(absPath, 'utf8');
      const lines = raw.split('\n');
      const preview = lines.slice(0, maxLines).join('\n');
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            file_path: safeFile,
            total_lines: lines.length,
            preview_lines: maxLines,
            issue: safeIssue,
            preview,
            instruction: 'Review the preview. To apply a fix, call ops.record_fix_attempt with fixDiff describing the change, then apply it using your editor or git.',
          }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }] };
    }
  }
);

// ── ops.run_targeted_test ─────────────────────────────────────────────────────
server.tool(
  'ops.run_targeted_test',
  {
    operator_token: z.string().describe('Non-empty approval token'),
    test_file:      z.string().describe('Path to the test file relative to project root, e.g. tests/foo.spec.ts'),
    timeout_ms:     z.number().int().min(5000).max(120000).optional().describe('Max wait in ms (default 30000)'),
  },
  async ({ operator_token, test_file, timeout_ms }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }] };

    const safeFile = String(test_file ?? '').replace(/\.\./g, '').slice(0, 500);
    if (!safeFile.match(/\.(spec|test)\.[cm]?[jt]s$/)) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'test_file must end with .spec.ts / .test.ts (no path traversal)' }) }] };
    }

    const timeoutMs = clampNumber(timeout_ms, 5000, 120000, 30000);
    const t0 = Date.now();

    try {
      const { stdout, stderr } = await execFileAsync(
        'npx', ['vitest', 'run', safeFile, '--reporter=verbose'],
        { cwd: process.cwd(), timeout: timeoutMs }
      );
      const elapsed = Date.now() - t0;
      const passed  = /\d+ passed/.test(stdout);
      const failed  = /\d+ failed/.test(stdout);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: !failed,
            test_file: safeFile,
            passed,
            failed,
            durationMs: elapsed,
            stdout: stdout.slice(-4000),
            stderr: stderr.slice(-1000),
          }, null, 2),
        }],
      };
    } catch (err: unknown) {
      const ex = err as { stdout?: string; stderr?: string; message?: string };
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: false,
            test_file: safeFile,
            durationMs: Date.now() - t0,
            error:  (ex?.message ?? String(err)).slice(0, 300),
            stdout: (ex?.stdout ?? '').slice(-3000),
            stderr: (ex?.stderr ?? '').slice(-1000),
          }, null, 2),
        }],
      };
    }
  }
);

// ── ops.record_fix_attempt ────────────────────────────────────────────────────
server.tool(
  'ops.record_fix_attempt',
  {
    operator_token:  z.string().describe('Non-empty approval token'),
    fix_type:        z.string().max(100).describe('Category of fix, e.g. "type-error", "logic-bug"'),
    fix_description: z.string().max(2000).describe('Human-readable description of the proposed fix'),
    fix_diff:        z.string().max(8000).optional().describe('Unified diff or summary of the change'),
    files_affected:  z.number().int().min(0).optional().describe('Number of files the fix touches (default 1)'),
    errors_resolved: z.number().int().min(0).optional().describe('Estimated errors this fix resolves (default 1)'),
    success:         z.boolean().optional().describe('Whether the fix was verified to work (omit if unknown)'),
    metadata:        z.record(z.string(), z.unknown()).optional().describe('Extra context (e.g. test result, issue ID)'),
  },
  async ({ operator_token, fix_type, fix_description, fix_diff, files_affected, errors_resolved, success, metadata }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }] };

    const safeType = String(fix_type ?? '').slice(0, 100);
    const safeDesc = String(fix_description ?? '').slice(0, 2000);
    const safeDiff = fix_diff != null ? String(fix_diff).slice(0, 8000) : null;
    const nFiles   = clampNumber(files_affected, 0, 9999, 1);
    const nErrors  = clampNumber(errors_resolved, 0, 9999, 1);
    const safeOk   = typeof success === 'boolean' ? success : null;
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
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ ok: true, fix_attempt_id: id, fix_type: safeType, files_affected: nFiles }),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 300) }) }] };
    }
  }
);

// ── ops.run_quality_gate ──────────────────────────────────────────────────────
server.tool(
  'ops.run_quality_gate',
  {
    operator_token: z.string().describe('Non-empty approval token'),
    gate:           z.enum(['tsc', 'vitest-all']).optional().describe('tsc (default) or vitest-all to run full test suite'),
    timeout_ms:     z.number().int().min(5000).max(300000).optional().describe('Max wait in ms (default 60000)'),
  },
  async ({ operator_token, gate, timeout_ms }) => {
    const tokenErr = requireToken(operator_token);
    if (tokenErr) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: tokenErr }) }] };

    const safeGate = String(gate ?? 'tsc') === 'vitest-all' ? 'vitest-all' : 'tsc';
    const timeoutMs = clampNumber(timeout_ms, 5000, 300000, 60000);
    const t0 = Date.now();

    const [cmd, args] = safeGate === 'vitest-all'
      ? ['npx', ['vitest', 'run', '--reporter=verbose']]
      : ['npx', ['tsc', '--noEmit', '--skipLibCheck']];

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: process.cwd(), timeout: timeoutMs });
      const elapsed    = Date.now() - t0;
      const errorMatch = /Found (\d+) errors?/.exec(stdout + stderr);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: true, gate: safeGate, passed: true, errorCount, durationMs: elapsed,
            output: (stdout + stderr).slice(-3000),
          }, null, 2),
        }],
      };
    } catch (err: unknown) {
      const ex = err as { stdout?: string; stderr?: string; message?: string };
      const combined = (ex?.stdout ?? '') + (ex?.stderr ?? '');
      const elapsed  = Date.now() - t0;
      const errorMatch = /Found (\d+) errors?/.exec(combined) ?? /(\d+) error/.exec(combined);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : -1;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ok: false, gate: safeGate, passed: false, errorCount, durationMs: elapsed,
            output: combined.slice(-3000),
          }, null, 2),
        }],
      };
    }
  }
);

// ── hypergraph.search ─────────────────────────────────────────────────────────
server.tool(
  'hypergraph.search',
  {
    query:          z.string().max(500).describe('Natural language query (1-500 chars)'),
    edge_types:     z.array(z.string()).optional().describe('Filter by edge_type (agents_md, cluster_summary, codebase_chunk, generic)'),
    limit:          z.number().int().min(1).max(50).optional().describe('Max results 1-50 (default 10)'),
    min_confidence: z.number().min(0).max(1).optional().describe('Minimum confidence threshold 0-1'),
  },
  async ({ query, edge_types, limit, min_confidence }) => {
    const safeQuery = String(query ?? '').slice(0, 500).trim();
    if (!safeQuery) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'query required' }) }] };
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
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }] };
    }
  }
);

// ── hypergraph.get_edge ───────────────────────────────────────────────────────
server.tool(
  'hypergraph.get_edge',
  {
    edge_hash: z.string().max(128).describe('The edge_hash to look up'),
    expand:    z.boolean().optional().describe('If true, also return related edges sharing at least one member'),
  },
  async ({ edge_hash, expand }) => {
    const hash = String(edge_hash ?? '').slice(0, 128).trim();
    if (!hash) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'edge_hash required' }) }] };
    try {
      const url = `${SVELTEKIT}/api/hypergraph/edge/${encodeURIComponent(hash)}${expand ? '?expand=true' : ''}`;
      const res = await fetch(url, { headers: { 'x-mcp-internal': '1' } });
      if (res.status === 404) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'edge not found', edge_hash: hash }) }] };
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }] };
    }
  }
);

// ── hypergraph.explain_activation ────────────────────────────────────────────
server.tool(
  'hypergraph.explain_activation',
  {
    edge_hash:   z.string().max(128).describe('The edge_hash to explain'),
    query_terms: z.array(z.string().max(100)).describe('List of query terms that triggered activation'),
  },
  async ({ edge_hash, query_terms }) => {
    const hash  = String(edge_hash ?? '').slice(0, 128).trim();
    const terms = Array.isArray(query_terms) ? (query_terms as unknown[]).map(t => String(t).slice(0, 100)) : [];
    if (!hash) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'edge_hash required' }) }] };
    try {
      const { explainEdgeActivation } = await import('../lib/server/hypergraph/hypergraph-search.js');
      const result = await explainEdgeActivation(hash, terms);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }] };
    }
  }
);

// ── hypergraph.expand_members ─────────────────────────────────────────────────
server.tool(
  'hypergraph.expand_members',
  {
    edge_hash: z.string().max(128).describe('The edge_hash to expand from'),
  },
  async ({ edge_hash }) => {
    const hash = String(edge_hash ?? '').slice(0, 128).trim();
    if (!hash) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'edge_hash required' }) }] };
    try {
      const url = `${SVELTEKIT}/api/hypergraph/edge/${encodeURIComponent(hash)}?expand=true`;
      const res = await fetch(url, { headers: { 'x-mcp-internal': '1' } });
      if (res.status === 404) return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'edge not found' }) }] };
      const data = await res.json();
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }] };
    }
  }
);

// ── knowledge.get_minified_map ────────────────────────────────────────────────
server.tool(
  'knowledge.get_minified_map',
  {
    directory:  z.string().max(200).optional().describe('Relative directory path (e.g. "src/lib/server/ai")'),
    max_edges:  z.number().int().min(1).max(20).optional().describe('Max hyperedges to include (default 5)'),
    max_agents: z.number().int().min(1).max(10).optional().describe('Max AGENTS.md directives to include (default 3)'),
  },
  async ({ directory, max_edges, max_agents }) => {
    const dir       = String(directory ?? '').slice(0, 200).trim();
    const edgeLimit = clampNumber(max_edges, 1, 20, 5);
    const agentLimit = clampNumber(max_agents, 1, 10, 3);

    try {
      // 1. Top hyperedges (grade B+ or by confidence)
      const edgeRes = await fetch(`${SVELTEKIT}/api/hypergraph/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-internal': '1' },
        body: JSON.stringify({ query: dir || 'architecture', limit: edgeLimit, includeMembers: false }),
      });
      const edgeData = edgeRes.ok ? await edgeRes.json() : { results: [] };

      // 2. AGENTS.md context for the directory (Redis key agents:dir:<dir>)
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
        agentsMd = agentRes.rows.map(r => {
          const lines = [`## ${r.title ?? 'Context'}`];
          if (r.summary) lines.push(r.summary.slice(0, 300));
          if (Array.isArray(r.rules) && r.rules.length) {
            lines.push('Rules: ' + (r.rules as { rule?: string }[]).slice(0, 3).map(x => x.rule).join('; '));
          }
          return lines.join('\n');
        });
      } catch { /* ignore */ }

      const map = {
        directory:   dir || '(root)',
        topEdges:    (edgeData.results ?? []).slice(0, edgeLimit).map((r: { edge: { id: string; edge_type: string; label: string | null; weight: number; query_hash: string | null } }) => ({
          id:          r.edge.id,
          edge_type:   r.edge.edge_type,
          label:       r.edge.label,
          weight:      r.edge.weight,
          query_hash:  r.edge.query_hash,
        })),
        agentsMd,
        generatedAt: new Date().toISOString(),
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(map, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: String(err).slice(0, 200) }) }] };
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

server.tool(
  'tools.batch_call',
  {
    calls: z
      .array(
        z.object({
          name: z.string().describe('Tool name to dispatch (must be registered)'),
          arguments: z.record(z.string(), z.unknown()).default({}).describe('Arguments object for the tool'),
        }),
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
          return { name: call.name, status: 'unknown' as const, error: `tool not found: ${call.name}`, ms: 0 };
        }
        try {
          const result = await Promise.race([
            handler(call.arguments ?? {}),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`batch_call timeout after ${timeoutMs}ms`)), timeoutMs),
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
      }),
    );

    const flat = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { status: 'error' as const, error: String(r.reason), ms: 0, name: 'unknown' },
    );
    const ok = flat.filter((r) => r.status === 'ok').length;
    const totalMs = Date.now() - start;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            { ok, total: flat.length, totalMs, calls: flat },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ── codebase.context_for_file ─────────────────────────────────────────────────
// Master "atlas → context packet" tool. Wraps src/lib/server/atlas/
// context-for-file.ts with an injected Redis client (MCP runs outside the
// SvelteKit bundler so `$lib/...` path aliases don't resolve under tsx —
// we pass our own ioredis instance instead).

server.tool(
  'codebase.context_for_file',
  {
    filePath:    z.string().min(1).max(512).describe('Repo-relative file path (e.g. "src/lib/server/db/client.ts")'),
    maxCards:    z.number().int().min(1).max(20).default(6).describe('Max peer prompt cards to include'),
    forceReload: z.boolean().default(false).describe('Bypass 5-min atlas cache'),
  },
  async ({ filePath, maxCards, forceReload }) => {
    const { contextForFile } = await import('../lib/server/atlas/context-for-file.js');
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true,
      connectTimeout: 3000,
      enableReadyCheck: false,
    });
    try {
      await redis.connect();
      const packet = await contextForFile(filePath, {
        peerLimit:   maxCards,
        forceReload,
        redis,
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(packet, null, 2) }] };
    } finally {
      await redis.quit().catch(() => {});
    }
  },
);

// ── agents_md.context_for_file ───────────────────────────────────────────────
// Slim wrapper — returns only the AGENTS-related slice of the full packet.
// Useful when a caller wants directory rules / tools / constraints without
// the prompt-card payload (saves ~3-5KB per response).

server.tool(
  'agents_md.context_for_file',
  {
    filePath: z.string().min(1).max(512).describe('Repo-relative file path'),
  },
  async ({ filePath }) => {
    const { contextForFile } = await import('../lib/server/atlas/context-for-file.js');
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false,
    });
    try {
      await redis.connect();
      const full = await contextForFile(filePath, { peerLimit: 0, redis });
      const slim = {
        filePath:       full.filePath,
        normalizedPath: full.normalizedPath,
        agentsDir:      full.directory.agentsDir ?? null,
        directoryPath:  full.directory.path,
        topo:           full.directory.topo,
        clusters:       full.directory.clusters,
        tools:          full.directory.tools,
        constraints:    full.directory.constraints,
        tags:           full.directory.tags,
        recommendedActions: full.recommendedActions,
        provenance:     full.provenance,
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(slim, null, 2) }] };
    } finally {
      await redis.quit().catch(() => {});
    }
  },
);

// ── agents_md.peers_for_dir ───────────────────────────────────────────────────
// Returns the directory card directly — peers, tools, tags, top files in
// the directory, without going through context-for-file's per-file lookup.
// O(1) Redis GET on ace:atlas:dir:<slug>.

server.tool(
  'agents_md.peers_for_dir',
  {
    dirPath: z.string().min(1).max(512).describe('Directory path (e.g. "src/lib/server/db")'),
  },
  async ({ dirPath }) => {
    const norm = String(dirPath)
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/^sveltekit-frontend\//, '')
      .replace(/^src\//, '');
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false,
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
          try { card = JSON.parse(raw); usedKey = slug; break; }
          catch { /* try next */ }
        }
      }
      const result = card
        ? { found: true, key: `ace:atlas:dir:${usedKey}`, card }
        : { found: false, dirPath, hint: 'Run `npm run atlas:index` to populate directory cards.' };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } finally {
      await redis.quit().catch(() => {});
    }
  },
);

// ── agents_md.coverage ────────────────────────────────────────────────────────
// Quality probe: how complete is the AGENTS.md envelope for the directory
// containing this file? Reads the Postgres mirror to report which envelope
// fields are populated. Lets agents detect "thin context" before relying on it.

server.tool(
  'agents_md.coverage',
  {
    filePath: z.string().min(1).max(512).describe('Repo-relative file path'),
  },
  async ({ filePath }) => {
    const norm = String(filePath)
      .replace(/\\/g, '/')
      .replace(/^\.?\//, '')
      .replace(/^sveltekit-frontend\//, '')
      .replace(/^src\//, '');
    const dir = norm.lastIndexOf('/') > 0 ? norm.slice(0, norm.lastIndexOf('/')) : '';

    const dbUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
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
        [`%${dir}%AGENTS.md`, `%/${dir}/AGENTS.md`],
      );
      const result = {
        filePath,
        normalizedPath: norm,
        directory:      dir,
        nearestEnvelopes: r.rows,
        coverage: {
          totalRowsMatched: r.rowCount ?? 0,
          anyRules:         r.rows.some(x => (x.rules_n ?? 0) > 0),
          anyTools:         r.rows.some(x => (x.tools_n ?? 0) > 0),
          anyConstraints:   r.rows.some(x => (x.constraints_n ?? 0) > 0),
          anySummary:       r.rows.some(x => (x.summary_chars ?? 0) > 50),
        },
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    } finally {
      await pgPool.end().catch(() => {});
    }
  },
);

// ── agents_md.shares_tags ────────────────────────────────────────────────────
// SHARES_TAGS lens — pure DB query against agent_context_relations.
// Distinct from agents_md.peers_for_dir which reads the Redis atlas card.
// This one returns only directories whose qdrant_tags Jaccard-overlap (≥0.3)
// with the source AGENTS.md, with a sibling-dir fallback when the SHARES_TAGS
// edge set is sparse for the requested source.

server.tool(
  'agents_md.shares_tags',
  {
    dirPath: z.string().min(1).max(500).describe('Directory path (e.g. "src/lib/server/ace")'),
    limit:   z.number().int().min(1).max(50).default(10).optional(),
  },
  async ({ dirPath, limit = 10 }) => {
    const stable = `agents:${dirPath.replace(/^src\//, 'src/')}/AGENTS.md`;
    try {
      const { rows } = await pool.query<{ target_key: string; weight: number; evidence: Record<string, unknown> }>(
        `SELECT target_key, weight, evidence
         FROM agent_context_relations
         WHERE source_key = $1 AND relation = 'SHARES_TAGS'
         ORDER BY weight DESC
         LIMIT $2`,
        [stable, limit],
      );
      let peers: Array<{ peer: string; weight: number; jaccard: number | null; source: 'shares_tags' | 'sibling-fallback' }> =
        rows.map(r => ({
          peer:    r.target_key,
          weight:  Number(r.weight) || 0,
          jaccard: typeof r.evidence?.jaccard === 'number' ? (r.evidence.jaccard as number) : null,
          source:  'shares_tags',
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
            [parent, dirPath, limit],
          );
          peers = sib.map(s => ({
            peer: s.stable_key, weight: 0.5, jaccard: null, source: 'sibling-fallback',
          }));
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({
        dirPath,
        sourceKey: stable,
        peerCount: peers.length,
        peers,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: String(err).slice(0, 300), dirPath,
      }) }] };
    }
  },
);

// ── agents_md.binding_chain ──────────────────────────────────────────────────
// directory_context_bindings priority-ordered walk-up chain.
// Distinct from agents_md.coverage which returns nearestEnvelopes (one row per
// matching dir LIKE). This walks the formal binding hierarchy with
// (binding_type, depth, priority, confidence) per row — answers
// "in what order do AGENTS.md envelopes apply to this file?".

server.tool(
  'agents_md.binding_chain',
  {
    filePath: z.string().min(1).max(500).describe('Repo-relative file path'),
  },
  async ({ filePath }) => {
    try {
      const { rows } = await pool.query<{
        agent_context_key: string; directory_path: string;
        binding_type: string; depth: number;
        applies_to_children: boolean; priority: number; confidence: number;
      }>(
        `SELECT agent_context_key, directory_path, binding_type, depth,
                applies_to_children, priority, confidence
         FROM directory_context_bindings
         WHERE $1 LIKE directory_path || '/%' OR directory_path = $1
         ORDER BY priority DESC, depth ASC, length(directory_path) DESC`,
        [filePath],
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        filePath,
        chain: rows,
        count: rows.length,
        types: Array.from(new Set(rows.map(r => r.binding_type))),
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({
        error: String(err).slice(0, 300), filePath,
      }) }] };
    }
  },
);

// ── HTTP server with /health + MCP handler ────────────────────────────────────

const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

const nodeServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, version: '1.0.0', uptime: process.uptime() }));
    return;
  }
  await transport.handleRequest(req, res);
});

await server.connect(transport);

// Pre-warm the Postgres pool so first FTS query doesn't eat into tool timeout
pool.query('SELECT 1').catch(() => { /* non-fatal — pool will retry on first real query */ });

nodeServer.listen(PORT, HOST, () => {
  console.log(`TRACE MCP server listening on http://${HOST}:${PORT}`);
  console.log('Tools: graph.expand_neighborhood, graph.shortest_path, graph.community_for_node,');
  console.log('       graph.pagerank_top, topology.search_near, topology.same_som_cluster,');
  console.log('       topology.search_4d (4D manifold + JSONB filters),');
  console.log('       clusters.get_members, clusters.get_summary_lenses,');
  console.log('       trace.kag_search (go-retrieval→sveltekit→postgres cascade),');
  console.log('       trace.explain_retrieval,');
  console.log('       search.postgres_fts, search.hybrid, search.go_hybrid (RRF),');
  console.log('       context.build_kv_packet, context.get_compressed_card,');
  console.log('       context.explain_compression, context.refresh_task_toc,');
  console.log('       kag.ingest_error, kag.multi_lane_search,');
  console.log('       graph.expand_neighborhood, clusters.get_summary_lenses, trace.validate_ace_hit,');
  console.log('       ops.propose_patch, ops.run_targeted_test, ops.record_fix_attempt, ops.run_quality_gate [OPERATOR-GATED]');
});