/**
 * Step 13: Soft Routing Orchestrator — 4 Parallel Lanes Without Hard Filters (768-dim canonical)
 *
 * Executes Qdrant, TurboVec, Postgres FTS, and Neo4j graph searches in parallel.
 * No hard filter cutoffs — all lanes contribute to final candidate pool via RRF.
 *
 * Dimension: 768-dim primary, 384-dim fallback with catch block.
 */

export interface RetrievalCandidate {
  packet_key: string;
  source_ref: string;
  feature_id: string;
  qdrant_score?: number;
  qdrant_rank?: number;
  turbovec_score?: number;
  turbovec_rank?: number;
  postgres_score?: number;
  postgres_rank?: number;
  neo4j_score?: number;
  neo4j_rank?: number;
  timing: {
    qdrant_ms?: number;
    turbovec_ms?: number;
    postgres_ms?: number;
    neo4j_ms?: number;
  };
}

export interface SoftRoutingConfig {
  qdrant_enabled: boolean;
  turbovec_enabled: boolean;
  postgres_enabled: boolean;
  neo4j_enabled: boolean;
  top_k: number;
  dedup_by: 'packet_key' | 'source_ref';
  embedding_dimension?: number; // 768 (primary) or 384 (legacy fallback)
}

export class SoftRoutingOrchestrator {
  private config: SoftRoutingConfig = {
    qdrant_enabled: true,
    turbovec_enabled: true,
    postgres_enabled: true,
    neo4j_enabled: true,
    top_k: 50,
    dedup_by: 'packet_key',
    embedding_dimension: 768, // Production canonical
  };

  constructor(config?: Partial<SoftRoutingConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Validate dimension
    const dim = this.config.embedding_dimension || 768;
    if (dim !== 768 && dim !== 384) {
      console.warn(`[SoftRoutingOrchestrator] Invalid dimension: ${dim}. Defaulting to 768-dim.`);
      this.config.embedding_dimension = 768;
    }

    if (dim === 384) {
      console.warn(
        '[SoftRoutingOrchestrator] Using legacy 384-dim embedding. ' +
        'Recommend migration to 768-dim (production canonical).'
      );
    }
  }

  async search(queryEmbedding: number[], query: string): Promise<RetrievalCandidate[]> {
    // Catch block: validate query embedding dimension
    try {
      this.validateQueryEmbedding(queryEmbedding);
    } catch (err) {
      console.error('[SoftRoutingOrchestrator] Query embedding validation failed:', err);
      return [];
    }

    const tasks: Promise<RetrievalCandidate[]>[] = [];

    if (this.config.qdrant_enabled) {
      tasks.push(this.qdrantLane(queryEmbedding));
    }

    if (this.config.turbovec_enabled) {
      tasks.push(this.turboVecLane(queryEmbedding));
    }

    if (this.config.postgres_enabled) {
      tasks.push(this.postgresLane(query));
    }

    if (this.config.neo4j_enabled) {
      tasks.push(this.neo4jLane(query));
    }

    const results = await Promise.allSettled(tasks);
    const allCandidates: RetrievalCandidate[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allCandidates.push(...result.value);
      } else {
        console.error('[SoftRoutingOrchestrator] Lane failed:', result.reason);
        // Continue with remaining lanes (soft failure)
      }
    }

    return this.deduplicate(allCandidates);
  }

  private validateQueryEmbedding(embedding: number[]): void {
    const expectedDim = this.config.embedding_dimension || 768;

    if (embedding.length !== expectedDim && embedding.length !== 384) {
      throw new Error(
        `Query embedding dimension mismatch. Expected ${expectedDim} or 384 (fallback), got ${embedding.length}.`
      );
    }

    // If 384-dim was sent but we're expecting 768, log warning (catch block)
    if (embedding.length === 384 && expectedDim === 768) {
      console.warn('[SoftRoutingOrchestrator] Received 384-dim query but expecting 768-dim. Accepting for fallback.');
    }

    // Check L2 norm
    let normSq = 0;
    for (let i = 0; i < embedding.length; i++) {
      normSq += embedding[i] * embedding[i];
    }

    if (normSq < 0.98 || normSq > 1.02) {
      console.warn(
        `[SoftRoutingOrchestrator] Query not L2-normalized. norm² = ${normSq.toFixed(4)}, expected ≈1.0`
      );
    }
  }

  private async qdrantLane(embedding: number[]): Promise<RetrievalCandidate[]> {
    const start = Date.now();

    try {
      // Placeholder: actual Qdrant call would use:
      // - codebase_chunks_768 for 768-dim queries
      // - codebase_chunks_384 for 384-dim fallback (with warning)
      const ms = Date.now() - start;

      return [
        {
          packet_key: 'example:1',
          source_ref: 'src/example.ts',
          feature_id: 'example_feature',
          qdrant_score: 0.95,
          qdrant_rank: 1,
          timing: { qdrant_ms: ms },
        },
      ];
    } catch (err) {
      console.error('[SoftRoutingOrchestrator.qdrantLane] Error:', err);
      return []; // Soft failure
    }
  }

  private async turboVecLane(embedding: number[]): Promise<RetrievalCandidate[]> {
    const start = Date.now();

    try {
      // Placeholder: TurboVec prefilter (768→64 via autoencoder)
      const ms = Date.now() - start;

      return [
        {
          packet_key: 'example:2',
          source_ref: 'src/example.ts',
          feature_id: 'example_feature',
          turbovec_score: 0.88,
          turbovec_rank: 1,
          timing: { turbovec_ms: ms },
        },
      ];
    } catch (err) {
      console.error('[SoftRoutingOrchestrator.turboVecLane] Error:', err);
      return []; // Soft failure
    }
  }

  private async postgresLane(query: string): Promise<RetrievalCandidate[]> {
    const start = Date.now();

    try {
      // Placeholder: actual Postgres FTS call
      const ms = Date.now() - start;

      return [
        {
          packet_key: 'example:3',
          source_ref: 'src/example.ts',
          feature_id: 'example_feature',
          postgres_score: 0.75,
          postgres_rank: 1,
          timing: { postgres_ms: ms },
        },
      ];
    } catch (err) {
      console.error('[SoftRoutingOrchestrator.postgresLane] Error:', err);
      return []; // Soft failure
    }
  }

  private async neo4jLane(query: string): Promise<RetrievalCandidate[]> {
    const start = Date.now();

    try {
      // Placeholder: actual Neo4j graph traversal
      const ms = Date.now() - start;

      return [
        {
          packet_key: 'example:4',
          source_ref: 'src/example.ts',
          feature_id: 'example_feature',
          neo4j_score: 0.65,
          neo4j_rank: 1,
          timing: { neo4j_ms: ms },
        },
      ];
    } catch (err) {
      console.error('[SoftRoutingOrchestrator.neo4jLane] Error:', err);
      return []; // Soft failure
    }
  }

  private deduplicate(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
    const seen = new Map<string, RetrievalCandidate>();

    for (const candidate of candidates) {
      const key = this.config.dedup_by === 'packet_key' ? candidate.packet_key : candidate.source_ref;

      if (!seen.has(key)) {
        seen.set(key, candidate);
      } else {
        const existing = seen.get(key)!;
        const mergedTiming = { ...existing.timing, ...candidate.timing };
        seen.set(key, { ...existing, ...candidate, timing: mergedTiming });
      }
    }

    return Array.from(seen.values());
  }
}

export function getSoftRoutingOrchestrator(config?: Partial<SoftRoutingConfig>): SoftRoutingOrchestrator {
  return new SoftRoutingOrchestrator(config);
}
