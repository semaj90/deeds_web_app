import Redis from 'ioredis';

export function createNoopEngramPluginAdapter(source = 'noop') {
  return {
    async health() {
      return { ok: true, source, warning: 'Engram adapter is inactive' };
    },
    async writeMemory() {
      return { ok: true, warning: 'Engram adapter is inactive' };
    },
    async searchMemories() {
      return [];
    },
    async close() {}
  };
}

/**
 * Redis-backed Engram adapter. Connects with separate host/port/password options (never a URL that
 * embeds the password), per the repo's ioredis standalone-script pattern. Credentials come from
 * options or REDIS_HOST / REDIS_PORT / REDIS_PASSWORD; nothing is logged.
 */
export function createRedisEngramAdapter(options = {}) {
  const redis = new Redis({
    host: options.host || process.env.REDIS_HOST || '127.0.0.1',
    port: Number(options.port || process.env.REDIS_PORT || 6379),
    password: options.password ?? process.env.REDIS_PASSWORD ?? undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  let connecting = null;
  const ready = () => {
    if (redis.status === 'ready') return Promise.resolve();
    connecting ??= redis.connect().finally(() => { connecting = null; });
    return connecting;
  };

  return {
    async health() {
      try {
        await ready();
        const res = await redis.ping();
        return { ok: res === 'PONG', source: 'redis', warning: null };
      } catch (err) {
        return { ok: false, source: 'redis', error: err.message };
      }
    },
    async writeMemory(memory) {
      await ready();
      const key = `ace:engram:lesson:${memory.id || Date.now()}`;
      await redis.set(key, JSON.stringify(memory));
      // Tag for scanning
      await redis.sadd('ace:engram:lessons', key);
      return { ok: true, key };
    },
    async searchMemories() {
      await ready();
      const keys = await redis.smembers('ace:engram:lessons');
      if (!keys.length) return [];
      const docs = await redis.mget(...keys);
      return docs.map(d => JSON.parse(d));
    },
    async close() {
      if (redis.status === 'ready') await redis.quit();
      else redis.disconnect();
    }
  };
}
