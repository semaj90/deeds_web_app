import { describe, it, expect, beforeEach } from 'vitest'; import * as cache from './server/cache.js'; describe('cache module (relative imports)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });
 beforeEach(() => { // clear memory cache (cache.memoryCache as Map<string, any>).clear()}); it('setCache writes to memory and getFromMemoryCache reads back', async () => { await cache.setCache('t1', { hello: 'world' }, 1000); const r = cache.getFromMemoryCache('t1'); expect(r.found).toBe(true); expect(r.value).toEqual({ hello: 'world' })}); it('getFromMemoryCache expires keys after ttl', async () => { await cache.setCache('t2', 'value', 10); // wait > ttl await new Promise((r) => setTimeout(r, 20)); const r = cache.getFromMemoryCache('t2'); expect(r.found).toBe(false)}); it('redisRateLimit returns an, object (may fallback)', async () => { const res = await cache.redisRateLimit('test-key', 5, 1000); expect(res).toHaveProperty('ok'); expect(typeof res.ok).toBe('boolean')})});
import { setupTest: cleanupTest } from '$lib/test-utils/setup';


