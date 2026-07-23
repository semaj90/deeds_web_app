/**
 * Search lanes abstraction for Phase 3
 * Consolidates Qdrant client, cuVS client, TurboVec prefilter, and BM25 fallback
 * behind a unified SearchLane interface.
 *
 * FILTER PUSHDOWN CONTRACT:
 *   source_ref / feature_ids / directory_path / kmeans_cluster_ids / som_row / som_col / packet_type
 *   are pushed INTO backend queries (Qdrant filter payload, SQL WHERE clause, GPU pre-mask).
 *   min_confidence / min_score / exclude_feature_ids / include_packet_keys are post-fetch gates.
 */

import type {
  SearchResult,
  SearchLaneConfig,
  SearchFilter,
  SearchLaneContext
} from './types.js';
import { RETRIEVAL_LIMITS } from './search-contract.js';
import { VECTOR_LANES } from '../vector/lane-registry.js';
import { sql, type SQL } from 'drizzle-orm';

async function getDb() {
  const mod = await import('$lib/server/db/client.js');
  return mod.db;
}

// ── LIKE wildcard escaping ────────────────────────────────────────────────────

/** Escape PostgreSQL LIKE metacharacters so user input is treated as a literal prefix. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

// ── Qdrant filter builder ────────────────────────────────────────────────────

/**
 * Build a Qdrant must[] filter array from SearchFilter pushdown fields.
 * Only reads top-level canonical filter fields — not the deprecated metadata sub-object.
 */
function buildQdrantFilter(filters?: SearchFilter): Record<string, unknown> | undefined {
  if (!filters) return undefined;
  const must: Record<string, unknown>[] = [];

  if (filters.source_ref) must.push({ key: 'source_ref', match: { value: filters.source_ref } });
  if (filters.source_ref_pattern) must.push({ key: 'source_ref', match: { text: filters.source_ref_pattern } });
  if (filters.directory_path) must.push({ key: 'directory_path', match: { text: filters.directory_path } });
  if (filters.feature_ids?.length) must.push({ key: 'feature_id', match: { any: filters.feature_ids } });
  if (filters.kmeans_cluster_ids?.length) must.push({ key: 'kmeans_cluster_id', match: { any: filters.kmeans_cluster_ids } });
  if (filters.som_row !== undefined) must.push({ key: 'som_row', match: { value: filters.som_row } });
  if (filters.som_col !== undefined) must.push({ key: 'som_col', match: { value: filters.som_col } });
  if (filters.packet_type) must.push({ key: 'packet_type', match: { value: filters.packet_type } });
  // Qdrant-payload-only fields (not in SQL tables)
  if (filters.language) must.push({ key: 'language', match: { value: filters.language } });
  if (filters.file_extension) must.push({ key: 'file_extension', match: { value: filters.file_extension } });
  if (filters.domain_class) must.push({ key: 'domain_class', match: { value: filters.domain_class } });
  if (filters.jsonb_contains) must.push({ key: 'metadata', match: { value: filters.jsonb_contains } });

  return must.length > 0 ? { must } : undefined;
}

// ── SQL WHERE clause builders — one per physical schema ──────────────────────

/**
 * Build parameterised SQL WHERE fragments for the atlas_packets table (alias ap).
 * Uses explicit ::text[] and ::integer[] casts for ANY() arrays.
 * Uses ESCAPE '\\' for LIKE patterns so % and _ in user input are literal.
 * Never uses sql.raw() — all values are Drizzle parameters.
 */
