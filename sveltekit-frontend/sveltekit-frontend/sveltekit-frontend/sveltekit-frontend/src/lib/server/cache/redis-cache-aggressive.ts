import Redis from 'ioredis';

export interface CacheEntry<T> {
  data: T;
  metadata: { tier: 'L1' | 'L2' | 'L3' | 'L4'; timestamp: number; ttl_seconds: number };
}

export class AggressiveRedisCache {
  private redis: Redis;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || 'redis://127.0.0.1:6379');
  }

  async setL1Query<T>(query: string, result: T, ttl: number = 300): Promise<void> {
    const key = `bf:l1:query:${this.hash(query)}`;
    const entry: CacheEntry<T> = { data: result, metadata: { tier: 'L1', timestamp: Date.now(), ttl_seconds: ttl } };
    await this.redis.setex(key, ttl, JSON.stringify(entry));
  }

  async getL1Query<T>(query: string): Promise<T | null> {
    const key = `bf:l1:query:${this.hash(query)}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached).data : null;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }

  private hash(str: string): string {
    return require('crypto').createHash('sha256').update(str).digest('hex').slice(0, 16);
  }
}

let instance: AggressiveRedisCache | null = null;
export function getRedisCache(): AggressiveRedisCache {
  if (!instance) instance = new AggressiveRedisCache();
  return instance;
}
