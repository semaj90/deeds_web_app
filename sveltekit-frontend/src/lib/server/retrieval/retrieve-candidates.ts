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

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { embedText } from '$lib/server/embedding/embed.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import type { Candidate } from './search-runtime.js';

const BM25_LIMIT = 100;
const QDRANT_LIMIT = 100;
const EXACT_LIMIT = 50;
const AST_LIMIT = 50;

/**
 * Retrieve candidates from all sources
 */
export async function retrieveAllCandidates(
  query: string,
  _limit: number = 128,
): Promise<Candidate[]> {
  const [bm25, qdrant, exact, ast] = await Promise.all([
    retrieveBM25(query),
    retrieveQdrant(query),
    retrieveExactMatches(query),
    retrieveASTMatches(query),
  ]);

  return [...bm25, ...qdrant, ...exact, ...ast];
}

/**
 * Canonical lexical retrieval via PostgreSQL ts_rank
 * Primary: uses search_vector tsvector with weighted field relevance
 * Fallback: trigram (ILIKE) on search failure
 */
export async function retrieveBM25(query: string): Promise<Candidate[]> {
  try {
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
    const searchTerm = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_').toLowerCase()}%`;

    const result = await db.execute(sql`
      SELECT
        id,
        source_ref,
        metadata,
        summary,
        content,
        CASE
          WHEN LOWER(summary) LIKE ${searchTerm} THEN 2
          WHEN LOWER(content) LIKE ${searchTerm} THEN 1
          ELSE 0.5
        END as score
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND LENGTH(TRIM(summary)) > 0
        AND (LOWER(summary) LIKE ${searchTerm} OR LOWER(content) LIKE ${searchTerm})
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
 * Uses canonical codebase_chunks_384 collection (384-dimensional embeddings)
 * Fallback to codebase_chunks_768 (legacy) if 384 unavailable
 */
export async function retrieveQdrant(query: string): Promise<Candidate[]> {
  try {
    // Embed query using EmbeddingGemma (384-dim canonical)
    const embedding = await embedQuery(query);
    if (!embedding) return [];

    // Verify embedding dimension matches canonical 384
    if (embedding.length !== 384) {
      console.warn(
        `Embedding dimension mismatch: expected 384, got ${embedding.length}. Query embedding will be truncated/padded.`
      );
    }

    // Search Qdrant (canonical 384-dim collection)
    const qdrant = getQdrantManager();
    const results = await qdrant.hybridSearch({
      collection: 'codebase_chunks_384', // CANONICAL: 384-dimensional
      query,
      queryEmbedding: embedding,
      limit: QDRANT_LIMIT,
    });

    // Map Qdrant results to candidates
    return results.results.map(hit => ({
      id: String(hit.id),
      packetKey: (hit.payload?.packet_key as string) || String(hit.id),
      sourceRef: (hit.payload?.source_ref as string) || '',
      summary: (hit.payload?.summary as string) || '',
      content: (hit.payload?.content as string) || '',
      score: hit.score,
      scoreSource: 'qdrant' as const,
    }));
  } catch (error) {
    console.warn('Qdrant (384) retrieval failed, attempting legacy 768-dim fallback:', error);
    // Fallback to legacy 768-dim collection if 384 fails
    try {
      const embedding = await embedQuery(query);
      if (!embedding) return [];

      const qdrant = getQdrantManager();
      const results = await qdrant.hybridSearch({
        collection: 'codebase_chunks_768', // LEGACY FALLBACK: 768-dimensional
        query,
        queryEmbedding: embedding,
        limit: QDRANT_LIMIT,
      });

      return results.results.map(hit => ({
        id: String(hit.id),
        packetKey: (hit.payload?.packet_key as string) || String(hit.id),
        sourceRef: (hit.payload?.source_ref as string) || '',
        summary: (hit.payload?.summary as string) || '',
        content: (hit.payload?.content as string) || '',
        score: hit.score * 0.95, // Slight penalty for legacy fallback
        scoreSource: 'qdrant' as const,
      }));
    } catch (fallbackError) {
      console.warn('Qdrant (768) fallback also failed:', fallbackError);
      return [];
    }
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

/**
 * Helper: Embed query text using EmbeddingGemma
 * Returns 384-dimensional embedding or null on failure
 * Wired to Ollama embeddinggemma:latest model
 */
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    if (!text || text.trim().length === 0) {
      return null;
    }
    return await embedText(text.slice(0, 2000));
  } catch (error) {
    console.warn('Query embedding failed:', error);
    return null;
  }
}
