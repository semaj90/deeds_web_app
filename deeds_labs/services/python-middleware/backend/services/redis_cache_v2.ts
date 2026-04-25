/**
 * ═══════════════════════════════════════════════════════════════════════
 * Agentic Knowledge Integration V2 - Redis Cache Service (TypeScript)
 * ═══════════════════════════════════════════════════════════════════════
 * Date: January 2, 2026
 * Purpose: Redis caching with key namespacing and TTL policies
 * ═══════════════════════════════════════════════════════════════════════
 */

import { createClient, RedisClientType } from 'redis';
import { createHash } from 'crypto';

// TTL policies (in seconds)
const TTL_POLICIES: Record<string, number> = {
  coordinates: 86400, // 24 hours
  embedding: 604800, // 7 days
  cluster: 43200, // 12 hours
  search: 3600, // 1 hour
  ast: 86400, // 24 hours
  analysis: 7200, // 2 hours
  pattern: 3600, // 1 hour
};

// Key prefixes
const KEY_PREFIXES: Record<string, string> = {
  coordinates: 'kb:v2:coordinates:',
  embedding: 'kb:v2:embedding:',
  cluster: 'kb:v2:cluster:',
  search: 'kb:v2:search:',
  ast: 'kb:v2:ast:',
  analysis: 'kb:v2:analysis:',
  pattern: 'kb:v2:pattern:',
};

export interface CacheStats {
  namespace: string;
  totalKeys: number;
  totalMemoryBytes: number;
  totalMemoryMB: number;
  defaultTTLSeconds: number;
}

export interface Coordinates {
  x: number;
  y: number;
  z: number;
  timestamp: string;
}

export interface ClusterData {
  summary: string;
  tags: string[];
  centroid: number[];
  size: number;
}

export interface SearchResults {
  query: string;
  results: Array<{ id: string; score: number }>;
  timestamp: string;
}

export interface ASTData {
  filePath: string;
  imports: string[];
  exports: string[];
  functions: string[];
  components?: string[];
  errors: any[];
}

export class RedisCache {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor(url: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.client = createClient({ url });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('✅ Redis connected');
      this.connected = true;
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  private makeKey(namespace: string, identifier: string): string {
    const prefix = KEY_PREFIXES[namespace] || `kb:v2:${namespace}:`;
    return `${prefix}${identifier}`;
  }

  private getTTL(namespace: string): number {
    return TTL_POLICIES[namespace] || 3600;
  }

  async set<T = any>(
    namespace: string,
    identifier: string,
    value: T,
    ttl?: number
  ): Promise<boolean> {
    await this.connect();
    const key = this.makeKey(namespace, identifier);
    const ttlSeconds = ttl || this.getTTL(namespace);
    const serialized = JSON.stringify(value);

    await this.client.setEx(key, ttlSeconds, serialized);
    return true;
  }

  async get<T = any>(namespace: string, identifier: string): Promise<T | null> {
    await this.connect();
    const key = this.makeKey(namespace, identifier);
    const value = await this.client.get(key);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as any;
    }
  }

  async delete(namespace: string, identifier: string): Promise<boolean> {
    await this.connect();
    const key = this.makeKey(namespace, identifier);
    const result = await this.client.del(key);
    return result > 0;
  }

  async exists(namespace: string, identifier: string): Promise<boolean> {
    await this.connect();
    const key = this.makeKey(namespace, identifier);
    const result = await this.client.exists(key);
    return result > 0;
  }

  async getTTLRemaining(namespace: string, identifier: string): Promise<number> {
    await this.connect();
    const key = this.makeKey(namespace, identifier);
    return await this.client.ttl(key);
  }

  async invalidatePattern(namespace: string, pattern: string = '*'): Promise<number> {
    await this.connect();
    const keyPattern = this.makeKey(namespace, pattern);
    const keys = await this.client.keys(keyPattern);

    if (keys.length === 0) {
      return 0;
    }

    return await this.client.del(keys);
  }

  async getStats(namespace: string): Promise<CacheStats> {
    await this.connect();
    const keyPattern = this.makeKey(namespace, '*');
    const keys = await this.client.keys(keyPattern);

    const totalKeys = keys.length;
    let totalMemory = 0;

    // Note: MEMORY USAGE command may not be available in all Redis versions
    for (const key of keys) {
      try {
        const memory = await this.client.memoryUsage(key);
        if (memory) {
          totalMemory += memory;
        }
      } catch {
        // Ignore if MEMORY USAGE is not supported
      }
    }

    return {
      namespace,
      totalKeys,
      totalMemoryBytes: totalMemory,
      totalMemoryMB: Math.round((totalMemory / 1024 / 1024) * 100) / 100,
      defaultTTLSeconds: this.getTTL(namespace),
    };
  }

  // Convenience methods for specific data types

  async setCoordinates(tagId: string, coords: Coordinates): Promise<boolean> {
    return this.set('coordinates', tagId, coords);
  }

  async getCoordinates(tagId: string): Promise<Coordinates | null> {
    return this.get<Coordinates>('coordinates', tagId);
  }

  async setEmbedding(textHash: string, embedding: number[]): Promise<boolean> {
    return this.set('embedding', textHash, embedding);
  }

  async getEmbedding(textHash: string): Promise<number[] | null> {
    return this.get<number[]>('embedding', textHash);
  }

  async setCluster(clusterId: string, data: ClusterData): Promise<boolean> {
    return this.set('cluster', clusterId, data);
  }

  async getCluster(clusterId: string): Promise<ClusterData | null> {
    return this.get<ClusterData>('cluster', clusterId);
  }

  async setSearchResults(queryHash: string, results: SearchResults): Promise<boolean> {
    return this.set('search', queryHash, results);
  }

  async getSearchResults(queryHash: string): Promise<SearchResults | null> {
    return this.get<SearchResults>('search', queryHash);
  }

  async setAST(fileHash: string, ast: ASTData): Promise<boolean> {
    return this.set('ast', fileHash, ast);
  }

  async getAST(fileHash: string): Promise<ASTData | null> {
    return this.get<ASTData>('ast', fileHash);
  }

  // Utility methods

  static hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex').substring(0, 16);
  }

  static hashFile(content: string): string {
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}

// Singleton instance
let cacheInstance: RedisCache | null = null;

export function getRedisCache(): RedisCache {
  if (!cacheInstance) {
    cacheInstance = new RedisCache();
  }
  return cacheInstance;
}

// Example usage
export async function exampleUsage() {
  const cache = getRedisCache();

  // Store coordinates
  await cache.setCoordinates('tag-123', {
    x: 0.5,
    y: 0.3,
    z: 0.8,
    timestamp: new Date().toISOString(),
  });

  // Retrieve coordinates
  const coords = await cache.getCoordinates('tag-123');
  console.log('Coordinates:', coords);

  // Store embedding
  const textHash = RedisCache.hashText('sample text');
  await cache.setEmbedding(textHash, new Array(384).fill(0.1));

  // Retrieve embedding
  const embedding = await cache.getEmbedding(textHash);
  console.log('Embedding length:', embedding?.length);

  // Get statistics
  const stats = await cache.getStats('coordinates');
  console.log('Cache stats:', stats);

  // Cleanup
  await cache.disconnect();
}
