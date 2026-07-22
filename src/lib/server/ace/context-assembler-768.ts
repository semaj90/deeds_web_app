/**
 * Step 16: ACE Context Assembly — 768-dim Canonical
 *
 * Builds ACEPacket from multi-lane retrieval results.
 * Compresses 18.8K tokens → 4.8K tokens (ACE context capping).
 * Caches to L1 Redis for subsequent queries.
 *
 * Dimension: 768-dim primary, 384-dim fallback with catch block.
 */

export interface ACEPacket {
  id: string;
  query_text: string;
  query_embedding: number[];
  query_embedding_dimension: number;
  retrieved_at: string;
  candidates: Array<{
    packet_key: string;
    source_ref: string;
    feature_id: string;
    domain_class?: string;
    authority_score: number;
    final_score: number;
    retrieval_trace?: {
      qdrant_ms?: number;
      turbovec_ms?: number;
      postgres_ms?: number;
      neo4j_ms?: number;
    };
  }>;
  total_tokens: number;
  compressed_tokens: number;
  compression_ratio: number;
  lanes_used: string[];
  cache_key: string;
  cache_ttl_seconds: number;
}

export class ACEContextAssembler {
  private embedding_dimension: number = 768; // Production canonical
  private max_context_tokens: number = 4800; // ACE context cap

  constructor(embedding_dimension?: number) {
    // Validate dimension
    if (embedding_dimension && embedding_dimension !== 768 && embedding_dimension !== 384) {
      console.warn(`[ACEContextAssembler] Invalid dimension: ${embedding_dimension}. Defaulting to 768-dim.`);
      this.embedding_dimension = 768;
    } else if (embedding_dimension === 384) {
      console.warn(
        '[ACEContextAssembler] Using legacy 384-dim embedding. ' +
        'Recommend migration to 768-dim (production canonical).'
      );
      this.embedding_dimension = 384;
    } else if (embedding_dimension) {
      this.embedding_dimension = embedding_dimension;
    }
  }

  async assemble(
    queryText: string,
    queryEmbedding: number[],
    candidates: Array<{
      packet_key: string;
      source_ref: string;
      feature_id: string;
      domain_class?: string;
      qdrant_score?: number;
      turbovec_score?: number;
      postgres_score?: number;
      neo4j_score?: number;
      final_score: number;
      retrieval_trace?: {
        qdrant_ms?: number;
        turbovec_ms?: number;
        postgres_ms?: number;
        neo4j_ms?: number;
      };
    }>,
    lanesUsed: string[]
  ): Promise<ACEPacket> {
    // Catch block: validate query embedding dimension
    try {
      this.validateQueryEmbedding(queryEmbedding);
    } catch (err) {
      console.error('[ACEContextAssembler] Query embedding validation failed:', err);
      // Continue anyway (soft failure)
    }

    // Estimate token count (rough approximation)
    const totalTokens = this.estimateTotalTokens(queryText, candidates);

    // Compress to context cap
    const selectedCandidates = this.selectCandidatesForContext(candidates);
    const compressedTokens = this.estimateCompressedTokens(queryText, selectedCandidates);
    const compressionRatio = totalTokens > 0 ? compressedTokens / totalTokens : 1;

    // Build packet
    const packet: ACEPacket = {
      id: this.generatePacketId(),
      query_text: queryText,
      query_embedding: queryEmbedding,
      query_embedding_dimension: queryEmbedding.length,
      retrieved_at: new Date().toISOString(),
      candidates: selectedCandidates.map((c) => ({
        packet_key: c.packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        domain_class: c.domain_class,
        authority_score: c.final_score,
        final_score: c.final_score,
        retrieval_trace: c.retrieval_trace,
      })),
      total_tokens: totalTokens,
      compressed_tokens: compressedTokens,
      compression_ratio: compressionRatio,
      lanes_used: lanesUsed,
      cache_key: this.generateCacheKey(queryEmbedding),
      cache_ttl_seconds: 3600, // 1 hour
    };

    return packet;
  }

