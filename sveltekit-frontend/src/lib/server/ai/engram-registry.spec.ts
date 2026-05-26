// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockOnConflictDoUpdate = vi.fn(async () => ({ rows: [] }));
const mockInsertValues = vi.fn(() => {
  const promise = Promise.resolve({ rows: [] }) as any;
  promise.onConflictDoUpdate = mockOnConflictDoUpdate;
  return promise;
});
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

vi.mock('$lib/server/db/client', () => ({
  db: {
    insert: mockInsert,
  },
}));
vi.mock('$lib/server/db/schema.js', () => ({
  contextTimeline: { table: 'context_timeline' },
  engramCards: { table: 'engram_cards' },
  memoryRegistry: { table: 'memory_registry' },
}));

function makeRedis(overrides: Partial<Record<string, any>> = {}) {
  return {
    set: vi.fn(async () => 'OK'),
    exists: vi.fn(async () => 1),
    ttl: vi.fn(async () => 3600),
    strlen: vi.fn(async () => 128),
    zcard: vi.fn(async () => 1),
    multi: vi.fn(() => ({
      zadd: vi.fn().mockReturnThis(),
      zremrangebyrank: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(async () => []),
    })),
    ...overrides,
  };
}

describe('engram registry', () => {
  beforeEach(() => {
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockOnConflictDoUpdate.mockClear();
  });

  it('writes an ACE packet and emits a durable registry event', async () => {
    const redis = makeRedis();
    const { injectAcePacket } = await import('./engram-registry.js');

    const result = await injectAcePacket(redis as any, {
      run_id: 'run-123',
      context_blob: 'hello world',
      ttl_seconds: 1200,
    });

    expect(result.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(2);

    const row = mockInsertValues.mock.calls[0]?.[0];
    expect(row).toMatchObject({
      userId: null,
      sessionId: 'run-123',
      eventType: 'tool_call',
      pipeline: 'engram-memory',
      payload: expect.objectContaining({
        kind: 'engram.ace_packet_inject',
        run_id: 'run-123',
        redis_key: 'ace:packet:run-123',
        ttl: 1200,
        status: 'written',
      }),
    });
  });

  it('writes chat memory and emits a durable registry event', async () => {
    const redis = makeRedis();
    const { storeChatMemoryTurn } = await import('./engram-registry.js');

    const result = await storeChatMemoryTurn(redis as any, {
      user_id: 'user-9',
      turn: { role: 'user', content: 'remember this' },
      max_turns: 20,
      ttl_seconds: 3600,
    });

    expect(result.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(3);

    const row = mockInsertValues.mock.calls[0]?.[0];
    expect(row).toMatchObject({
      userId: null,
      sessionId: 'user-9',
      eventType: 'tool_call',
      pipeline: 'engram-memory',
      payload: expect.objectContaining({
        kind: 'engram.chat_memory_store',
        user_id: 'user-9',
        redis_key: 'user:memory:user-9',
        max_turns: 20,
        ttl: 3600,
        status: 'written',
      }),
    });
  });

  it('does not throw if the durable registry insert fails', async () => {
    mockInsertValues.mockImplementationOnce(() => {
      const promise = Promise.reject(new Error('postgres unavailable')) as any;
      promise.onConflictDoUpdate = mockOnConflictDoUpdate;
      return promise;
    });
    const redis = makeRedis();
    const { injectAcePacket } = await import('./engram-registry.js');

    await expect(
      injectAcePacket(redis as any, {
        run_id: 'run-404',
        context_blob: 'payload',
      }),
    ).resolves.toMatchObject({
      ok: true,
      key: 'ace:packet:run-404',
    });
  });
});