function buildPacketConditions(filters?: SearchFilter): SQL | undefined {
  if (!filters) return undefined;
  const frags: SQL[] = [];

  if (filters.source_ref) {
    frags.push(sql`ap.source_ref = ${filters.source_ref}`);
  }
  if (filters.source_ref_pattern) {
    frags.push(sql`ap.source_ref LIKE ${escapeLike(filters.source_ref_pattern) + '%'} ESCAPE '\\'`);
  }
  if (filters.directory_path) {
    frags.push(sql`ap.directory_path LIKE ${escapeLike(filters.directory_path) + '%'} ESCAPE '\\'`);
  }
  if (filters.feature_ids?.length) {
    frags.push(sql`ap.feature_id = ANY(${filters.feature_ids}::text[])`);
  }
  if (filters.kmeans_cluster_ids?.length) {
    frags.push(sql`ap.kmeans_cluster_id = ANY(${filters.kmeans_cluster_ids}::integer[])`);
  }
  if (filters.som_row !== undefined) {
    frags.push(sql`ap.som_row = ${filters.som_row}`);
  }
  if (filters.som_col !== undefined) {
    frags.push(sql`ap.som_col = ${filters.som_col}`);
  }
  if (filters.packet_type) {
    frags.push(sql`ap.packet_type = ${filters.packet_type}`);
  }
  if (frags.length === 0) return undefined;
  return frags.reduce((acc, frag) => sql`${acc} AND ${frag}`);
}

/**
 * Build parameterised SQL WHERE fragments for the codebase_chunk_index table (alias c).
 * Only includes columns that actually exist on codebase_chunk_index.
 */
function buildChunkConditions(filters?: SearchFilter): SQL | undefined {
  if (!filters) return undefined;
  const frags: SQL[] = [];

  // codebase_chunk_index has source_ref and feature_id; no directory_path or SOM columns
  if (filters.source_ref) {
    frags.push(sql`c.source_ref = ${filters.source_ref}`);
  }
  if (filters.source_ref_pattern) {
    frags.push(sql`c.source_ref LIKE ${escapeLike(filters.source_ref_pattern) + '%'} ESCAPE '\\'`);
  }
  if (filters.feature_ids?.length) {
    frags.push(sql`c.feature_id = ANY(${filters.feature_ids}::text[])`);
  }
  if (frags.length === 0) return undefined;
  return frags.reduce((acc, frag) => sql`${acc} AND ${frag}`);
}

function getQueryVectorForLane(
  context: SearchLaneContext,
  lane: 'gpu-cuvs' | 'qdrant' | 'qdrant-768' | 'qdrant-384'
): Float32Array | undefined {
  if (lane === 'qdrant-384') {
    return context.queryVectorBundle?.dense384?.vector
      ?? context.queryVectorBundle?.dense384
      ?? undefined;
  }

  if (lane === 'qdrant' || lane === 'qdrant-768') {
    return context.queryVectorBundle?.dense768?.vector
      ?? context.queryVectorBundle?.dense768
      ?? context.queryVector
      ?? undefined;
  }

  return context.queryVectorBundle?.latent64?.vector
    ?? context.queryVectorBundle?.latent64
    ?? context.queryVector
    ?? undefined;
}

// ── Interface ────────────────────────────────────────────────────────────────

export interface ISearchLane {
  name: string;
  health(): Promise<boolean>;
  search(context: SearchLaneContext): Promise<SearchResult[]>;
  config(): SearchLaneConfig;
}

// ── Abstract base ────────────────────────────────────────────────────────────

export abstract class SearchLaneBase implements ISearchLane {
  abstract name: string;
  abstract health(): Promise<boolean>;
  abstract search(context: SearchLaneContext): Promise<SearchResult[]>;
  abstract config(): SearchLaneConfig;

  /** Post-fetch gates only — min_confidence, min_score, exclusions */
  protected applyPostFetchFilters(results: SearchResult[], filters?: SearchFilter): SearchResult[] {
    if (!filters) return results;

    return results.filter((r) => {
      if (filters.min_confidence !== undefined && r.confidence < filters.min_confidence) return false;
      if (filters.min_score !== undefined && r.score < filters.min_score) return false;
      if (filters.exclude_feature_ids?.includes(r.feature_id ?? '')) return false;
      if (filters.include_packet_keys && !filters.include_packet_keys.includes(r.packet_key ?? '')) return false;
      return true;
    });
  }

  protected rankResults(results: SearchResult[]): SearchResult[] {
    return results.map((r, idx) => ({ ...r, rank: idx }));
  }
}

// ── GPU cuVS lane ────────────────────────────────────────────────────────────

export class GpuCuvSLane extends SearchLaneBase {
  name = 'gpu-cuvs';

  private url: string;
  private timeout: number;

