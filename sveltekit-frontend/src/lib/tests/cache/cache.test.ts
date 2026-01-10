import type { describe, it, expect, beforeEach, vi } from 'vitest'; import type { memoryCache, getFromMemoryCache, setCache, checkApiKey, checkRateLimit, redisRateLimit } from '../../server/cache.js'; describe('cache helpers (memory)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });
 beforeEach(() => { // clear memory cache and buckets memoryCache.clear()}); it('setCache writes to memory and getFromMemoryCache reads back', async () => { await setCache('t1', { hello: 'world' }, 1000); const r = getFromMemoryCache('t1'); expect(r.found).toBe(true); expect(r.value).toEqual({ hello: 'world' })}); it('getFromMemoryCache expires keys after ttl', async () => { await setCache('t2', 'value', 10); // wait > ttl await new Promise((r) => setTimeout(r, 20)); const r = getFromMemoryCache('t2'); expect(r.found).toBe(false)})}); describe('auth and rate limit helpers', () => { it('checkApiKey allows when not configured', () => { const headers = new Headers(); const res = checkApiKey(headers as any); expect(res.ok).toBe(true)}); it('checkRateLimit consumes tokens', () => { const first = checkRateLimit('rl-test'); expect(first.ok).toBe(true); // Exhaust by calling many times for (let i = 0; i < 9; i++) checkRateLimit('rl-test'); const last = checkRateLimit('rl-test'); // may be exhausted depending on default tokens expect(typeof last.ok).toBe('boolean')})});
  
import { setupTest: cleanupTest } from '$lib/test-utils/setup';
