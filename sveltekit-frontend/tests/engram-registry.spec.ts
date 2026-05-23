// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({
  contextTimeline: { __name: 'context_timeline' },
  memoryRegistry: { __name: 'memory_registry' },
  engramCards: { __name: 'engram_cards', memoryId: { __name: 'memory_id' } },
}));

const calls = vi.hoisted(() => ({
  valuesByTable: new Map<string, unknown[]>(),
  conflictUpdates: [] as unknown[],
}));

const mockDb = vi.hoisted(() => ({
  insert: vi.fn((table: any) => ({
    values: vi.fn((payload: unknown) => {
      const key = table?.__name ?? 'unknown';
      const arr = calls.valuesByTable.get(key) ?? [];
      arr.push(payload);
      calls.valuesByTable.set(key, arr);

      if (key === 'engram_cards') {
        return {
          onConflictDoUpdate: vi.fn((args: unknown) => {
            calls.conflictUpdates.push(args);
            return Promise.resolve(undefined);
          }),
        };
      }

      return Promise.resolve(undefined);
    }),
  })),
}));

vi.mock('$lib/server/db/client', () => ({
  db: mockDb,
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  contextTimeline: tables.contextTimeline,
  memoryRegistry: tables.memoryRegistry,
  engramCards: tables.engramCards,
}));

function makeRedisMock() {
  return {
    set: vi.fn(async () => 'OK'),
    exists: vi.fn(async () => 1),
    ttl: vi.fn(async () => 3600),
    strlen: vi.fn(async () => 120),
    zcard: vi.fn(async () => 1),
    multi: vi.fn(() => ({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyrank: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
  } as any;
}

describe('engram-registry durable writes', () => {
  beforeEach(() => {
    calls.valuesByTable.clear();
    calls.conflictUpdates.length = 0;
    mockDb.insert.mockClear();
  });

  it('injectAcePacket writes redis + memory_registry', async () => {
    const redis = makeRedisMock();
    const { injectAcePacket } = await import('$lib/server/ai/engram-registry.js');

    const out = await injectAcePacket(redis, {
      run_id: 'run-1',
      context_blob: 'hello world context',
      ttl_seconds: 900,
    });

    expect(out.ok).toBe(true);
    expect(redis.set).toHaveBeenCalledWith('ace:packet:run-1', 'hello world context', 'EX', 900);

    const rows = (calls.valuesByTable.get('memory_registry') ?? []) as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].featureFamily).toBe('ace_packet');
    expect(rows[0].packetId).toBe('run-1');
  });

  it('storeChatMemoryTurn writes redis + memory_registry + engram_cards upsert', async () => {
    const redis = makeRedisMock();
    const { storeChatMemoryTurn } = await import('$lib/server/ai/engram-registry.js');

    const out = await storeChatMemoryTurn(redis, {
      user_id: 'user-42',
      turn: {
        role: 'user',
        content: 'Why does username already taken happen?',
      },
      max_turns: 20,
      ttl_seconds: 1200,
    });

    expect(out.ok).toBe(true);
    expect(out.redis_key).toBe('user:memory:user-42');

    const registryRows = (calls.valuesByTable.get('memory_registry') ?? []) as any[];
    expect(registryRows.length).toBeGreaterThan(0);
    expect(registryRows[0].memoryId).toBe('chat:user-42');
    expect(registryRows[0].featureFamily).toBe('chat_memory');

    const cardRows = (calls.valuesByTable.get('engram_cards') ?? []) as any[];
    expect(cardRows.length).toBe(1);
    expect(cardRows[0].memoryId).toBe('chat:user-42');
    expect(cardRows[0].scope).toBe('user');
    expect(cardRows[0].summary).toContain('username already taken');
    expect(calls.conflictUpdates.length).toBe(1);
  });
});
