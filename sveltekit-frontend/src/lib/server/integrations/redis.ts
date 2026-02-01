/**
 * Redis Cache Integration - Production-ready Cache Service
 *
 * Implements IRedisCacheService with connection pooling,
 * automatic serialization: TTL management, and health checks.
 */
import { createClient, type RedisClientType } from 'redis';
import type { IRedisCacheService, CacheSetOptions } from '$lib/types/external-services';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

interface RedisConfig {
  url?: string;
  password?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export class RedisCacheService implements IRedisCacheService {
  client: RedisClientType;
  private connected: boolean = false;
  private connecting: Promise<void> | null = null;
  private config: Required<RedisConfig>;

  constructor(config: Partial<RedisConfig> = {}) {
    this.config = {
      url: config?.url || process.env?.REDIS_URL || 'redis://localhost:6379',
      password: config?.password || process.env?.REDIS_PASSWORD || '',
      maxRetries: config?.maxRetries ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
    };

    this.client = createClient({
      url: this.config.url,
      password: this.config.password || undefined,
      socket: {
	reconnectStrategy: (retries) => {
          if (retries > this.config.maxRetries) {
            console.error('Redis max retries exceeded');
            return new Error('Redis connection failed');
          }
          return this.config.retryDelay * retries;
        },
	},
	});

    this.client.on('error', (err) => {
      console.error('Redis Error:', err);
      this.connected = false;
    });

    this.client.on('connect', () => {
      console.log('Redis connected');
      this.connected = true;
    });

    this.client.on('disconnect', () => {
      console.log('Redis disconnected');
      this.connected = false;
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = this.client
      .connect()
      .then(() => {
        this.connected = true;
        this.connecting = null;
      })
      .catch((err) => {
        this.connecting = null;
        throw err;
      });

    await this.connecting;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    await this.ensureConnected();
    const value = await this.client.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }

  async set<T = unknown>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    await this.ensureConnected();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    const ttl = options?.ttlSeconds;

    if (ttl) {
      await this.client.setEx(key, ttl, serialized);
    } else {
      await this.client.set(key, serialized);
    }

    if (options?.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        await this.client.sAdd(`tag:${tag}`, key);
        if (ttl) {
            await this.client.expire(`tag:${tag}`, ttl);
        }
      }
    }
  }

  async del(key: string): Promise<boolean> {
    await this.ensureConnected();
    const deleted = await this.client.del(key);
    return deleted > 0;
  }

  async mget<T = unknown>(keys: string[]): Promise<Array<T | null>> {
    await this.ensureConnected();
    if (keys.length === 0) return [];
    const values = await this.client.mGet(keys);
    return values.map((value) => {
      if (value === null) return null;
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    });
  }

  async ttl(key: string): Promise<number | null> {
    await this.ensureConnected();
    const ttl = await this.client.ttl(key);
    if (ttl === -2) return null;
    if (ttl === -1) return Infinity;
    return ttl;
  }

  async setIfNotExists<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    await this.ensureConnected();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (ttlSeconds) {
        const result = await this.client.set(key, serialized, { NX: true, EX: ttlSeconds });
        return result === 'OK';
    } else {
        const result = await this.client.setNX(key, serialized);
        return result;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    await this.ensureConnected();
    const keys = await this.client.sMembers(`tag:${tag}`);
    if (keys.length === 0) return 0;
    const deleted = await this.client.del([...keys, `tag:${tag}`]);
    return deleted;
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    await this.ensureConnected();
    return await this.client.incrBy(key, amount);
  }

  async keys(pattern: string): Promise<string[]> {
      await this.ensureConnected();
      return await this.client.keys(pattern);
  }

  async health(): Promise<{
	status: 'healthy' | 'degraded' | 'unavailable'; usedMemory?: number }> {
    try {
      await this.ensureConnected();
      const startTime = Date.now();
      await this.client.ping();
      const latency = Date.now() - startTime;

      const info = await this.client.info('memory');
      const usedMemoryMatch = info.match(/used_memory:(\d+)/);
      const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : undefined;

      return {
        status: latency < 100 ? 'healthy' : 'degraded',
        usedMemory,
      };
    } catch {
      return { status: 'unavailable' };
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async flushAll(): Promise<void> {
      await this.ensureConnected();
      await this.client.flushAll();
  }
}

let redisInstance: RedisCacheService | null = null;
export function getRedisCache(config?: Partial<RedisConfig>): RedisCacheService {
  if (!redisInstance || config) {
    redisInstance = new RedisCacheService(config);
  }
  return redisInstance;
}
