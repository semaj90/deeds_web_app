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
 * Tool namespaces (10 tools):
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

const pool = new Pool({ connectionString: PG_URL, max: 4, idleTimeoutMillis: 30_000 });
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
    headers: { 'Content-Type': 'application/json' },
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
      const { createClient } = await import('redis');
      const redis = createClient({ url: REDIS_URL });
      await redis.connect();
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
      const { createClient } = await import('redis');
      const redis = createClient({ url: REDIS_URL });
      await redis.connect();
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
    // Proxy to SvelteKit code-intel search which runs full KAG-DAG pipeline
    const body: Record<string, unknown> = { query, limit };
    if (filePath) body.filePath = filePath;
    const data = await sveltePost('/api/code-intel/search', body);
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
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
      const { createClient } = await import('redis');
      const redis = createClient({ url: REDIS_URL });
      await redis.connect();
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

nodeServer.listen(PORT, HOST, () => {
  console.log(`TRACE MCP server listening on http://${HOST}:${PORT}`);
  console.log('Tools: graph.expand_neighborhood, graph.shortest_path, graph.community_for_node,');
  console.log('       graph.pagerank_top, topology.search_near, topology.same_som_cluster,');
  console.log('       clusters.get_members, clusters.get_summary_lenses,');
  console.log('       trace.kag_search, trace.explain_retrieval');
});