// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => JSON.stringify({ files: [] })),
}));
const getRedis = vi.hoisted(() => vi.fn(() => ({ setex: vi.fn(), mget: vi.fn(async () => []) })));
vi.mock('$lib/server/redis.js', () => ({ getRedis }));

import { POST } from './+server.js';

const event = (body: unknown, user: unknown = { id: 1 }) =>
  ({
    request: new Request('http://localhost/api/codebase-index/agents-write', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    locals: { user },
  }) as any;

describe('POST /api/codebase-index/agents-write', () => {
  it('401 without a user', async () => {
    expect((await POST(event({}, null))).status).toBe(401);
  });

  it('400 on a present but wrongly typed body', async () => {
    for (const bad of [{ minFiles: 'many' }, { dryRun: 'yes' }, { filter: 5 }, { minFiles: 0 }]) {
      expect((await POST(event(bad))).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('accepts an empty body as defaults without performing a real store write', async () => {
    const res = await POST(event(''));
    expect(res.status).not.toBe(400);
  });

  it('rejects malformed JSON before obtaining the Redis writer', async () => {
    getRedis.mockClear();
    const res = await POST(event('{nope'));
    expect(res.status).toBe(400);
    expect(getRedis).not.toHaveBeenCalled();
  });
});
