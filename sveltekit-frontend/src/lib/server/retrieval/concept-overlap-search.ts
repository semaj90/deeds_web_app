/**
 * Concept Overlap Search
 *
 * Rank packets by how many query concepts they contain.
 * Uses JSONB overlap operator (&&) for fast matching.
 */

import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasPackets } from '$lib/server/db/schema-postgres.js';

/**
 * Rank packets by concept overlap with query concepts.
 *
 * If query extracted concepts [concept_A, concept_B],
 * rank packets by percentage of query concepts they contain.
 */
export async function conceptOverlapSearch(
  queryConceptIds: string[],
  limit: number = 20
): Promise<Array<{ id: string; overlapScore: number }>> {
  if (!queryConceptIds || queryConceptIds.length === 0) {
    return [];
  }

  try {
    const results = await db.execute(
      sql`
        SELECT
          ${atlasPackets.packetId},
          (
            CARDINALITY(
              ${atlasPackets.conceptIds} && ${queryConceptIds}::text[]
            ) /
            GREATEST(CARDINALITY(${atlasPackets.conceptIds}), 1)
          )::float as overlap_score
        FROM ${atlasPackets}
        WHERE ${atlasPackets.conceptIds} && ${queryConceptIds}::text[]
        ORDER BY overlap_score DESC
        LIMIT ${limit}
      `
    );

    return (
      results.rows?.map((row: any) => ({
        id: row.id,
        overlapScore: row.overlap_score || 0,
      })) || []
    );
  } catch (error) {
    console.error('Concept overlap search failed:', error);
    return [];
  }
}

/**
 * Extract concepts from query (placeholder).
 * Replace with actual concept extraction (NLP, LLM, or keyword extraction).
 */
export function extractQueryConcepts(_query: string): string[] {
  // TODO: Implement real concept extraction
  // Options:
  //   1. Named entity recognition (spacy, flair)
  //   2. Keyword extraction (YAKE, TF-IDF)
  //   3. LLM-based extraction (Gemma4)
  //   4. String matching against concept registry
  return [];
}