  constructor(url = 'http://127.0.0.1:8791', timeout = 30000) {
    super();
    this.url = url;
    this.timeout = timeout;
  }

  async health(): Promise<boolean> {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(`${this.url}/health`, { signal: ac.signal });
      clearTimeout(t);
      return res.ok;
    } catch { return false; }
  }

  async search(context: SearchLaneContext): Promise<SearchResult[]> {
    if (!(await this.health())) throw new Error('GPU cuVS service unavailable');
    const queryVector = getQueryVectorForLane(context, 'gpu-cuvs');
    if (!queryVector || queryVector.length === 0) return [];

    // Build cluster pre-mask if kmeans_cluster_ids filter present
    const body: Record<string, unknown> = {
      query: Array.from(queryVector),
      k: context.topK,
    };
    if (context.filters?.kmeans_cluster_ids?.length) {
      body.cluster_filter = context.filters.kmeans_cluster_ids;
    }
    if (context.filters?.source_ref) body.source_ref_filter = context.filters.source_ref;
    if (context.filters?.feature_ids?.length) body.feature_id_filter = context.filters.feature_ids;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeout);
    const res = await fetch(`${this.url}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) throw new Error(`GPU search failed: ${res.status}`);

    const data = (await res.json()) as {
      indices: number[];
      distances: number[];
      metric: string;
    };

    const results: SearchResult[] = data.indices.map((idx, i) => ({
      id: String(idx),
      rank: i,
      score: this.distanceToScore(data.distances[i], data.metric),
      confidence: 0.95,
      source: 'gpu-cuvs' as const,
      packet_key: null,
      source_ref: null,
      feature_id: null,
      file_path: null,
      summary: null,
      metadata: {
        gpu_indices: [idx],
        gpu_distances: [data.distances[i]],
      },
    }));

    return this.applyPostFetchFilters(results, context.filters);
  }

  config(): SearchLaneConfig {
    return { enabled: true, priority: 0, weight: 0.4, fallback: 'qdrant' };
  }

  private distanceToScore(distance: number, metric: string): number {
    if (metric === 'cosine') return Math.max(0, 1 - distance);
    if (metric === 'l2') return Math.exp(-distance);
    if (metric === 'inner_product') return Math.max(0, distance);
    return 0.5;
  }
}

// ── Qdrant lane ──────────────────────────────────────────────────────────────

export class QdrantLane extends SearchLaneBase {
  name = 'qdrant';

  private url: string;
  private collection: string;
  private embeddingDimension: number;
  private timeout: number;

  constructor(
    url = 'http://127.0.0.1:6333',
    collection = VECTOR_LANES.source768.collection,
    embeddingDimension = VECTOR_LANES.source768.dimension,
    timeout = 30000
  ) {
    super();
    this.url = url;
    this.collection = collection;
    this.embeddingDimension = embeddingDimension;
    this.timeout = timeout;
  }

  async health(): Promise<boolean> {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(`${this.url}/collections/${this.collection}`, { signal: ac.signal });
      clearTimeout(t);
      return res.ok;
    } catch { return false; }
  }

  async search(context: SearchLaneContext): Promise<SearchResult[]> {
    if (!(await this.health())) throw new Error('Qdrant service unavailable');
    const queryVector = getQueryVectorForLane(context, 'qdrant');
    if (!queryVector || queryVector.length === 0) return [];

    // Build Qdrant filter from pushdown fields
    const qdrantFilter = buildQdrantFilter(context.filters);
    const limit = context.topK;

    const body: Record<string, unknown> = {
      vector: Array.from(queryVector),
      limit,
      with_payload: true,
    };
    if (qdrantFilter) body.filter = qdrantFilter;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeout);
    const res = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) throw new Error(`Qdrant search failed: ${res.status}`);

    const data = (await res.json()) as {
      result: Array<{ id: string; score: number; payload: Record<string, unknown> }>;
    };

    const results: SearchResult[] = (data.result ?? []).map((point, i) => ({
      id: point.id,
      rank: i,
      score: Math.min(1, Math.max(0, point.score)),
      confidence: 0.85,
      source: this.name as SearchResult['source'],
      lane_id: `${this.collection}:content`,
      packet_key: (point.payload?.packet_key as string | null) ?? null,
      source_ref: (point.payload?.source_ref as string | null) ?? null,
      feature_id: (point.payload?.feature_id as string | null) ?? null,
      file_path: (point.payload?.file_path as string | null) ?? null,
      summary: (point.payload?.summary as string | null) ?? null,
      metadata: {
        qdrant_point_id: point.id,
        qdrant_collection: this.collection,
        embedding_dim: this.embeddingDimension,
        payload: point.payload,
      },
    }));

    return this.applyPostFetchFilters(results, context.filters);
  }

  config(): SearchLaneConfig {
    return { enabled: true, priority: 1, weight: 0.35, fallback: 'bm25' };
  }
}

// ── Qdrant 768-dim lane (source semantic lane) ───────────────────────────────

export class QdrantLane768 extends QdrantLane {
  name = 'qdrant-768' as const;

  constructor(
    url = 'http://127.0.0.1:6333',
    collection = VECTOR_LANES.source768.collection,
    embeddingDimension = VECTOR_LANES.source768.dimension,
    timeout = 30000
  ) {
    super(url, collection, embeddingDimension, timeout);
  }
}

// ── Qdrant 384-dim lane (codebase_chunks_384_hybrid — canonical retrieval contract) ──

/**
 * Dense retrieval lane targeting the 384-dim canonical collection.
 * Uses named vector "content" which `codebase_chunks_384_hybrid` exposes.
 * This is the canonical retrieval contract for truncated-aware multi-hop traversal.
 * Falls back gracefully if the collection has 0 indexed points (TurboVec not yet
 * retargeted) — returns empty slice rather than throwing.
 */
export class QdrantLane384 extends SearchLaneBase {
  name = 'qdrant-384' as const;

  private url: string;
  private collection: string;
  private namedVector: string;
  private embeddingDimension: number;
  private timeout: number;

  constructor(
    url = 'http://127.0.0.1:6333',
    collection = VECTOR_LANES.retrieval384.collection,
    namedVector = VECTOR_LANES.retrieval384.vectorName,
    embeddingDimension = VECTOR_LANES.retrieval384.dimension,
    timeout = 30000
  ) {
    super();
    this.url = url;
    this.collection = collection;
    this.namedVector = namedVector;
    this.embeddingDimension = embeddingDimension;
    this.timeout = timeout;
  }

  async health(): Promise<boolean> {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(`${this.url}/collections/${this.collection}`, { signal: ac.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      const data = (await res.json()) as { result?: { vectors_count?: number } };
      // Degrade gracefully when collection is empty (indexed: 0 during TurboVec transition)
      const count = data.result?.vectors_count ?? 0;
      return count > 0;
    } catch { return false; }
  }

  async search(context: SearchLaneContext): Promise<SearchResult[]> {
    const healthy = await this.health();
    if (!healthy) return [];
    const queryVector = getQueryVectorForLane(context, 'qdrant-384');
    if (!queryVector || queryVector.length === 0) return [];

    const qdrantFilter = buildQdrantFilter(context.filters);
    const limit = context.topK;

    // Use named vector syntax for collections with multiple vector configs
    const body: Record<string, unknown> = {
      vector: { name: this.namedVector, vector: Array.from(queryVector) },
      limit,
      with_payload: true,
    };
    if (qdrantFilter) body.filter = qdrantFilter;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), this.timeout);
    const res = await fetch(`${this.url}/collections/${this.collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(t);

    if (!res.ok) {
      console.warn(`[QdrantLane384] Search returned ${res.status}`);
      return [];
    }

    const data = (await res.json()) as {
      result: Array<{ id: string; score: number; payload: Record<string, unknown> }>;
    };

    const results: SearchResult[] = (data.result ?? []).map((point, i) => ({
      id: point.id,
      rank: i,
      score: Math.min(1, Math.max(0, point.score)),
      confidence: 0.88,
      source: 'qdrant-384' as const,
      lane_id: 'codebase_chunks_384_hybrid:content',
      packet_key: (point.payload?.packet_key as string | null) ?? null,
      source_ref: (point.payload?.source_ref as string | null) ?? null,
      feature_id: (point.payload?.feature_id as string | null) ?? null,
      file_path: (point.payload?.file_path as string | null) ?? null,
      summary: (point.payload?.summary as string | null) ?? null,
      metadata: {
        qdrant_point_id: point.id,
        qdrant_collection: this.collection,
        embedding_dim: this.embeddingDimension,
        payload: point.payload,
      },
    }));

    return this.applyPostFetchFilters(results, context.filters);
  }

  config(): SearchLaneConfig {
    // Slightly higher weight than the 768-dim lane — 384-dim is the retrieval contract
    return { enabled: true, priority: 1, weight: 0.38, fallback: 'bm25' };
  }
}

