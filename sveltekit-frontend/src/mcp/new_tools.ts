import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { extractDocumentNative } from '../lib/server/langextract/native.js';
import { traceRerank } from '../lib/server/ai/trace-reranker.js';
import { lookupWikiNotes } from '../lib/server/graph/graph-intel.js';
import { archiveSynthesisMemory } from '../lib/server/indexer/synthesis-memory-archiver.js';
import { generateEmbedding } from '../lib/server/grpc/embedding-client.js';

/**
 * Register new agentic tools for organizing messy text and advanced retrieval.
 * These tools leverage the native TS LangExtract + TurboQuant Reranker.
 *
 * Canonical surface uses `kb.*` prefix plus the named tool `trace.kag_search`
 * (per §10 of the dev guide — registered unconditionally as a thin alias of
 * `kb.trace_search`).
 *
 * Bare-name aliases (`trace_search`, `wiki_note_lookup`) are registered only
 * when `enableLegacy` is true (driven by `MCP_LEGACY_ALIASES=true`).
 *
 * Note: the full KAG-DAG implementation of `trace.kag_search` lives in
 * `tools/trace-kag.tool.ts` and is mounted by `server-fastmcp.ts` (a separate
 * server). If both servers ever merge, that richer impl registers later and
 * shadows the thin alias — name resolves either way.
 */
export function registerNewTools(server: McpServer, config: { rerankUrl: string }, enableLegacy = false) {

  // == kb.organize_messy_text ==================================================

  server.registerTool(
    'kb.organize_messy_text',
    {
      description: 'Organize messy text into structured entities and sections.',
      inputSchema: z.object({
        text: z.string().describe('The messy text blob to organize'),
        query: z.string().optional().describe('Relevance query (e.g. "key legal facts")'),
      })
    },
    async ({ text, query }) => {
      try {
        // 1. Extract using the native TS heuristic (Regex + Entity detection)
        const doc = extractDocumentNative(text, 'mcp-organize-task');

        // 2. If a query is provided, rerank the extracted entities/sections
        let organized: any = {
          entities: doc.entities,
          sections: doc.sections,
          summary: `Extracted ${doc.entities.length} entities and ${doc.sections.length} sections.`
        };

        if (query && doc.entities.length > 0) {
          const documents = doc.entities.map(e => `[${e.type}] ${e.text}`);
          const res = await fetch(`${config.rerankUrl}/rerank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, documents, top_n: 15 }),
          });

          if (res.ok) {
            const data = await res.json();
            organized.reranked_entities = data.results?.map((r: any) => ({
              ...doc.entities[r.index],
              relevance_score: r.relevance_score
            }));
            organized.summary += ` Reranked top ${organized.reranked_entities.length} entities for query: "${query}"`;
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(organized, null, 2) }]
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Organization failed: ${err}` }], isError: true };
      }
    }
  );

  // == kb.extract_citations ===================================================

  server.registerTool(
    'kb.extract_citations',
    {
      description: 'Extract legal citations and statutes from text.',
      inputSchema: z.object({
        text: z.string().describe('Text to scan for legal citations'),
      })
    },
    async ({ text }) => {
      const doc = extractDocumentNative(text, 'mcp-citation-task');
      const citations = doc.entities.filter(e => e.type === 'citation' || e.type === 'statute');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(citations, null, 2) }]
      };
    }
  );

  // == kb.trace_search ========================================================

  async function handleTraceSearch({ query, limit, intent }: { query: string, limit: number, intent?: string[] }) {
    try {
      const emb = await generateEmbedding(query);
      if (!emb) {
        return { content: [{ type: 'text' as const, text: 'Embedding service unavailable' }], isError: true };
      }

      const hits = await traceRerank({
        query,
        queryEmbedding: emb,
        limit,
        intentOverride: intent
      });

      const results = hits.map(h => ({
        id: h.id,
        score: h.score,
        path: h.payload?.path,
        content: (h.payload?.content ?? '').slice(0, 1000),
        lenses: h.lenses,
        tags: h.payload?.tags
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }]
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Trace search failed: ${err}` }], isError: true };
    }
  }

  server.registerTool(
    'kb.trace_search',
    {
      description: 'Search the hypergraph/KAG context for documents, cards, and relations matching a query.',
      inputSchema: z.object({
        query: z.string().describe('Technical query or coding problem'),
        limit: z.number().int().min(1).max(20).default(5).describe('Max results to return'),
        intent: z.array(z.string()).optional().describe('Lenses: purpose, risk, api_surface, dependencies, retrieval_role'),
      })
    },
    handleTraceSearch
  );

  // `trace.kag_search` is registered in the standalone TRACE server with the
  // richer KAG-DAG implementation. Keep this bundle focused on the kb.* tools
  // and the legacy aliases only.

  if (enableLegacy) {
    server.registerTool(
      'trace_search',
      {
        description: 'DEPRECATED bare-name alias for kb.trace_search. Gated by MCP_LEGACY_ALIASES.',
        inputSchema: z.object({
          query: z.string().describe('Technical query or coding problem'),
          limit: z.number().int().min(1).max(20).default(5),
          intent: z.array(z.string()).optional(),
        })
      },
      handleTraceSearch
    );
  }

  // == kb.wiki_note_lookup ====================================================

  async function handleWikiLookup({ query, limit }: { query: string, limit: number }) {
    try {
      const notes = await lookupWikiNotes(query, limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }]
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Wiki lookup failed: ${err}` }], isError: true };
    }
  }

  server.registerTool(
    'kb.wiki_note_lookup',
    {
      description: 'Look up notes in the wiki.',
      inputSchema: z.object({
        query: z.string().describe('Directory name, tag, or topic to look up'),
        limit: z.number().int().min(1).max(20).default(5),
      })
    },
    handleWikiLookup
  );

  if (enableLegacy) {
    server.registerTool(
      'wiki_note_lookup',
      {
        description: 'DEPRECATED bare-name alias for kb.wiki_note_lookup. Gated by MCP_LEGACY_ALIASES.',
        inputSchema: z.object({
          query: z.string().describe('Directory name, tag, or topic to look up'),
          limit: z.number().int().min(1).max(20).default(5),
        })
      },
      handleWikiLookup
    );
  }

  // == kb.archive_synthesis ===================================================

  server.registerTool(
    'kb.archive_synthesis',
    {
      description: 'Archive a synthesis artifact.',
      inputSchema: z.object({
        title: z.string().describe('Title for the synthesis artifact'),
        content: z.string().describe('The synthesized answer or report'),
        source: z.string().describe('Provenance source (e.g. "chat:e782" or "research:query")'),
        tags: z.array(z.string()).default([]).describe('Keywords for retrieval'),
      })
    },
    async ({ title, content, source, tags }) => {
      try {
        const res = await archiveSynthesisMemory({ title, content, source, tags });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }]
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Archiving failed: ${err}` }], isError: true };
      }
    }
  );
}
