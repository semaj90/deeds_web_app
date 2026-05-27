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

import { join } from 'node:path';
import { searchCodeLexical }       from '$lib/server/search/postgres-fts.js';
import { searchQdrantCode }        from '$lib/server/search/qdrant-search.js';
import { expandNeighbours }        from '$lib/server/search/neo4j-rerank.js';
import { buildSubgraphV1SeedNeighborhood } from '$lib/server/retrieval/subgraph-seed-neighborhood.js';
import { fetchCodebaseContext }    from '$lib/server/ace/context-assembler.js';
import { expandNotecardNeighbors, getNotecardById, getNotecardBySourcePath, searchNotecards } from '$lib/server/kb/search-logic.js';
import { getRedis }                from '$lib/server/redis.js';
import { db }                      from '$lib/server/db/client';
import { engramCards } from '$lib/server/db/schema.js';
import { desc, eq, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { runRg } from '../../../../scripts/rg-atlas/run-rg.mjs';
import { injectSummary } from '$lib/server/ai/opencode-skill.js';

// ── Shared result shape ───────────────────────────────────────────────────────

export interface MCPToolResult {
  tool: string;
  success: boolean;
  data: unknown;
  error?: string;
  meta?: { durationMs: number; cached?: boolean };
}

function ok(tool: string, data: unknown, durationMs: number, cached = false): MCPToolResult {
  return { tool, success: true, data, meta: { durationMs, cached } };
}
function err(tool: string, error: string, durationMs: number): MCPToolResult {
  return { tool, success: false, data: null, error, meta: { durationMs } };
}

function asStableKey(sourceRef: string): string {
  const trimmed = String(sourceRef ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('file:')) return trimmed;
  if (/^[a-z]+:/i.test(trimmed)) return trimmed;
  return `file:${trimmed}`;
}

function asSourceRef(stableKey: string): string {
  return stableKey.startsWith('file:') ? stableKey.slice(5) : stableKey;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function tokenizeLower(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length > 2);
}

function overlapScore(query: string, value: string): number {
  const q = new Set(tokenizeLower(query));
  if (q.size === 0) return 0;
  const tokens = tokenizeLower(value);
  if (tokens.length === 0) return 0;
  const overlap = tokens.filter((token) => q.has(token)).length;
  return clamp01(overlap / Math.max(2, q.size));
}

function trustBucketToScore(bucket: string): number {
  const normalized = bucket.trim().toLowerCase();
  if (normalized === 'local_verified') return 1.0;
  if (normalized === 'external_verified') return 0.8;
  if (normalized === 'synthetic') return 0.45;
  if (normalized === 'web_unverified') return 0.25;
  return 0.45;
}

function trustTierToScore(tier: number): number {
  const clampedTier = Math.max(-1, Math.min(2, tier));
  return (clampedTier + 1) / 3;
}

// ── Tool implementations ──────────────────────────────────────────────────────

/** trace.kag_search — lexical FTS search over codebase chunks */
export async function tool_trace_kag_search(args: {
  query: string;
  limit?: number;
  filter?: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await searchCodeLexical(args.query, {
      limit: Math.min(args.limit ?? 10, 20),
    });
    return ok(
      'trace.kag_search',
      rows.map((r) => ({
        stable_key: r.stable_key,
        file_path: r.file_path,
        symbol_name: r.symbol_name,
        content: r.content.slice(0, 500),
        score: r.lexical_score,
        tags: r.tags,
      })),
      Date.now() - t0
    );
  } catch (e) {
    return err('trace.kag_search', String(e), Date.now() - t0);
  }
}

/** search.dev_context — ACE codebase context for a query + optional file path */
export async function tool_search_dev_context(args: {
  query: string;
  filePath?: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const chunks = await fetchCodebaseContext(args.query, undefined, args.filePath);
    const limited = chunks?.slice(0, Math.min(args.limit ?? 8, 15)) ?? [];
    return ok(
      'search.dev_context',
      limited.map((c: Record<string, unknown>) => ({
        file_path: c.filePath,
        symbol_name: c.symbolName,
        content: String(c.content ?? '').slice(0, 600),
        score: c.score,
      })),
      Date.now() - t0
    );
  } catch (e) {
    return err('search.dev_context', String(e), Date.now() - t0);
  }
}

/** search.postgres_fts — direct lexical FTS with optional topo_class */
export async function tool_search_postgres_fts(args: {
  query: string;
  topoClass?: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await searchCodeLexical(args.query, {
      limit: Math.min(args.limit ?? 10, 20),
      topoClass: args.topoClass,
    });
    return ok(
      'search.postgres_fts',
      rows.map((r) => ({
        stable_key: r.stable_key,
        file_path: r.file_path,
        content: r.content.slice(0, 400),
        score: r.lexical_score,
        topo_class: r.topo_class,
      })),
      Date.now() - t0
    );
  } catch (e) {
    return err('search.postgres_fts', String(e), Date.now() - t0);
  }
}

/** codebase.rg_search — controlled ripgrep search over the repo codebase */
export async function tool_codebase_rg_search(args: {
  query: string;
  paths?: string[];
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const requestedPaths =
      Array.isArray(args.paths) && args.paths.length > 0 ? args.paths : ['src'];
    const searchPaths = requestedPaths
      .map((path) => String(path).trim())
      .filter(
        (path) =>
          path.length > 0 &&
          !path.includes('..') &&
          !path.startsWith('/') &&
          !/^[A-Za-z]:/.test(path)
      )
      .slice(0, 20);
    const hits = runRg(args.query, searchPaths.length > 0 ? searchPaths : ['src']).slice(
      0,
      Math.min(args.limit ?? 40, 200)
    );

    return ok(
      'codebase.rg_search',
      {
        query: args.query,
        paths: searchPaths.length > 0 ? searchPaths : ['src'],
        matchCount: hits.length,
        matches: hits,
      },
      Date.now() - t0
    );
  } catch (e) {
    return err('codebase.rg_search', String(e), Date.now() - t0);
  }
}

/** search.qdrant_topology — vector search filtered by topo_class */
export async function tool_search_qdrant_topology(args: {
  queryEmbedding: number[];
  topoClass?: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const rows = await searchQdrantCode(
      args.queryEmbedding,
      Math.min(args.limit ?? 10, 20),
      args.topoClass
    );
    return ok(
      'search.qdrant_topology',
      rows.map((r) => ({
        stable_key: r.stable_key,
        file_path: r.file_path,
        symbol_name: r.symbol_name,
        content: r.content.slice(0, 400),
        semantic_score: r.semantic_score,
        topo_class: r.topo_class,
        som_bmu_col: (r as unknown as Record<string, unknown>).som_bmu_col,
        som_bmu_row: (r as unknown as Record<string, unknown>).som_bmu_row,
      })),
      Date.now() - t0
    );
  } catch (e) {
    return err('search.qdrant_topology', String(e), Date.now() - t0);
  }
}

/** graph.expand_neighborhood — sourceRefs-first graph neighborhood expansion */
export async function tool_graph_expand_neighborhood(args: {
  sourceRefs?: string[];
  stableKeys?: string[];
  maxHops?: 1 | 2;
  depth?: number;
  limit?: number;
  query?: string;
  route?: string;
  symbol?: string;
  filePath?: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const requestedSourceRefs = Array.isArray(args.sourceRefs)
      ? args.sourceRefs.map((ref) => String(ref)).filter(Boolean)
      : [];
    const requestedStableKeys = Array.isArray(args.stableKeys)
      ? args.stableKeys.map((key) => String(key)).filter(Boolean)
      : [];

    const seedKeys = Array.from(
      new Set(
        [...requestedSourceRefs.map(asStableKey), ...requestedStableKeys.map(asStableKey)]
          .filter(Boolean)
          .slice(0, 20)
      )
    );

    if (seedKeys.length === 0) {
      return ok(
        'graph.expand_neighborhood',
        { ok: true, nodes: [], edges: [], sourceRefs: [], confidence: 0 },
        Date.now() - t0
      );
    }

    const maxHops: 1 | 2 = args.maxHops === 2 || Number(args.depth ?? 0) >= 2 ? 2 : 1;
    const limit = Math.min(Math.max(Number(args.limit ?? 40), 1), 120);

    const neighbourSets = await Promise.all(seedKeys.map((k) => expandNeighbours(k, maxHops)));
    const neighborKeys = Array.from(new Set(neighbourSets.flat())).slice(0, limit);
    const allKeys = Array.from(new Set([...seedKeys, ...neighborKeys]));

    // PageRank scores live in Redis at couchdb:pagerank_scores (written by run-pagerank.ts)
    let pageRankMap: Record<string, number> = {};
    try {
      const redis = getRedis();
      const raw = await redis.get('couchdb:pagerank_scores');
      if (raw) pageRankMap = JSON.parse(raw) as Record<string, number>;
    } catch {
      /* non-fatal — return neighbours without scores */
    }

    const primaryStableKey = seedKeys[0] ?? '';
    const derivedFilePath =
      args.filePath ??
      (primaryStableKey.startsWith('file:') ? primaryStableKey.slice(5) : undefined);
    const seedEnvelope = await buildSubgraphV1SeedNeighborhood({
      query: args.query,
      route: args.route,
      symbol: args.symbol,
      filePath: derivedFilePath,
      maxHops,
      maxNeighbors: 24,
    });

    const nodes = allKeys.map((key) => ({
      id: key,
      stableKey: key,
      sourceRef: asSourceRef(key),
      pagerank: pageRankMap[key] ?? null,
      kind: key.startsWith('file:') ? 'file' : 'node',
      isSeed: seedKeys.includes(key),
    }));

    const edges = seedKeys.flatMap((seed) =>
      neighborKeys
        .filter((neighbor) => neighbor !== seed)
        .map((neighbor) => ({
          from: seed,
          to: neighbor,
          relation: 'IMPORTS',
        }))
    );

    const sourceRefs = Array.from(new Set(nodes.map((node) => node.sourceRef))).slice(0, limit);
    const confidence = clamp01(
      (seedKeys.length > 0 ? 0.45 : 0) +
        Math.min(0.35, neighborKeys.length / Math.max(1, seedKeys.length * 8)) +
        (Object.keys(pageRankMap).length > 0 ? 0.2 : 0)
    );

    const legacyNeighbors = neighborKeys.map((key) => ({
      stable_key: key,
      pagerank: pageRankMap[key] ?? null,
    }));

    return ok(
      'graph.expand_neighborhood',
      {
        ok: true,
        nodes,
        edges,
        sourceRefs,
        confidence,
        graphPaths: edges.map((edge) => `${asSourceRef(edge.from)} -> ${asSourceRef(edge.to)}`),
        maxHops,
        center: primaryStableKey,
        seedEnvelope,
        neighbors: legacyNeighbors,
      },
      Date.now() - t0
    );
  } catch (e) {
    return err('graph.expand_neighborhood', String(e), Date.now() - t0);
  }
}

/** turbovec.rank_chunks — read-only RotorQuant blended rerank for source refs */
export async function tool_turbovec_rank_chunks(args: {
  query: string;
  sourceRefs: string[];
  limit?: number;
  graphNodes?: Array<{ sourceRef?: string; stableKey?: string; isSeed?: boolean }>;
  trustTiers?: Record<string, number>;
  trustBuckets?: Record<string, string>;
  recency?: Record<string, number>;
  vectorScores?: Record<string, number>;
  graphScores?: Record<string, number>;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const refs = Array.from(new Set((args.sourceRefs ?? []).map((ref) => String(ref)).filter(Boolean)));
    if (refs.length === 0) {
      return ok(
        'turbovec.rank_chunks',
        { ok: true, ranked: [], formula: '0.45*vector + 0.25*graph + 0.20*trust + 0.10*recency' },
        Date.now() - t0
      );
    }

    const graphRefSet = new Set(
      (args.graphNodes ?? [])
        .map((node) => {
          if (typeof node.sourceRef === 'string' && node.sourceRef.trim().length > 0) return node.sourceRef;
          if (typeof node.stableKey === 'string' && node.stableKey.trim().length > 0) return asSourceRef(node.stableKey);
          return '';
        })
        .filter(Boolean)
    );

    const ranked = refs
      .map((sourceRef) => {
        const vector = clamp01(args.vectorScores?.[sourceRef] ?? overlapScore(args.query, sourceRef));
        const graph = clamp01(
          args.graphScores?.[sourceRef] ?? (graphRefSet.has(sourceRef) ? 0.9 : 0.35)
        );
        const trust = clamp01(
          typeof args.trustTiers?.[sourceRef] === 'number'
            ? trustTierToScore(args.trustTiers[sourceRef] as number)
            : trustBucketToScore(args.trustBuckets?.[sourceRef] ?? 'synthetic')
        );
        const recency = clamp01(args.recency?.[sourceRef] ?? 0.5);

        const finalScore =
          0.45 * vector +
          0.25 * graph +
          0.2 * trust +
          0.1 * recency;

        return {
          sourceRef,
          finalScore: Number(finalScore.toFixed(6)),
          scores: {
            vector,
            graph,
            trust,
            recency,
          },
          reason: `vector=${vector.toFixed(2)} graph=${graph.toFixed(2)} trust=${trust.toFixed(2)} recency=${recency.toFixed(2)}`,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, Math.min(args.limit ?? 10, 30));

    const furtherResearch = (ranked[0]?.finalScore ?? 0) < 0.6 || ranked.length < 3;

    return ok(
      'turbovec.rank_chunks',
      {
        ok: true,
        formula: '0.45*vector + 0.25*graph + 0.20*trust + 0.10*recency',
        ranked,
        sourceRefs: ranked.map((item) => item.sourceRef),
        furtherResearch,
      },
      Date.now() - t0
    );
  } catch (e) {
    return err('turbovec.rank_chunks', String(e), Date.now() - t0);
  }
}

/** engram.chat_memory_recent — read-only recent memory fetch from engram_cards */
export async function tool_engram_chat_memory_recent(args: {
  userId?: string;
  sourceRefs?: string[];
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const limit = Math.min(Math.max(Number(args.limit ?? 8), 1), 40);
    const refs = Array.isArray(args.sourceRefs)
      ? Array.from(new Set(args.sourceRefs.map((ref) => String(ref)).filter(Boolean)))
      : [];

    const scopedRows =
      args.userId && String(args.userId).trim().length > 0
        ? await db
            .select()
            .from(engramCards)
            .where(eq(engramCards.memoryId, `chat:${String(args.userId).trim()}`))
            .orderBy(desc(engramCards.createdAt))
            .limit(limit)
        : await db
            .select()
            .from(engramCards)
            .where(eq(engramCards.scope, 'user'))
            .orderBy(desc(engramCards.createdAt))
            .limit(limit * 2);

    const filtered = refs.length
      ? scopedRows.filter((row) => {
          const rowRefs = Array.isArray(row.sourceRefs) ? row.sourceRefs.map(String) : [];
          return refs.some((ref) => rowRefs.some((rowRef) => rowRef.includes(ref)));
        })
      : scopedRows;

    return ok(
      'engram.chat_memory_recent',
      {
        ok: true,
        count: Math.min(filtered.length, limit),
        memories: filtered.slice(0, limit).map((row) => ({
          memoryId: row.memoryId,
          scope: row.scope,
          summary: row.summary,
          sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : [],
          createdAt: row.createdAt,
        })),
      },
      Date.now() - t0,
      true
    );
  } catch (e) {
    return err('engram.chat_memory_recent', String(e), Date.now() - t0);
  }
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
      neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD)
    );
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(
        `MATCH p = shortestPath(
           (a:CodebaseFile {filePath: $src})-[*]-(b:CodebaseFile {filePath: $tgt})
         )
         RETURN [n IN nodes(p) | n.filePath] AS path, length(p) AS hops`,
        { src: args.sourceFile, tgt: args.targetFile }
      );
      const record = result.records[0];
      return ok(
        'graph.shortest_path',
        {
          path: record?.get('path') ?? [],
          hops: record?.get('hops') ?? -1,
        },
        Date.now() - t0
      );
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (e) {
    return err('graph.shortest_path', String(e), Date.now() - t0);
  }
}

/** clusters.get_summary_lenses — Redis cluster summary cards (wiki notes) */
export async function tool_clusters_get_summary_lenses(args: {
  prefix?: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const redis = getRedis();
    const pattern = `wiki:note:dir:${args.prefix ?? '*'}`;
    const keys = (await redis.keys(pattern)).slice(0, args.limit ?? 10);
    const values = keys.length > 0 ? await redis.mget(...keys) : [];
    const lenses = keys.map((k, i) => {
      try {
        return { key: k, ...JSON.parse(values[i] ?? '{}') };
      } catch {
        return { key: k, raw: values[i] };
      }
    });
    return ok('clusters.get_summary_lenses', lenses, Date.now() - t0, true);
  } catch (e) {
    return err('clusters.get_summary_lenses', String(e), Date.now() - t0);
  }
}

/** trace.explain_retrieval — retrieval trace stored in Redis by hybrid-search */
export async function tool_trace_explain_retrieval(args: {
  traceKey: string;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const redis = getRedis();
    const raw = await redis.get(args.traceKey);
    if (!raw)
      return err('trace.explain_retrieval', `No trace at ${args.traceKey}`, Date.now() - t0);
    return ok('trace.explain_retrieval', JSON.parse(raw), Date.now() - t0, true);
  } catch (e) {
    return err('trace.explain_retrieval', String(e), Date.now() - t0);
  }
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
    return ok(
      'kb.search_cards',
      {
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
      },
      Date.now() - t0
    );
  } catch (e) {
    return err('kb.search_cards', String(e), Date.now() - t0);
  }
}