// ── Lexical lane (keyword BM25/FTS) ─────────────────────────────────────────

/**
 * Lexical lane: keyword extraction from query string + Postgres FTS/trigram search.
 * Accepts string queries directly (no vector required).
 * topk range: 1–10 per call, slight score variance from tsvector rank.
 */
export class LexicalLane extends SearchLaneBase {
  name = 'lexical';

  async health(): Promise<boolean> {
    try {
      const db = await getDb();
      await db.execute(sql`SELECT 1`);
      return true;
    } catch { return false; }
  }

  async search(context: SearchLaneContext): Promise<SearchResult[]> {
    const queryStr = (context.keywordBundle?.exactKeywords?.length
      ? context.keywordBundle.exactKeywords.join(' ')
      : context.queryText).trim();
    if (!queryStr.trim()) return [];

    const limit = Math.min(context.topK, RETRIEVAL_LIMITS.exactLexicalTopK);

    // Surface token list for metadata — websearch_to_tsquery handles actual query parsing
    const queryTokens = queryStr.trim().split(/\s+/).filter(t => t.length >= 2).slice(0, 16);

    const condition = buildPacketConditions(context.filters);

    try {
      const db = await getDb();
      const results = await db.execute(sql`
        SELECT
          ap.packet_key,
          ap.source_ref,
          ap.feature_id,
          ap.file_path,
          ap.summary,
          ap.kmeans_cluster_id,
          ap.som_row,
          ap.som_col,
          ts_rank_cd(
            to_tsvector('english', COALESCE(ap.summary, '') || ' ' || COALESCE(ap.source_ref, '')),
            websearch_to_tsquery('english', ${queryStr})
          ) AS ts_rank
        FROM atlas_packets ap
        WHERE to_tsvector('english', COALESCE(ap.summary, '') || ' ' || COALESCE(ap.source_ref, ''))
              @@ websearch_to_tsquery('english', ${queryStr})
          ${condition ? sql`AND ${condition}` : sql``}
        ORDER BY ts_rank DESC
        LIMIT ${limit}
      `);

      const rows = (results.rows ?? []) as Array<{
        packet_key: string | null;
        source_ref: string | null;
        feature_id: string | null;
        file_path: string | null;
        summary: string | null;
        kmeans_cluster_id: number | null;
        som_row: number | null;
        som_col: number | null;
        ts_rank: number;
      }>;

      const mapped: SearchResult[] = rows.map((row, i) => ({
        id: row.packet_key ?? `lexical-${i}`,
        rank: i,
        // Slight variance: ts_rank + position decay
        score: Math.min(0.99, Math.max(0.01, (row.ts_rank ?? 0.1) * (1 - i * 0.02))),
        confidence: 0.70,
        source: 'lexical' as const,
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        file_path: row.file_path,
        summary: row.summary,
        metadata: {
          ts_rank: row.ts_rank,
          keywords: queryTokens,
          kmeans_cluster_id: row.kmeans_cluster_id,
          som_cell_x: row.som_row,
          som_cell_y: row.som_col,
        },
      }));

      return this.applyPostFetchFilters(mapped, context.filters);
    } catch (err) {
      console.error('[LexicalLane] Search error:', err instanceof Error ? err.message : '');
      return [];
    }
  }

