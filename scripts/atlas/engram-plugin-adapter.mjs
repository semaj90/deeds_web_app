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

export function createRedisEngramAdapter(options = {}) {
  const redis = new Redis(options.url || process.env.REDIS_URL || 'redis://localhost:6379');
  
  return {
    async health() {
      try {
        const res = await redis.ping();
        return { ok: res === 'PONG', source: 'redis', warning: null };
      } catch (err) {
        return { ok: false, source: 'redis', error: err.message };
      }
    },
    async writeMemory(memory) {
      const key = `ace:engram:lesson:${memory.id || Date.now()}`;
      await redis.set(key, JSON.stringify(memory));
      // Tag for scanning
      await redis.sadd('ace:engram:lessons', key);
      return { ok: true, key };
    },
    async searchMemories() {
      const keys = await redis.smembers('ace:engram:lessons');
      if (!keys.length) return [];
      const docs = await redis.mget(...keys);
      return docs.map(d => JSON.parse(d));
    },
    async close() {
      await redis.quit();
    }
  };
}
