/**
 * In-process MCP tool implementations for trace-mcp-server.ts.
 *
 * Each function implements one read-only tool from the allowlist.
 * trace-mcp-server.ts wraps these as HTTP endpoints on :8788.
 * gemma4-tool-controller.ts calls them either via HTTP (if server running)
 * or directly in-process (fallback).
 *
 * ALL tools here are READ-ONLY — no writes to Qdrant, Neo4j, Redis, or Postgres.
 */

import { searchCodeLexical }       from '$lib/server/search/postgres-fts.js';
import { searchQdrantCode }        from '$lib/server/search/qdrant-search.js';
import { expandNeighbours }        from '$lib/server/search/neo4j-rerank.js';
import { fetchCodebaseContext }    from '$lib/server/ace/context-assembler.js';
import { expandNotecardNeighbors, getNotecardById, getNotecardBySourcePath, searchNotecards } from '$lib/server/kb/search-logic.js';
import { getRedis }                from '$lib/server/redis.js';
import { db }                      from '$lib/server/db/client';
import { sql }                     from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

// ── Shared result shape ───────────────────────────────────────────────────────

export interface MCPToolResult {
  tool:    string;
  success: boolean;
  data:    unknown;
  error?:  string;
  meta?:   { durationMs: number; cached?: boolean };
}

function ok(tool: string, data: unknown, durationMs: number, cached = false): MCPToolResult {
  return { tool, success: true, data, meta: { durationMs, cached } };
}
function err(tool: string, error: string, durationMs: number): MCPToolResult {
  return { tool, success: false, data: null, error, meta: { durationMs } };
}

// ── Tool implementations ──────────────────────────────────────────────────────

/** trace.kag_search — lexical FTS search over codebase chunks */
export async function tool_trace_kag_search(args: {
  query:   string;
  limit?:  number;
  filter?: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await searchCodeLexical(args.query, {
      limit: Math.min(args.limit ?? 10, 20),
    });
    return ok('trace.kag_search', rows.map(r => ({
      stable_key:  r.stable_key,
      file_path:   r.file_path,
      symbol_name: r.symbol_name,
      content:     r.content.slice(0, 500),
      score:       r.lexical_score,
      tags:        r.tags,
    })), Date.now() - t0);
  } catch (e) { return err('trace.kag_search', String(e), Date.now() - t0); }
}

/** search.dev_context — ACE codebase context for a query + optional file path */
export async function tool_search_dev_context(args: {
  query:     string;
  filePath?: string;
  limit?:    number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const chunks = await fetchCodebaseContext(args.query, undefined, args.filePath);
    const limited = chunks?.slice(0, Math.min(args.limit ?? 8, 15)) ?? [];
    return ok('search.dev_context', limited.map((c: Record<string, unknown>) => ({
      file_path:   c.filePath,
      symbol_name: c.symbolName,
      content:     String(c.content ?? '').slice(0, 600),
      score:       c.score,
    })), Date.now() - t0);
  } catch (e) { return err('search.dev_context', String(e), Date.now() - t0); }
}

/** search.postgres_fts — direct lexical FTS with optional topo_class */
export async function tool_search_postgres_fts(args: {
  query:      string;
  topoClass?: string;
  limit?:     number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await searchCodeLexical(args.query, {
      limit:     Math.min(args.limit ?? 10, 20),
      topoClass: args.topoClass,
    });
    return ok('search.postgres_fts', rows.map(r => ({
      stable_key: r.stable_key,
      file_path:  r.file_path,
      content:    r.content.slice(0, 400),
      score:      r.lexical_score,
      topo_class: r.topo_class,
    })), Date.now() - t0);
  } catch (e) { return err('search.postgres_fts', String(e), Date.now() - t0); }
}

/** search.qdrant_topology — vector search filtered by topo_class */
export async function tool_search_qdrant_topology(args: {
  queryEmbedding: number[];
  topoClass?:     string;
  limit?:         number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await searchQdrantCode(
      args.queryEmbedding,
      Math.min(args.limit ?? 10, 20),
      args.topoClass,
    );
    return ok('search.qdrant_topology', rows.map(r => ({
      stable_key:      r.stable_key,
      file_path:       r.file_path,
      symbol_name:     r.symbol_name,
      content:         r.content.slice(0, 400),
      semantic_score:  r.semantic_score,
      topo_class:      r.topo_class,
      som_bmu_col:     (r as unknown as Record<string, unknown>).som_bmu_col,
      som_bmu_row:     (r as unknown as Record<string, unknown>).som_bmu_row,
    })), Date.now() - t0);
  } catch (e) { return err('search.qdrant_topology', String(e), Date.now() - t0); }
}

