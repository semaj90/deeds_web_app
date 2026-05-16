// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalEngramMemoryAdapterImpl } from '$lib/server/memory/local-engram-memory-adapter.js';

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  zincrby: vi.fn(),
  expire: vi.fn(),
  zrevrange: vi.fn(),
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => redisMocks,
}));

vi.mock('$lib/server/ai/engram-memory.js', () => ({
  hashQuery: (q: string) => `hash_${q.slice(0, 5)}`,
  recordEngramTransition: vi.fn(async () => ({ currentHash: 'abc' })),
  getDidYouMeanFromEngram: vi.fn(async () => [{ suggestion: 'suggested query', hitCount: 10 }]),
}));

describe('LocalEngramMemoryAdapter', () => {
  const adapter = LocalEngramMemoryAdapterImpl.getInstance();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRoutingHints', () => {
    it('returns hints including suggestions and BMU', async () => {
      redisMocks.get.mockResolvedValue('3:7');
      
      const hints = await adapter.getRoutingHints('test query');
      
      expect(hints.didYouMean).toBe('suggested query');
      expect(hints.priorQueries).toContain('suggested query');
      expect(hints.bmuHints).toContain('3:7');
      expect(hints.source).toBe('local-engram');
    });

    it('handles missing BMU', async () => {
      redisMocks.get.mockResolvedValue(null);
      
      const hints = await adapter.getRoutingHints('test query');
      
      expect(hints.bmuHints).toHaveLength(0);
    });
  });

  describe('recordTransition', () => {
    it('calls the underlying engram-memory record function', async () => {
      const { recordEngramTransition } = await import('$lib/server/ai/engram-memory.js');
      
      await adapter.recordTransition({
        currentQuery: 'current',
        previousQuery: 'prev',
        somRow: 1,
        somCol: 2
      });
      
      expect(recordEngramTransition).toHaveBeenCalled();
    });
  });
});
