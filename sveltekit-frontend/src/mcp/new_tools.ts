import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { extractDocumentNative } from '../lib/server/langextract/native.js';

/**
 * Register new agentic tools for organizing messy text and advanced retrieval.
 * These tools leverage the native TS LangExtract + TurboQuant Reranker.
 */
export function registerNewTools(server: McpServer, config: { rerankUrl: string }) {

  // == kb.organize_messy_text ==================================================

  server.tool(
    'kb.organize_messy_text',
    {
      text: z.string().describe('The messy text blob to organize'),
      query: z.string().optional().describe('Relevance query (e.g. "key legal facts")'),
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
          content: [{ type: 'text', text: JSON.stringify(organized, null, 2) }]
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Organization failed: ${err}` }], isError: true };
      }
    }
  );

  // == kb.extract_citations ===================================================

  server.tool(
    'kb.extract_citations',
    {
      text: z.string().describe('Text to scan for legal citations'),
    },
    async ({ text }) => {
      const doc = extractDocumentNative(text, 'mcp-citation-task');
      const citations = doc.entities.filter(e => e.type === 'citation' || e.type === 'statute');
      return {
        content: [{ type: 'text', text: JSON.stringify(citations, null, 2) }]
      };
    }
  );
}
