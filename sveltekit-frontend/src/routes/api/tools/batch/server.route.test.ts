// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeBatch: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('$lib/server/grpc/tool-calling-client.js', () => ({
  getToolCallingClient: () => mocks.getClient(),
}));

describe('/api/tools/batch', () => {
  beforeEach(() => {
    mocks.executeBatch.mockReset();
    mocks.getClient.mockReset();
    mocks.executeBatch.mockResolvedValue({
      results: [],
      totalDurationMs: 12,
    });
    mocks.getClient.mockReturnValue({
      executeBatch: mocks.executeBatch,
    });
  });

  it('rejects batches larger than three calls', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/tools/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parallel: true,
        calls: [
          { toolName: 'search', arguments: { query: 'one' } },
          { toolName: 'search', arguments: { query: 'two' } },
          { toolName: 'search', arguments: { query: 'three' } },
          { toolName: 'search', arguments: { query: 'four' } },
        ],
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(400);
    expect(mocks.executeBatch).not.toHaveBeenCalled();
  });

  it('forwards up to three calls to the gRPC batch client', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/tools/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parallel: true,
        calls: [
          { toolName: 'search', arguments: { query: 'one' } },
          { toolName: 'search', arguments: { query: 'two' } },
          { toolName: 'search', arguments: { query: 'three' } },
        ],
      }),
    });

    const response = await POST({ request, locals: { user: { id: 'u1' } } } as any);
    expect(response.status).toBe(200);
    expect(mocks.executeBatch).toHaveBeenCalledTimes(1);
    expect(mocks.executeBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        parallel: true,
        calls: expect.arrayContaining([
          expect.objectContaining({ toolName: 'search' }),
        ]),
      }),
      expect.any(Number),
    );
  });
});
