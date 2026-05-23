// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPing = vi.fn(async () => 'PONG');
vi.mock('$lib/server/redis.js', () => ({
  getRedis: () => ({
    ping: mockPing,
  }),
}));

const mockCallTraceMcp = vi.fn(async () => ({ ok: true, data: { success: true }, ms: 10 }));
vi.mock('./trace-http.js', () => ({
  callTraceMcp: mockCallTraceMcp,
}));

const mockCallMcpTool = vi.fn(async () => [{ type: 'text', text: 'local result' }]);
const mockListMcpTools = vi.fn(async () => [{ name: 'local_tool', description: 'test' }]);
vi.mock('./mcp-internal.js', () => ({
  callMcpTool: mockCallMcpTool,
  listMcpTools: mockListMcpTools,
}));

describe('Unified MCP Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes and verifies Redis and TRACE MCP connectivity', async () => {
    const { initialize } = await import('./client.js');
    const ok = await initialize();
    expect(ok).toBe(true);
    expect(mockPing).toHaveBeenCalled();
    expect(mockCallTraceMcp).toHaveBeenCalledWith('trace.kag_search', expect.any(Object));
  });

  it('lists tools from internal registry', async () => {
    const { list } = await import('./client.js');
    const tools = await list();
    expect(tools).toEqual([{ name: 'local_tool', description: 'test' }]);
    expect(mockListMcpTools).toHaveBeenCalled();
  });

  it('routes trace.* calls to callTraceMcp', async () => {
    const { call } = await import('./client.js');
    const res = await call('trace.do_something', { query: 'test' });
    expect(mockCallTraceMcp).toHaveBeenCalledWith('trace.do_something', { query: 'test' });
    expect(res).toEqual({ success: true });
    expect(mockCallMcpTool).not.toHaveBeenCalled();
  });

  it('routes non-trace calls to local mcp-internal tool executor', async () => {
    const { call } = await import('./client.js');
    const res = await call('local_tool', { param: 1 });
    expect(mockCallMcpTool).toHaveBeenCalledWith('local_tool', { param: 1 });
    expect(res).toEqual([{ type: 'text', text: 'local result' }]);
    expect(mockCallTraceMcp).not.toHaveBeenCalled();
  });
});
