// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCallTraceMcp = vi.fn();

vi.mock('$lib/server/mcp/trace-http.js', () => ({
  callTraceMcp: mockCallTraceMcp,
}));

describe('src/routes/api/ai/context/compact-search/+server.ts', () => {
  let POST: (evt: { request: Request; locals: Record<string, unknown>; url: URL; params: Record<string, string> }) => Promise<Response>;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockCallTraceMcp.mockResolvedValue({ ok: true, data: { context_tree_id: 'act:1234', hits: [] }, ms: 10 });
    const mod = await import('../../../../src/routes/api/ai/context/compact-search/+server.js') as Record<string, unknown>;
    POST = mod.POST as typeof POST;
  });

  function makeReq(body?: unknown) {
    return new Request('http://localhost/api/ai/context/compact-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  }

  function makeUrl() { return new URL('http://localhost/api/ai/context/compact-search'); }

  it('401 — returns Unauthorized when locals.user is missing', async () => {
    const res = await POST({ request: makeReq(), locals: {}, url: makeUrl(), params: {} });
    expect(res.status).toBe(401);
  });

  it('400 — returns validation error for empty query', async () => {
    const res = await POST({ request: makeReq({ query: '' }), locals: { user: { id: '1' } }, url: makeUrl(), params: {} });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('query');
  });

  it('200 — proxies ace.compact_search through TRACE MCP', async () => {
    const res = await POST({ request: makeReq({ query: 'find relevant statutes', limit: 2 }), locals: { user: { id: '1' } }, url: makeUrl(), params: {} });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.result).toEqual({ context_tree_id: 'act:1234', hits: [] });
    expect(mockCallTraceMcp).toHaveBeenCalledWith('ace.compact_search', expect.objectContaining({ query: 'find relevant statutes', limit: 2 }));
  });

  it('503 — returns service unavailable when MCP is unreachable', async () => {
    mockCallTraceMcp.mockResolvedValueOnce({ ok: false, data: null, ms: 5, error: 'TRACE MCP unreachable' });
    const res = await POST({ request: makeReq({ query: 'find relevant statutes' }), locals: { user: { id: '1' } }, url: makeUrl(), params: {} });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('TRACE MCP unreachable');
  });
});
