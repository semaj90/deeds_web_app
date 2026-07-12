/**
 * Phase 2F.1: Multi-Signal Retrieval with RRF Fusion
 *
 * Combines dense semantic (Qdrant) + lexical (BM25) signals
 * Uses Reciprocal Rank Fusion to normalize and blend scores
 */

import { db } from '$lib/server/db/client.js';
import { QdrantManager } from './qdrant-manager.js';
import { sql } from 'drizzle-orm';

export interface RetrievalCandidate {
  packet_key: string;
  source_ref: string;
  feature_label?: string;
  semantic_score?: number;
  semantic_rank?: number;
  lexical_score?: number;
  lexical_rank?: number;
  rrf_score: number;
  final_rank: number;
}

export interface MultiSignalSearchParams {
  query: string;
  queryEmbedding: number[];
  collection: string;
  limit?: number;
  signals?: ('semantic' | 'lexical')[];
}

export interface MultiSignalResult {
  candidates: RetrievalCandidate[];
  metrics: {
    semantic_retrieved: number;
    lexical_retrieved: number;
    fused_returned: number;
    fusion_overlap: number;
  };
  latencies: {
    semantic_ms: number;
    lexical_ms: number;
    fusion_ms: number;
    total_ms: number;
  };
}

const RRF_CONSTANT = 60; // Reciprocal Rank Fusion constant

export class MultiSignalRetriever {
  private qdrantManager: QdrantManager;

  constructor() {
    this.qdrantManager = new QdrantManager();
  }

  /**
   * Search using multiple signals with RRF fusion
   */
  async search(params: MultiSignalSearchParams): Promise<MultiSignalResult> {
    const startTime = Date.now();
    const signals = params.signals || ['semantic', 'lexical'];
    const limit = params.limit || 100;

    // Run semantic and lexical searches in parallel
    const [semanticResults, lexicalResults, semanticLatency, lexicalLatency] =
      await Promise.all([
        signals.includes('semantic')
          ? this.semanticSearch(params.queryEmbedding, params.collection, limit)
          : Promise.resolve([]),
        signals.includes('lexical')
          ? this.lexicalSearch(params.query, limit)
          : Promise.resolve([]),
        this.getSemanticLatency(),
        this.getLexicalLatency(),
      ]);

    const fusionStart = Date.now();

    // Fuse results using RRF
    const fused = this.fuseWithRRF(semanticResults, lexicalResults);
    const candidates = Array.from(fused.values())
      .sort((a, b) => b.rrf_score - a.rrf_score)
      .slice(0, params.limit || 20)
      .map((candidate, idx) => ({
        ...candidate,
        final_rank: idx + 1,
      }));

    const fusionLatency = Date.now() - fusionStart;
    const totalLatency = Date.now() - startTime;

    return {
      candidates,
      metrics: {
        semantic_retrieved: semanticResults.length,
        lexical_retrieved: lexicalResults.length,
        fused_returned: candidates.length,
        fusion_overlap: this.computeOverlap(semanticResults, lexicalResults),
      },
      latencies: {
        semantic_ms: semanticLatency,
        lexical_ms: lexicalLatency,
        fusion_ms: fusionLatency,
        total_ms: totalLatency,
      },
    };
  }

  /**
   * Semantic search via Qdrant dense ANN
   */
  private async semanticSearch(
    embedding: number[],
    collection: string,
    limit: number
  ): Promise<RetrievalCandidate[]> {
    try {
      const result = await this.qdrantManager.hybridSearch({
        query: '', // No text query needed
        queryEmbedding: embedding,
        collection,
        limit,
      });

      return result.results.map((r, idx) => ({
        packet_key: r.payload?.packet_key || 'unknown',
        source_ref: r.payload?.source_ref || '',
        feature_label: r.payload?.feature_label,
        semantic_score: r.score,
        semantic_rank: idx,
      }));
    } catch (error) {
      console.error('Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Lexical search via PostgreSQL full-text search (tsvector)
   */
  private async lexicalSearch(
    query: string,
    limit: number
  ): Promise<RetrievalCandidate[]> {
    try {
      // Use plainto_tsquery for safe, simple text query
      const results = await db.execute(
        sql`
          SELECT
            packet_key,
            source_ref,
            feature_label,
            ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) as ts_score
          FROM codebase_chunk_index
          WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
          ORDER BY ts_score DESC
          LIMIT ${limit}
        `
      );

      return (results as any[]).map((r, idx) => ({
        packet_key: r.packet_key,
        source_ref: r.source_ref,
        feature_label: r.feature_label,
        lexical_score: r.ts_score,
        lexical_rank: idx,
      }));
    } catch (error) {
      console.error('Lexical search failed:', error);
      return [];
    }
  }

  /**
   * Reciprocal Rank Fusion: combine ranked lists
   * Score = Σ(1 / (rank + k)) for each signal
   */
  private fuseWithRRF(
    semantic: RetrievalCandidate[],
    lexical: RetrievalCandidate[]
  ): Map<string, RetrievalCandidate> {
    const fused = new Map<string, RetrievalCandidate>();

    // Add semantic results with RRF scoring
    semantic.forEach((result) => {
      const rrfScore =
        1 / ((result.semantic_rank ?? 0) + RRF_CONSTANT);
      const existing = fused.get(result.packet_key);

      if (existing) {
        existing.rrf_score += rrfScore;
      } else {
        fused.set(result.packet_key, {
          ...result,
          rrf_score: rrfScore,
          final_rank: 0,
        });
      }
    });

    // Add lexical results with RRF scoring
    lexical.forEach((result) => {
      const rrfScore =
        1 / ((result.lexical_rank ?? 0) + RRF_CONSTANT);
      const existing = fused.get(result.packet_key);

      if (existing) {
        existing.rrf_score += rrfScore;
      } else {
        fused.set(result.packet_key, {
          ...result,
          rrf_score: rrfScore,
          final_rank: 0,
        });
      }
    });

    return fused;
  }

  /**
   * Compute overlap between two result sets
   */
  private computeOverlap(
    semantic: RetrievalCandidate[],
    lexical: RetrievalCandidate[]
  ): number {
    const semanticKeys = new Set(semantic.map((r) => r.packet_key));
    const lexicalKeys = new Set(lexical.map((r) => r.packet_key));

    let overlap = 0;
    semanticKeys.forEach((key) => {
      if (lexicalKeys.has(key)) overlap++;
    });

    return overlap;
  }

  /**
   * Placeholder: track semantic latency (would be measured in real scenario)
   */
  private async getSemanticLatency(): Promise<number> {
    return 10; // Placeholder
  }

  /**
   * Placeholder: track lexical latency
   */
  private async getLexicalLatency(): Promise<number> {
    return 5; // Placeholder
  }
}

export const multiSignalRetriever = new MultiSignalRetriever();
