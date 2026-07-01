/**
 * src/lib/server/search/search-results-aggregator.ts
 *
 * Aggregates and merges results from multiple search backends:
 *   - rg (full-text/BM25)
 *   - Qdrant (semantic/vector)
 *   - Neo4j (topology/graph)
 *
 * Produces unified, ranked result set using reciprocal rank fusion (RRF).
 *
 * Phase 1 (Production Ready):
 *   - Single backend (rg) pass-through aggregation
 *
 * Phase 2 (Research):
 *   - Multi-backend fusion (RRF weighting)
 *   - Confidence scores and explainability
 */

import { log } from '../logging';

export interface AggregatedResult {
  file: string;
  line: number;
  column?: number;
  content: string;
  match: string;
  rffScore: number; // Reciprocal Rank Fusion score
  sources: {
    rg?: { rank: number; score: number };
    qdrant?: { rank: number; score: number };
    neo4j?: { rank: number; score: number };
  };
  context?: {
    before: string[];
    after: string[];
  };
}

export interface AggregationOptions {
  weights?: {
    rg?: number;
    qdrant?: number;
    neo4j?: number;
  };
  deduplicateBy?: 'file_line' | 'content_hash'; // How to merge duplicates
  topK?: number; // Keep top K results
}

/**
 * Reciprocal Rank Fusion (RRF) for multi-backend result merging.
 * Formula: RRF(d) = Σ(1 / (k + rank(d)))
 * where k is typically 60 (protects against low-rank noise).
 *
 * @param results - Map of backend → ranked results
 * @param options - Aggregation options
 * @returns Merged and ranked results
 */
export async function aggregate(
  results: Map<string, Array<{ file: string; line: number; score?: number }>>,
  options: AggregationOptions = {}
): Promise<AggregatedResult[]> {
  const {
    weights = { rg: 1.0, qdrant: 0.8, neo4j: 0.6 },
    deduplicateBy = 'file_line',
    topK = 50
  } = options;

  const k = 60; // RRF constant
  const mergedMap = new Map<string, AggregatedResult>();

  // Track rank across each backend
  let rgRank = 0;
  let qdrantRank = 0;
  let neo4jRank = 0;

  for (const [backend, backendResults] of results) {
    if (!backendResults || backendResults.length === 0) {
      log.debug(`[aggregator] Empty results from backend: ${backend}`);
      continue;
    }

    for (let i = 0; i < backendResults.length; i++) {
      const result = backendResults[i];
      const key =
        deduplicateBy === 'file_line'
          ? `${result.file}:${result.line}`
          : `${result.file}:${result.content}`;

      let existing = mergedMap.get(key);

      if (!existing) {
        existing = {
          file: result.file,
          line: result.line,
          column: result.column,
          content: result.content || '',
          match: result.match || '',
          rffScore: 0,
          sources: {}
        };
        mergedMap.set(key, existing);
      }

      // Add RRF component for this backend
      const rank = i + 1;
      const weight = weights[backend as keyof typeof weights] || 0;
      const rffComponent = weight / (k + rank);

      existing.rffScore += rffComponent;

      // Track source ranking
      if (backend === 'rg') {
        existing.sources.rg = { rank, score: result.score || 1.0 };
      } else if (backend === 'qdrant') {
        existing.sources.qdrant = { rank, score: result.score || 1.0 };
      } else if (backend === 'neo4j') {
        existing.sources.neo4j = { rank, score: result.score || 1.0 };
      }
    }
  }

  // Sort by RRF score and limit to topK
  const aggregated = Array.from(mergedMap.values())
    .sort((a, b) => b.rffScore - a.rffScore)
    .slice(0, topK);

  log.info(`[aggregator] Aggregated ${mergedMap.size} results, kept top ${aggregated.length}`, {
    weights,
    backends: Array.from(results.keys())
  });

  return aggregated;
}

/**
 * Simple result deduplication by file:line.
 * Keeps the first occurrence.
 *
 * @param results - Array of results
 * @returns Deduplicated array
 */
export function deduplicateResults<T extends { file: string; line: number }>(
  results: T[]
): T[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.file}:${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Merge results from the same file, preserving order by line number.
 * Useful for presenting results grouped by file.
 *
 * @param results - Array of results
 * @returns Results grouped by file
 */
export function groupByFile<T extends { file: string; line: number }>(
  results: T[]
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const result of results) {
    if (!grouped.has(result.file)) {
      grouped.set(result.file, []);
    }
    grouped.get(result.file)!.push(result);
  }

  // Sort each group by line number
  for (const group of grouped.values()) {
    group.sort((a, b) => a.line - b.line);
  }

  return grouped;
}

/**
 * Calculate confidence score for aggregated results.
 * Based on: number of sources contributing + RRF score + source agreement.
 *
 * @param result - Aggregated result
 * @returns Confidence score 0-1
 */
export function calculateConfidence(result: AggregatedResult): number {
  const sourceCount = Object.keys(result.sources).length;
  const sourceWeight = Math.min(sourceCount / 3, 1.0); // Up to 3 sources = full weight
  const scoreWeight = Math.min(result.rffScore / 0.5, 1.0); // Normalize RRF score

  return sourceWeight * 0.4 + scoreWeight * 0.6;
}

/**
 * Filter results by confidence threshold.
 * High-confidence results appear in multiple backends or have high scores.
 *
 * @param results - Array of aggregated results
 * @param threshold - Confidence threshold (0-1)
 * @returns Filtered results
 */
export function filterByConfidence<T extends AggregatedResult>(
  results: T[],
  threshold: number = 0.5
): T[] {
  return results.filter((r) => calculateConfidence(r) >= threshold);
}