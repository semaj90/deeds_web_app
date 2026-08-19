import { pool } from '$lib/server/db/client.js';

export interface PostgresLexicalScoreV1 {
  packetKey: string;
  score: number;
}

export interface PostgresLexicalScoreReceiptV1 {
  schema: 'atlas.postgres-lexical-score-receipt.v1';
  executor: 'postgres-fts';
  queryMode: 'websearch_to_tsquery';
  ranking: 'ts_rank_cd';
  requestedPacketKeys: number;
  returnedPacketKeys: number;
  scores: PostgresLexicalScoreV1[];
}

/**
 * Canonical lexical enrichment for an already-identified candidate set.
 * It intentionally mirrors the repo's SearchLane PostgreSQL FTS semantics
 * instead of treating BM42/Qdrant sparse retrieval as the BM25 owner.
 */
export async function scorePostgresLexicalCandidatesV1(
  query: string,
  packetKeys: string[],
  limit = 512,
): Promise<PostgresLexicalScoreReceiptV1> {
  const uniquePacketKeys = [...new Set(packetKeys.filter(Boolean))].slice(
    0,
    Math.max(1, Math.min(512, limit)),
  );
  if (!query.trim() || uniquePacketKeys.length === 0) {
    return {
      schema: 'atlas.postgres-lexical-score-receipt.v1',
      executor: 'postgres-fts',
      queryMode: 'websearch_to_tsquery',
      ranking: 'ts_rank_cd',
      requestedPacketKeys: uniquePacketKeys.length,
      returnedPacketKeys: 0,
      scores: [],
    };
  }

  const result = await pool.query<{ packet_key: string; lexical_score: number }>(
    `
      SELECT
        ap.packet_key,
        ts_rank_cd(
          to_tsvector('english', COALESCE(ap.summary, '') || ' ' || COALESCE(ap.source_ref, '')),
          websearch_to_tsquery('english', $1)
        ) AS lexical_score
      FROM atlas_packets ap
      WHERE ap.packet_key = ANY($2::text[])
        AND to_tsvector('english', COALESCE(ap.summary, '') || ' ' || COALESCE(ap.source_ref, ''))
            @@ websearch_to_tsquery('english', $1)
      ORDER BY lexical_score DESC, ap.packet_key ASC
      LIMIT $3
    `,
    [query.trim(), uniquePacketKeys, uniquePacketKeys.length],
  );

  const scores = result.rows
    .map((row) => ({ packetKey: row.packet_key, score: Number(row.lexical_score) }))
    .filter((row) => row.packetKey && Number.isFinite(row.score));

  return {
    schema: 'atlas.postgres-lexical-score-receipt.v1',
    executor: 'postgres-fts',
    queryMode: 'websearch_to_tsquery',
    ranking: 'ts_rank_cd',
    requestedPacketKeys: uniquePacketKeys.length,
    returnedPacketKeys: scores.length,
    scores,
  };
}
