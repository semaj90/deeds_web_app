// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRefreshDirectory } = vi.hoisted(() => ({
  mockRefreshDirectory: vi.fn()
}));

vi.mock('../../../../../src/lib/server/kb/wiki-logic.js', () => ({
  refreshDirectory: mockRefreshDirectory
}));

describe('src/routes/api/wiki/refresh-directory/+server.ts', () => {
  let handler: any;

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = await import('../../../../../src/routes/api/wiki/refresh-directory/+server.js');
    handler = mod.POST;
    mockRefreshDirectory.mockResolvedValue({
      path: 'src/lib/server/kb',
      status: 'dry_run',
      timestamp: '2026-05-12T00:00:00.000Z',
      proposedChanges: ['Update AGENTS.md metadata for src/lib/server/kb']
    });
  });

  function makeRequest(body: unknown) {
    return new Request('http://localhost/api/wiki/refresh-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  it('401 when locals.user is missing', async () => {
    const resp = await handler({ request: makeRequest({ path: 'src/lib/server/kb' }), locals: {} });
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('400 for invalid body', async () => {
    const resp = await handler({ request: makeRequest({ path: '' }), locals: { user: { id: 1 } } });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid body');
  });

  it('200 and defaults dryRun to true', async () => {
    const resp = await handler({ request: makeRequest({ path: 'src/lib/server/kb' }), locals: { user: { id: 1 } } });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.path).toBe('src/lib/server/kb');
    expect(mockRefreshDirectory).toHaveBeenCalledWith('src/lib/server/kb', true);
  });

  it('passes dryRun false when requested', async () => {
    const resp = await handler({ request: makeRequest({ path: 'src/lib/server/kb', dryRun: false }), locals: { user: { id: 1 } } });
    expect(resp.status).toBe(200);
    expect(mockRefreshDirectory).toHaveBeenCalledWith('src/lib/server/kb', false);
  });
});
