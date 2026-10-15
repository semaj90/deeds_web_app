import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchKeywordCorpusV1 } from '$lib/server/atlas/keyword-corpus-search-v1.js';

export function registerAtlasKeywordCorpusTools(server: McpServer): void {
  server.registerTool('atlas.keyword_corpus_search', {
    description: 'Read-only keyword search over the schema-validated Parent Atlas .okf vocabulary. Returns reference-only entries with stable Top-K pagination and revision-bound LUT display codes; results are not canonical taxonomy or source evidence.',
    inputSchema: z.object({
      query: z.string().trim().min(1).max(512),
      limit: z.number().int().min(1).max(20).optional(),
      cursor: z.string().max(2048).nullable().optional(),
    }).strict(),
  }, async ({ query, limit, cursor }) => {
    const corpusDirectory = path.resolve(process.cwd(), '..', '.okf', 'corpora');
    const result = searchKeywordCorpusV1({
      query,
      corpusPath: path.join(corpusDirectory, 'keyword-corpus.yaml'),
      schemaPath: path.join(corpusDirectory, 'keyword-corpus.schema.json'),
      limit,
      cursor,
    });
    return {
      structuredContent: result as unknown as Record<string, unknown>,
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  });
}