/** kb.search_schema_contract — retrieval over the standalone schema-indexer contract cards */
export async function tool_kb_search_schema_contract(args: {
  query: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const cards = await searchNotecards({
      query: args.query,
      limit: Math.min(args.limit ?? 10, 20),
      cardsPath: join(process.cwd(), 'memory', 'knowledge', 'schema-indexer-contract-cards.jsonl'),
    });
    return ok(
      'kb.search_schema_contract',
      {
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
      },
      Date.now() - t0
    );
  } catch (e) {
    return err('kb.search_schema_contract', String(e), Date.now() - t0);
  }
}

/** kb.get_card — fetch a single card by stable id or source path */
export async function tool_kb_get_card(args: { chunk_id: string }): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const card =
      (await getNotecardById(args.chunk_id)) ?? (await getNotecardBySourcePath(args.chunk_id));
    if (!card) return err('kb.get_card', `Card not found: ${args.chunk_id}`, Date.now() - t0);
    return ok(
      'kb.get_card',
      {
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
      },
      Date.now() - t0,
      true
    );
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
    if (!expanded)
      return err('kb.expand_neighbors', `Card not found: ${args.chunk_id}`, Date.now() - t0);
    return ok(
      'kb.expand_neighbors',
      {
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
      },
      Date.now() - t0,
      true
    );
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
    const match = matches.find(
      (item) => item.card_id === args.chunk_id || item.source_path === card?.source_path
    );
    return ok(
      'kb.explain_retrieval',
      {
        query: args.query,
        chunk_id: args.chunk_id,
        retrieved: Boolean(match),
        score: match?.score ?? null,
        rank_score: match?.rank_score ?? null,
        why: match?.why ?? [],
        card: card ?? null,
      },
      Date.now() - t0,
      true
    );
  } catch (e) {
    return err('kb.explain_retrieval', String(e), Date.now() - t0);
  }
}