/** graph.expand_neighborhood — Neo4j neighbor expansion for a set of stable_keys */
export async function tool_graph_expand_neighborhood(args: {
  stableKeys: string[];
  maxHops?:   number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    // expandNeighbours(stableKey) returns string[] — fan out over each seed key
    const keys = args.stableKeys.slice(0, 20);
    const neighbourSets = await Promise.all(keys.map(k => expandNeighbours(k)));
    const allNeighbours = [...new Set(neighbourSets.flat())];

    // PageRank scores live in Redis at couchdb:pagerank_scores (written by run-pagerank.ts)
    let pageRankMap: Record<string, number> = {};
    try {
      const redis = getRedis();
      const raw   = await redis.get('couchdb:pagerank_scores');
      if (raw) pageRankMap = JSON.parse(raw) as Record<string, number>;
    } catch { /* non-fatal — return neighbours without scores */ }

    return ok('graph.expand_neighborhood', allNeighbours.map(key => ({
      stable_key: key,
      pagerank:   pageRankMap[key] ?? null,
    })), Date.now() - t0);
  } catch (e) { return err('graph.expand_neighborhood', String(e), Date.now() - t0); }
}

/** graph.shortest_path — Neo4j shortest path between two files */
export async function tool_graph_shortest_path(args: {
  sourceFile: string;
  targetFile: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const { default: neo4j } = await import('neo4j-driver');
    const driver = neo4j.driver(
      ENV.NEO4J_URI,
      neo4j.auth.basic(
        ENV.NEO4J_USER,
        ENV.NEO4J_PASSWORD,
      ),
    );
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(
        `MATCH p = shortestPath(
           (a:CodebaseFile {filePath: $src})-[*]-(b:CodebaseFile {filePath: $tgt})
         )
         RETURN [n IN nodes(p) | n.filePath] AS path, length(p) AS hops`,
        { src: args.sourceFile, tgt: args.targetFile },
      );
      const record = result.records[0];
      return ok('graph.shortest_path', {
        path: record?.get('path') ?? [],
        hops: record?.get('hops') ?? -1,
      }, Date.now() - t0);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (e) { return err('graph.shortest_path', String(e), Date.now() - t0); }
}

/** clusters.get_summary_lenses — Redis cluster summary cards (wiki notes) */
export async function tool_clusters_get_summary_lenses(args: {
  prefix?:  string;
  limit?:   number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const redis = getRedis();
    const pattern = `wiki:note:dir:${args.prefix ?? '*'}`;
    const keys    = (await redis.keys(pattern)).slice(0, args.limit ?? 10);
    const values  = keys.length > 0 ? await redis.mget(...keys) : [];
    const lenses  = keys.map((k, i) => {
      try { return { key: k, ...JSON.parse(values[i] ?? '{}') }; }
      catch { return { key: k, raw: values[i] }; }
    });
    return ok('clusters.get_summary_lenses', lenses, Date.now() - t0, true);
  } catch (e) { return err('clusters.get_summary_lenses', String(e), Date.now() - t0); }
}

/** trace.explain_retrieval — retrieval trace stored in Redis by hybrid-search */
export async function tool_trace_explain_retrieval(args: {
  traceKey: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const redis  = getRedis();
    const raw    = await redis.get(args.traceKey);
    if (!raw) return err('trace.explain_retrieval', `No trace at ${args.traceKey}`, Date.now() - t0);
    return ok('trace.explain_retrieval', JSON.parse(raw), Date.now() - t0, true);
  } catch (e) { return err('trace.explain_retrieval', String(e), Date.now() - t0); }
}

/** kb.search_cards — notecard retrieval over the identity spine */
export async function tool_kb_search_cards(args: {
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const cards = await searchNotecards({
      query: args.query,
      limit: Math.min(args.limit ?? 10, 20),
      filters: args.filters as Parameters<typeof searchNotecards>[0]['filters'],
    });
    return ok('kb.search_cards', {
      query: args.query,
      count: cards.length,
      cards: cards.map((hit) => ({
        chunk_id: hit.card_id,
        source_path: hit.source_path,
        score: hit.score,
        why: hit.why,
        kind: hit.kind,
        tags: hit.tags,
        rank_score: hit.rank_score,
        content: hit.context_text,
      })),
    }, Date.now() - t0);
  } catch (e) {
    return err('kb.search_cards', String(e), Date.now() - t0);
  }
}

/** kb.get_card — fetch a single card by stable id or source path */
export async function tool_kb_get_card(args: {
  chunk_id: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const card = (await getNotecardById(args.chunk_id)) ?? (await getNotecardBySourcePath(args.chunk_id));
    if (!card) return err('kb.get_card', `Card not found: ${args.chunk_id}`, Date.now() - t0);
    return ok('kb.get_card', {
      card: {
        chunk_id: card.card_id,
        source_path: card.source_path,
        title: card.title,
        kind: card.kind,
        zone: card.zone,
        tags: card.tags,
        exports: card.exports,
        confidence: card.confidence,
        updated_at: card.updated_at,
        summary: card.search_text,
        content: card.context_text,
      },
    }, Date.now() - t0, true);
  } catch (e) {
    return err('kb.get_card', String(e), Date.now() - t0);
  }
}

/** kb.expand_neighbors — hop through graph_neighbors on notecards */
export async function tool_kb_expand_neighbors(args: {
  chunk_id: string;
  hops?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const expanded = await expandNotecardNeighbors({
      cardId: args.chunk_id,
      hops: args.hops ?? 1,
    });
    if (!expanded) return err('kb.expand_neighbors', `Card not found: ${args.chunk_id}`, Date.now() - t0);
    return ok('kb.expand_neighbors', {
      center: {
        chunk_id: expanded.center.card_id,
        source_path: expanded.center.source_path,
        title: expanded.center.title,
        kind: expanded.center.kind,
        tags: expanded.center.tags,
      },
      neighbors: expanded.neighbors.map((neighbor) => ({
        chunk_id: neighbor.card_id,
        source_path: neighbor.source_path,
        title: neighbor.title,
        kind: neighbor.kind,
        tags: neighbor.tags,
        hop: neighbor.hop,
        via: neighbor.via,
      })),
    }, Date.now() - t0, true);
  } catch (e) {
    return err('kb.expand_neighbors', String(e), Date.now() - t0);
  }
}

/** kb.explain_retrieval — explain notecard ranking for a query/card pair */
export async function tool_kb_explain_retrieval(args: {
  query: string;
  chunk_id: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const [matches, card] = await Promise.all([
      searchNotecards({ query: args.query, limit: 20 }),
      getNotecardById(args.chunk_id) ?? getNotecardBySourcePath(args.chunk_id),
    ]);
    const match = matches.find((item) => item.card_id === args.chunk_id || item.source_path === card?.source_path);
    return ok('kb.explain_retrieval', {
      query: args.query,
      chunk_id: args.chunk_id,
      retrieved: Boolean(match),
      score: match?.score ?? null,
      rank_score: match?.rank_score ?? null,
      why: match?.why ?? [],
      card: card ?? null,
    }, Date.now() - t0, true);
  } catch (e) {
    return err('kb.explain_retrieval', String(e), Date.now() - t0);
  }
}

/** context.build_kv_packet — return compressed ACE context bundle */
export async function tool_context_build_kv_packet(args: {
  query:      string;
  limit?:     number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const allChunks = await fetchCodebaseContext(args.query);
    const chunks    = (allChunks ?? []).slice(0, args.limit ?? 6);
    const packet = {
      query:      args.query,
      chunkCount: chunks.length,
      chunks:     chunks.slice(0, 6).map((c: Record<string, unknown>) => ({
        file_path:  c.filePath,
        symbol:     c.symbolName,
        summary:    String(c.content ?? '').slice(0, 300),
        score:      c.score,
      })),
      buildMs: Date.now() - t0,
    };
    return ok('context.build_kv_packet', packet, Date.now() - t0);
  } catch (e) { return err('context.build_kv_packet', String(e), Date.now() - t0); }
}

/** workspace.timeline — recent agent actions from trace tables */
export async function tool_workspace_timeline(args: {
  limit?:      number;
  actionType?: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await db.execute(sql`
      SELECT action_type, tool_name, target_file, query, result_summary,
             duration_ms, created_at
      FROM agent_actions
      ${args.actionType ? sql`WHERE action_type = ${args.actionType}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${args.limit ?? 10}
    `);
    return ok('workspace.timeline', rows.rows, Date.now() - t0);
  } catch (e) { return err('workspace.timeline', String(e), Date.now() - t0); }
}

/** topology.route_query — topology-aware search routing */
export async function tool_topology_route_query(args: {
  query:      string;
  topoClass?: string;
  limit?:     number;
}): Promise<MCPToolResult> {
  // Delegates to lexical search with topology filter — topology-search-client
  // requires a full server context; use postgres_fts with topo_class as proxy
  return tool_search_postgres_fts({
    query:      args.query,
    topoClass:  args.topoClass,
    limit:      args.limit,
  });
}

/** search.hybrid — semantic+lexical via Go retrieval :8100/search/codebase, falls back to Postgres FTS */
export async function tool_search_hybrid(args: {
  query:      string;
  topoClass?: string;
  limit?:     number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const { searchCodebaseViaHttp } = await import('$lib/server/grpc/retrieval-client.js');
    const goResult = await searchCodebaseViaHttp({
      query:     args.query,
      topoClass: args.topoClass,
      limit:     args.limit ?? 10,
    });
    if (goResult && goResult.results.length > 0) {
      return ok('search.hybrid', goResult.results, Date.now() - t0, false);
    }
  } catch { /* Go service unavailable — fall through */ }
  // Fallback: Postgres FTS — overlay total elapsed time to include Go probe overhead
  const ftsResult = await tool_search_postgres_fts(args);
  return { ...ftsResult, tool: 'search.hybrid', meta: { durationMs: Date.now() - t0 } };
}

/** context.get_compressed_card — retrieve a compressed file/trace card by stableKey */
export async function tool_context_get_compressed_card(args: {
  stableKey: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const { getCompressedCard } = await import('$lib/server/ai/kv-context-controller.js');
    const card = await getCompressedCard(args.stableKey);
    if (!card) return err('context.get_compressed_card', `No card found for ${args.stableKey}`, Date.now() - t0);
    return ok('context.get_compressed_card', card, Date.now() - t0, false);
  } catch (e) { return err('context.get_compressed_card', String(e), Date.now() - t0); }
}

/** context.explain_compression — debug view of current KV packet for a taskId */
export async function tool_context_explain_compression(args: {
  taskId: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const { explainCompression } = await import('$lib/server/ai/kv-context-controller.js');
    const result = await explainCompression(args.taskId);
    return ok('context.explain_compression', JSON.parse(result), Date.now() - t0, false);
  } catch (e) { return err('context.explain_compression', String(e), Date.now() - t0); }
}

// ── Dispatch table ────────────────────────────────────────────────────────────

export const TOOL_DISPATCH: Record<
  string,
  (args: Record<string, unknown>) => Promise<MCPToolResult>
> = {
  'trace.kag_search':              (a) => tool_trace_kag_search(a as Parameters<typeof tool_trace_kag_search>[0]),
  'trace.explain_retrieval':       (a) => tool_trace_explain_retrieval(a as Parameters<typeof tool_trace_explain_retrieval>[0]),
  'topology.route_query':          (a) => tool_topology_route_query(a as Parameters<typeof tool_topology_route_query>[0]),
  'search.hybrid':                 (a) => tool_search_hybrid(a as Parameters<typeof tool_search_hybrid>[0]),
  'search.dev_context':            (a) => tool_search_dev_context(a as Parameters<typeof tool_search_dev_context>[0]),
  'search.postgres_fts':           (a) => tool_search_postgres_fts(a as Parameters<typeof tool_search_postgres_fts>[0]),
  'search.qdrant_topology':        (a) => tool_search_qdrant_topology(a as Parameters<typeof tool_search_qdrant_topology>[0]),
  'graph.expand_neighborhood':     (a) => tool_graph_expand_neighborhood(a as Parameters<typeof tool_graph_expand_neighborhood>[0]),
  'graph.shortest_path':           (a) => tool_graph_shortest_path(a as Parameters<typeof tool_graph_shortest_path>[0]),
  'clusters.get_summary_lenses':   (a) => tool_clusters_get_summary_lenses(a as Parameters<typeof tool_clusters_get_summary_lenses>[0]),
  'context.build_kv_packet':       (a) => tool_context_build_kv_packet(a as Parameters<typeof tool_context_build_kv_packet>[0]),
  'context.get_compressed_card':   (a) => tool_context_get_compressed_card(a as Parameters<typeof tool_context_get_compressed_card>[0]),
  'context.explain_compression':   (a) => tool_context_explain_compression(a as Parameters<typeof tool_context_explain_compression>[0]),
  'workspace.timeline':            (a) => tool_workspace_timeline(a as Parameters<typeof tool_workspace_timeline>[0]),
  'kb.search_cards':               (a) => tool_kb_search_cards(a as Parameters<typeof tool_kb_search_cards>[0]),
  'kb.get_card':                   (a) => tool_kb_get_card(a as Parameters<typeof tool_kb_get_card>[0]),
  'kb.expand_neighbors':           (a) => tool_kb_expand_neighbors(a as Parameters<typeof tool_kb_expand_neighbors>[0]),
  'kb.explain_retrieval':          (a) => tool_kb_explain_retrieval(a as Parameters<typeof tool_kb_explain_retrieval>[0]),
};