  config(): SearchLaneConfig {
    return { enabled: true, priority: 2, weight: 0.20 };
  }
}

// ── BM25 lane (trigram fallback) ─────────────────────────────────────────────

export class Bm25Lane extends SearchLaneBase {
  name = 'bm25';

  async health(): Promise<boolean> {
    try {
      const db = await getDb();
      await db.execute(sql`SELECT 1`);
      return true;
    } catch { return false; }
  }

  async search(context: SearchLaneContext): Promise<SearchResult[]> {
    const queryStr = (context.keywordBundle?.exactKeywords?.length
      ? context.keywordBundle.exactKeywords.join(' ')
      : context.queryText).trim();
    if (!queryStr) return [];

    const limit = context.topK;
    const condition = buildChunkConditions(context.filters);

    try {
      const db = await getDb();
      const results = await db.execute(sql`
        SELECT
          c.id,
          c.summary,
          c.source_ref,
          similarity(
            COALESCE(c.summary, '') || ' ' || COALESCE(c.source_ref, ''),
            ${queryStr}
          ) AS sim_score
        FROM codebase_chunk_index c
        WHERE (COALESCE(c.summary, '') || ' ' || COALESCE(c.source_ref, ''))
              % ${queryStr}
          ${condition ? sql`AND ${condition}` : sql``}
        ORDER BY sim_score DESC
        LIMIT ${limit}
      `);

      if (!results.rows?.length) return [];

      return (results.rows as Array<{
        id: number;
        summary: string | null;
        source_ref: string | null;
        sim_score: number;
      }>).map((row, idx) => ({
        id: String(row.id),
        rank: idx,
        score: Math.min(1.0, row.sim_score || 0.5),
        confidence: 0.75,
        source: 'bm25' as const,
        packet_key: null,
        source_ref: row.source_ref,
        feature_id: null,
        file_path: row.source_ref,
        summary: row.summary,
        metadata: { bm25_similarity: row.sim_score },
      }));
    } catch (err) {
      console.error('[Bm25Lane] Search error:', err instanceof Error ? err.message : '');
      return [];
    }
  }

