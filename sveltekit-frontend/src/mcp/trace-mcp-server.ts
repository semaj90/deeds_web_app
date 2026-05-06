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
 * Tool namespaces (12 tools):
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
 *   kag.record_agent_run       — write run artifacts + queue JSONL for ingest
 *   kag.ingest_memory_directory — flush pending JSONL queue → Redis ACE cache
 */

import http from 'node:http';
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
const TOPO_URL   = process.env.TOPOLOGY_SEARCH_URL  ?? 'http://127.0.0.1:8101';

const pool = new Pool({ connectionString: PG_URL, max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
pool.on('error', () => {});

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
    const rows = await neo4jQuery(
      `MATCH (n {stableKey: $key})
       OPTIONAL MATCH (n)-[:MEMBER_OF]->(c:GPUCluster)
       OPTIONAL MATCH (n)-[:BELONGS_TO_COMMUNITY]->(cm:Community)
       RETURN n.gpuCluster AS gpuCluster, n.somCluster AS somCluster,
              c.clusterId AS clusterNodeId, cm.communityId AS communityId,
              n.clusterKey AS clusterKey`,
      { key: stableKey }
    );
    const row = rows[0]?.row ?? [];
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          stableKey,
          gpuCluster:    row[0],
          somCluster:    row[1],
          clusterNodeId: row[2],
          communityId:   row[3],
          clusterKey:    row[4],
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
    // Try Redis cache of PageRank scores first
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);
      const raw = await redis.get('couchdb:pagerank_scores') as string | null;
      await redis.quit();
      if (raw) {
        const scores: Record<string, number> = JSON.parse(raw);
        let entries = Object.entries(scores).map(([k, v]) => ({ stableKey: k, pageRank: v }));
        if (nodeType) entries = entries.filter(e => e.stableKey.startsWith(nodeType.toLowerCase() + ':'));
        entries.sort((a, b) => b.pageRank - a.pageRank);
        return { content: [{ type: 'text' as const, text: JSON.stringify(entries.slice(0, limit), null, 2) }] };
      }
    } catch { /* fall through to Neo4j */ }

    const label = nodeType ? `:${nodeType}` : '';
    const rows = await neo4jQuery(
      `MATCH (n${label}) WHERE n.pageRankScore IS NOT NULL
       RETURN n.stableKey AS stableKey, n.pageRankScore AS score, n.label AS label
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
    // Look up the node's som_cluster then return siblings
    const rows = await pool.query<{ som_cluster: number }>(
      `SELECT som_cluster FROM codebase_chunk_index WHERE stable_key = $1 LIMIT 1`,
      [stableKey]
    );
    const cluster = rows.rows[0]?.som_cluster;
    if (cluster == null) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Node not found in Postgres index' }) }] };

    const siblings = await pool.query<{ stable_key: string; rel_path: string; som_cluster: number }>(
      `SELECT stable_key, rel_path, som_cluster
       FROM codebase_chunk_index
       WHERE som_cluster = $1 AND stable_key != $2
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

// ── clusters.get_members ──────────────────────────────────────────────────────

server.tool(
  'clusters.get_members',
  {
    clusterKey: z.string().describe('Cluster key (e.g. "gpu:998" or "dir:src/lib/server/ace")'),
    limit:      z.number().int().min(1).max(200).default(50).describe('Max files returned'),
  },
  async ({ clusterKey, limit }) => {
    const rows = await pool.query<{ stable_key: string; rel_path: string; page_rank_score: number | null }>(
      `SELECT stable_key, rel_path, page_rank_score
       FROM codebase_chunk_index
       WHERE cluster_key = $1
       ORDER BY page_rank_score DESC NULLS LAST
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

server.tool(
  'clusters.get_summary_lenses',
  {
    clusterKey: z.string().describe('Cluster key to get wiki notes / AGENTS.md for'),
  },
  async ({ clusterKey }) => {
    try {
      const { default: Redis } = await import('ioredis');
      const redis = new Redis(REDIS_URL);
      const [wikiNote, agentNote] = await Promise.all([
        redis.get(`wiki:note:cluster:${clusterKey}`),
        redis.get(`agents:dir:${clusterKey}`),
      ]);
      await redis.quit();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ clusterKey, wikiNote, agentsMd: agentNote }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
    }
  }
);

// ── trace.kag_search ──────────────────────────────────────────────────────────

server.tool(
  'trace.kag_search',
  {
    query:    z.string().max(2000).describe('Natural language question or search'),
    filePath: z.string().optional().describe('Optional file path for AGENTS.md-scoped context'),
    limit:    z.number().int().min(1).max(50).default(10).describe('Max chunks returned'),
  },
  async ({ query, filePath, limit }) => {
    // ── Try SvelteKit KAG-DAG pipeline first (3s budget — fast-path only) ───────
    try {
      const body: Record<string, unknown> = { query, limit };
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
          [query, limit, null]
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
      // Embed the query via SvelteKit embed endpoint
      let embedding: number[] = [];
      try {
        const embedRes = await sveltePost('/api/embed', { text: query });
        embedding = (embedRes as { embedding?: number[] }).embedding ?? [];
      } catch { /* continue without embedding — will degrade to FTS-only */ }

      // Postgres FTS + Qdrant in parallel
      const [pgRes, qdrantRes] = await Promise.all([
        pool.query('SELECT * FROM search_code_lexical($1, $2, $3)', [query, limit * 2, topo_class ?? null]),
        embedding.length
          ? fetch(`${SVELTEKIT}/api/code-intel/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, embedding, limit: limit * 2, topoClass: topo_class }),
              signal: AbortSignal.timeout(10_000),
            }).then((r) => r.json()).catch(() => ({ results: [] }))
          : Promise.resolve({ results: [] }),
      ]);

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
          text: JSON.stringify({ results, count: results.length, mode, embedding_used: embedding.length > 0 }, null, 2),
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
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
      const body: Record<string, unknown> = { query, limit, mode: 'dev_context' };
      if (filePath)   body.filePath  = filePath;
      if (topo_class) body.topoClass = topo_class;

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
      const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');
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

      for (const file of batch) {
        const src = join(pendDir, file);
        let fileOk = true;
        let fileReason = '';

        try {
          const raw   = readFileSync(src, 'utf8');
          const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

          for (const line of lines) {
            let rec: Record<string, unknown>;
            try { rec = JSON.parse(line) as Record<string, unknown>; }
            catch { failed++; continue; }

            const recType    = (rec.type as string | undefined) ?? '';
            const sourceKind = (rec.source_kind as string | undefined) ?? '';
            const stableKey  = (rec.stable_key as string | undefined) ?? (rec.id as string | undefined) ?? line.slice(0, 80);
            const idHash     = createHash('sha1').update(stableKey).digest('hex').slice(0, 12);
            const idempKey   = `kag:ingested:${idHash}`;

            if (dryRun) { ingested++; continue; }

            // Idempotency: skip if written within last 7 days
            if (redis) {
              if (await redis.exists(idempKey)) { skipped++; continue; }
            }

            try {
              if (recType === 'error') {
                // Postgres context_timeline
                try {
                  await pool.query(
                    `INSERT INTO context_timeline (event_type, pipeline, session_id, payload)
                     VALUES ($1, $2, $3, $4::jsonb)`,
                    ['error_ingested', 'kag', '',
                     JSON.stringify({ id: rec.id, summary: rec.summary, tags: rec.tags,
                       files: rec.files, confidence: rec.confidence,
                       needsDeepResearch: rec.needsDeepResearch,
                       source_file: file, ingested_at: new Date().toISOString() })],
                  );
                } catch { /* Postgres down or migration pending — non-fatal */ }
                // Redis ACE error cache (24h)
                if (redis) {
                  await redis.setex(`ace:error:${idHash}`, 86_400, JSON.stringify({
                    id: rec.id, summary: rec.summary,
                    tags:  Array.isArray(rec.tags)  ? rec.tags  : [],
                    files: Array.isArray(rec.files) ? rec.files : [],
                    confidence: rec.confidence ?? 0.5,
                    needsDeepResearch: rec.needsDeepResearch ?? false,
                    ingested_at: new Date().toISOString(),
                  }));
                }

              } else if (recType === 'agent_run') {
                try {
                  await pool.query(
                    `INSERT INTO context_timeline (event_type, pipeline, session_id, payload)
                     VALUES ($1, $2, $3, $4::jsonb)`,
                    ['agent_run_ingested', 'kag', '',
                     JSON.stringify({ id: rec.id, summary: rec.summary, tags: rec.tags,
                       files: rec.files, confidence: rec.confidence, patchResult: rec.patchResult,
                       needsDeepResearch: rec.needsDeepResearch,
                       source_file: file, ingested_at: new Date().toISOString() })],
                  );
                } catch { /* non-fatal */ }
                if (redis) {
                  await redis.setex(`ace:agent:${idHash}`, 86_400, JSON.stringify({
                    id: rec.id, summary: rec.summary, confidence: rec.confidence,
                    patchResult: rec.patchResult, ingested_at: new Date().toISOString(),
                  }));
                }

              } else if (sourceKind === 'graphify_deep_imports') {
                // Code-graph nodes → Redis fast ACE lookup (12h TTL)
                if (redis) {
                  const srcType = (rec.source_type as string | undefined) ?? '';
                  const ttl = 43_200;
                  if (srcType === 'node_summary') {
                    await redis.setex(`code:graph:node:${idHash}`, ttl, JSON.stringify({
                      file_path: rec.file_path, zone: rec.zone,
                      directFanIn: rec.directFanIn, directFanOut: rec.directFanOut,
                      upstreamNodeCount: rec.upstreamNodeCount,
                      downstreamNodeCount: rec.downstreamNodeCount,
                      text: rec.text, stable_key: stableKey,
                    }));
                  } else if (srcType === 'hotspot_callers') {
                    await redis.setex(`code:graph:hotspot:${idHash}`, ttl, JSON.stringify({
                      file_path: rec.file_path, zone: rec.zone,
                      directFanIn: rec.directFanIn, topCallers: rec.topCallers,
                      text: rec.text, stable_key: stableKey,
                    }));
                  }
                }

              } else if (recType === 'ace_hit') {
                if (redis) {
                  await redis.setex(`ace:hit:${idHash}`, 86_400, JSON.stringify(rec));
                }
              }
              // else: unknown type — skip silently

              // Mark as ingested (7-day idempotency TTL)
              if (redis) await redis.setex(idempKey, 604_800, '1');
              ingested++;
            } catch (dispatchErr) {
              failed++;
            }
          }
        } catch (fileErr) {
          fileOk = false;
          fileReason = String(fileErr);
          failed++;
        }

        if (!dryRun && moveProcessed) {
          if (fileOk) {
            try { renameSync(src, join(doneDir, file)); processedFiles.push(file); }
            catch (mvErr) { failedFiles.push({ path: file, reason: `move failed: ${mvErr}` }); }
          } else {
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
  console.log('       clusters.get_members, clusters.get_summary_lenses,');
  console.log('       trace.kag_search, trace.explain_retrieval,');
  console.log('       search.postgres_fts, search.hybrid,');
  console.log('       context.build_kv_packet, context.get_compressed_card,');
  console.log('       context.explain_compression, context.refresh_task_toc');
});