/** context.build_kv_packet — return compressed ACE context bundle */
export async function tool_context_build_kv_packet(args: {
  query: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const allChunks = await fetchCodebaseContext(args.query);
    const chunks = (allChunks ?? []).slice(0, args.limit ?? 6);
    const packet = {
      query: args.query,
      chunkCount: chunks.length,
      chunks: chunks.slice(0, 6).map((c: Record<string, unknown>) => ({
        file_path: c.filePath,
        symbol: c.symbolName,
        summary: String(c.content ?? '').slice(0, 300),
        score: c.score,
      })),
      buildMs: Date.now() - t0,
    };
    return ok('context.build_kv_packet', packet, Date.now() - t0);
  } catch (e) {
    return err('context.build_kv_packet', String(e), Date.now() - t0);
  }
}

/** workspace.timeline — recent agent actions from trace tables */
export async function tool_workspace_timeline(args: {
  limit?: number;
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
  } catch (e) {
    return err('workspace.timeline', String(e), Date.now() - t0);
  }
}

/** topology.route_query — topology-aware search routing */
export async function tool_topology_route_query(args: {
  query: string;
  topoClass?: string;
  limit?: number;
}): Promise<MCPToolResult> {
  // Delegates to lexical search with topology filter — topology-search-client
  // requires a full server context; use postgres_fts with topo_class as proxy
  return tool_search_postgres_fts({
    query: args.query,
    topoClass: args.topoClass,
    limit: args.limit,
  });
}

