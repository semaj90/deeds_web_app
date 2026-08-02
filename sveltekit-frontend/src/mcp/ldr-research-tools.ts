/**
 * ldr-research-tools.ts — canonical Streamable HTTP registration for LDR.
 *
 * Reuses the existing `executeLDRResearch`/`formatLDRResultForAgent` handler from
 * `tools/ldr-research.ts` (the older stdio `src/mcp/server.ts` registration) rather
 * than duplicating research logic — this file only adds the registration onto the
 * live `trace-mcp-server.ts` (:8788) surface so LDR is reachable from the same MCP
 * boundary as every other tool (`library.registry_*`, `trace.kag_search`, etc.).
 *
 * LDR is an *acquisition* adapter, not a second RAG platform: it gathers candidate
 * external sources when Parent Atlas lacks local evidence. It does not write
 * canonical Postgres/Qdrant records itself — see GS1.19 in
 * openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md for the
 * research -> acquire -> validate -> ingest boundary this tool sits inside of.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeLDRResearch, formatLDRResultForAgent, type LDRToolInput } from './tools/ldr-research.js';

export function registerLdrResearchTools(server: McpServer, _pool: any) {
  server.registerTool(
    'ldr_research',
    {
      description:
        'Execute Local Deep Research - autonomous web search, document extraction, and synthesis ' +
        'for questions Parent Atlas cannot answer from local repo evidence. Returns a synthesized ' +
        'answer with web sources as CANDIDATE evidence only; it does not persist canonical records. ' +
        'Use trace_dynamic_context first for repo-internal questions.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Research query or question'),
        maxResults: z.number().int().min(1).max(50).default(15).describe('Max web search results'),
        maxDocs: z.number().int().min(1).max(20).default(10).describe('Max documents to extract'),
        temperature: z.number().min(0).max(1).default(0.3).describe('Synthesis temperature'),
      }) as any,
    },
    async (input: LDRToolInput) => {
      const output = await executeLDRResearch(input);
      return {
        content: [
          {
            type: 'text' as const,
            text: formatLDRResultForAgent(output),
          },
        ],
        structuredContent: output as unknown as Record<string, unknown>,
        isError: !output.success,
      };
    }
  );
}
