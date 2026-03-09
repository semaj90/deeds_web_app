import { gzipSync, gunzipSync } from 'zlib';
import { Buffer } from 'buffer';
import crypto from 'crypto';
import { createClient } from 'redis';

type RedisClientInstance = ReturnType<typeof createClient>;
type RedisClient = RedisClientInstance | null;

const IS_SERVER = typeof window === 'undefined';
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const MEMORY_CACHE_LIMIT = 1000;

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

interface RedisConfig {
  url: string;
}

export interface LangCacheEntry<T> {
  embedding?: number[];
  result?: T;
  tokens?: number;
  ttl?: number;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const resolveRedisConfig = (): RedisConfig | null => {
  if (typeof process === 'undefined' || !process?.env) return null;

  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return { url };
  }

  const host = process.env.REDIS_HOST?.trim() || '127.0.0.1';
  const port = process.env.REDIS_PORT?.trim() || '6379';
  const password = process.env.REDIS_PASSWORD?.trim();

  if (password) {
    return { url: `redis://:${encodeURIComponent(password)}@${host}:${port}` };
  }

  return { url: `redis://${host}:${port}` };
};

const tryCreateClient = (config: RedisConfig | null): RedisClientInstance | null => {
  if (!config) return null;
  if (typeof createClient !== 'function') return null;

  try {
    // The type error indicates a Redis protocol version mismatch (RESP3 vs RESP2).
    // Forcing RESP2 by adding `protocol: 2` aligns the client with the expected type.
    const client = createClient({ url: config.url, protocol: 2 });
    client.on('error', (err: unknown) => console.warn('[redis] client error', formatError(err)));
    return client;
  } catch (error) {
    console.warn('[redis] failed to initialize client', formatError(error));
    return null;
  }
};

const redisConfig = resolveRedisConfig();

class MemoryCache {
  private store = new Map<string, MemoryEntry>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (this.store.size >= MEMORY_CACHE_LIMIT) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlMs),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

const globalMemoryCache = new MemoryCache();

export class CacheService {
  public client: RedisClient;

  constructor(private readonly config: RedisConfig | null) {
    this.client = IS_SERVER ? tryCreateClient(config) : null;
  }

  private encode(value: unknown): string {
    const json = JSON.stringify(value);
    return gzipSync(Buffer.from(json, 'utf8')).toString('base64');
  }

  private decode<T>(raw: string | Buffer | null): T | null {
    if (raw == null) return null;

    const base = typeof raw === 'string' ? raw : raw.toString('utf8');

    try {
      const zipped =
        typeof raw === 'string' ? Buffer.from(raw, 'base64') : Buffer.from(base, 'base64');
      const inflated = gunzipSync(zipped).toString('utf8');
      return JSON.parse(inflated) as T;
    } catch {
      try {
        return JSON.parse(base) as T;
      } catch {
        return base as unknown as T;
      }
    }
  }

  private async ensureClient(): Promise<RedisClientInstance | null> {
    if (!IS_SERVER) return null;

    if (!this.client) {
      this.client = tryCreateClient(this.config);
    }

    const client = this.client;
    if (!client) return null;

    if (!client.isOpen) {
      try {
        await client.connect();
      } catch (error) {
        console.warn('[redis] connect failed', formatError(error));
        await this.safeShutdown(client);
        this.client = null;
        return null;
      }
    }

    return client;
  }

  private async safeShutdown(client: RedisClientInstance): Promise<void> {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }

  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  public async get<T>(key: string): Promise<T | null> {
    const client = await this.ensureClient();
    if (client) {
      try {
        const raw = await client.get(key);
        const decoded = this.decode<T>(raw);
        if (decoded !== null && decoded !== undefined) return decoded;
      } catch (error) {
        console.warn('[cache] get failed', formatError(error));
      }
    }
    return globalMemoryCache.get<T>(key);
  }

  public async set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
    const payload = this.encode(value);
    const client = await this.ensureClient();

    if (client) {
      try {
        await client.set(key, payload, { PX: Math.max(1, ttlMs) });
        globalMemoryCache.set(key, value, ttlMs);
        return;
      } catch (error) {
        console.warn('[cache] set failed', formatError(error));
      }
    }

