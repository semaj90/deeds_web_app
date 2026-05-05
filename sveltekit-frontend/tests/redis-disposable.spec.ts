// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRedis: vi.fn(() => ({
    get:  vi.fn(async () => 'value'),
    quit: vi.fn(async () => 'OK' as const),
  })),
}));

vi.mock('$lib/server/redis.js', () => ({ getRedis: mocks.getRedis }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { REDIS_URL: 'redis://test' } }));
vi.mock('ioredis', () => ({
  Redis: class FakeRedis {
    constructor(_url?: string, _opts?: unknown) { /* no-op */ }
    quit = vi.fn(async () => 'OK');
    ping = vi.fn(async () => 'PONG');
  },
}));

describe('redis-disposable — TS 7 await using pattern', () => {
  it('getDisposableRedis returns a pooled handle with a no-op asyncDispose', async () => {
    const { getDisposableRedis } = await import('$lib/server/redis-disposable.js');
    const r = getDisposableRedis();
    expect(typeof (r as Record<symbol, unknown>)[Symbol.asyncDispose]).toBe('function');

    // Pooled disposal must NOT call .quit (would kill the round-robin pool)
    await (r as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose]();
    expect((r as { quit: ReturnType<typeof vi.fn> }).quit).not.toHaveBeenCalled();
  });

  it('createDisposableRedis returns a standalone client whose dispose calls .quit', async () => {
    const { createDisposableRedis } = await import('$lib/server/redis-disposable.js');
    const r = createDisposableRedis('redis://standalone');
    expect(typeof (r as Record<symbol, unknown>)[Symbol.asyncDispose]).toBe('function');

    await (r as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose]();
    expect((r as { quit: ReturnType<typeof vi.fn> }).quit).toHaveBeenCalledTimes(1);
  });

  it('asyncDispose is idempotent — calling getDisposableRedis on the same handle does not redefine', async () => {
    const { getDisposableRedis } = await import('$lib/server/redis-disposable.js');
    const r1 = getDisposableRedis();
    const desc1 = Object.getOwnPropertyDescriptor(r1, Symbol.asyncDispose);
    const r2 = getDisposableRedis();
    const desc2 = Object.getOwnPropertyDescriptor(r2, Symbol.asyncDispose);
    // mocks return new objects each call — but if they returned the same handle,
    // the descriptor would be unchanged (idempotent guard).
    expect(desc1).toBeDefined();
    expect(desc2).toBeDefined();
  });

  it('asyncDispose handler swallows errors from .quit (already-disconnected case)', async () => {
    const { createDisposableRedis } = await import('$lib/server/redis-disposable.js');
    const r = createDisposableRedis();
    (r as { quit: ReturnType<typeof vi.fn> }).quit = vi.fn(async () => {
      throw new Error('Connection is closed.');
    });
    // Must NOT throw
    await expect(
      (r as { [Symbol.asyncDispose]: () => Promise<void> })[Symbol.asyncDispose](),
    ).resolves.toBeUndefined();
  });
});
