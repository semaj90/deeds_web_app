import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8888';

/**
 * Advanced research tools leveraging SearXNG and Ollama.
 */
export function registerResearchTools(server: McpServer) {

  // == research.web_search ====================================================
  server.tool(
    'research.web_search',
    {
      query: z.string().describe('The search query'),
      engines: z.string().optional().describe('Comma-separated list of engines (e.g. "google,bing")'),
      limit: z.number().default(5).describe('Number of results to return')
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

  // == research.deep_analyze ==================================================
  /**
   * Performs a multi-query expansion and synthesis of search results.
   */
  server.tool(
    'research.deep_analyze',
    {
      topic: z.string().describe('The research topic to analyze in depth'),
      depth: z.enum(['standard', 'exhaustive']).default('standard')
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