  config(): SearchLaneConfig {
    return { enabled: true, priority: 3, weight: 0.15 };
  }
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class SearchLaneRegistry {
  private lanes: Map<string, ISearchLane> = new Map();
  private fallbackChain: string[] = [];

  constructor() {
    this.register(new GpuCuvSLane());
    // 768-dim lane: explicit source semantic lane for adaptive hot/warm/cold routing.
    this.register(new QdrantLane768());
    // Backward-compatible alias used by older retrieval call sites.
    this.register(new QdrantLane());
    // 384-dim lane: truncated-aware canonical retrieval contract, codebase_chunks_384_hybrid
    this.register(new QdrantLane384());
    this.register(new LexicalLane());
    this.register(new Bm25Lane());
    // Fallback chain for single-lane queries — prefers the explicit 768 source lane before legacy alias.
    this.fallbackChain = ['gpu-cuvs', 'qdrant-384', 'qdrant-768', 'qdrant', 'lexical', 'bm25'];
  }

  register(lane: ISearchLane): void {
    this.lanes.set(lane.name, lane);
  }

  get(name: string): ISearchLane | undefined {
    return this.lanes.get(name);
  }

  getAll(): ISearchLane[] {
    return Array.from(this.lanes.values());
  }

  getFallbackChain(): string[] {
    return [...this.fallbackChain];
  }

  setFallbackChain(chain: string[]): void {
    this.fallbackChain = chain;
  }

  async searchWithFallback(
    context: SearchLaneContext
  ): Promise<{ results: SearchResult[]; lane: string }> {
    const chain = this.getFallbackChain();

    for (const laneName of chain) {
      const lane = this.get(laneName);
      if (!lane) continue;

      try {
        if (!(await lane.health())) {
          console.warn(`[SearchLane] ${laneName} unhealthy, trying next`);
          continue;
        }
        const results = await lane.search(context);
        return { results, lane: laneName };
      } catch (err) {
        console.warn(`[SearchLane] ${laneName} failed:`, err instanceof Error ? err.message : '');
        continue;
      }
    }

    throw new Error('All search lanes failed');
  }
}

let registry: SearchLaneRegistry | null = null;

export function getSearchLaneRegistry(): SearchLaneRegistry {
  if (!registry) registry = new SearchLaneRegistry();
  return registry;
}
