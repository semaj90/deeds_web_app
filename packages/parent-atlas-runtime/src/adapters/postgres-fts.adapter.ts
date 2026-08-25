/**
 * PostgreSQL lexical adapter — full-text search recall stage
 *
 * Canonical owner (renamed 2026-08-26 from postgres-bm25.adapter.ts — see
 * that file for the compatibility re-export and openspec/changes/
 * parent-atlas-neural-prefill-encoder/tasks.md's DBCTX-01/BM25 cleanup
 * entries for the naming rationale). Executes PostgreSQL native
 * tsvector/GIN full-text search (ts_rank_cd cover-density ranking) against
 * codebase_chunk_index as the first recall stage in the Parent Atlas
 * retrieval pipeline.
 *
 * Runtime status: POSTGRES_FTS_ADAPTER / LIVE_QUERY_PROVEN — this is a real
 * `ts_rank_cd(search_vector, websearch_to_tsquery(...))` query against a
 * live GIN-indexed column, not a placeholder. It is NOT true BM25 — pg_search
 * is not installed in this repo (confirmed via `SELECT extname FROM
 * pg_extension`, 2026-08-26). indexKind is reported explicitly so callers
 * don't have to infer the ranking algorithm from the function name.
 */

import type { Database } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { CandidateForIdentityResolution } from './identity-resolver.js';

export interface PostgresFtsSearchOptions {
  db: Database;
  query: string;
  limit: number;
  sourceScope?: string[];
  requireSourceRef?: boolean;
}

export const POSTGRES_FTS_INDEX_KIND = 'postgres_tsvector_english' as const;

export interface PostgresFtsCandidate extends CandidateForIdentityResolution {
  retrieved_via: 'postgres_fts';
  indexKind: typeof POSTGRES_FTS_INDEX_KIND;
  retrieval_algorithm: 'postgres_fts_ts_rank_cd';
  identity_resolution_source: 'source_ref_content_hash_exact';
  title?: string;
  snippet?: string;
}

interface PostgresFtsCanonicalRow {
  id: string;
  packet_key: string;
  source_ref: string;
  feature_id: string;
  content_hash: string;
  lexical_score: number | string;
  title: string | null;
  snippet: string | null;
}

function globToSqlLikePattern(pattern: string): string {
  return pattern
    .replace(/([\\%_])/g, '\\$1')
    .replace(/\*/g, '%')
    .replace(/\?/g, '_');
}

/**
 * Execute PostgreSQL native full-text search (ts_rank_cd cover-density
 * ranking, GIN-indexed tsvector) against codebase_chunk_index.search_vector.
 *
 * Returns up to `limit` candidates sorted by relevance.
 */