/** search.hybrid — semantic+lexical via Go retrieval :8100/search/codebase, falls back to Postgres FTS */
export async function tool_search_hybrid(args: {
  query: string;
  topoClass?: string;
  limit?: number;
}): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const { searchCodebaseViaHttp } = await import('$lib/server/grpc/retrieval-client.js');
    const goResult = await searchCodebaseViaHttp({
      query: args.query,
      topoClass: args.topoClass,
      limit: args.limit ?? 10,
    });
    if (goResult && goResult.results.length > 0) {
      return ok('search.hybrid', goResult.results, Date.now() - t0, false);
    }
  } catch {
    /* Go service unavailable — fall through */
  }
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
    if (!card)
      return err(
        'context.get_compressed_card',
        `No card found for ${args.stableKey}`,
        Date.now() - t0
      );
    return ok('context.get_compressed_card', card, Date.now() - t0, false);
  } catch (e) {
    return err('context.get_compressed_card', String(e), Date.now() - t0);
  }
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
  } catch (e) {
    return err('context.explain_compression', String(e), Date.now() - t0);
  }
}

/** opencode.inject_summary — strictly validated LLM context injection from OpenCode agents */
export async function tool_opencode_inject_summary(args: Record<string, unknown>): Promise<MCPToolResult> {
  const t0 = Date.now();
  try {
    const result = await injectSummary(args);
    return ok('opencode.inject_summary', result, Date.now() - t0);
  } catch (e) {
    return err('opencode.inject_summary', String(e), Date.now() - t0);
  }
}

