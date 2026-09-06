/**
 * Stage 1: Deterministic Candidate Retrieval
 *
 * Retrieves candidates from four independent sources in parallel:
 * - PostgreSQL lexical fallback (ts_rank + trigram/ILIKE fallback)
 * - Qdrant ANN (semantic search)
 * - Exact matches (function symbols, class names)
 * - AST matches (structural patterns)
 *
 * Returns a flat multiset of source-specific candidates.
 * Fusion happens downstream so the same packet can accumulate evidence
 * from multiple lanes before reciprocal rank fusion.
 */

import { sql } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { basename, extname, resolve as pathResolve } from 'node:path';
import type { Candidate } from './search-runtime.js';
import { createBm42SparseRetriever } from './adapters/bm42-sparse-retriever.js';
import { embedQueryForLane } from './embedding-service.js';
import { VECTOR_INDEX_REGISTRY } from '$lib/server/vector/vector-index-registry.js';
import { QDRANT_DENSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import { RETRIEVAL_LIMITS, identifierVariants, tokenizeKeywordSurface } from './search-contract.js';
import { resolveCanonicalIdentity } from './identity-resolution.js';
import { resolveProjectionsBatch } from '$lib/server/atlas/retrieval/projection-registry-v1.js';

const BM25_LIMIT = RETRIEVAL_LIMITS.postgresFtsTopK;
const QDRANT_LIMIT = RETRIEVAL_LIMITS.denseTopK;
const EXACT_LIMIT = RETRIEVAL_LIMITS.exactLexicalTopK;
const AST_LIMIT = RETRIEVAL_LIMITS.topologyTopK;
const RG_LIMIT = RETRIEVAL_LIMITS.maxGraphNeighbors;
const SPARSE_LIMIT = RETRIEVAL_LIMITS.sparseTopK;

let sparseRetriever: ReturnType<typeof createBm42SparseRetriever> | null = null;

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function pickNullableString(...values: unknown[]): string | null {
  return pickString(...values);
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Compute canonical identity plus observability fields for a candidate.
 *
 * `packetKey` and `symbolVersionId` are normalized to the resolved canonical identity key so the
 * search runtime deduplicates on the shared precedence chain. The original raw fields are carried
 * separately as snake_case metadata so degraded fallback cases stay visible instead of silently
 * masquerading as canonical.
 */
export function deriveIdentity(input: {
  symbolVersionId?: unknown;
  packetKey?: unknown;
  /** Optional chunk-unique fallback tier, checked before source_ref. */
  contentHash?: unknown;
  sourceRef?: unknown;
  fallbackId: string;
}): {
  packetKey: string;
  symbolVersionId: string;
  symbol_version_id: string | null;
  packet_key: string | null;
  source_ref: string | null;
  content_hash: string | null;
  fallback_id: string;
  identityStatus: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
  identitySource: ReturnType<typeof resolveCanonicalIdentity>['source'];
} {
  const resolved = resolveCanonicalIdentity({
    symbolVersionId: typeof input.symbolVersionId === 'string' ? input.symbolVersionId : undefined,
    packetKey: typeof input.packetKey === 'string' ? input.packetKey : undefined,
    contentHash: typeof input.contentHash === 'string' ? input.contentHash : undefined,
    sourceRef: typeof input.sourceRef === 'string' ? input.sourceRef : undefined,
    fallbackId: input.fallbackId,
  });
  return {
    packetKey: resolved.canonicalId,
    symbolVersionId: resolved.canonicalId,
    symbol_version_id: pickString(input.symbolVersionId),
    packet_key: pickString(input.packetKey),
    source_ref: pickString(input.sourceRef),
    content_hash: pickString(input.contentHash),
    fallback_id: input.fallbackId,
    identityStatus: resolved.status,
    identitySource: resolved.source,
  };
}

/**
 * RF-QDRANT-HYDRATION-02: batch-validate each dense candidate's Qdrant point id against its own
 * `postgres_id` payload via `ProjectionRegistryV1`, and attach `canonicalChunkId` only when it
 * checks out. Fail-open by design -- a `ProjectionRegistryV1` error (network, schema drift) must
 * never remove or block candidates that already resolved via the existing symbol_version_id ->
 * packet_key -> content_hash -> source_ref precedence; it only adds evidence, never subtracts it.
 */
export async function hydrateCanonicalChunkIds(candidates: Candidate[]): Promise<void> {
  if (candidates.length === 0) return;
  try {
    // Deduplicate by point id -- `resolveProjectionsBatch` does not guarantee output order
    // matches input order, so results are matched back by key, never by array position.
    const byPointId = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const pointId = candidate.qdrantPointId ?? candidate.id;
      const bucket = byPointId.get(pointId) ?? [];
      bucket.push(candidate);
      byPointId.set(pointId, bucket);
    }
    const keys = [...byPointId.keys()].map((canonicalPacketIdentity) => ({
      canonicalPacketIdentity,
      representationIdentity: 'semantic_768' as const,
    }));
    const resolutions = await resolveProjectionsBatch(keys);
    for (const resolution of resolutions) {
      if (!resolution.ok) continue;
      const bucket = byPointId.get(resolution.ref.physicalPointId);
      if (!bucket) continue;
      for (const candidate of bucket) candidate.canonicalChunkId = resolution.ref.physicalPointId;
    }
  } catch (error) {
    console.warn('[retrieveQdrant] RF-QDRANT-HYDRATION-02 batch hydration failed (fail-open):', (error as Error).message);
  }
}

async function getDb() {
  const mod = await import('$lib/server/db/client.js');
  return mod.db;
}

async function getQdrantManager() {
  const mod = await import('$lib/server/vector/qdrant-manager.js');
  return mod.getQdrantManager();
}

function getSparseRetriever(): ReturnType<typeof createBm42SparseRetriever> {
  if (!sparseRetriever) {
    sparseRetriever = createBm42SparseRetriever();
  }
  return sparseRetriever;
}

/**
 * Retrieve candidates from all sources
 */
export async function retrieveAllCandidates(
  query: string,
  filters?: { sourceRefs?: string[]; pathPrefixes?: string[] },
  _limit: number = 128,
  options?: { includeVectorLanes?: boolean },
): Promise<Candidate[]> {
  const includeVectorLanes = options?.includeVectorLanes ?? true;

  const [bm25, qdrant, exact, ast, rg, sparse] = await Promise.all([
    retrieveBM25(query),
    includeVectorLanes ? withTimeout(retrieveQdrant(query), 5000, []) : Promise.resolve([]),
    retrieveExactMatches(query),
    retrieveASTMatches(query),
    retrieveRipgrep(query),
    includeVectorLanes ? withTimeout(retrieveBM42Sparse(query), 5000, []) : Promise.resolve([]),
  ]);

  const combined = [...bm25, ...qdrant, ...exact, ...ast, ...rg, ...sparse];
  if (!filters) {
    return combined;
  }

  return combined.filter((candidate) => {
    if (filters.sourceRefs?.length && !filters.sourceRefs.includes(candidate.sourceRef)) {
      return false;
    }
    if (filters.pathPrefixes?.length && !filters.pathPrefixes.some((prefix) => candidate.sourceRef.startsWith(prefix))) {
      return false;
    }
    return true;
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/**
 * BM42 sparse retrieval via Qdrant named sparse vector (bm42 lane)
 * Runs against codebase_chunks_384_hybrid collection.
 */
async function retrieveBM42Sparse(query: string): Promise<Candidate[]> {
  try {
    const laneCandidates = await getSparseRetriever().retrieve({ query, limit: SPARSE_LIMIT });
    return laneCandidates.map(lc => ({
      id: lc.qdrantPointId ?? lc.packetKey,
      sourceRef: lc.sourceRef,
      summary: (lc.metadata?.summary as string) || '',
      content: (lc.metadata?.content as string) || '',
      score: lc.score ?? 0,
      scoreSource: 'qdrant' as const,
      embeddingLane: 'bm42' as const, // Canonical sparse vector name per qdrant-collection-contracts.ts
      workspaceRevision: pickString(lc.workspaceRevision, lc.metadata?.workspace_revision, lc.metadata?.workspaceRevision),
      sourceRevision: pickNullableString(lc.sourceRevision, lc.metadata?.source_revision, lc.metadata?.sourceRevision),
      representationId: pickNullableString(lc.representationId, lc.metadata?.representation_id, lc.metadata?.representationId),
      representationRevision: pickNumber(lc.representationRevision, lc.metadata?.representation_revision, lc.metadata?.representationRevision),
      qdrantPointId: lc.qdrantPointId ?? lc.packetKey,
      ...deriveIdentity({
        symbolVersionId: lc.symbolVersionId,
        packetKey: lc.packetKey,
        contentHash: lc.metadata?.content_hash ?? lc.metadata?.contentHash,
        sourceRef: lc.sourceRef,
        fallbackId: lc.qdrantPointId ?? lc.packetKey,
      }),
    }));
  } catch {
    return [];
  }
}

/**
 * Canonical lexical retrieval via PostgreSQL ts_rank
 * Primary: uses search_vector tsvector with weighted field relevance
 * Fallback: trigram (ILIKE) on search failure
 */
export async function retrieveBM25(query: string): Promise<Candidate[]> {
  try {
    const db = await getDb();
    // Clean query for ts_rank (PostgreSQL Boolean query syntax)
    const queryTerms = query
      .trim()
      .replace(/[^\w\s&|!-]/g, ' ') // Remove special chars except &|!-
      .split(/\s+/)
      .filter(word => word.length > 0);

    if (queryTerms.length === 0) {
      return []; // Empty query
    }

    // Build Boolean query with AND between terms
    const queryTsQuery = queryTerms.join(' & ');

    // Primary: PostgreSQL ts_rank on search_vector
    const result = await db.execute(sql`
      SELECT
        id,
        source_ref,
        metadata,
        summary,
        content,
        ts_rank(search_vector, to_tsquery('english', ${queryTsQuery})) as score
      FROM codebase_chunk_index
      WHERE search_vector @@ to_tsquery('english', ${queryTsQuery})
      ORDER BY score DESC, id ASC
      LIMIT ${BM25_LIMIT}
    `);

    if (result.rows.length > 0) {
      type BM25Row = {
        id: string;
        source_ref: string;
        metadata: Record<string, unknown> | null;
        summary: string;
        content: string;
        score: number;
      };

    return (result.rows as BM25Row[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref || '',
      summary: row.summary || '',
      content: row.content || '',
        score: Math.max(0.5, Math.min(1.0, row.score)), // Normalize to 0.5-1.0 range
        scoreSource: 'postgres_trigram' as const,
        workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
        sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
        representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
        representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
        ...deriveIdentity({
          symbolVersionId: row.metadata?.symbol_version_id,
          packetKey: row.metadata?.packet_key,
          sourceRef: row.source_ref,
          fallbackId: row.id,
        }),
      }));
    }

    // Fallback: trigram (ILIKE) when tsvector query has no matches
    return await retrieveBM25Trigram(query);
  } catch (error) {
    console.warn('Lexical retrieval (tsvector) failed, falling back to trigram:', error);
    // Fallback to trigram on any error
    return retrieveBM25Trigram(query).catch(() => []);
  }
}

/**
 * Fallback lexical retrieval via PostgreSQL trigram (ILIKE substring matching)
 * Used when tsvector query has no results or encounters errors
 * Slower than tsvector but works for any substring pattern
 */
async function retrieveBM25Trigram(query: string): Promise<Candidate[]> {
  try {
    const terms = query
      .toLowerCase()
      .split(/[^\w]+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 2)
      .slice(0, 8);

    if (terms.length === 0) return [];

    const likePredicates = terms.map((term) => {
      const searchTerm = `%${term.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
      return sql`(
        LOWER(summary) LIKE ${searchTerm}
        OR LOWER(content) LIKE ${searchTerm}
        OR LOWER(source_ref) LIKE ${searchTerm}
      )`;
    });

    const db = await getDb();
    const result = await db.execute(sql`
      SELECT
        id,
        source_ref,
        metadata,
        summary,
        content,
        CASE
          WHEN ${sql.join(likePredicates, sql` OR `)} THEN 1.0
          ELSE 0.5
        END as score
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND LENGTH(TRIM(summary)) > 0
        AND (${sql.join(likePredicates, sql` OR `)})
      ORDER BY score DESC, id ASC
      LIMIT ${BM25_LIMIT}
    `);

    type TrigRamRow = {
      id: string;
      source_ref: string;
      metadata: Record<string, unknown> | null;
      summary: string;
      content: string;
      score: number;
    };

    return (result.rows as TrigRamRow[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref || '',
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'postgres_trigram' as const, // Explicitly named as fallback
      workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
      sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
      representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
      representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
      ...deriveIdentity({
        symbolVersionId: row.metadata?.symbol_version_id,
        packetKey: row.metadata?.packet_key,
        contentHash: row.metadata?.content_hash ?? row.metadata?.contentHash,
        sourceRef: row.source_ref,
        fallbackId: row.id,
      }),
    }));
  } catch (error) {
    console.warn('Lexical trigram fallback failed:', error);
    return [];
  }
}

/**
 * Semantic retrieval via Qdrant ANN search
 * Primary: codebase_chunks_768_v2 (clean dense 768-dim lane)
 * Legacy hybrid/sparse lanes remain available via separate call sites.
 */
export async function retrieveQdrant(query: string): Promise<Candidate[]> {
  const dense768 = await embedQueryForLane(query, 'dense_768').catch(() => null);
  const queryVectors = {
    dense768: dense768?.vector ?? null,
  };
  const embedding = queryVectors.dense768;
  if (!embedding) return [];

  const qdrant = await getQdrantManager();
  const collections = [VECTOR_INDEX_REGISTRY.qdrantSource768V2.collection];
  const resultsByKey = new Map<string, Candidate>();

  try {
    for (const collection of collections) {
      try {
        // Keep dense retrieval as a raw logical lane. The BM42 adapter is a
        // separate lane and SearchRuntime is the sole production fusion owner;
        // Qdrant must not fuse dense+sparse here before SearchRuntime sees them.
        const results = await qdrant.denseSearch({
          collection,
          query,
          queryVector: Array.from(embedding),
          vectorName: QDRANT_DENSE_VECTOR_NAME,
          limit: QDRANT_LIMIT,
        });

        for (const hit of results.results) {
          const candidate: Candidate = {
            id: String(hit.id),
            sourceRef: (hit.payload?.source_ref as string) || '',
            summary: (hit.payload?.summary as string) || '',
            content: (hit.payload?.content as string) || '',
            score: hit.score,
            scoreSource: 'qdrant_768',
            embeddingLane: 'dense_768',
            workspaceRevision: pickString(hit.payload?.workspace_revision, hit.payload?.workspaceRevision),
            sourceRevision: pickNullableString(hit.payload?.source_revision, hit.payload?.sourceRevision),
            representationId: pickNullableString(hit.payload?.representation_id, hit.payload?.representationId),
            representationRevision: pickNumber(hit.payload?.representation_revision, hit.payload?.representationRevision),
            qdrantPointId: String(hit.id),
            retrievalExecutor: 'qdrant',
            ...deriveIdentity({
              symbolVersionId: hit.payload?.symbol_version_id,
              packetKey: hit.payload?.packet_key,
              contentHash: hit.payload?.content_hash,
              sourceRef: hit.payload?.source_ref,
              fallbackId: String(hit.id),
            }),
          };

          const existing = resultsByKey.get(candidate.packetKey) ?? resultsByKey.get(candidate.id);
          if (!existing || candidate.score > existing.score) {
            resultsByKey.set(candidate.packetKey, candidate);
            resultsByKey.set(candidate.id, candidate);
          }
        }
      } catch (error) {
        console.warn(`[retrieveQdrant] ${collection} search failed:`, (error as Error).message);
      }
    }

    if (resultsByKey.size > 0) {
      const deduped = [...new Map(
        [...resultsByKey.values()].map((candidate) => [candidate.packetKey || candidate.id, candidate])
      ).values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, QDRANT_LIMIT);
      await hydrateCanonicalChunkIds(deduped);
      return deduped;
    }
  } catch (error) {
    console.warn('[retrieveQdrant] adaptive hybrid search failed, falling back to dense-only:', (error as Error).message);
  }

  // Fallback: dense-only v2 collection
  try {
    const results = await qdrant.denseSearch({
      collection: VECTOR_INDEX_REGISTRY.qdrantSource768V2.collection ?? 'codebase_chunks_768_v2',
      query,
      queryVector: Array.from(embedding),
      vectorName: QDRANT_DENSE_VECTOR_NAME,
      limit: QDRANT_LIMIT,
    });

    const fallbackCandidates = results.results.map(hit => ({
      id: String(hit.id),
      sourceRef: (hit.payload?.source_ref as string) || '',
      summary: (hit.payload?.summary as string) || '',
      content: (hit.payload?.content as string) || '',
      score: hit.score * 0.95,
      scoreSource: 'qdrant_768' as const,
      embeddingLane: 'dense_768' as const,
      workspaceRevision: pickString(hit.payload?.workspace_revision, hit.payload?.workspaceRevision),
      sourceRevision: pickNullableString(hit.payload?.source_revision, hit.payload?.sourceRevision),
      representationId: pickNullableString(hit.payload?.representation_id, hit.payload?.representationId),
      representationRevision: pickNumber(hit.payload?.representation_revision, hit.payload?.representationRevision),
      qdrantPointId: String(hit.id),
      retrievalExecutor: 'qdrant',
      ...deriveIdentity({
        symbolVersionId: hit.payload?.symbol_version_id,
        packetKey: hit.payload?.packet_key,
        contentHash: hit.payload?.content_hash,
        sourceRef: hit.payload?.source_ref,
        fallbackId: String(hit.id),
      }),
    }));
    await hydrateCanonicalChunkIds(fallbackCandidates);
    return fallbackCandidates;
  } catch (fallbackError) {
    console.warn('[retrieveQdrant] dense-only fallback also failed:', (fallbackError as Error).message);
    return [];
  }
}

/**
 * Exact identifier matches
 * Searches for exact function symbols, class names, etc
 */
export async function retrieveExactMatches(query: string): Promise<Candidate[]> {
  try {
    // Split query into potential identifiers
    const identifiers = query
      .split(/\s+/)
      .filter(term => term.length > 2 && /^[a-zA-Z_]/.test(term));

    if (identifiers.length === 0) return [];

    // Use the first identifier for simple search
    const firstIdentifier = identifiers[0];
    const searchPattern = `%${firstIdentifier}%`;

    const db = await getDb();
    const result = await db.execute(sql`
      SELECT
        id,
        source_ref,
        metadata,
        summary,
        content,
        1.0 as score
      FROM codebase_chunk_index
      WHERE COALESCE(metadata->>'function_symbol', symbol) IS NOT NULL
        AND (
          COALESCE(metadata->>'function_symbol', symbol) ILIKE ${searchPattern}
          OR COALESCE(metadata->>'packet_key', id::text) ILIKE ${searchPattern}
        )
      ORDER BY id ASC
      LIMIT ${EXACT_LIMIT}
    `);

    type ExactRow = {
      id: string;
      source_ref: string;
      metadata: Record<string, unknown> | null;
      summary: string;
      content: string;
      score: number;
    };

    return (result.rows as ExactRow[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref,
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'exact_symbol' as const,
      workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
      sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
      representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
      representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
      ...deriveIdentity({
        symbolVersionId: row.metadata?.symbol_version_id,
        packetKey: row.metadata?.packet_key,
        contentHash: row.metadata?.content_hash ?? row.metadata?.contentHash,
        sourceRef: row.source_ref,
        fallbackId: row.id,
      }),
    }));
  } catch (error) {
    console.warn('Exact match retrieval failed:', error);
    return [];
  }
}

/**
 * AST-based structural matches
 * Searches via tree_node_id array matching against query identifiers
 */
export async function retrieveASTMatches(query: string): Promise<Candidate[]> {
  try {
    // Extract potential identifiers from query (alphanumeric, underscore)
    const identifiers = query
      .split(/[^\w]+/)
      .filter(term => term.length > 0)
      .map(term => `%${term}%`);

    if (identifiers.length === 0) return [];

    const identifierPredicates = identifiers.map((identifier) => sql`COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id') ILIKE ${identifier}`);

    // Search for packets with tree_node_ids that match query identifiers
    // tree_node_ids is a TEXT[] array in Postgres
    const db = await getDb();
    const result = await db.execute(sql`
      SELECT
        id,
        source_ref,
        metadata,
        output_meta,
        summary,
        content,
        0.8 as score
      FROM codebase_chunk_index
      WHERE COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id') IS NOT NULL
        AND (${sql.join(identifierPredicates, sql` OR `)})
      ORDER BY COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id') ASC, id ASC
      LIMIT ${AST_LIMIT}
    `);

    type ASTRow = {
      id: string;
      source_ref: string;
      metadata: Record<string, unknown> | null;
      output_meta: Record<string, unknown> | null;
      summary: string;
      content: string;
      score: number;
    };

    return (result.rows as ASTRow[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref,
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'ast_tree' as const,
      workspaceRevision: pickString(row.metadata?.workspace_revision, row.output_meta?.workspace_revision, row.metadata?.workspaceRevision, row.output_meta?.workspaceRevision),
      sourceRevision: pickNullableString(row.metadata?.source_revision, row.output_meta?.source_revision, row.metadata?.sourceRevision, row.output_meta?.sourceRevision),
      representationId: pickNullableString(row.metadata?.representation_id, row.output_meta?.representation_id, row.metadata?.representationId, row.output_meta?.representationId),
      representationRevision: pickNumber(row.metadata?.representation_revision, row.output_meta?.representation_revision, row.metadata?.representationRevision, row.output_meta?.representationRevision),
      ...deriveIdentity({
        symbolVersionId: row.metadata?.symbol_version_id ?? row.output_meta?.symbol_version_id,
        packetKey: row.metadata?.packet_key ?? row.output_meta?.packet_key,
        contentHash: row.metadata?.content_hash ?? row.output_meta?.content_hash ?? row.metadata?.contentHash ?? row.output_meta?.contentHash,
        sourceRef: row.source_ref,
        fallbackId: row.id,
      }),
    }));
  } catch (error) {
    console.warn('AST match retrieval failed:', error);
    return [];
  }
}

const RG_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'not', 'are', 'was', 'were']);

/**
 * Ripgrep keyword lane — file-system lexical search
 * Extracts identifier-like keywords from the query, runs rg against src/ to find
 * matching files, then looks up chunks by source_ref in Postgres.
 * Silent on any rg error (binary absent, timeout, no matches).
 */
export async function retrieveRipgrep(query: string): Promise<Candidate[]> {
  try {
    // Extract identifier-like keywords from query
    const keywords = [...new Set(
      (query.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) ?? [])
        .flatMap((kw) => identifierVariants(kw))
        .flatMap((kw) => tokenizeKeywordSurface(kw))
        .filter((kw) => kw.length > 2)
        .filter((kw) => !RG_STOP_WORDS.has(kw.toLowerCase()))
    )].slice(0, Math.min(8, RETRIEVAL_LIMITS.maxExactKeywords));

    if (keywords.length === 0) return [];

    // Run rg for each keyword in parallel, collect matched file paths
    const rgResults = await Promise.all(
      keywords.map(kw =>
        new Promise<string[]>((resolve) => {
          // cwd: SvelteKit dev server runs from sveltekit-frontend/, so process.cwd() is correct
          const child = execFile(
            'rg',
            ['--json', '-l', '-i', kw, 'src/'],
            { cwd: pathResolve(process.cwd()), timeout: 5000 },
            (err, stdout) => {
              if (err) {
                resolve([]);
                return;
              }
              // rg --json -l emits one JSON object per line; "match" type lines contain path.text
              const paths: string[] = [];
              for (const line of stdout.split('\n')) {
                if (!line.trim()) continue;
                try {
                  const obj = JSON.parse(line);
                  if (obj.type === 'match' || obj.type === 'path') {
                    const p = obj.data?.path?.text ?? obj.data?.lines?.text;
                    if (p) paths.push(p as string);
                  }
                } catch {
                  // skip malformed lines
                }
              }
              resolve(paths);
            }
          );
          // Belt-and-suspenders timeout via AbortController is not available on execFile;
          // the `timeout` option above handles it.
          void child;
        })
      )
    );

    // Collect unique file stems across all keyword results
    const stems = new Set<string>();
    for (const paths of rgResults) {
      for (const filePath of paths) {
        const stem = basename(filePath, extname(filePath));
        if (stem) stems.add(stem);
      }
    }

    if (stems.size === 0) return [];

    // Query codebase_chunk_index for chunks whose source_ref contains any of the file stems
    const candidates: Candidate[] = [];
    for (const stem of stems) {
      if (candidates.length >= RG_LIMIT) break;

      const stemPattern = `%${stem}%`;
      const remaining = RG_LIMIT - candidates.length;

      try {
        const db = await getDb();
        const result = await db.execute(sql`
          SELECT
            id,
            source_ref,
            metadata,
            summary,
            content
          FROM codebase_chunk_index
          WHERE source_ref ILIKE ${stemPattern}
          ORDER BY id ASC
          LIMIT ${remaining}
        `);

        type RgRow = {
          id: string;
          source_ref: string;
          metadata: Record<string, unknown> | null;
          summary: string;
          content: string;
        };

        for (const row of result.rows as RgRow[]) {
        candidates.push({
          id: row.id,
          sourceRef: row.source_ref || '',
          summary: row.summary || '',
          content: row.content || '',
            score: 0.7,
            scoreSource: 'rg_keyword' as const,
            workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
            sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
            representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
            representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
            ...deriveIdentity({
              symbolVersionId: row.metadata?.symbol_version_id,
              packetKey: row.metadata?.packet_key,
              contentHash: row.metadata?.content_hash ?? row.metadata?.contentHash,
              sourceRef: row.source_ref,
              fallbackId: row.id,
            }),
          });
        }
      } catch {
        // ignore per-stem DB errors
      }
    }

    return candidates;
  } catch {
    return [];
  }
}

/**
 * Legacy helper: embed query text using an explicit lane contract.
 * Prefer `embedQueryForLane()` at call sites.
 */
async function embedQuery(
  text: string,
  lane: 'dense_384' | 'dense_768' = 'dense_768'
): Promise<number[] | null> {
  try {
    if (!text || text.trim().length === 0) {
      return null;
    }
    const { embedQueryForLane } = await import('./embedding-service.js');
    const result = await embedQueryForLane(text, lane);
    return Array.from(result.vector);
  } catch (error) {
    console.warn('Query embedding failed:', error);
    return null;
  }
}
