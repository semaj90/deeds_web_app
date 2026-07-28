/**
 * MCP Tool: Embeddings → Keywords → Qdrant Tags
 *
 * Derives keywords and Qdrant tags from packet embeddings using:
 * 1. Cosine similarity to known keyword centroids (Redis cache)
 * 2. Agentic dense search to find semantically adjacent packets
 * 3. Cluster assignment for categorization tags
 *
 * Wired into Parent Atlas MCP server for agentic tool calling.
 */

import Redis from 'ioredis';
import { createAtlasRedisClient, VECTOR_LANE_REGISTRY } from './redis-client-factory.mjs';

/**
 * Extract keywords from a packet embedding
 * Uses top-K cosine similarity against cached keyword centroids
 *
 * @param {number[]} embedding - 768-dim embedding vector
 * @param {number} topK - Number of keywords to extract (default: 5)
 * @returns {Promise<{keyword: string, score: number}[]>} Keywords with scores
 */
export async function deriveKeywordsFromEmbedding(embedding, topK = 5) {
  const redis = createAtlasRedisClient();
  await redis.connect();

  try {
    // Load keyword centroids from Redis (precomputed by karpathy pipeline)
    // Key pattern: gpu:karpathy:keywords:{clusterName}
    const keywordKeys = await redis.keys('gpu:karpathy:keywords:*');
    const keywords = [];

    for (const key of keywordKeys) {
      const centroidStr = await redis.get(key);
      if (!centroidStr) continue;

      const centroid = JSON.parse(centroidStr);
      const clusterName = key.split(':').pop();

      // Compute cosine similarity
      const similarity = cosineSimilarity(embedding, centroid.vector);

      keywords.push({
        keyword: clusterName,
        score: similarity,
        source: 'karpathy-centroids'
      });
    }

    // Sort by score and return top-K
    return keywords
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(k => ({ keyword: k.keyword, score: Math.round(k.score * 1000) / 1000 }));
  } finally {
    await redis.quit();
  }
}

/**
 * Find semantically adjacent packets (agentic dense search)
 * Uses Qdrant cosine similarity to find similar packets
 *
 * @param {number[]} embedding - 768-dim embedding (DENSE_768 from registry)
 * @param {number} limit - Max results (default: 10)
 * @returns {Promise<{packetKey: string, similarity: number, tags: string[]}[]>}
 */
export async function findSemanticNeighbors(embedding, limit = 10) {
  try {
    // This would call Qdrant search directly
    // For now, return stub that expects external Qdrant handler
    return {
      method: 'qdrant_search',
      query: {
        collection: 'codebase_chunks_768',
        vector: embedding,
        limit: limit,
        vectorName: 'content',
        withPayload: ['packet_key', 'cluster_id', 'tags']
      }
    };
  } catch (err) {
    console.error('Semantic neighbor search failed:', err.message);
    return [];
  }
}

/**
 * Assign cluster tags based on packet embedding
 * Uses precomputed SOM + K-means assignments
 *
 * @param {number[]} embedding - 768-dim embedding
 * @returns {Promise<{clusterId: string, clusterName: string, confidence: number}[]>}
 */
export async function deriveClusterTags(embedding) {
  const redis = createAtlasRedisClient();
  await redis.connect();

  try {
    // Load SOM grid centroids from Redis (cached by daily pipeline)
    // Key pattern: som:centroid:{row}:{col}:{dim}
    const tags = [];

    // Find nearest SOM cell (simplified: just check Redis cache)
    const somCentroids = await redis.keys('som:centroid:*');

    for (const key of somCentroids) {
      const centroidStr = await redis.get(key);
      if (!centroidStr) continue;

      const centroid = JSON.parse(centroidStr);
      const similarity = cosineSimilarity(embedding, centroid);
      const [, row, col] = key.split(':');

      tags.push({
        clusterId: `som_${row}_${col}`,
        clusterName: `SOM_${row}_${col}`,
        confidence: Math.round(similarity * 1000) / 1000
      });
    }

    // Sort by confidence and return
    return tags.sort((a, b) => b.confidence - a.confidence);
  } finally {
    await redis.quit();
  }
}

/**
 * Comprehensive tag derivation: keywords + cluster + neighbors
 * Callable from agentic tool calling (MCP interface)
 *
 * @param {Object} params
 * @param {number[]} params.embedding - 768-dim embedding
 * @param {string} params.packetKey - packet identity (for dedup)
 * @param {number} params.keywordTopK - number of keywords (default: 5)
 * @param {number} params.neighborLimit - max semantic neighbors (default: 10)
 * @returns {Promise<{keywords: any[], clusterTags: any[], neighbors: any[]}>}
 */
export async function deriveAllTagsForPacket(params) {
  const {
    embedding,
    packetKey,
    keywordTopK = 5,
    neighborLimit = 10
  } = params;

  if (!embedding || !Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(`Invalid embedding: expected 768-dim array, got ${embedding?.length || 'undefined'}`);
  }

  // Run all three in parallel
  const [keywords, clusterTags, neighborsQuery] = await Promise.all([
    deriveKeywordsFromEmbedding(embedding, keywordTopK),
    deriveClusterTags(embedding),
    findSemanticNeighbors(embedding, neighborLimit)
  ]);

  return {
    packetKey,
    timestamp: new Date().toISOString(),
    vectorLane: VECTOR_LANE_REGISTRY.DENSE_768.role,
    keywords: keywords.slice(0, keywordTopK),
    clusterTags: clusterTags.slice(0, 3), // Top 3 clusters
    neighborsQuery: neighborsQuery,
    metadata: {
      keywordModel: 'karpathy-centroids',
      clusterModel: 'som-20x20',
      retrievalModel: 'qdrant-codebase-768'
    }
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} similarity score 0-1
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (normA * normB);
}

/**
 * MCP tool definition (for registration with MCP server)
 */
export const mcpToolDefinition = {
  name: 'atlas_derive_tags_from_embedding',
  description: 'Derive keywords, cluster tags, and semantic neighbors from a 768-dim packet embedding',
  inputSchema: {
    type: 'object',
    properties: {
      embedding: {
        type: 'array',
        items: { type: 'number' },
        description: '768-dimensional embedding vector (DENSE_768 from VECTOR_LANE_REGISTRY)',
        minItems: 768,
        maxItems: 768
      },
      packetKey: {
        type: 'string',
        description: 'Packet identity key for deduplication and traceability'
      },
      keywordTopK: {
        type: 'integer',
        description: 'Number of keywords to extract (default: 5)',
        minimum: 1,
        maximum: 20
      },
      neighborLimit: {
        type: 'integer',
        description: 'Max semantic neighbors to find (default: 10)',
        minimum: 1,
        maximum: 100
      }
    },
    required: ['embedding', 'packetKey']
  }
};

export default deriveAllTagsForPacket;
