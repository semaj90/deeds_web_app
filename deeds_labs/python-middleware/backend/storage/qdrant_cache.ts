/**
 * R3 Semantic Cache with Qdrant
 * Cosine similarity-based duplicate suppression
 * No rerank if duplicate found (cosine > threshold)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { PointStruct } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';

export interface CacheEntry {
  id: string;
  embedding: number[];
  content: string;
  metadata: Record<string, any>;
  timestamp: number;
  cosine_similarity?: number;
}

export interface CacheConfig {
  qdrantUrl: string;
  collectionName: string;
  vectorSize: number;
  similarityThreshold: number;
}

export class R3SemanticCache {
  private client: QdrantClient;
  private config: CacheConfig;
  private collectionInitialized = false;

  constructor(config: CacheConfig) {
    this.config = config;
    this.client = new QdrantClient({
      url: config.qdrantUrl,
    });
  }

  async initialize(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.config.collectionName);

      if (!exists) {
        await this.client.createCollection(this.config.collectionName, {
          vectors: {
            size: this.config.vectorSize,
            distance: 'Cosine',
          },
        });
      }

      this.collectionInitialized = true;
      console.log(`R3 Semantic Cache initialized: ${this.config.collectionName}`);
    } catch (error) {
      console.error('Failed to initialize R3 cache:', error);
      throw error;
    }
  }

  async store(embedding: number[], content: string, metadata: Record<string, any>): Promise<CacheEntry> {
    if (!this.collectionInitialized) {
      await this.initialize();
    }

    const id = uuidv4();
    const entry: CacheEntry = {
      id,
      embedding,
      content,
      metadata,
      timestamp: Date.now(),
    };

    const point: PointStruct = {
      id: this.uuidToId(id),
      vector: embedding,
      payload: {
        content,
        metadata,
        timestamp: entry.timestamp,
      },
    };

    await this.client.upsert(this.config.collectionName, {
      points: [point],
    });

    return entry;
  }

  async findDuplicate(embedding: number[], threshold: number = this.config.similarityThreshold): Promise<CacheEntry | null> {
    if (!this.collectionInitialized) {
      await this.initialize();
    }

    try {
      const results = await this.client.search(this.config.collectionName, {
        vector: embedding,
        limit: 1,
        score_threshold: threshold,
      });

      if (results.length === 0) {
        return null;
      }

      const result = results[0];
      return {
        id: result.id.toString(),
        embedding: result.vector || [],
        content: result.payload?.content || '',
        metadata: result.payload?.metadata || {},
        timestamp: result.payload?.timestamp || 0,
        cosine_similarity: result.score,
      };
    } catch (error) {
      console.error('Error searching cache:', error);
      return null;
    }
  }

  async search(embedding: number[], limit: number = 5): Promise<CacheEntry[]> {
    if (!this.collectionInitialized) {
      await this.initialize();
    }

    try {
      const results = await this.client.search(this.config.collectionName, {
        vector: embedding,
        limit,
      });

      return results.map(result => ({
        id: result.id.toString(),
        embedding: result.vector || [],
        content: result.payload?.content || '',
        metadata: result.payload?.metadata || {},
        timestamp: result.payload?.timestamp || 0,
        cosine_similarity: result.score,
      }));
    } catch (error) {
      console.error('Error searching cache:', error);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    if (!this.collectionInitialized) {
      await this.initialize();
    }

    try {
      await this.client.delete(this.config.collectionName, {
        points_selector: {
          ids: [this.uuidToId(id)],
        },
      });
    } catch (error) {
      console.error('Error deleting from cache:', error);
    }
  }

  async clear(): Promise<void> {
    if (!this.collectionInitialized) {
      await this.initialize();
    }

    try {
      await this.client.deleteCollection(this.config.collectionName);
      this.collectionInitialized = false;
      await this.initialize();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  async getStats(): Promise<{ count: number; vectorSize: number }> {
    if (!this.collectionInitialized) {
      await this.initialize();
    }

    try {
      const collection = await this.client.getCollection(this.config.collectionName);
      return {
        count: collection.points_count || 0,
        vectorSize: this.config.vectorSize,
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { count: 0, vectorSize: this.config.vectorSize };
    }
  }

  private uuidToId(uuid: string): string | number {
    // Convert UUID to numeric ID for Qdrant
    return parseInt(uuid.replace(/-/g, '').substring(0, 8), 16);
  }
}

// Singleton instance
let cacheInstance: R3SemanticCache | null = null;

export async function getSemanticCache(config?: CacheConfig): Promise<R3SemanticCache> {
  if (!cacheInstance && config) {
    cacheInstance = new R3SemanticCache(config);
    await cacheInstance.initialize();
  }
  return cacheInstance!;
}
