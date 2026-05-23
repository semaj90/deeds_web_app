// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  registryRows: [
    { memoryId: 'chat:user-42', hotness: 0.8 },
    { memoryId: 'packet:abc', hotness: 0.6 },
  ],
  cardRows: [
    {
      memoryId: 'chat:user-42',
      scope: 'user',
      summary: 'Case law hearsay precedent and citation workflow',
      labels: { role: 'user' },
      sourceRefs: [{ type: 'redis_key', value: 'user:memory:user-42' }],
      didYouMean: ['hearsay precedent citation'],
    },
    {
      memoryId: 'packet:abc',
      scope: 'global',
      summary: 'Upload evidence and hash verification path',
      labels: { role: 'system' },
      sourceRefs: [],
      didYouMean: [],
    },
  ],
}));

const mockDb = vi.hoisted(() => {
  const insert = vi.fn(() => ({
    values: vi.fn(() => Promise.resolve(undefined)),
  }));

  const select = vi.fn(() => ({
    from: vi.fn((table: any) => {
      const tableName = table?.__name ?? '';
      const rows = tableName === 'memory_registry' ? fixtures.registryRows : fixtures.cardRows;

      const chain: any = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(async (n: number) => rows.slice(0, n)),
      };

      return chain;
    }),
  }));

  return { select, insert };
});

vi.mock('$lib/server/db/client', () => ({
  db: mockDb,
}));

vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({}) as any,
}));

vi.mock('$lib/server/ai/engram-memory.js', () => ({
  getDidYouMeanFromEngram: vi.fn(async () => [
    { suggestion: 'legal hearsay citation', hitCount: 7 },
    { suggestion: 'hearsay precedent citation', hitCount: 5 },
  ]),
}));

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => ({ op: 'eq', args }),
  inArray: (...args: unknown[]) => ({ op: 'inArray', args }),
  desc: (...args: unknown[]) => ({ op: 'desc', args }),
}));

vi.mock('$lib/server/db/schema.js', () => ({
  contextTimeline: { __name: 'context_timeline' },
  intentEvalRuns: { __name: 'intent_eval_runs' },
  memoryRegistry: {
    __name: 'memory_registry',
    memoryId: { __name: 'memory_id' },
    hotness: { __name: 'hotness' },
    updatedAt: { __name: 'updated_at' },
    userIntent: { __name: 'user_intent' },
  },
  engramCards: {
    __name: 'engram_cards',
    memoryId: { __name: 'memory_id' },
    scope: { __name: 'scope' },
  },
}));

describe('recallEngramsForIntent', () => {
  beforeEach(() => {
    mockDb.select.mockClear();
    mockDb.insert.mockClear();
  });

  it('returns ranked cards and blended did-you-mean suggestions', async () => {
    const { recallEngramsForIntent } = await import('$lib/server/ai/engram-registry.js');

    const result = await recallEngramsForIntent({
      query: 'find hearsay citation case law precedent',
      limit: 5,
      scope: 'user',
      runId: 'intent-run-1',
    });

    expect(result.intent.label).toBe('legal_research');
    expect(result.cards.length).toBe(1);
    expect(result.cards[0]?.memoryId).toBe('chat:user-42');

    expect(result.didYouMean).toContain('legal hearsay citation');
    expect(result.didYouMean).toContain('hearsay precedent citation');

    expect(mockDb.insert).toHaveBeenCalled();
  });
});
