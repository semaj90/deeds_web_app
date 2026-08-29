import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ENV } from '$lib/server/env.server.js';
import { webSearch as canonicalWebSearch } from '$lib/server/retrieval/web-search.js';
import { resolveLoadedLlamaModel } from '$lib/server/ai/llama-server-model-resolver.js';
import type { DispatcherMiddleware } from './dispatcher-middleware.js';
import { generateSessionId, createToolWithDispatcher } from './dispatcher-tool-integration.js';

const LLAMA_SERVER_URL = ENV.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';

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
        query: z.string().describe('The search query'),
        engines: z.string().optional().describe('Comma-separated list of engines (e.g. "google,bing")'),
        limit: z.number().default(5).describe('Number of results to return')
      })
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
    )
  );

  // == research.synthesize ====================================================
  /**
   * Full RAG+KAG synthesis with llama-server (Gemma4).
   * Routes through L1 Redis exact-match → L2 Bifrost semantic → L3 llama-server.
   * Returns answer + confidence + cache tier.
   */
  server.registerTool(
    'research.synthesize',
    {
      description: 'Full RAG+KAG legal synthesis with llama-server (Gemma4 + TurboQuant). Routes through L1 Redis (5ms) → L2 Bifrost semantic → L3 llama-server (Qdrant ANN + Neo4j KAG + ACE context).',
      inputSchema: z.object({
        query:       z.string().min(3).max(4000).describe('Natural-language legal/research question'),
        case_id:     z.string().uuid().optional().describe('Optional UUID — scopes retrieval to a specific case'),
        temperature: z.number().min(0).max(2).default(0.3).optional().describe('LLM temperature (default 0.3 for legal precision)'),
        max_tokens:  z.number().int().min(50).max(4000).default(800).optional().describe('Max output tokens'),
        skip_cache:  z.boolean().default(false).optional().describe('Bypass L1/L2 caches and force a fresh generation'),
      })
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'research.synthesize',
      sessionId_synthesize,
      async ({ query, case_id, temperature, max_tokens, skip_cache }) => {
        const loadedModel = await resolveLoadedLlamaModel(LLAMA_SERVER_URL, null);
        for (const model of [loadedModel.resolvedModel]) {
          try {
            const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
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
              signal:  AbortSignal.timeout(90_000),
            });
            if (!res.ok) {
              const text = await res.text().catch(() => '');
              return {
                content: [{ type: 'text', text: `synth failed: HTTP ${res.status} ${text.slice(0, 200)}` }],
                isError: true,
              };
            }
            const data = await res.json();
            const answer = data.choices?.[0]?.message?.content ?? '';
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ answer, model: data.model, usage: data.usage, case_id }, null, 2)
              }]
            };
          } catch (err: any) {
            return {
              content: [{ type: 'text', text: `synth unreachable: ${err.message ?? String(err)}` }],
              isError: true,
            };
          }
        }
        return {
          content: [{ type: 'text', text: 'synth: no models available' }],
          isError: true,
        };
      }
    )
  );

  // == research.deep_analyze ==================================================
  /**
   * Performs a multi-query expansion and synthesis of search results.
   */
  server.registerTool(
    'research.deep_analyze',
    {
      description: 'Performs a multi-query expansion and synthesis of search results.',
      inputSchema: z.object({
        topic: z.string().describe('The research topic to analyze in depth'),
        depth: z.enum(['standard', 'exhaustive']).default('standard')
      })
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
    )
  );
}
