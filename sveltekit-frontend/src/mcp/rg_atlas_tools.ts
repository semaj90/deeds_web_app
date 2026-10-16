import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runRgSearchAtlas } from '../lib/server/rg-atlas/run.js';
import { rgSearchAtlasOptionsSchema } from '../lib/server/rg-atlas/types.js';
import type { DispatcherMiddleware } from './dispatcher-middleware.js';
import { generateSessionId, createToolWithDispatcher } from './dispatcher-tool-integration.js';

const rgSearchAtlasToolInputSchema = rgSearchAtlasOptionsSchema.omit({ persist: true }).strict();

/**
 * Register RG-Atlas search tools.
 */
export function registerRgAtlasTools(server: McpServer, dispatcherMiddleware?: DispatcherMiddleware) {
  const sessionId_rg_atlas_search = generateSessionId();

  server.registerTool(
    'kb.rg_atlas_search',
    {
      description: 'Run an advisory multi-lane repository search. Results are candidates only and are not source-qualified evidence or ContextManifest admission.',
      inputSchema: rgSearchAtlasToolInputSchema
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'kb.rg_atlas_search',
      sessionId_rg_atlas_search,
      async (opts) => {
        try {
          const result = await runRgSearchAtlas({ ...(opts as any), persist: false });
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
    ,
    'READ_ONLY'
    )
  );
}