export async function searchPostgresFts(
  options: PostgresFtsSearchOptions
): Promise<PostgresFtsCandidate[]> {
  const { db, query, limit, sourceScope, requireSourceRef = true } = options;

  if (!query.trim()) {
    return [];
  }

  const boundedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.trunc(limit), 200))
    : 20;
  const lexicalLimit = Math.min(1000, Math.max(boundedLimit * 5, boundedLimit));
  const sourceScopeClause = sourceScope?.length
    ? sql`AND (${sql.join(
        sourceScope.map((pattern) =>
          sql`ci.source_ref LIKE ${globToSqlLikePattern(pattern)} ESCAPE '\\'`,
        ),
        sql` OR `,
      )})`
    : sql``;
  const sourceRefClause = requireSourceRef
    ? sql`AND ci.source_ref IS NOT NULL`
    : sql``;

  const result = await db.execute(sql`
    WITH q AS (
      SELECT websearch_to_tsquery('english', ${query.trim()}) AS tsq
    ),
    lexical AS (
      SELECT
        ci.id::text AS lexical_id,
        ci.source_ref,
        ci.relative_path,
        ci.symbol,
        ci.content_hash,
        coalesce(ci.summary, left(ci.content, 240), '') AS snippet,
        ts_rank_cd(ci.search_vector, q.tsq, 32)::double precision AS lexical_score
      FROM public.codebase_chunk_index AS ci
      CROSS JOIN q
      WHERE ci.search_vector @@ q.tsq
        AND ci.content_hash IS NOT NULL
        ${sourceRefClause}
        ${sourceScopeClause}
      ORDER BY lexical_score DESC, ci.id
      LIMIT ${lexicalLimit}
    ),
    canonical AS (
      SELECT
        p.packet_id::text AS id,
        p.packet_key,
        p.source_ref,
        p.feature_id,
        p.content_hash,
        coalesce(p.feature_label, l.symbol, l.relative_path) AS title,
        l.snippet,
        l.lexical_score,
        count(*) OVER (PARTITION BY l.lexical_id) AS identity_match_count,
        row_number() OVER (
          PARTITION BY p.packet_key
          ORDER BY l.lexical_score DESC, l.lexical_id
        ) AS packet_rank
      FROM lexical AS l
      JOIN public.atlas_packets AS p
        ON p.source_ref = l.source_ref
       AND p.content_hash = l.content_hash
      WHERE p.packet_key IS NOT NULL
        AND p.feature_id IS NOT NULL
    )
    SELECT id, packet_key, source_ref, feature_id, content_hash,
           lexical_score, title, snippet
    FROM canonical
    WHERE identity_match_count = 1
      AND packet_rank = 1
    ORDER BY lexical_score DESC, packet_key ASC
    LIMIT ${boundedLimit}
  `) as Array<Record<string, unknown>>;

  return result.map((row) => ({
    id: String(row.id ?? ''),
    packet_key: String(row.packet_key ?? ''),
    source_ref: String(row.source_ref ?? ''),
    feature_id: String(row.feature_id ?? ''),
    content_hash: String(row.content_hash ?? ''),
    score: Number(row.lexical_score ?? 0),
    retrieved_via: 'postgres_fts' as const,
    indexKind: POSTGRES_FTS_INDEX_KIND,
    retrieval_algorithm: 'postgres_fts_ts_rank_cd' as const,
    identity_resolution_source: 'source_ref_content_hash_exact' as const,
    title: row.title == null ? undefined : String(row.title),
    snippet: row.snippet == null ? undefined : String(row.snippet),
  }));
}

/**
 * Local fallback relevance scorer (approximate, not the live ts_rank_cd
 * path). Used only if PostgreSQL full-text index is unavailable or disabled.
 */
export function scorePostgresFtsFallback(
  document: string,
  query: string,
  k1: number = 1.5,
  b: number = 0.75
): number {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const docTokens = document.toLowerCase().split(/\s+/);
  const docLength = docTokens.length;

  let score = 0;
  for (const token of tokens) {
    let matches = 0;
    for (let i = 0; i < docTokens.length; i++) {
      if (docTokens[i].includes(token)) {
        matches++;
      }
    }

    if (matches > 0) {
      const idf = Math.log(1 + (1 - 0.5) / 0.5);
      const tf = (matches * (k1 + 1)) / (matches + k1 * (1 - b + b * (docLength / 100)));
      score += idf * tf;
    }
  }

  return Math.min(score / 100, 1.0); // Normalize to [0, 1]
}

/**
 * Filter results by source scope (optional).
 * Example: sourceScope = ['src/lib/server/*', 'src/routes/api/*']
 */
export function filterBySourceScope(
  candidates: PostgresFtsCandidate[],
  sourceScope?: string[]
): PostgresFtsCandidate[] {
  if (!sourceScope || sourceScope.length === 0) {
    return candidates;
  }

  return candidates.filter(c => {
    const sourceRef = c.source_ref;
    if (!sourceRef) return false;
    return sourceScope.some(pattern => {
      const regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regex}$`).test(sourceRef);
    });
  });
}

/**
 * Validate results are well-formed:
 * - All candidates have packet_key
 * - All candidates have source_ref (if required)
 * - All candidates have feature_id
 * - No NaN scores
 */
export function validatePostgresFtsResults(
  candidates: PostgresFtsCandidate[],
  requireSourceRef: boolean = true
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];

    if (!c.packet_key) {
      errors.push(`Candidate ${i}: missing packet_key`);
    }
    if (requireSourceRef && !c.source_ref) {
      errors.push(`Candidate ${i}: missing source_ref`);
    }
    if (!c.feature_id) {
      errors.push(`Candidate ${i}: missing feature_id`);
    }
    if (isNaN(c.score)) {
      errors.push(`Candidate ${i}: NaN score`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
