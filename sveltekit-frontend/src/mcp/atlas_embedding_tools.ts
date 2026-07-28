import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Atlas Embedding Keywords Tools — MCP Wrapper
 *
 * Derives keywords, cluster tags, and semantic neighbors from packet embeddings.
 * Uses cosine similarity to match embeddings against cached centroids in Redis.
 * Designed for agentic tool calling to enrich packets with semantic metadata.
 *
 * Prerequisites:
 *   - Redis/Valkey running at REDIS_URL with karpathy keyword centroids (gpu:karpathy:keywords:*)
 *   - Redis with SOM centroids (som:centroid:*)
 *   - Qdrant running with codebase_chunks_768 collection for neighbor search
 *
 * Exports:
 *   - atlas.embedding_keywords — Extract top-K keywords from embedding
 *   - atlas.embedding_cluster_tags — Assign SOM cluster tags to embedding
 *   - atlas.embedding_neighbors — Find semantic neighbors via Qdrant
 *   - atlas.embedding_all_tags — Comprehensive tag derivation (keywords + clusters + neighbors)
 */

export function registerAtlasEmbeddingTools(server: McpServer, redisUrl?: string) {
  // Tool 1: Extract keywords from embedding
  server.registerTool(
    'atlas.embedding_keywords',
    {
      description:
        'Extract top-K keywords from a 768-dimensional packet embedding using cosine similarity to cached keyword centroids in Redis.',
      inputSchema: z.object({
        embedding: z
          .array(z.number())
          .length(768)
          .describe('768-dimensional embedding vector from embeddinggemma:latest'),
        topK: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe('Number of top keywords to return'),
      }),
    },
    async ({ embedding, topK }) => {
      try {
        const { createAtlasRedisClient } = await import(
          '../../scripts/atlas/lib/redis-client-factory.mjs'
        );
        const redis = createAtlasRedisClient();
        await redis.connect();

        try {
          // Load keyword centroids from Redis
          const keywordKeys = await redis.keys('gpu:karpathy:keywords:*');
          const keywords: Array<{ keyword: string; score: number; source: string }> = [];

          for (const key of keywordKeys) {
            const centroidStr = await redis.get(key);
            if (!centroidStr) continue;

            const centroid = JSON.parse(centroidStr) as number[];
            const clusterName = key.split(':').pop() || 'unknown';
            const similarity = cosineSimilarity(embedding, centroid);

            keywords.push({
              keyword: clusterName,
              score: similarity,
              source: 'karpathy-centroids',
            });
          }

          // Sort by score and return top-K
          const topKeywords = keywords
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map((k) => ({
              keyword: k.keyword,
              score: Math.round(k.score * 1000) / 1000,
            }));

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'success',
                    keywords: topKeywords,
                    total_centroids_checked: keywordKeys.length,
                    embedding_dimension: embedding.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } finally {
          await redis.quit();
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown error',
              }),
            },
          ],
        };
      }
    }
  );

  // Tool 2: Assign cluster tags
  server.registerTool(
    'atlas.embedding_cluster_tags',
    {
      description:
        'Assign SOM cluster tags to a 768-dimensional embedding by matching against cached SOM centroids in Redis.',
      inputSchema: z.object({
        embedding: z
          .array(z.number())
          .length(768)
          .describe('768-dimensional embedding vector'),
        topClusters: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3)
          .describe('Number of top cluster tags to return'),
      }),
    },
    async ({ embedding, topClusters }) => {
      try {
        const { createAtlasRedisClient } = await import(
          '../../scripts/atlas/lib/redis-client-factory.mjs'
        );
        const redis = createAtlasRedisClient();
        await redis.connect();

        try {
          const somCentroids = await redis.keys('som:centroid:*');
          const tags: Array<{
            clusterId: string;
            clusterName: string;
            confidence: number;
          }> = [];

          for (const key of somCentroids) {
            const centroidStr = await redis.get(key);
            if (!centroidStr) continue;

            const centroid = JSON.parse(centroidStr) as number[];
            const similarity = cosineSimilarity(embedding, centroid);
            const parts = key.split(':');
            const row = parts[2] || '?';
            const col = parts[3] || '?';

            tags.push({
              clusterId: `som_${row}_${col}`,
              clusterName: `SOM_${row}_${col}`,
              confidence: Math.round(similarity * 1000) / 1000,
            });
          }

          const topTags = tags
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, topClusters);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'success',
                    cluster_tags: topTags,
                    total_som_cells_checked: somCentroids.length,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } finally {
          await redis.quit();
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown error',
              }),
            },
          ],
        };
      }
    }
  );

  // Tool 3: Find semantic neighbors
  server.registerTool(
    'atlas.embedding_neighbors',
    {
      description:
        'Find semantically adjacent packets via Qdrant ANN search on a 768-dimensional embedding. Returns a query structure for agentic dense search in codebase_chunks_768 collection.',
      inputSchema: z.object({
        embedding: z
          .array(z.number())
          .length(768)
          .describe('768-dimensional embedding vector'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe('Maximum number of neighbors to find'),
      }),
    },
    async ({ embedding, limit }) => {
      try {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'success',
                  neighbor_query: {
                    method: 'qdrant_search',
                    collection: 'codebase_chunks_768',
                    vector: embedding,
                    limit,
                    vectorName: 'content',
                    withPayload: ['packet_key', 'cluster_id', 'tags'],
                  },
                  note: 'This query structure should be passed to Qdrant `/search` endpoint for neighbor retrieval',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown error',
              }),
            },
          ],
        };
      }
    }
  );

  // Tool 4: Comprehensive tag derivation
  server.registerTool(
    'atlas.embedding_all_tags',
    {
      description:
        'Comprehensive tag derivation for a packet embedding. Combines keywords, cluster tags, and neighbor query in parallel. Returns combined metadata for packet enrichment.',
      inputSchema: z.object({
        embedding: z
          .array(z.number())
          .length(768)
          .describe('768-dimensional embedding vector'),
        packetKey: z.string().describe('Packet identity for deduplication and traceability'),
        keywordTopK: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(5)
          .describe('Number of keywords to extract'),
        clusterTopK: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3)
          .describe('Number of cluster tags to derive'),
        neighborLimit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe('Maximum semantic neighbors to query'),
      }),
    },
    async ({ embedding, packetKey, keywordTopK, clusterTopK, neighborLimit }) => {
      try {
        const { createAtlasRedisClient, VECTOR_LANE_REGISTRY } = await import(
          '../../scripts/atlas/lib/redis-client-factory.mjs'
        );

        const redis = createAtlasRedisClient();
        await redis.connect();

        try {
          // Parallel extraction
          const [keywordKeys, somCentroids] = await Promise.all([
            redis.keys('gpu:karpathy:keywords:*'),
            redis.keys('som:centroid:*'),
          ]);

          // Extract keywords
          const keywords = [];
          for (const key of keywordKeys) {
            const centroidStr = await redis.get(key);
            if (!centroidStr) continue;
            const centroid = JSON.parse(centroidStr) as number[];
            const similarity = cosineSimilarity(embedding, centroid);
            const clusterName = key.split(':').pop() || 'unknown';
            keywords.push({
              keyword: clusterName,
              score: Math.round(similarity * 1000) / 1000,
              source: 'karpathy-centroids',
            });
          }
          const topKeywords = keywords
            .sort((a, b) => b.score - a.score)
            .slice(0, keywordTopK)
            .map((k) => ({ keyword: k.keyword, score: k.score }));

          // Extract cluster tags
          const tags = [];
          for (const key of somCentroids) {
            const centroidStr = await redis.get(key);
            if (!centroidStr) continue;
            const centroid = JSON.parse(centroidStr) as number[];
            const similarity = cosineSimilarity(embedding, centroid);
            const parts = key.split(':');
            const row = parts[2] || '?';
            const col = parts[3] || '?';
            tags.push({
              clusterId: `som_${row}_${col}`,
              clusterName: `SOM_${row}_${col}`,
              confidence: Math.round(similarity * 1000) / 1000,
            });
          }
          const topTags = tags
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, clusterTopK);

          // Construct neighbor query
          const neighborsQuery = {
            method: 'qdrant_search' as const,
            collection: 'codebase_chunks_768',
            vector: embedding,
            limit: neighborLimit,
            vectorName: 'content',
            withPayload: ['packet_key', 'cluster_id', 'tags'],
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    status: 'success',
                    packetKey,
                    timestamp: new Date().toISOString(),
                    vectorLane: VECTOR_LANE_REGISTRY?.DENSE_768?.role || 'DENSE_768',
                    keywords: topKeywords,
                    clusterTags: topTags,
                    neighborsQuery,
                    metadata: {
                      keywordModel: 'karpathy-centroids',
                      clusterModel: 'som-20x20',
                      retrievalModel: 'qdrant-codebase-768',
                      totalKeywordCentroidsChecked: keywordKeys.length,
                      totalSomCellsChecked: somCentroids.length,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } finally {
          await redis.quit();
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'error',
                error: err instanceof Error ? err.message : 'Unknown error',
              }),
            },
          ],
        };
      }
    }
  );
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
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