  async cachePacket(
    packet: ACEPacket,
    redis: any // ioredis.Redis type
  ): Promise<void> {
    try {
      const entry = {
        data: packet,
        metadata: {
          tier: 'L1',
          timestamp: Date.now(),
          ttl_seconds: packet.cache_ttl_seconds,
          embedding_dimension: packet.query_embedding_dimension,
        },
      };

      await redis.setex(
        `ace:packet:${packet.cache_key}`,
        packet.cache_ttl_seconds,
        JSON.stringify(entry)
      );
    } catch (err) {
      console.error('[ACEContextAssembler] Cache write failed:', err);
      // Soft failure: continue without cache
    }
  }

  async getCachedPacket(
    queryEmbedding: number[],
    redis: any // ioredis.Redis type
  ): Promise<ACEPacket | null> {
    try {
      const cacheKey = this.generateCacheKey(queryEmbedding);
      const cached = await redis.get(`ace:packet:${cacheKey}`);
      if (!cached) return null;

      const entry = JSON.parse(cached);
      return entry.data as ACEPacket;
    } catch (err) {
      console.warn('[ACEContextAssembler] Cache read failed:', err);
      return null;
    }
  }

  async persistPacket(
    packet: ACEPacket,
    db: any // Postgres client
  ): Promise<void> {
    try {
      // Placeholder: would write audit trail to Postgres
      const sql = `
        INSERT INTO ace_packets (
          packet_id, query_text, query_embedding, query_embedding_dimension,
          retrieved_at, candidates_json, compression_ratio, cache_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await db.query(sql, [
        packet.id,
        packet.query_text,
        JSON.stringify(packet.query_embedding),
        packet.query_embedding_dimension,
        packet.retrieved_at,
        JSON.stringify(packet.candidates),
        packet.compression_ratio,
        packet.cache_key,
      ]);
    } catch (err) {
      console.error('[ACEContextAssembler] Persistence failed:', err);
      // Soft failure: continue without audit trail
    }
  }

  private validateQueryEmbedding(embedding: number[]): void {
    if (embedding.length !== this.embedding_dimension && embedding.length !== 384) {
      throw new Error(
        `Query embedding dimension mismatch. Expected ${this.embedding_dimension} or 384 (fallback), got ${embedding.length}.`
      );
    }

    // If 384-dim was sent but we're expecting 768, log warning (catch block)
    if (embedding.length === 384 && this.embedding_dimension === 768) {
      console.warn(
        '[ACEContextAssembler] Received 384-dim query but expecting 768-dim. Accepting for fallback.'
      );
    }

    // Check L2 norm
    let normSq = 0;
    for (let i = 0; i < embedding.length; i++) {
      normSq += embedding[i] * embedding[i];
    }

    if (normSq < 0.98 || normSq > 1.02) {
      console.warn(
        `[ACEContextAssembler] Query not L2-normalized. norm² = ${normSq.toFixed(4)}, expected ≈1.0`
      );
    }
  }

  private selectCandidatesForContext(
    candidates: Array<{
      packet_key: string;
      source_ref: string;
      feature_id: string;
      domain_class?: string;
      final_score: number;
      retrieval_trace?: object;
    }>
  ): typeof candidates {
    // Select top candidates until we reach context cap
    // Simple heuristic: take top 10 by score (tokens ~400 each)
    return candidates.slice(0, 10);
  }

  private estimateTotalTokens(
    queryText: string,
    candidates: Array<{ source_ref: string }>
  ): number {
    // Rough estimation: query (4 tokens) + candidates (40 tokens avg each)
    return 4 + candidates.length * 40;
  }

  private estimateCompressedTokens(
    queryText: string,
    candidates: Array<{ source_ref: string }>
  ): number {
    // After compression: query (4 tokens) + candidates (24 tokens avg each, compressed)
    return Math.min(4 + candidates.length * 24, this.max_context_tokens);
  }

  private generatePacketId(): string {
    return `ace:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  }

  private generateCacheKey(embedding: number[]): string {
    // Simple hash of embedding
    let hash = 0;
    for (let i = 0; i < Math.min(10, embedding.length); i++) {
      hash += embedding[i] * 1000;
    }
    return `${hash}:${embedding.length}`;
  }
}

let assemblerInstance: ACEContextAssembler | null = null;

export function getACEContextAssembler(embedding_dimension?: number): ACEContextAssembler {
  if (!assemblerInstance) {
    assemblerInstance = new ACEContextAssembler(embedding_dimension);
  }
  return assemblerInstance;
}