    globalMemoryCache.set(key, value, ttlMs);
  }

  public async del(key: string): Promise<void> {
    const client = await this.ensureClient();
    if (client) {
      try {
        await client.del(key);
      } catch (error) {
        console.warn('[cache] del failed', formatError(error));
      }
    }
    globalMemoryCache.delete(key);
  }

  public async ping(): Promise<boolean> {
    const client = await this.ensureClient();
    if (!client) return false;

    try {
      const res = await client.ping();
      return res === 'PONG' || res === 'OK';
    } catch (error) {
      console.warn('[cache] ping failed', formatError(error));
      return false;
    }
  }

  public async hget<T>(key: string, field: string): Promise<T | null> {
    const client = await this.ensureClient();
    if (client) {
      try {
        const raw = await client.hGet(key, field);
        const decoded = this.decode<T>(raw);
        if (decoded !== null && decoded !== undefined) return decoded;
      } catch (error) {
        console.warn('[cache] hget failed', formatError(error));
      }
    }
    return globalMemoryCache.get<T>(`${key}:${field}`);
  }

  public async hset(
    key: string,
    field: string,
    value: unknown,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<void> {
    const payload = this.encode(value);
    const client = await this.ensureClient();

    if (client) {
      try {
        await client.hSet(key, field, payload);
        globalMemoryCache.set(`${key}:${field}`, value, ttlMs);
        return;
      } catch (error) {
        console.warn('[cache] hset failed', formatError(error));
      }
    }

    globalMemoryCache.set(`${key}:${field}`, value, ttlMs);
  }

  public async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const client = await this.ensureClient();

    if (client) {
      try {
        const results = await client.mGet(keys);
        if (results) {
          return results.map((entry: string | null) => this.decode<T>(entry));
        }
      } catch (error) {
        console.warn('[cache] mget failed', formatError(error));
      }
    }

    return keys.map((key) => globalMemoryCache.get<T>(key));
  }

  public async getEmbedding(text: string, model = 'default'): Promise<number[] | null> {
    return this.get<number[]>(`embedding:${model}:${this.hash(text)}`);
  }

  public async setEmbedding(text: string, embedding: number[], model = 'default'): Promise<void> {
    await this.set(`embedding:${model}:${this.hash(text)}`, embedding, 24 * 60 * 60 * 1000);
  }

  public async getSearchResults(
    query: string,
    type: string,
    filters: Record<string, unknown> = {}
  ): Promise<unknown[] | null> {
    const key = `search:${type}:${this.hash(query)}:${this.hash(JSON.stringify(filters))}`;
    return this.get<unknown[]>(key);
  }

  public async setSearchResults(
    query: string,
    type: string,
    results: unknown[],
    filters: Record<string, unknown> = {}
  ): Promise<void> {
    const key = `search:${type}:${this.hash(query)}:${this.hash(JSON.stringify(filters))}`;
    await this.set(key, results, 5 * 60 * 1000);
  }

  public async getShader(key: string): Promise<string | null> {
    return this.get<string>(`shader:${this.hash(key)}`);
  }

  public async setShader(key: string, wgsl: string, ttlMs = 6 * 60 * 60 * 1000): Promise<void> {
    await this.set(`shader:${this.hash(key)}`, wgsl, ttlMs);
  }

  public async close(): Promise<void> {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    await this.safeShutdown(client);
  }

  public async getClient(): Promise<RedisClientInstance | null> {
    return this.ensureClient();
  }
}

export const cache = new CacheService(redisConfig);

export const redisClient = (): RedisClientInstance | null => cache.client;

export const redis = cache;

export async function waitForRedis(timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cache.ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export const cacheEmbedding = (text: string, embedding: number[], model = 'default') =>
  cache.setEmbedding(text, embedding, model);

export const getCachedEmbedding = (text: string, model = 'default') =>
  cache.getEmbedding(text, model);

export const cacheSearchResults = (
  query: string,
  type: string,
  results: unknown[],
  filters?: Record<string, unknown>
) => cache.setSearchResults(query, type, results, filters ?? {});

export const getCachedSearchResults = (
  query: string,
  type: string,
  filters?: Record<string, unknown>
) => cache.getSearchResults(query, type, filters ?? {});

export const cacheShader = (key: string, compiledWGSL: string, ttlMs?: number) =>
  cache.setShader(key, compiledWGSL, ttlMs ?? 6 * 60 * 60 * 1000);

export const getCachedShader = (key: string) => cache.getShader(key);

const langCacheKey = (model: string, prompt: string) =>
  `langcache:${model}:${crypto.createHash('sha256').update(prompt).digest('hex')}`;

export async function setLangCache<T>(
  model: string,
  prompt: string,
  data: LangCacheEntry<T>,
  ttlSeconds = 3600
): Promise<void> {
  await cache.set(langCacheKey(model, prompt), data, ttlSeconds * 1000);
}

export async function getLangCache<T>(
  model: string,
  prompt: string
): Promise<LangCacheEntry<T> | null> {
  return cache.get<LangCacheEntry<T>>(langCacheKey(model, prompt));
}

export async function deleteLangCache(model: string, prompt: string): Promise<void> {
  await cache.del(langCacheKey(model, prompt));
}

export async function getRedisClient(): Promise<RedisClientInstance | null> {
  return cache.getClient();
}

export async function closeRedisClient(): Promise<void> {
  await cache.close();
}

export default cache;
