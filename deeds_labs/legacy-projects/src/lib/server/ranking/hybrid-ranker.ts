// src/lib/server/ranking/hybrid-ranker.ts
import Fuse from 'fuse.js';
import { sql } from 'drizzle-orm';
import type { SearchResult } from '$lib/server/vectordb/dual-vector-store'; // Import SearchResult

export interface RankedResult extends SearchResult {
  score: number;
  scores: {
    semantic: number;
    fuzzy: number;
    bm25: number;
  };
}

export class HybridRanker {
  // Assuming 'db' (Drizzle instance) is available, perhaps passed in constructor or globally
  // For now, I'll add a placeholder for it.
  private db: any; // Placeholder for Drizzle instance

  constructor(db: any) {
    this.db = db;
  }

  async rank(query: {
    text: string;
    embedding: number[];
    candidates: SearchResult[];
  }): Promise<RankedResult[]> {
    const { text, embedding, candidates } = query;

    // Stage 1: Semantic scores (already from vector search)
    const semanticScores = new Map(
      candidates.map(c => [c.id, c.similarity])
    );

    // Stage 2: Fuzzy search with Fuse.js
    const fuse = new Fuse(candidates, {
      keys: ['metadata.title', 'metadata.parties', 'metadata.case_number'],
      threshold: 0.3,
      distance: 100,
      includeScore: true
    });

    const fuzzyResults = fuse.search(text);
    const fuzzyScores = new Map(
      fuzzyResults.map(r => [r.item.id, 1 - (r.score || 0)])
    );

    // Stage 3: BM25 full-text search (PostgreSQL)
    const bm25Scores = await this.getBM25Scores(text, candidates);

    // Stage 4: Reciprocal Rank Fusion (RRF)
    const finalScores = candidates.map(candidate => {
      const semanticScore = semanticScores.get(candidate.id) || 0;
      const fuzzyScore = fuzzyScores.get(candidate.id) || 0;
      const bm25Score = bm25Scores.get(candidate.id) || 0;

      // Weighted combination
      const combinedScore =
        semanticScore * 0.5 +
        fuzzyScore * 0.3 +
        bm25Score * 0.2;

      return {
        ...candidate,
        score: combinedScore,
        scores: {
          semantic: semanticScore,
          fuzzy: fuzzyScore,
          bm25: bm25Score
        }
      };
    });

    // Sort by combined score
    return finalScores.sort((a, b) => b.score - a.score).slice(0, 20);
  }

  private async getBM25Scores(
    query: string,
    candidates: SearchResult[]
  ): Promise<Map<string, number>> {
    const candidateIds = candidates.map(c => c.id);

    // Placeholder for actual database query
    console.warn('BM25 scoring is a placeholder and requires a live PostgreSQL connection.');
    // In a real implementation, this would query the PostgreSQL database
    // using the 'db' instance to get BM25 scores.
    // For now, return dummy scores.
    const dummyScores = new Map<string, number>();
    candidateIds.forEach(id => dummyScores.set(id, Math.random())); // Random score for demonstration
    return dummyScores;
  }
}