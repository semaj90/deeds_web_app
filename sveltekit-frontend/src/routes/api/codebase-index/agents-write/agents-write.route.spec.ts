// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('node:fs', () => ({ existsSync: vi.fn(() => true) }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => JSON.stringify({ files: [] })),
}));
vi.mock('$lib/server/redis.js', () => ({ getRedis: vi.fn(() => ({})) }));

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

  it('an empty or malformed-JSON body means defaults, not a 400', async () => {
    const res = await POST(event('{nope'));
    expect(res.status).not.toBe(400);
  });
});
