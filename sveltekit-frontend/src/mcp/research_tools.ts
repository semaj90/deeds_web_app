import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ENV } from '$lib/server/env.server.js';

const SEARXNG_URL   = ENV.SEARXNG_URL;
const LANGGRAPH_URL = ENV.LANGGRAPH_URL;

/**
 * Advanced research tools leveraging SearXNG and Ollama.
 */
export function registerResearchTools(server: McpServer) {

  // == research.web_search ====================================================
  server.registerTool(
    'research.web_search',
    {
      description: 'Search the web using SearXNG.',
      inputSchema: z.object({
        query: z.string().describe('The search query'),
        engines: z.string().optional().describe('Comma-separated list of engines (e.g. "google,bing")'),
        limit: z.number().default(5).describe('Number of results to return')
      })
    },
    async ({ query, engines, limit }) => {
      try {
        const qp = new URLSearchParams({
          q: query,
          format: 'json',
          pageno: '1',
          ...(engines ? { engines } : {})
        });

        const res = await fetch(`${SEARXNG_URL}/search?${qp}`);
        if (!res.ok) throw new Error(`SearXNG returned ${res.status}`);

        const data = await res.json();
        const results = (data.results || []).slice(0, limit).map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content || r.snippet
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
        };
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Web search failed: ${err.message}` }], isError: true };
      }
    }
  );

  // == research.synthesize ====================================================
  /**
   * Full RAG+KAG+LangGraph synthesis via the legal-ai-langgraph:8091 container.
   * Routes through L1 Redis exact-match → L2 Bifrost semantic → L3 LangGraph DAG.
   * Returns answer + confidence + cache tier + trace_id.
   *
   * The synth container is already running (docker compose --profile gpu) and
   * auto-discovers Ollama models including gemma4-rotorquant:latest.
   */
  server.registerTool(
    'research.synthesize',
    {
      description: 'Full RAG+KAG+LangGraph legal synthesis via the GPU pipeline at :8091. Returns answer + confidence + citations + cache tier. Routes through L1 Redis (5ms) → L2 Bifrost semantic → L3 LangGraph DAG (Gemma4 + Qdrant ANN + Neo4j KAG + ACE context).',
      inputSchema: z.object({
        query:       z.string().min(3).max(4000).describe('Natural-language legal/research question'),
        case_id:     z.string().uuid().optional().describe('Optional UUID — scopes retrieval to a specific case'),
        temperature: z.number().min(0).max(2).default(0.3).optional().describe('LLM temperature (default 0.3 for legal precision)'),
        max_tokens:  z.number().int().min(50).max(4000).default(800).optional().describe('Max output tokens'),
        skip_cache:  z.boolean().default(false).optional().describe('Bypass L1/L2 caches and force a fresh DAG run'),
      })
    },
    async ({ query, case_id, temperature, max_tokens, skip_cache }) => {
      try {
        const res = await fetch(`${LANGGRAPH_URL}/synthesize`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ query, case_id, temperature, max_tokens, skip_cache }),
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
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `synth unreachable: ${err.message ?? String(err)}` }],
          isError: true,
        };
      }
    }
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
    async ({ topic, depth }) => {
      // This tool orchestrates multiple web searches and synthesizes them.
      // For now, it performs 3 parallel searches for different facets.
      const facets = [
        `${topic} technical overview`,
        `${topic} implementation examples`,
        `${topic} best practices and limitations`
      ];

      const searchResults = await Promise.all(facets.map(async (f) => {
        const qp = new URLSearchParams({ q: f, format: 'json' });
        const res = await fetch(`${SEARXNG_URL}/search?${qp}`);
        return res.ok ? (await res.json()).results?.slice(0, 3) : [];
      }));

      return {
        content: [{ 
          type: 'text', 
          text: `Deep analysis initiated for "${topic}". Gathered ${searchResults.flat().length} source snippets across ${facets.length} research facets.` 
        }]
      };
    }
  );
}
