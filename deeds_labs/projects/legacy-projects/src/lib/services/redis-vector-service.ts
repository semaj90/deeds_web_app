/**
 * Redis Vector Database Service
 * Handles vector storage, semantic search, and caching for Enhanced RAG
 */

import { createClient } from 'redis';

export interface VectorDocument {
  id: string;
  embedding: number[];
  metadata: {
    title?: string;
    source?: string;
    type?: 'pdf' | 'web' | 'code' | 'chat';
    timestamp?: string;
    chunk_index?: number;
    [key: string]: any;
  };
  content: string;
  ttl?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
  content: string;
}

export interface SemanticCacheEntry {
  query: string;
  result: any;
  timestamp: number;
  ttl: number;
}

export class RedisVectorService {
  private client: any;
  private indexName = 'vector_index';
  private cachePrefix = 'semantic_cache:';
  private isConnected = false;
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      },
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('✅ Redis Vector Service connected');
      this.isConnected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      await this.ensureIndex();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Create vector search index if it doesn't exist
   */
  private async ensureIndex(): Promise<void> {
    try {
      await this.client.ft.info(this.indexName);
      console.log('✅ Vector index already exists');
    } catch (error) {
      // Index doesn't exist, create it
      console.log('📊 Creating vector search index...');

      await this.client.ft.create(
        this.indexName,
        {
          '$.embedding': {
            type: 'VECTOR',
            ALGORITHM: 'HNSW',
            TYPE: 'FLOAT32',
            DIM: 384, // Ollama Gemma embedding dimension
            DISTANCE_METRIC: 'COSINE',
            AS: 'embedding',
          },
          '$.metadata.type': {
            type: 'TEXT',
            AS: 'metadata_type',
            SORTABLE: true,
          },
          '$.metadata.source': {
            type: 'TEXT',
            AS: 'metadata_source',
            SORTABLE: true,
          },
          // Store timestamp as TEXT to match stored ISO string; change to NUMERIC if you persist epoch
          '$.metadata.timestamp': {
            type: 'TEXT',
            AS: 'metadata_timestamp',
            SORTABLE: true,
          },
          '$.content': {
            type: 'TEXT',
            AS: 'content',
          },
        },
        {
          ON: 'JSON',
          PREFIX: 'doc:',
        }
      );
      console.log('✅ Vector search index created successfully');
    }
  }

  /**
   * Store a document with vector embedding
   */
  async storeDocument(doc: VectorDocument): Promise<void> {
    await this.connect();

    const key = `doc:${doc.id}`;
    const document = {
      id: doc.id,
      embedding: doc.embedding,
      metadata: {
        ...doc.metadata,
        timestamp: doc.metadata.timestamp || new Date().toISOString(),
      },
      content: doc.content,
    };

    if (doc.ttl) {
      await this.client.json.set(key, '$', document);
      await this.client.expire(key, doc.ttl);
    } else {
      await this.client.json.set(key, '$', document);
    }

    console.log(`✅ Stored document: ${doc.id}`);
  }

  /**
   * Batch store multiple documents
   */
  async storeBatch(docs: VectorDocument[]): Promise<void> {
    await this.connect();

    const pipeline = this.client.multi();

    for (const doc of docs) {
      const key = `doc:${doc.id}`;
      const document = {
        id: doc.id,
        embedding: doc.embedding,
        metadata: {
          ...doc.metadata,
          timestamp: doc.metadata.timestamp || new Date().toISOString(),
        },
        content: doc.content,
      };

      pipeline.json.set(key, '$', document);
      if (doc.ttl) {
        pipeline.expire(key, doc.ttl);
      }
    }

    await pipeline.exec();
    console.log(`✅ Batch stored ${docs.length} documents`);
  }

  /**
   * Semantic search using vector similarity
   */
  async searchSimilar(
    queryEmbedding: number[],
    options: {
      topK?: number;
      threshold?: number;
      filter?: Record<string, any>;
    } = {}
  ): Promise<SearchResult[]> {
    await this.connect();

    const { topK = 10, threshold = 0.7, filter } = options;

    // Build query
    let query = `*=>[KNN ${topK} @embedding $query_vector AS score]`;

    // Add filters if provided
    if (filter) {
      const filterClauses = Object.entries(filter).map(([key, value]) => {
        if (key === 'type') {
          return `@metadata_type:${value}`;
        }
        if (key === 'source') {
          return `@metadata_source:${value}`;
        }
        return `@${key}:${value}`;
      });

      if (filterClauses.length > 0) {
        query = `(${filterClauses.join(' ')})=>[KNN ${topK} @embedding $query_vector AS score]`;
      }
    }

    const results = await this.client.ft.search(this.indexName, query, {
      PARAMS: {
        query_vector: Buffer.from(new Float32Array(queryEmbedding).buffer),
      },
      RETURN: ['$.id', '$.metadata', '$.content', 'score'],
      SORTBY: 'score',
      LIMIT: { from: 0, size: topK },
    });

    return results.documents
      .map((doc: any) => ({
        id: doc.value['$.id'],
        // RediSearch returns vector distance; depending on config, smaller is closer.
        // If AS score gives similarity, parse directly; otherwise invert if needed upstream.
        score: Number(doc.value.score ?? doc.score ?? 0),
        metadata: JSON.parse(doc.value['$.metadata'] || '{}'),
        content: doc.value['$.content'] || '',
      }))
      .filter((result: SearchResult) => result.score >= threshold);
  }

  /**
   * Semantic cache for query results
   */
  async getCachedResult(queryHash: string): Promise<any | null> {
    await this.connect();

    const cacheKey = `${this.cachePrefix}${queryHash}`;
    const cached = await this.client.get(cacheKey);

    if (cached) {
      const entry: SemanticCacheEntry = JSON.parse(cached);
      console.log(`💾 Cache hit for query: ${queryHash}`);
      return entry.result;
    }

    return null;
  }

  /**
   * Store result in semantic cache
   */
  async setCachedResult(queryHash: string, result: any, ttl: number = 3600): Promise<void> {
    await this.connect();

    const cacheKey = `${this.cachePrefix}${queryHash}`;
    const entry: SemanticCacheEntry = {
      query: queryHash,
      result,
      timestamp: Date.now(),
      ttl,
    };

    await this.client.setEx(cacheKey, ttl, JSON.stringify(entry));
    console.log(`💾 Cached result for query: ${queryHash}`);
  }

  /**
   * Delete document
   */
  async deleteDocument(id: string): Promise<void> {
    await this.connect();
    await this.client.del(`doc:${id}`);
    console.log(`🗑️ Deleted document: ${id}`);
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<VectorDocument | null> {
    await this.connect();

    const doc = await this.client.json.get(`doc:${id}`);
    return doc as VectorDocument | null;
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<any> {
    await this.connect();

    try {
      const info = await this.client.ft.info(this.indexName);
      return info;
    } catch (error) {
      console.error('Error getting index stats:', error);
      return null;
    }
  }

  /**
   * Clear all cached results
   */
  async clearCache(): Promise<void> {
    await this.connect();

    const keys = await this.client.keys(`${this.cachePrefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
      console.log(`🧹 Cleared ${keys.length} cached entries`);
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.connect();
      await this.client.ping();
      return true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const redisVectorService = new RedisVectorService();

// Export for use in other services
export default redisVectorService;
