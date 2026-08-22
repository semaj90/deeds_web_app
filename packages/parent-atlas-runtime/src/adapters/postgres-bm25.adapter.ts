/**
 * Postgres BM25 Adapter — Full-text search recall stage
 *
 * Executes BM25 full-text search against codebase_chunk_index and atlas_packets
 * as the first recall stage in the Parent Atlas retrieval pipeline.
 *
 * Returns up to bm25Limit candidates sorted by BM25 relevance.
 */

import type { Database } from 'drizzle-orm';
import { sql, desc } from 'drizzle-orm';
import type { CandidateForIdentityResolution } from './identity-resolver.js';

export interface Postgres25TextSearchOptions {
  db: Database;
  query: string;
  limit: number;
  sourceScope?: string[];
  requireSourceRef?: boolean;
}

export interface BM25Candidate extends CandidateForIdentityResolution {
  retrieved_via: 'bm25';
  title?: string;
  snippet?: string;
}

/**
 * Execute BM25 full-text search against Postgres
 *
 * Uses built-in ts_rank_cd() for BM25-like relevance scoring.
 * Queries codebase_chunk_index which has English full-text index.
 *
 * Returns up to `limit` candidates sorted by relevance.
 */
export async function searchPostgresBM25(
  options: Postgres25TextSearchOptions
): Promise<BM25Candidate[]> {
  const { db, query, limit, sourceScope, requireSourceRef = true } = options;

  if (!query.trim()) {
    return [];
  }

  // Normalize query: remove special characters, tokenize
  const tokens = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' & '); // PostgreSQL tsquery format

  // TODO: Wire real Postgres query
  // const candidates = await db.execute(sql`
  //   SELECT
  //     ci.id,
  //     ci.packet_key,
  //     ci.source_ref,
  //     ci.feature_id,
  //     ci.content_hash,
  //     ci.title,
  //     ts_rank_cd(ci.content_tsvector, plainto_tsquery('english', ${query})) AS bm25_score,
  //     SUBSTRING(ci.content, 1, 200) AS snippet
  //   FROM codebase_chunk_index ci
  //   WHERE
  //     ci.content_tsvector @@ plainto_tsquery('english', ${query})
  //     ${requireSourceRef ? sql`AND ci.source_ref IS NOT NULL` : sql``}
  //     ${sourceScope && sourceScope.length > 0 ? sql`AND ci.source_ref LIKE ANY(${sourceScope})` : sql``}
  //   ORDER BY bm25_score DESC
  //   LIMIT ${limit}
  // `);

  // Placeholder response
  return [
    {
      id: 'bm25:001',
      packet_key: 'ace:packet:bm25:001',
      source_ref: 'src/lib/server/db/client.ts',
      feature_id: 'db.client',
      content_hash: 'hash001',
      score: 0.95,
      retrieved_via: 'bm25',
      title: 'Database Client',
      snippet: 'Postgres database connection pool...'
    }
  ];
}

/**
 * BM25 relevance scorer (fallback if ts_rank_cd unavailable)
 *
 * Simplified scoring based on token matches, position, density.
 * Used if PostgreSQL full-text index is unavailable or disabled.
 */
export function scoreBM25(
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
      // Simplified BM25 formula
      const idf = Math.log(1 + (1 - 0.5) / 0.5);
      const tf = (matches * (k1 + 1)) / (matches + k1 * (1 - b + b * (docLength / 100)));
      score += idf * tf;
    }
  }

  return Math.min(score / 100, 1.0); // Normalize to [0, 1]
}

/**
 * Filter BM25 results by source scope (optional)
 *
 * Constrains results to specific directories or files.
 * Example: sourceScope = ['src/lib/server/*', 'src/routes/api/*']
 */
export function filterBySourceScope(
  candidates: BM25Candidate[],
  sourceScope?: string[]
): BM25Candidate[] {
  if (!sourceScope || sourceScope.length === 0) {
    return candidates;
  }

  return candidates.filter(c => {
    if (!c.source_ref) return false;
    return sourceScope.some(pattern => {
      const regex = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regex}$`).test(c.source_ref);
    });
  });
}

/**
 * Validate BM25 results are well-formed
 *
 * Checks:
 * - All candidates have packet_key
 * - All candidates have source_ref (if required)
 * - All candidates have feature_id
 * - No NaN scores
 */
export function validateBM25Results(
  candidates: BM25Candidate[],
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
