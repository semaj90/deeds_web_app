type RedisLike = {
  setBuffer?: (k: string, v: Uint8Array, ...args: unknown[]) => Promise<void>;
  get?: (k: string) => Promise<string | null>;
  del?: (k: string) => Promise<number>;
};

interface CacheEntry {
  buffer: Uint8Array;
  createdAt: number;
  ttl?: number;
}

export class VertexCacheManager {
  private mem: Map<string, CacheEntry> = new Map();
  private redis: RedisLike | null = null;

  constructor(redisClient?: RedisLike | null) {
    this.redis = redisClient ?? null;
  }

  async store(key: string, buffer: Uint8Array, ttlSeconds?: number) {
    this.mem.set(key, { buffer, createdAt: Date.now(), ttl: ttlSeconds });
    // best-effort Redis persistence
    if (this.redis?.setBuffer) {
      try {
        await this.redis.setBuffer(`vertex:${key}`, buffer);
      } catch {
        /* ignore */
      }
    }
  }

  get(key: string): Uint8Array | null {
    const e = this.mem.get(key);
    if (!e) return null;
    if (e.ttl && Date.now() - e.createdAt > (e.ttl || 0) * 1000) {
      this.mem.delete(key);
      return null;
    }
    return e.buffer;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  evict(key: string) {
    this.mem.delete(key);
    if (this.redis?.del) {
      try {
        this.redis.del(`vertex:${key}`);
      } catch {
        /* ignore */
      }
    }
  }

  listKeys(): string[] {
    return Array.from(this.mem.keys());
  }
}