// ── Dispatch table ────────────────────────────────────────────────────────────

export const TOOL_DISPATCH: Record<
  string,
  (args: Record<string, unknown>) => Promise<MCPToolResult>
> = {
  'trace.kag_search': (a) =>
    tool_trace_kag_search(a as Parameters<typeof tool_trace_kag_search>[0]),
  'trace.explain_retrieval': (a) =>
    tool_trace_explain_retrieval(a as Parameters<typeof tool_trace_explain_retrieval>[0]),
  'topology.route_query': (a) =>
    tool_topology_route_query(a as Parameters<typeof tool_topology_route_query>[0]),
  'search.hybrid': (a) => tool_search_hybrid(a as Parameters<typeof tool_search_hybrid>[0]),
  'search.dev_context': (a) =>
    tool_search_dev_context(a as Parameters<typeof tool_search_dev_context>[0]),
  'search.postgres_fts': (a) =>
    tool_search_postgres_fts(a as Parameters<typeof tool_search_postgres_fts>[0]),
  'codebase.rg_search': (a) =>
    tool_codebase_rg_search(a as Parameters<typeof tool_codebase_rg_search>[0]),
  'search.qdrant_topology': (a) =>
    tool_search_qdrant_topology(a as Parameters<typeof tool_search_qdrant_topology>[0]),
  'graph.expand_neighborhood': (a) =>
    tool_graph_expand_neighborhood(a as Parameters<typeof tool_graph_expand_neighborhood>[0]),
  'turbovec.rank_chunks': (a) =>
    tool_turbovec_rank_chunks(a as Parameters<typeof tool_turbovec_rank_chunks>[0]),
  'engram.chat_memory_recent': (a) =>
    tool_engram_chat_memory_recent(a as Parameters<typeof tool_engram_chat_memory_recent>[0]),
  'graph.shortest_path': (a) =>
    tool_graph_shortest_path(a as Parameters<typeof tool_graph_shortest_path>[0]),
  'clusters.get_summary_lenses': (a) =>
    tool_clusters_get_summary_lenses(a as Parameters<typeof tool_clusters_get_summary_lenses>[0]),
  'context.build_kv_packet': (a) =>
    tool_context_build_kv_packet(a as Parameters<typeof tool_context_build_kv_packet>[0]),
  'context.get_compressed_card': (a) =>
    tool_context_get_compressed_card(a as Parameters<typeof tool_context_get_compressed_card>[0]),
  'context.explain_compression': (a) =>
    tool_context_explain_compression(a as Parameters<typeof tool_context_explain_compression>[0]),
  'workspace.timeline': (a) =>
    tool_workspace_timeline(a as Parameters<typeof tool_workspace_timeline>[0]),
  'kb.search_cards': (a) => tool_kb_search_cards(a as Parameters<typeof tool_kb_search_cards>[0]),
  'kb.search_schema_contract': (a) =>
    tool_kb_search_schema_contract(a as Parameters<typeof tool_kb_search_schema_contract>[0]),
  'kb.get_card': (a) => tool_kb_get_card(a as Parameters<typeof tool_kb_get_card>[0]),
  'kb.expand_neighbors': (a) =>
    tool_kb_expand_neighbors(a as Parameters<typeof tool_kb_expand_neighbors>[0]),
  'kb.explain_retrieval': (a) =>
    tool_kb_explain_retrieval(a as Parameters<typeof tool_kb_explain_retrieval>[0]),
  'opencode.inject_summary': (a) =>
    tool_opencode_inject_summary(a as Parameters<typeof tool_opencode_inject_summary>[0]),
};
