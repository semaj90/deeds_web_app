/**
 * BM25 Search via PostgreSQL trigram similarity
 *
 * Uses pg_trgm for fast full-text similarity search with GIN indexing.
 * Not exact BM25 but highly correlated and production-ready.
 */

import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';

/**
 * Search atlas_packets by text similarity using trigram matching.
 * Requires GIN index: CREATE INDEX idx_atlas_packets_summary_gin ON atlas_packets USING GIN (summary gin_trgm_ops);
 */
export async function bm25SearchIndexed(
  query: string,
  limit: number = 20
): Promise<Array<{ id: string; similarity: number; summary: string }>> {
  try {
    const results = await db.execute(
      sql`
        SELECT
          ${atlasPackets.id},
          similarity(${atlasPackets.summary}, ${query}) as similarity,
          ${atlasPackets.summary}
        FROM ${atlasPackets}
        WHERE ${atlasPackets.summary} % ${query}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `
    );

    return (
      results.rows?.map((row: any) => ({
        id: row.id,
        similarity: row.similarity || 0,
        summary: row.summary || '',
      })) || []
    );
  } catch (error) {
    console.error('BM25 search failed:', error);
    return [];
  }
}

/**
 * Fallback: Search without index (slower but always works)
 */
export async function bm25SearchUnindexed(
  query: string,
  limit: number = 20
): Promise<Array<{ id: string; similarity: number }>> {
  try {
    const results = await db
      .select({
        id: atlasPackets.id,
        similarity: sql<number>`similarity(${atlasPackets.summary}, ${query})`,
      })
      .from(atlasPackets)
      .where(sql`${atlasPackets.summary} % ${query}`)
      .orderBy(sql`similarity DESC`)
      .limit(limit);

    return results;
  } catch (error) {
    console.error('BM25 fallback search failed:', error);
    return [];
  }
}
