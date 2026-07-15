/**
 * Postgres AST Retriever Adapter
 *
 * Queries atlas_packets by extracted symbol tokens and packet_type kinds,
 * not by tree_node_id (which requires knowing the UUID upfront).
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import type { Retriever, LaneCandidate, RetrievalInput } from '../lane-contracts.js';
import { validateCandidate } from '../lane-contracts.js';
import { escapeLike } from './postgres-exact-retriever.js';

const AST_PACKET_KINDS = [
  'function', 'method', 'class', 'interface', 'type', 'enum',
  'const', 'let', 'var', 'export', 'import', 'module',
] as const;

function inferKindsFromQuery(query: string): string[] {
  const lower = query.toLowerCase();
  return AST_PACKET_KINDS.filter(k => lower.includes(k));
}

export function createPostgresAstRetriever(): Retriever {
  return {
    lane: 'ast' as const,

    async retrieve(input: RetrievalInput): Promise<LaneCandidate[]> {
      try {
        // Extract identifier tokens suitable for symbol matching
        const symbols = (input.query.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) ?? [])
          .slice(0, 8);

        if (symbols.length === 0) return [];

        const kinds = inferKindsFromQuery(input.query);

        const symbolPredicates = symbols.map((sym) => {
          const p = `%${escapeLike(sym)}%`;
          return sql`ap.function_symbol ILIKE ${p} ESCAPE '\\'`;
        });

        const kindFilter = kinds.length > 0
          ? sql`AND ap.packet_type = ANY(${kinds})`
          : sql``;

        const result = await db.execute(sql`
          SELECT
            ap.id,
            ap.packet_key,
            ap.source_ref,
            ap.function_symbol,
            ap.packet_type,
            ap.summary,
            0.8 AS score
          FROM atlas_packets ap
          WHERE ap.function_symbol IS NOT NULL
            AND (${sql.join(symbolPredicates, sql` OR `)})
            ${kindFilter}
          ORDER BY ap.source_ref ASC, ap.function_symbol ASC
          LIMIT ${input.limit}
        `);

        type ASTRow = {
          id: string;
          packet_key: string;
          source_ref: string;
          function_symbol: string | null;
          packet_type: string | null;
          summary: string | null;
          score: number;
        };

        const candidates: LaneCandidate[] = [];
        for (let i = 0; i < (result.rows as ASTRow[]).length; i++) {
          const row = (result.rows as ASTRow[])[i];
          if (!row.packet_key || !row.source_ref) continue;
          const candidate: LaneCandidate = {
            packetKey: row.packet_key,
            packetId: row.id,
            sourceRef: row.source_ref,
            rank: i + 1,
            score: row.score,
            lane: 'ast',
            metadata: {
              function_symbol: row.function_symbol,
              packet_type: row.packet_type,
              summary: row.summary,
            },
          };
          const valid = validateCandidate(candidate);
          if (valid) candidates.push(valid);
        }
        return candidates;
      } catch (err) {
        console.warn('[postgres-ast-retriever] failed:', (err as Error).message);
        return [];
      }
    },
  };
}
