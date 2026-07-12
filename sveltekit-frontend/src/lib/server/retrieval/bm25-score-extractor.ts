/**
 * BM25 Score Extractor — PostgreSQL JSONB Query
 *
 * Purpose: Extract lexical_features from packets + compute BM25 scores for query
 * Input: Query keywords + list of packet IDs
 * Output: Map of packet_id → BM25 score [0, 1]
 *
 * Used by: Reranker as Signal 2 (0.35 weight in blend)
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

export interface PacketLexicalFeature {
  term: string;
  frequency: number;
  score: number;
  type: string;
}

export interface BM25ScoreMap {
  [packetId: string]: number;
}

/**
 * Extract BM25 scores for query keywords across candidates
 * @param queryTerms Extracted query keywords (preprocessed)
 * @param packetIds List of packet IDs to score
 * @returns Map of packet_id → BM25 score [0, 1]
 */
export async function extractBM25Scores(
  queryTerms: string[],
  packetIds: string[]
): Promise<BM25ScoreMap> {
  if (queryTerms.length === 0 || packetIds.length === 0) {
    return {};
  }

  try {
    // Query: fetch lexical_features JSONB for all candidate packets
    const rows = await sql`
      SELECT packet_id, payload->'lexical_features' as features
      FROM atlas_packets
      WHERE packet_id = ANY(${packetIds})
        AND payload->>'lexical_features' IS NOT NULL
    `.all();

    const scores: BM25ScoreMap = {};

    for (const row of rows) {
      const packetId = row.packet_id as string;
      const featuresJson = row.features as unknown;

      if (!featuresJson || typeof featuresJson !== 'object') {
        scores[packetId] = 0;
        continue;
      }

      // features is array of { term, frequency, score, type }
      const features = Array.isArray(featuresJson) ? featuresJson : [featuresJson];

      let termScore = 0;
      let maxScore = 0;

      for (const feature of features as PacketLexicalFeature[]) {
        maxScore = Math.max(maxScore, feature.score || 0);

        // Check if feature term matches any query term
        const termLower = (feature.term || '').toLowerCase();
        for (const queryTerm of queryTerms) {
          if (termLower.includes(queryTerm.toLowerCase()) || queryTerm.toLowerCase().includes(termLower)) {
            termScore += feature.score || 0;
          }
        }
      }

      // Normalize to [0, 1]: divide by max possible score
      const maxPossible = queryTerms.length * (maxScore || 1);
      scores[packetId] = maxPossible > 0 ? Math.min(1.0, termScore / maxPossible) : 0;
    }

    // Fill in missing packet IDs with 0 score
    for (const id of packetIds) {
      if (!(id in scores)) {
        scores[id] = 0;
      }
    }

    return scores;
  } catch (err) {
    console.error('extractBM25Scores error:', err);
    return {};
  }
}

/**
 * Extract and normalize query terms for BM25 lookup
 * @param query Raw user query string
 * @returns Array of normalized keywords
 */
export function extractQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s\-_./:()[\]{}<>]+/)
    .filter(t => t.length > 2 && !isStopword(t));
}

/**
 * Simple stopword filter
 */
function isStopword(term: string): boolean {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  ]);
  return stopwords.has(term);
}
