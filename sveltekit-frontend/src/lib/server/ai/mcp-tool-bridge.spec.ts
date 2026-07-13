// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock('$lib/server/env.server.js', () => ({
  ENV: {
    TRACE_MCP_URL: 'http://trace.test',
  },
}));

describe('mcp-tool-bridge', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('parses a direct JSON MCP response', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: '{"ok":true,"count":2}' }],
            isError: false,
          },
        }),
    });

    const { callTraceMcpTool } = await import('./mcp-tool-bridge.js');
    const result = await callTraceMcpTool('trace.kag_search', { query: 'abc' });

    expect(result).toEqual({ ok: true, count: 2 });
  });

  it('parses an SSE framed MCP response', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        [
          'event: message',
          `data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\\"items\\":[1,2,3]}"}],"isError":false}}`,
          '',
        ].join('\n'),
    });

    const { callTraceMcpTool } = await import('./mcp-tool-bridge.js');
    const result = await callTraceMcpTool('trace.kag_search', { query: 'abc' });

    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('builds a tool map and preserves call execution', async () => {
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.method === 'tools/list') {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                tools: [
                  {
                    name: 'trace.kag_search',
                    description: 'Search trace',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        query: { type: 'string' },
                        limit: { type: 'integer' },
                      },
                      required: ['query'],
                    },
                  },
                ],
              },
            }),
        };
      }

      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              content: [{ type: 'text', text: '{"status":"ok"}' }],
              isError: false,
            },
          }),
      };
    });

    const { buildMcpToolMap } = await import('./mcp-tool-bridge.js');
    const map = await buildMcpToolMap(['trace.kag_search']);

    expect(Object.keys(map)).toContain('trace__kag_search');
    const execute = map.trace__kag_search.execute as (args: Record<string, unknown>) => Promise<unknown>;
    await expect(execute({ query: 'hello', limit: 3 })).resolves.toEqual({ status: 'ok' });
  });
});
