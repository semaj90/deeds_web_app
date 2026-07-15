/**
 * Postgres Exact Retriever Adapter
 *
 * Matches identifier tokens extracted from the query against
 * atlas_packets columns. Uses parameterized ILIKE with proper
 * wildcard escaping — never raw query interpolation.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';

/**
 * Escape special LIKE wildcard characters in a literal string value.
 * Postgres LIKE escape character is '\'.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Signals extracted from a raw query string for identifier-based search.
 */
export interface QuerySignals {
  identifiers: string[];   // CamelCase, snake_case, dotted tokens
  paths: string[];         // src/... or relative file-like paths
  errorCodes: string[];    // TS1234, E001, ERR_*
  exactPhrases: string[];  // "quoted strings"
}

export function extractQuerySignals(query: string): QuerySignals {
  // Quoted phrases
  const exactPhrases: string[] = [];
  let cleaned = query.replace(/"([^"]+)"/g, (_, phrase) => {
    exactPhrases.push(phrase);
    return ' ';
  });

  // Path-like tokens (contain forward slashes)
  const paths = (cleaned.match(/\b[a-zA-Z_][a-zA-Z0-9_./:-]*\/[a-zA-Z0-9_./:-]+\b/g) ?? [])
    .slice(0, 4);

  // Error codes: TS\d+, E\d+, ERR_*
  const errorCodes = (cleaned.match(/\b(?:TS\d+|E\d{3,}|ERR_[A-Z_]+)\b/g) ?? [])
    .slice(0, 4);

  // General identifiers
  const identifiers = (Array.from(cleaned.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) ?? []) as string[])
    .filter(t => t.length > 2)
    .slice(0, 8);

  return { identifiers, paths, errorCodes, exactPhrases };
}

export function createPostgresExactRetriever(): Retriever {
  return {
    lane: 'exact' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      try {
        const signals = extractQuerySignals(input.query);
        const tokens = [
          ...signals.identifiers,
          ...signals.paths,
          ...signals.errorCodes,
          ...signals.exactPhrases,
        ].slice(0, 8);

        if (tokens.length === 0) return [];

        const primary = tokens[0];
        const primaryPattern = `%${escapeLike(primary)}%`;

        const idPredicates = tokens.map((tok) => {
          const p = `%${escapeLike(tok)}%`;
          return sql`(
            ap.packet_key ILIKE ${p} ESCAPE '\\'
            OR ap.source_ref ILIKE ${p} ESCAPE '\\'
            OR ap.function_symbol ILIKE ${p} ESCAPE '\\'
            OR ap.title_id ILIKE ${p} ESCAPE '\\'
            OR ap.feature_id ILIKE ${p} ESCAPE '\\'
          )`;
        });

        const result = await db.execute(sql`
          SELECT
            ap.id,
            ap.packet_key,
            ap.source_ref,
            ap.function_symbol,
            ap.summary,
            CASE
              WHEN ap.function_symbol = ${primary} THEN 1.0
              WHEN ap.packet_key = ${primary}       THEN 1.0
              WHEN ap.source_ref ILIKE ${primaryPattern} ESCAPE '\\' THEN 0.95
              ELSE 0.90
            END AS score
          FROM atlas_packets ap
          WHERE ${sql.join(idPredicates, sql` OR `)}
          ORDER BY score DESC, ap.source_ref ASC
          LIMIT ${input.limit}
        `);

        type ExactRow = {
          id: string;
          packet_key: string;
          source_ref: string;
          function_symbol: string | null;
          summary: string | null;
          score: number;
        };

        const candidates: LaneCandidate[] = [];
        for (let i = 0; i < (result.rows as ExactRow[]).length; i++) {
          const row = (result.rows as ExactRow[])[i];
          if (!row.packet_key || !row.source_ref) continue;
          const candidate: LaneCandidate = {
            packetKey: row.packet_key,
            packetId: row.id,
            sourceRef: row.source_ref,
            rank: i + 1,
            score: row.score,
            lane: 'exact',
            metadata: {
              function_symbol: row.function_symbol,
              summary: row.summary,
            },
          };
          const valid = validateCandidate(candidate);
          if (valid) candidates.push(valid);
        }
        return candidates;
      } catch (err) {
        console.warn('[postgres-exact-retriever] failed:', (err as Error).message);
        return [];
      }
    },
  };
}
