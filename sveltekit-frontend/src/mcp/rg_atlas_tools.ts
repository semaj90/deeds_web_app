import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runRgSearchAtlas } from '../lib/server/rg-atlas/run.js';
import { rgSearchAtlasOptionsSchema } from '../lib/server/rg-atlas/types.js';

/**
 * Register RG-Atlas search tools.
 */
export function registerRgAtlasTools(server: McpServer) {
  server.registerTool(
    'kb.rg_atlas_search',
    {
      description: 'Execute high-authority deep search using the RG-Atlas pipeline (rg + GPU Karpathy + Qdrant union + MARCO rerank). Better for deep research than standard trace_search.',
      inputSchema: rgSearchAtlasOptionsSchema
    },
    async (opts) => {
      try {
        const result = await runRgSearchAtlas(opts as any);
        return {
          content: [{ 
            type: 'text' as const, 
            text: JSON.stringify({
              runId: result.runId,
              hitCount: result.hits.length,
              topHits: result.hits.slice(0, 5).map(h => ({
                path: h.filePath,
                line: h.lineNumber,
                score: h.scores.final,
                snippet: h.snippet?.substring(0, 500)
              })),
              diagnostics: result.diagnostics
            }, null, 2) 
          }]
        };
      } catch (err) {
        return { 
          content: [{ type: 'text' as const, text: `RG-Atlas search failed: ${err instanceof Error ? err.message : String(err)}` }], 
          isError: true 
        };
      }
    }
  );
}
