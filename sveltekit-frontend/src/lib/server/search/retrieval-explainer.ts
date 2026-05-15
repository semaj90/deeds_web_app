/**
 * Builds the score breakdown JSON stored under ace:explain:{hash} in Redis
 * and returned as the trace.explain_retrieval MCP tool response.
 */

import type { HybridSearchResult } from './hybrid-search.js';

export interface RetrievalTrace {
  query: string;
  mode: string;
  timestamp: string;
  durationMs: number;
  totalCandidates: number;
  topResults: {
    stable_key: string;
    file_path: string;
    scores: {
      lexical:   number;
      semantic:  number;
      authority: number;
      gpu:       number;
      final:     number;
    };
    sources: string[];
  }[];
  scoreWeights: Record<string, number>;
  neo4jUsed: boolean;
  gpuRerankUsed: boolean;
}

export const SCORE_WEIGHTS: Record<string, Record<string, number>> = {
  'lexical-heavy': { lexical: 0.45, semantic: 0.25, neo4j: 0.15, gpu: 0.10, boost: 0.05 },
  'hybrid':        { lexical: 0.30, semantic: 0.30, neo4j: 0.20, gpu: 0.15, boost: 0.05 },
  'semantic-heavy':{ lexical: 0.15, semantic: 0.45, neo4j: 0.20, gpu: 0.15, boost: 0.05 },
};

export function buildRetrievalTrace(
  query: string,
  mode: string,
  results: HybridSearchResult[],
  durationMs: number,
  opts: { neo4jUsed: boolean; gpuRerankUsed: boolean }
): RetrievalTrace {
  return {
    query,
    mode,
    timestamp: new Date().toISOString(),
    durationMs,
    totalCandidates: results.length,
    topResults: results.slice(0, 10).map((r) => ({
      stable_key: r.stable_key,
      file_path:  r.file_path,
      scores: {
        lexical:   r.lexical_score   ?? 0,
        semantic:  r.semantic_score  ?? 0,
        authority: r.authority_score ?? 0,
        gpu:       r.gpu_score       ?? 0,
        final:     r.final_score,
      },
      sources: r.sources,
    })),
    scoreWeights:   SCORE_WEIGHTS[mode] ?? SCORE_WEIGHTS['hybrid'],
    neo4jUsed:      opts.neo4jUsed,
    gpuRerankUsed:  opts.gpuRerankUsed,
  };
}
