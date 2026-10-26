import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { webSearch as canonicalWebSearch } from '$lib/server/retrieval/web-search.js';
import { resolveLlamaInferenceTarget } from '$lib/server/llm/runtime-contract.js';
import type { DispatcherMiddleware } from './dispatcher-middleware.js';
import { generateSessionId, createToolWithDispatcher } from './dispatcher-tool-integration.js';
import { readBoundedJsonResponse, MCP_UPSTREAM_JSON_MAX_BYTES } from './read-tool-bounds.js';

/**
 * Advanced research tools leveraging SearXNG and llama-server.
 */
export function registerResearchTools(server: McpServer, dispatcherMiddleware?: DispatcherMiddleware) {
  const sessionId_web_search = generateSessionId();
  const sessionId_synthesize = generateSessionId();
  const sessionId_deep_analyze = generateSessionId();

  // == research.web_search ====================================================
  server.registerTool(
    'research.web_search',
    {
      description: 'Search the web using the canonical SearXNG/DuckDuckGo adapter.',
      inputSchema: z.object({
        query: z.string().trim().min(1).max(512).describe('The search query'),
        engines: z.string().max(128).regex(/^[A-Za-z0-9_, -]*$/).optional()
          .describe('Comma-separated search engine identifiers'),
        limit: z.number().int().min(1).max(10).default(5).describe('Number of results to return')
      }).strict()
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'research.web_search',
      sessionId_web_search,
      async ({ query, engines, limit }) => {
        try {
          const response = await canonicalWebSearch(
            query,
            limit,
            engines ? engines.split(',').map((engine) => engine.trim()).filter(Boolean) : undefined
          );
          const results = response.results.map((result) => ({
            title: result.title,
            url: result.url,
            content: result.snippet,
            source: result.source
          }));

          return {
            content: [{ type: 'text', text: JSON.stringify({ provider: response.provider, results }, null, 2) }]
          };
        } catch (err: any) {
          return { content: [{ type: 'text', text: `Web search failed: ${err.message}` }], isError: true };
        }
      }
    ,
    'READ_ONLY'
    )
  );

  // == research.synthesize ====================================================
  /**
   * Direct bounded model generation. This handler does not retrieve or verify evidence.
   */
  server.registerTool(
    'research.synthesize',
    {
      description: 'Generate a response to a bounded question with the active model. This tool does not retrieve, cite, or verify source evidence; do not use it as a grounded legal answer.',
      inputSchema: z.object({
        query:       z.string().trim().min(3).max(2000).describe('Natural-language research question'),
        case_id:     z.string().uuid().optional().describe('Optional case reference echoed for caller correlation; it does not scope retrieval'),
        temperature: z.number().min(0).max(2).default(0.3).optional().describe('LLM temperature (default 0.3 for legal precision)'),
        max_tokens:  z.number().int().min(50).max(4000).default(800).optional().describe('Max output tokens'),
        skip_cache:  z.boolean().default(false).optional().describe('Disable llama-server prompt-cache reuse for this request'),
      }).strict()
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'research.synthesize',
      sessionId_synthesize,
      async ({ query, case_id, temperature, max_tokens, skip_cache }) => {
        try {
          const target = await resolveLlamaInferenceTarget();
          const model = target.model;
          const res = await fetch(`${target.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: 'You are a legal research assistant. Provide accurate, well-reasoned legal analysis based on the given query.' },
                  { role: 'user', content: query }
                ],
                temperature: temperature ?? 0.3,
                max_tokens: max_tokens ?? 800,
                stream: false,
                cache_prompt: !skip_cache,
            }),
            signal: AbortSignal.timeout(90_000),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            return {
              content: [{ type: 'text', text: `synth failed: HTTP ${res.status} ${text.slice(0, 200)}` }],
              isError: true,
            };
          }
          const data = await readBoundedJsonResponse(res, MCP_UPSTREAM_JSON_MAX_BYTES) as {
            choices?: Array<{ message?: { content?: string } }>;
            model?: string;
            usage?: unknown;
          };
          const answer = data.choices?.[0]?.message?.content ?? '';
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ answer, model: data.model, usage: data.usage, case_id }, null, 2)
            }]
          };
        } catch (err: unknown) {
          return {
            content: [{ type: 'text', text: `synth unreachable: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }
    ,
    'READ_ONLY'
    )
  );

  // == research.deep_analyze ==================================================
  /**
   * Performs a multi-query expansion and synthesis of search results.
   */
  server.registerTool(
    'research.deep_analyze',
    {
      description: 'Runs a bounded set of web searches for research facets and reports source counts; it does not synthesize or verify conclusions.',
      inputSchema: z.object({
        topic: z.string().trim().min(1).max(512).describe('The research topic to analyze in depth'),
        depth: z.enum(['standard', 'exhaustive']).default('standard')
      }).strict()
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'research.deep_analyze',
      sessionId_deep_analyze,
      async ({ topic, depth }) => {
        // This tool orchestrates multiple web searches and synthesizes them.
        // For now, it performs 3 parallel searches for different facets.
        const facets = [
          `${topic} technical overview`,
          `${topic} implementation examples`,
          `${topic} best practices and limitations`
        ];

        if (depth === 'exhaustive') {
          facets.push(topic + ' risks and failure modes', topic + ' primary documentation');
        }
        const searchResults = await Promise.all(
          facets.map(async (facet) => (await canonicalWebSearch(facet, 3)).results)
        );

        return {
          content: [{
            type: 'text',
            text: `Deep analysis initiated for "${topic}". Gathered ${searchResults.flat().length} source snippets across ${facets.length} research facets.`
          }]
        };
      }
    ,
    'READ_ONLY'
    )
  );
}
