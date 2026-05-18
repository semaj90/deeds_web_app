import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { extractDocumentNative } from '../lib/server/langextract/native.js';
import { traceRerank } from '../lib/server/ai/trace-reranker.js';
import { lookupWikiNotes } from '../lib/server/graph/graph-intel.js';
import { archiveSynthesisMemory } from '../lib/server/indexer/synthesis-memory-archiver.js';
import { generateEmbedding } from '../lib/server/grpc/embedding-client.js';
import { buildFeaturePrefetchContext } from './context-prefetch.js';
import type { FeaturePrefetchContextResult } from './context-prefetch.js';

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
export function registerNewTools(
  server: McpServer,
  config: { rerankUrl: string },
  enableLegacy = false
) {
  type AtlasChunkCard = {
    chunkId: string;
    rank: number;
    sourceRef: string;
    kind: 'source' | 'agents-md' | 'notecard';
    summary: string;
    score: number;
  };

  function normalizeCompactScore(score: number | undefined): number {
    if (typeof score !== 'number' || Number.isNaN(score)) return 0;
    if (score <= 1) return Math.max(0, Math.min(1, score));
    return Math.max(0, Math.min(1, score / 100));
  }

  function compactText(value: string, limit = 220): string {
    const text = value.replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
  }

  function buildAtlasCompactContext(packet: FeaturePrefetchContextResult) {
    const candidateChunks = [
      ...packet.knowledgeDelta.slice(0, 4).map((delta) => ({
        sourceRef: delta.filePath,
        kind: 'source' as const,
        summary: compactText(delta.reasons.join(' · '), 220),
        score: Number((1 - delta.deltaScore).toFixed(3)),
      })),
      ...packet.directoryContexts.slice(0, 2).map((context) => ({
        sourceRef: context.agentsMd?.resolvedPath ?? context.dir,
        kind: (context.agentsMd ? 'agents-md' : 'source') as const,
        summary: compactText(context.summary, 220),
        score: Number(normalizeCompactScore(context.score).toFixed(3)),
      })),
      ...packet.notecardHits.slice(0, 2).map((hit) => ({
        sourceRef: hit.source_path,
        kind: 'notecard' as const,
        summary: compactText(hit.context_text, 220),
        score: Number(normalizeCompactScore(hit.score).toFixed(3)),
      })),
    ];

    const chunkIndex: AtlasChunkCard[] = [...candidateChunks]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((chunk, rank) => ({
        chunkId: `${rank + 1}:${chunk.kind}:${chunk.sourceRef}`,
        rank: rank + 1,
        ...chunk,
      }));
    const topChunks = chunkIndex;
    const sourceRefs = packet.sourceRefs.slice(0, 5);

    const summaryParts = [
      packet.directoryContexts[0]
        ? `dir ${packet.directoryContexts[0].dir}: ${compactText(packet.directoryContexts[0].summary, 120)}`
        : null,
      packet.communityContexts[0]
        ? `community ${packet.communityContexts[0].id}: ${compactText(packet.communityContexts[0].summary, 120)}`
        : null,
      packet.notecardHits[0]
        ? `notecard ${packet.notecardHits[0].source_path}: ${compactText(packet.notecardHits[0].context_text, 120)}`
        : null,
      packet.knowledgeDelta[0] ? `recent ${packet.knowledgeDelta[0].filePath}` : null,
    ].filter((part): part is string => Boolean(part));

    const suggestedFiles = Array.from(
      new Map(
        packet.prefetchTargets
          .filter((target) => target.kind === 'source' || target.kind === 'agents-md')
          .map((target) => [
            target.path,
            {
              path: target.path,
              score: Number(target.score.toFixed(3)),
              reason: target.reasons[0] ?? 'prefetch',
            },
          ])
      ).values()
    ).slice(0, 5);

    const retrievalPath = [
      'atlas.compact_context',
      'context.prefetch_feature_context',
      packet.directoryContexts.length ? 'directory-kag' : null,
      packet.communityContexts.length ? 'community-graph' : null,
      packet.notecardHits.length ? 'notecards' : null,
      packet.sourceRefs.length ? 'source-refs' : null,
    ].filter((part): part is string => Boolean(part));

    return {
      query: packet.query,
      summary:
        summaryParts.length > 0 ? summaryParts.join(' | ') : `Compact context for ${packet.query}`,
      chunk_index: chunkIndex,
      top_chunks: topChunks,
      sourceRefs,
      suggested_files: suggestedFiles,
      confidence: Number((topChunks[0]?.score ?? 0).toFixed(3)),
      retrieval_path: retrievalPath,
      tool_trace: retrievalPath,
    };
  }

  type AtlasPrefetchInput = {
    path?: string;
    query: string;
    limit: number;
    activityLimit: number;
    includeCommunity: boolean;
    includeNotecards: boolean;
    includeAgentsMd: boolean;
  };

  const atlasPrefetchInputSchema = z.object({
    query: z.string().describe('What you are about to work on (code path, feature, question)'),
    path: z
      .string()
      .optional()
      .describe('Optional file or directory path to keep the packet local'),
    limit: z.number().int().min(1).max(10).default(4).describe('Max context items per lane'),
    activityLimit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(24)
      .describe('How many recent activity log lines to inspect'),
    includeCommunity: z.boolean().default(true).describe('Include community graph context'),
    includeNotecards: z.boolean().default(true).describe('Include notecard search hits'),
    includeAgentsMd: z.boolean().default(true).describe('Include nearest AGENTS.md quick hits'),
  });

  async function loadAtlasCompactContext(options: AtlasPrefetchInput) {
    const packet = await buildFeaturePrefetchContext(options);
    return buildAtlasCompactContext(packet);
  }

  // == kb.organize_messy_text ==================================================

  server.registerTool(
    'kb.organize_messy_text',
    {
      description: 'Organize messy text into structured entities and sections.',
      inputSchema: z.object({
        text: z.string().describe('The messy text blob to organize'),
        query: z.string().optional().describe('Relevance query (e.g. "key legal facts")'),
      }),
    },
    async ({ text, query }) => {
      try {
        // 1. Extract using the native TS heuristic (Regex + Entity detection)
        const doc = extractDocumentNative(text, 'mcp-organize-task');

        // 2. If a query is provided, rerank the extracted entities/sections
        let organized: any = {
          entities: doc.entities,
          sections: doc.sections,
          summary: `Extracted ${doc.entities.length} entities and ${doc.sections.length} sections.`,
        };

        if (query && doc.entities.length > 0) {
          const documents = doc.entities.map((e) => `[${e.type}] ${e.text}`);
          const res = await fetch(`${config.rerankUrl}/rerank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, documents, top_n: 15 }),
          });

          if (res.ok) {
            const data = await res.json();
            organized.reranked_entities = data.results?.map((r: any) => ({
              ...doc.entities[r.index],
              relevance_score: r.relevance_score,
            }));
            organized.summary += ` Reranked top ${organized.reranked_entities.length} entities for query: "${query}"`;
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(organized, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Organization failed: ${err}` }],
          isError: true,
        };
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
      }),
    },
    async ({ text }) => {
      const doc = extractDocumentNative(text, 'mcp-citation-task');
      const citations = doc.entities.filter((e) => e.type === 'citation' || e.type === 'statute');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(citations, null, 2) }],
      };
    }
  );

  // == kb.trace_search ========================================================

  async function handleTraceSearch({
    query,
    limit,
    intent,
  }: {
    query: string;
    limit: number;
    intent?: string[];
  }) {
    try {
      const emb = await generateEmbedding(query);
      if (!emb) {
        return {
          content: [{ type: 'text' as const, text: 'Embedding service unavailable' }],
          isError: true,
        };
      }

      const hits = await traceRerank({
        query,
        queryEmbedding: emb,
        limit,
        intentOverride: intent,
      });

      const results = hits.map((h) => ({
        id: h.id,
        score: h.score,
        path: h.payload?.path,
        content: (h.payload?.content ?? '').slice(0, 1000),
        lenses: h.lenses,
        tags: h.payload?.tags,
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Trace search failed: ${err}` }],
        isError: true,
      };
    }
  }

  server.registerTool(
    'kb.trace_search',
    {
      description:
        'Search the hypergraph/KAG context for documents, cards, and relations matching a query.',
      inputSchema: z.object({
        query: z.string().describe('Technical query or coding problem'),
        limit: z.number().int().min(1).max(20).default(5).describe('Max results to return'),
        intent: z
          .array(z.string())
          .optional()
          .describe('Lenses: purpose, risk, api_surface, dependencies, retrieval_role'),
      }),
    },
    handleTraceSearch
  );

  server.registerTool(
    'atlas.query',
    {
      description:
        'Atlas alias for ranked technical search. Returns the same compact hit list as kb.trace_search for a query.',
      inputSchema: z.object({
        query: z.string().describe('Technical query or coding problem'),
        limit: z.number().int().min(1).max(20).default(5).describe('Max results to return'),
        intent: z
          .array(z.string())
          .optional()
          .describe('Lenses: purpose, risk, api_surface, dependencies, retrieval_role'),
      }),
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
        }),
      },
      handleTraceSearch
    );
  }

  // == kb.wiki_note_lookup ====================================================

  async function handleWikiLookup({ query, limit }: { query: string; limit: number }) {
    try {
      const notes = await lookupWikiNotes(query, limit);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Wiki lookup failed: ${err}` }],
        isError: true,
      };
    }
  }

  server.registerTool(
    'kb.wiki_note_lookup',
    {
      description: 'Look up notes in the wiki.',
      inputSchema: z.object({
        query: z.string().describe('Directory name, tag, or topic to look up'),
        limit: z.number().int().min(1).max(20).default(5),
      }),
    },
    handleWikiLookup
  );

  if (enableLegacy) {
    server.registerTool(
      'wiki_note_lookup',
      {
        description:
          'DEPRECATED bare-name alias for kb.wiki_note_lookup. Gated by MCP_LEGACY_ALIASES.',
        inputSchema: z.object({
          query: z.string().describe('Directory name, tag, or topic to look up'),
          limit: z.number().int().min(1).max(20).default(5),
        }),
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
      }),
    },
    async ({ title, content, source, tags }) => {
      try {
        const res = await archiveSynthesisMemory({ title, content, source, tags });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(res, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Archiving failed: ${err}` }],
          isError: true,
        };
      }
    }
  );

  // == context.prefetch_feature_context ======================================

  server.registerTool(
    'context.prefetch_feature_context',
    {
      description:
        'Build a prefetch packet for the next feature edit using recent activity, directory KAG context, community graph context, AGENTS.md quick hits, and notecard search results.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Optional file or directory path for the feature to prefetch'),
        query: z.string().optional().describe('Optional natural-language query or feature name'),
        limit: z.number().int().min(1).max(10).default(4).describe('Max context items to return'),
        activityLimit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(24)
          .describe('How many recent activity log lines to inspect'),
        includeCommunity: z.boolean().default(true).describe('Include community graph context'),
        includeNotecards: z.boolean().default(true).describe('Include notecard search hits'),
        includeAgentsMd: z.boolean().default(true).describe('Include nearest AGENTS.md quick hits'),
      }),
    },
    async ({
      path,
      query,
      limit,
      activityLimit,
      includeCommunity,
      includeNotecards,
      includeAgentsMd,
    }) => {
      try {
        if (!path && !query) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'context.prefetch_feature_context requires either path or query.',
              },
            ],
            isError: true,
          };
        }

        const packet = await buildFeaturePrefetchContext({
          path,
          query,
          limit,
          activityLimit,
          includeCommunity,
          includeNotecards,
          includeAgentsMd,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(packet, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text' as const, text: `context.prefetch_feature_context failed: ${err}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'atlas.compact_context',
    {
      description:
        'Build a compact Atlas context packet with top chunks, sourceRefs, a compressed summary, confidence, and retrieval path.',
      inputSchema: atlasPrefetchInputSchema,
    },
    async (options) => {
      try {
        const packet = await loadAtlasCompactContext(options);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(buildAtlasCompactContext(packet), null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `atlas.compact_context failed: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'atlas.source_refs',
    {
      description: 'Return the top sourceRefs from the compact Atlas packet.',
      inputSchema: atlasPrefetchInputSchema,
    },
    async (options) => {
      try {
        const packet = await loadAtlasCompactContext(options);
        const compact = buildAtlasCompactContext(packet);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query: compact.query,
                  sourceRefs: compact.sourceRefs,
                  confidence: compact.confidence,
                  retrieval_path: compact.retrieval_path,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `atlas.source_refs failed: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'atlas.suggest_files',
    {
      description: 'Return the top suggested files from the compact Atlas packet.',
      inputSchema: atlasPrefetchInputSchema,
    },
    async (options) => {
      try {
        const packet = await loadAtlasCompactContext(options);
        const compact = buildAtlasCompactContext(packet);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query: compact.query,
                  suggested_files: compact.suggested_files,
                  confidence: compact.confidence,
                  retrieval_path: compact.retrieval_path,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `atlas.suggest_files failed: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'atlas.explain_trace',
    {
      description: 'Return the compact summary and retrieval path for the current Atlas packet.',
      inputSchema: atlasPrefetchInputSchema,
    },
    async (options) => {
      try {
        const packet = await loadAtlasCompactContext(options);
        const compact = buildAtlasCompactContext(packet);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query: compact.query,
                  summary: compact.summary,
                  confidence: compact.confidence,
                  retrieval_path: compact.retrieval_path,
                  tool_trace: compact.tool_trace,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `atlas.explain_trace failed: ${err}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'atlas.get_chunk',
    {
      description:
        'Return a chunk from the compact Atlas chunk index, optionally prioritizing a chunkId, chunkIndex, or sourceRef.',
      inputSchema: atlasPrefetchInputSchema.extend({
        chunkId: z
          .string()
          .optional()
          .describe('Optional chunkId from atlas.compact_context.chunk_index'),
        chunkIndex: z
          .number()
          .int()
          .min(0)
          .max(7)
          .optional()
          .describe('Optional zero-based chunk index within the compact Atlas packet'),
        sourceRef: z
          .string()
          .optional()
          .describe('Optional sourceRef to prioritize when selecting a chunk'),
      }),
    },
    async ({ chunkId, chunkIndex, sourceRef, ...options }) => {
      try {
        const packet = await loadAtlasCompactContext(options);
        const compact = buildAtlasCompactContext(packet);
        const index = compact.chunk_index;
        const prioritizedChunk = chunkId
          ? index.find((chunk) => chunk.chunkId === chunkId)
          : typeof chunkIndex === 'number'
            ? (index[chunkIndex] ?? null)
            : sourceRef
              ? index.find((chunk) => chunk.sourceRef === sourceRef)
              : (index[0] ?? null);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query: compact.query,
                  chunkId: chunkId ?? null,
                  chunkIndex: typeof chunkIndex === 'number' ? chunkIndex : null,
                  sourceRef: sourceRef ?? null,
                  chunk: prioritizedChunk ?? null,
                  chunk_index: compact.chunk_index,
                  top_chunks: compact.top_chunks.slice(0, 5),
                  sourceRefs: compact.sourceRefs,
                  confidence: compact.confidence,
                  retrieval_path: compact.retrieval_path,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `atlas.get_chunk failed: ${err}` }],
          isError: true,
        };
      }
    }
  );
}
