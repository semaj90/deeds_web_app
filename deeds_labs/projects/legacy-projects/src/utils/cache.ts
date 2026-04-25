import { createClient } from 'redis';
import pino from 'pino';

const logger = pino();

export interface CacheConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  database?: number;
}

export class CacheManager {
  client: any = null;
  isConnected = false;
  sharedBuffers = new Map<string, SharedArrayBuffer>();
  cacheHits = 0;
  cacheMisses = 0;

  constructor(public config: CacheConfig = {}) {}

  async connect(): Promise<void> {
    try {
      const redisUrl =
        this.config.url ||
        `redis://${this.config.password ? `:${this.config.password}@` : ''}${
          this.config.host || 'localhost'
        }:${this.config.port || 6379}`;

      if (typeof createClient !== 'function') {
        throw new Error('Redis createClient() not available — check redis installation');
      }

      this.client = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: false,
        },
        database: this.config.database ?? 0,
      } as any);

      this.client.on('error', (err: any) => {
        logger.error(`Redis error: ${err?.message || err}`);
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('✅ Redis connected for caching');
      });

      await this.client.connect();
      await this.client.ping();
      logger.info('✅ Redis cache ready');
    } catch (error) {
      logger.warn(`⚠️ Redis unavailable: ${(error as Error).message}`);
      this.client = null;
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.client.isOpen) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('🔌 Redis disconnected');
    }
  }

  private get ok(): boolean {
    return !!this.client && this.isConnected;
  }

  async get(key: string): Promise<any> {
    if (!this.ok) return null;
    try {
      const value = await this.client.get(key);
      if (value) {
        this.cacheHits++;
        return JSON.parse(value);
      }
      this.cacheMisses++;
      return null;
    } catch (err) {
      logger.error(`Cache get error: ${err}`);
      return null;
    }
  }

  async set(key: string, value: any, ttl = 3600): Promise<boolean> {
    if (!this.ok) return false;
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.error(`Cache set error: ${err}`);
      return false;
    }
  }

  async mget(keys: string[]): Promise<any[]> {
    if (!this.ok) return Array(keys.length).fill(null);
    try {
      const pipeline = this.client.multi();
      for (const key of keys) pipeline.get(key);
      const results: any[] = await pipeline.exec();
      return results.map((r: any) => {
        const v = r?.[1];
        if (typeof v === 'string') {
          this.cacheHits++;
          try {
            return JSON.parse(v);
          } catch {
            return v;
          }
        }
        this.cacheMisses++;
        return null;
      });
    } catch (err) {
      logger.error(`Cache mget error: ${err}`);
      return Array(keys.length).fill(null);
    }
  }

  async mset(pairs: Array<[string, any]>, ttl = 3600): Promise<boolean> {
    if (!this.ok) return false;
    try {
      const pipeline = this.client.multi();
      for (const [k, v] of pairs) pipeline.setEx(k, ttl, JSON.stringify(v));
      await pipeline.exec();
      return true;
    } catch (err) {
      logger.error(`Cache mset error: ${err}`);
      return false;
    }
  }

  // ────────────────────────────────
  // Shared memory utilities
  // ────────────────────────────────
  createSharedIndex(name: string, embeddings: Float32Array): SharedArrayBuffer {
    const buffer = new SharedArrayBuffer(embeddings.byteLength);
    new Float32Array(buffer).set(embeddings);
    this.sharedBuffers.set(name, buffer);
    logger.info(`📊 Created shared memory index: ${name} (${embeddings.length} floats)`);
    return buffer;
  }

  getSharedIndex(name: string): SharedArrayBuffer | null {
    return this.sharedBuffers.get(name) ?? null;
  }

  getStats() {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      ratio: total ? this.cacheHits / total : 0,
      enabled: this.isConnected,
    };
  }

  get isReady(): boolean {
    return this.isConnected && !!this.client;
  }
}

export function createCacheManager(config?: CacheConfig): CacheManager {
  return new CacheManager(config);
}
