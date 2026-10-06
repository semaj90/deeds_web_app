// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server.js';

function event(body: unknown, authenticated = true) {
  return {
    request: new Request('http://localhost/api/cache/bifrost/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { user: authenticated ? { id: 'user-1' } : null },
  } as never;
}

describe('/api/cache/bifrost/check admission boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a miss without contacting the globally scoped Bifrost cache', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(event({ prompt: 'find a code symbol' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      hit: false,
      admission: 'MISS',
      reason: 'REQUEST_CONTEXT_MISSING',
      threshold: 0.82,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects thresholds below the policy floor without a cache call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(event({ prompt: 'query', threshold: 0.81 }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still requires authentication', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(event({ prompt: 'query' }, false));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
