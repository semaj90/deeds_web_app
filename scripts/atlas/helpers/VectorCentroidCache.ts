import { Redis } from 'ioredis';

export interface CentroidData {
  centroid: Float32Array;
  memberCount: number;
  timestamp: number;
  coherence: number; // 0-1 score
}

export class VectorCentroidCache {
  private redis: Redis;
  private dimension: number;

  constructor(redisClient: Redis, dimension: number = 768) {
    this.redis = redisClient;
    this.dimension = dimension;
  }

  /**
   * Get cluster centroid from cache or compute it
   * Centroid = mean of all member vectors
   */
  async getOrComputeCentroid(
    clusterId: string,
    vectorIds: string[],
    fetchVectorFn: (id: string) => Promise<Float32Array | null>,
    ttl: number = 86400
  ): Promise<CentroidData> {
    const cacheKey = `centroid:${clusterId}:${this.dimension}`;

    // Try cache first
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return this.deserializeCentroid(cached);
      }
    } catch (err) {
      console.warn('[VectorCentroidCache] Cache miss or error:', err);
    }

    // Compute: fetch vectors and average them
    const vectors: Float32Array[] = [];
    for (const id of vectorIds) {
      const vec = await fetchVectorFn(id);
      if (vec) vectors.push(vec);
    }

    if (vectors.length === 0) {
      throw new Error(`[VectorCentroidCache] No vectors found for cluster ${clusterId}`);
    }

    const centroid = this.computeMean(vectors);
    const coherence = this.computeCoherence(vectors, centroid);

    const data: CentroidData = {
      centroid,
      memberCount: vectors.length,
      timestamp: Date.now(),
      coherence
    };

    // Store in cache
    try {
      const serialized = this.serializeCentroid(data);
      await this.redis.set(cacheKey, serialized, 'EX', ttl);
    } catch (err) {
      console.warn('[VectorCentroidCache] Cache write failed:', err);
    }

    return data;
  }

  /**
   * Compute cluster summary as averaged embedding
   * Used for efficient cluster-level search
   */
  async computeClusterSummary(
    clusterId: string,
    vectorIds: string[],
    topK: number = 5,
    fetchVectorFn: (id: string) => Promise<Float32Array | null>
  ): Promise<{
    summary: Float32Array;
    selectedIndices: number[];
    coherence: number;
  }> {
    // Fetch all vectors
    const vectors: Array<{ id: string; vec: Float32Array; index: number }> = [];
    for (let i = 0; i < vectorIds.length; i++) {
      const vec = await fetchVectorFn(vectorIds[i]);
      if (vec) {
        vectors.push({ id: vectorIds[i], vec, index: i });
      }
    }

    if (vectors.length === 0) {
      throw new Error(`[VectorCentroidCache] No vectors for summary of ${clusterId}`);
    }

    // Compute centroid (temporary)
    const temp = this.computeMean(vectors.map(v => v.vec));

    // Select top-K closest to centroid
    const distances = vectors.map((v, idx) => ({
      index: idx,
      originalIndex: v.index,
      distance: this.cosineSimilarity(v.vec, temp)
    }));

    distances.sort((a, b) => b.distance - a.distance); // descending
    const selected = distances.slice(0, Math.min(topK, distances.length));
    const selectedVectors = selected.map(s => vectors[s.index].vec);

    // Final summary from selected vectors
    const summary = this.computeMean(selectedVectors);
    const coherence = this.computeCoherence(selectedVectors, summary);

    // Cache the summary
    const cacheKey = `cluster_summary:${clusterId}:${this.dimension}`;
    try {
      const data: CentroidData = {
        centroid: summary,
        memberCount: selectedVectors.length,
        timestamp: Date.now(),
        coherence
      };
      const serialized = this.serializeCentroid(data);
      await this.redis.set(cacheKey, serialized, 'EX', 86400);
    } catch (err) {
      console.warn('[VectorCentroidCache] Summary cache write failed:', err);
    }

    return {
      summary,
      selectedIndices: selected.map(s => s.originalIndex),
      coherence
    };
  }

  /**
   * Invalidate cache entries for a cluster
   */
  async invalidateCluster(clusterId: string): Promise<void> {
    const patterns = [
      `centroid:${clusterId}:*`,
      `cluster_summary:${clusterId}:*`
    ];

    for (const pattern of patterns) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch (err) {
        console.warn(`[VectorCentroidCache] Failed to invalidate ${pattern}:`, err);
      }
    }
  }

  // ===== PRIVATE HELPERS =====

  private computeMean(vectors: Float32Array[]): Float32Array {
    if (vectors.length === 0) throw new Error('Cannot compute mean of empty vector set');

    const mean = new Float32Array(this.dimension);
    for (const vec of vectors) {
      for (let i = 0; i < this.dimension; i++) {
        mean[i] += vec[i];
      }
    }

    for (let i = 0; i < this.dimension; i++) {
      mean[i] /= vectors.length;
    }

    return mean;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < this.dimension; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  private computeCoherence(vectors: Float32Array[], centroid: Float32Array): number {
    // Coherence = average cosine similarity to centroid (0-1)
    if (vectors.length === 0) return 0;

    let totalSimilarity = 0;
    for (const vec of vectors) {
      totalSimilarity += this.cosineSimilarity(vec, centroid);
    }

    return totalSimilarity / vectors.length;
  }

  private serializeCentroid(data: CentroidData): string {
    // Encode: base64 of Float32Array + metadata JSON
    const encoded = Buffer.from(data.centroid.buffer).toString('base64');
    const metadata = {
      encoded,
      memberCount: data.memberCount,
      timestamp: data.timestamp,
      coherence: data.coherence
    };
    return JSON.stringify(metadata);
  }

  private deserializeCentroid(serialized: string): CentroidData {
    const metadata = JSON.parse(serialized);
    const buffer = Buffer.from(metadata.encoded, 'base64');
    const centroid = new Float32Array(buffer.buffer);

    return {
      centroid,
      memberCount: metadata.memberCount,
      timestamp: metadata.timestamp,
      coherence: metadata.coherence
    };
  }
}
