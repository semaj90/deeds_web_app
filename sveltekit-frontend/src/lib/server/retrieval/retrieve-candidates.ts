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
import { VECTOR_INDEX_REGISTRY } from '$lib/server/vector/vector-index-registry.js';
import { RETRIEVAL_LIMITS, identifierVariants, inferRetrievalTier, tokenizeKeywordSurface } from './search-contract.js';

const BM25_LIMIT = RETRIEVAL_LIMITS.postgresFtsTopK;
const QDRANT_LIMIT = RETRIEVAL_LIMITS.denseTopK;
const EXACT_LIMIT = RETRIEVAL_LIMITS.exactLexicalTopK;
const AST_LIMIT = RETRIEVAL_LIMITS.topologyTopK;
const RG_LIMIT = RETRIEVAL_LIMITS.maxGraphNeighbors;
const SPARSE_LIMIT = RETRIEVAL_LIMITS.sparseTopK;

let sparseRetriever: ReturnType<typeof createBm42SparseRetriever> | null = null;

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
 * BM42 sparse retrieval via Qdrant named sparse vector (bm42_sparse lane)
 * Runs against codebase_chunks_384_hybrid collection.
 */
async function retrieveBM42Sparse(query: string): Promise<Candidate[]> {
  try {
    const laneCandidates = await _sparseRetriever.retrieve({ query, limit: SPARSE_LIMIT });
    return laneCandidates.map(lc => ({
      id: lc.qdrantPointId ?? lc.packetKey,
      packetKey: lc.packetKey,
      sourceRef: lc.sourceRef,
      summary: (lc.metadata?.summary as string) || '',
      content: (lc.metadata?.content as string) || '',
      score: lc.score ?? 0,
      scoreSource: 'qdrant' as const,
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
        packetKey: (row.metadata?.packet_key as string) || row.id,
        sourceRef: row.source_ref || '',
        summary: row.summary || '',
        content: row.content || '',
        score: Math.max(0.5, Math.min(1.0, row.score)), // Normalize to 0.5-1.0 range
        scoreSource: 'postgres_trigram' as const,
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
      packetKey: (row.metadata?.packet_key as string) || row.id,
      sourceRef: row.source_ref || '',
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'postgres_trigram' as const, // Explicitly named as fallback
    }));
  } catch (error) {
    console.warn('Lexical trigram fallback failed:', error);
    return [];
  }
}

/**
 * Semantic retrieval via Qdrant ANN search
 * Primary: codebase_chunks_384_hybrid (dense 384-dim + BM42 sparse)
 * Secondary: codebase_chunks_768 (dense-only detail lane)
 */
export async function retrieveQdrant(query: string): Promise<Candidate[]> {
  const [dense384, dense768] = await Promise.allSettled([
    embedQueryForLane(query, 'dense_384'),
    embedQueryForLane(query, 'dense_768'),
  ]);
  const queryVectors = {
    dense384: dense384.status === 'fulfilled' ? dense384.value.vector : null,
    dense768: dense768.status === 'fulfilled' ? dense768.value.vector : null,
  };
  const embedding = queryVectors.dense768 ?? queryVectors.dense384;
  if (!embedding) return [];

  const qdrant = await getQdrantManager();
  const retrievalTier = inferRetrievalTier({ query });
  const collections = retrievalTier === 'cold'
    ? ['codebase_chunks_768', 'codebase_chunks_384_hybrid']
    : ['codebase_chunks_384_hybrid', 'codebase_chunks_768'];
  const resultsByKey = new Map<string, Candidate>();

  try {
    for (const collection of collections) {
      const queryEmbedding =
        collection === 'codebase_chunks_384_hybrid'
          ? queryVectors.dense384
          : queryVectors.dense768;

      if (!queryEmbedding) continue;

      try {
        const results = await qdrant.hybridSearch({
          collection,
          query,
          queryEmbedding,
          limit: QDRANT_LIMIT,
        });

        for (const hit of results.results) {
          const candidate: Candidate = {
            id: String(hit.id),
            packetKey: (hit.payload?.packet_key as string) || String(hit.id),
            sourceRef: (hit.payload?.source_ref as string) || '',
            summary: (hit.payload?.summary as string) || '',
            content: (hit.payload?.content as string) || '',
            score: hit.score,
            scoreSource: 'qdrant' as const,
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
      return [...new Map(
        [...resultsByKey.values()].map((candidate) => [candidate.packetKey || candidate.id, candidate])
      ).values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, QDRANT_LIMIT);
    }
  } catch (error) {
    console.warn('[retrieveQdrant] adaptive hybrid search failed, falling back to dense-only:', (error as Error).message);
  }

  // Fallback: dense-only 384-dim legacy collection (run npm run atlas:backfill:hybrid to populate hybrid)
  try {
    const results = await qdrant.hybridSearch({
      collection: VECTOR_INDEX_REGISTRY.qdrantSource768.collection ?? 'codebase_chunks_768',
      query,
      queryEmbedding: queryVectors.dense768 ?? queryVectors.dense384 ?? Array.from(embedding),
      limit: QDRANT_LIMIT,
    });

    return results.results.map(hit => ({
      id: String(hit.id),
      packetKey: (hit.payload?.packet_key as string) || String(hit.id),
      sourceRef: (hit.payload?.source_ref as string) || '',
      summary: (hit.payload?.summary as string) || '',
      content: (hit.payload?.content as string) || '',
      score: hit.score * 0.95,
      scoreSource: 'qdrant' as const,
    }));
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
      packetKey: (row.metadata?.packet_key as string) || row.id,
      sourceRef: row.source_ref,
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'exact_symbol' as const,
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
      packetKey: (row.metadata?.packet_key as string) || (row.output_meta?.packet_key as string) || row.id,
      sourceRef: row.source_ref,
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'ast_tree' as const,
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
            packetKey: (row.metadata?.packet_key as string) || row.id,
            sourceRef: row.source_ref || '',
            summary: row.summary || '',
            content: row.content || '',
            score: 0.7,
            scoreSource: 'rg_keyword' as const,
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
