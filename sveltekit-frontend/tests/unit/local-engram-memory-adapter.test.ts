import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalEngramMemoryAdapterImpl } from '../../src/lib/server/memory/local-engram-memory-adapter.js';
import * as redisModule from '../../src/lib/server/redis.js';
import * as engramMemoryModule from '../../src/lib/server/ai/engram-memory.js';

vi.mock('../../src/lib/server/redis.js');
vi.mock('../../src/lib/server/ai/engram-memory.js');

describe('LocalEngramMemoryAdapter', () => {
  let adapter: LocalEngramMemoryAdapterImpl;
  let mockRedis: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis = {
      get: vi.fn(),
      set: vi.fn(),
    };
    (redisModule.getRedis as any).mockReturnValue(mockRedis);
    adapter = LocalEngramMemoryAdapterImpl.getInstance();
  });

  it('returns empty hints when redis is unavailable', async () => {
    (redisModule.getRedis as any).mockReturnValue(null);
    const hints = await adapter.getRoutingHints('test query');
    expect(hints.workflowMemories).toEqual([]);
    expect(hints.source).toBe('local-engram');
  });

  it('fetches didYouMean and BMU hints', async () => {
    (engramMemoryModule.getDidYouMeanFromEngram as any).mockResolvedValue([
      { suggestion: 'did you mean this?' }
    ]);
    mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('ace:engram:query-bmu:')) return Promise.resolve('3:7');
        return Promise.resolve(null);
    });

    const hints = await adapter.getRoutingHints('test query');
    expect(hints.didYouMean).toBe('did you mean this?');
    expect(hints.bmuHints).toContain('3:7');
  });

  it('fetches workflow memories from redis', async () => {
    const mockMemory = {
      memoryType: 'retrieval_lesson',
      summary: 'lesson learned',
      accepted: true,
      trust: 'low_hint'
    };
    mockRedis.get.mockImplementation((key: string) => {
      if (key.includes('ace:engram:workflow:hot:')) {
        return Promise.resolve(JSON.stringify([mockMemory]));
      }
      return Promise.resolve(null);
    });

    const hints = await adapter.getRoutingHints('test query');
    expect(hints.workflowMemories).toHaveLength(1);
    expect(hints.workflowMemories[0].summary).toBe('lesson learned');
  });

  it('records transitions using engram-memory helper', async () => {
    await adapter.recordTransition({
      currentQuery: 'test',
      somRow: 1,
      somCol: 2
    });
    expect(engramMemoryModule.recordEngramTransition).toHaveBeenCalledWith(
      mockRedis,
      expect.objectContaining({ currentQuery: 'test', somRow: 1, somCol: 2 })
    );
  });

  it('rejects memories containing forbidden thinking-token fields', async () => {
    const badMemory: any = {
      summary: 'lesson with hiddenThoughts',
      memoryType: 'workflow_lesson',
      hiddenThoughts: 'I am thinking...',
      accepted: true,
      testsPassed: true,
      reward: 1
    };

    await adapter.recordWorkflowMemory(badMemory);
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
