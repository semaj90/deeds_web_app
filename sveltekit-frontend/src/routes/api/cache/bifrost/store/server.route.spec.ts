// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server.js';

function event(body: unknown) {
  return {
    request: new Request('http://localhost/api/cache/bifrost/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    locals: { user: { id: 'user-1' } },
  } as never;
}

describe('/api/cache/bifrost/store admission boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not store unqualified prompt/answer pairs in the global cache', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(event({ prompt: 'query', response: 'answer' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      stored: false,
      admission: 'BLOCKED',
      reason: 'SERVER_ADMISSION_METADATA_UNAVAILABLE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
