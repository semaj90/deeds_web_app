import { describe, expect, it } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAtlasKeywordCorpusTools } from './atlas-keyword-corpus-tools.js';

describe('atlas.keyword_corpus_search MCP tool', () => {
  it('registers and invokes the read-only reference corpus search', async () => {
    let registeredName = '';
    let handler: ((input: { query: string; limit?: number }) => Promise<{
      content: Array<{ type: string; text: string }>;
      structuredContent?: Record<string, unknown>;
    }>) | null = null;
    const server = {
      registerTool: (name: string, _config: unknown, run: typeof handler) => {
        registeredName = name;
        handler = run;
      },
    } as unknown as McpServer;
    registerAtlasKeywordCorpusTools(server);
    expect(registeredName).toBe('atlas.keyword_corpus_search');
    const response = await handler!({ query: 'MCP tool selection', limit: 3 });
    const result = JSON.parse(response.content[0]!.text) as { status: string; items: Array<{ entryId: string }>; writesPerformed: boolean };
    expect(response.structuredContent).toEqual(result);
    expect(result.status).toBe('OK');
    expect(result.items[0]?.entryId).toBe('viterbi-mcp-tool-routing');
    expect(result.writesPerformed).toBe(false);
  });
});
