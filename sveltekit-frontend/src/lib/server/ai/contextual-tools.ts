/**
 * Shared contextual tool definitions and executor for agentic chat endpoints.
 * Used by /api/sse/chat and /api/contextual/chat.
 *
 * Uses SIMD JSON parsing for Ollama response deserialization (fastJsonParse)
 * and Zod schema validation for tool call arguments.
 */
import {
	completeToolParameters,
	shouldUseWebSearchFallback,
	type ToolExecutionPolicyContext,
} from '$lib/server/ace/policy.js';
import { z } from 'zod';

export interface ContextualToolResult {
	ok: boolean;
	tool: string;
	result: string;
	durationMs: number;
	metadata?: Record<string, unknown>;
}

/** Ollama native function-calling tool definitions */
export const CONTEXTUAL_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'glossary_search',
      description:
        'Search the legal glossary for term definitions and legal concepts. Use when the user asks "what is [term]?", "define [term]", or needs clarification on legal terminology.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Legal term or concept to look up' },
          limit: { type: 'number', description: 'Max results (default: 5)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'rag_search',
      description:
        'Semantic search through legal documents using vector similarity. Use to find relevant evidence, case documents, or legal precedents.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Semantic search query' },
          limit: { type: 'number', description: 'Max results (default: 5)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for legal research, case law, or documentation.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxResults: { type: 'number', description: 'Max results (default: 5)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'graph_expand',
      description:
        'Expand retrieval using the knowledge graph. Given an evidence or case ID, find related documents through graph connections (KAG neighbors). Use when the user asks about related evidence, connections between documents, or wants to explore relationships.',
      parameters: {
        type: 'object',
        required: ['caseId'],
        properties: {
          caseId: { type: 'string', description: 'Case UUID to expand graph from' },
          limit: { type: 'number', description: 'Max neighbors (default: 8)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'authority_drill',
      description:
        'Drill down into cited statutes and case precedents. Given a legal citation or statute reference, find the full text and related authorities. Use when the user asks about specific statutes, precedents, or wants deeper analysis of cited law.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'Statute code, case citation, or legal concept to drill into',
          },
          maxHops: { type: 'number', description: 'Max citation hops (default: 2)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'case_search',
      description:
        'Search for similar cases by description or legal issue. Returns matching cases with similarity scores. Use when the user asks to find related cases, similar precedents, or case patterns.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Case description or legal issue to search for' },
          limit: { type: 'number', description: 'Max results (default: 5)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'crawl_web_research',
      description:
        'Trigger a live web search crawl on a research query, summarise top results with gemma4-legal, ' +
        'and index them in the glyph cache. Use when the user wants fresh web research on a legal topic, ' +
        'case law updates, or news relevant to their case. Results are also persisted for future searches.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Research query to crawl' },
          pipeline: {
            type: 'string',
            description: 'Pipeline label: ace|rag|kag|dag|codebase (default: ace)',
          },
          maxResults: {
            type: 'number',
            description: 'Max web results to fetch (default: 5, max: 10)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'crawl_legal_corpus',
      description:
        'Search the local legal corpus (Legal Canon, Court Opinions, Context Documents) using vector similarity, ' +
        'then summarise top chunks with gemma4-legal. Use for offline legal research across authoritative ' +
        'primary sources plus nearby contextual local documents from the indexed Qdrant collections.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Legal research query' },
          pipeline: {
            type: 'string',
            description: 'Pipeline label: ace|rag|kag|dag|codebase (default: ace)',
          },
          maxResults: {
            type: 'number',
            description: 'Max chunks per collection (default: 4, max: 8)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'face_identify',
      description:
        'Identify or match a person of interest by face using gemma4 VLM multi-pass reranking. ' +
        'Pass 1: 768-dim face embedding cosine similarity. ' +
        'Pass 2: VLM visual reasoning ("same person?"). ' +
        'Pass 3: GRPO reward fusion (0.25 embed + 0.75 VLM confidence). ' +
        'Use when the user asks "who is this person?", "find photos of X", or needs identity matching across POI database.',
      parameters: {
        type: 'object',
        required: ['poiId'],
        properties: {
          poiId: { type: 'string', description: 'Reference POI UUID to match against all others' },
          limit: { type: 'number', description: 'Max candidates to evaluate (default: 10)' },
          passes: {
            type: 'number',
            description: 'Reranking passes: 1 (embed only), 2 (+ VLM), 3 (+ GRPO) — default 3',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'face_identify',
      description:
        'Identify or match a person of interest by face using gemma4 VLM multi-pass GRPO reranking. ' +
        'Pass 1: 768-dim face embedding cosine similarity (fast, ~5ms). ' +
        'Pass 2: gemma4-legal-vlm visual reasoning — "same person?" → confidence 0-100. ' +
        'Pass 3: GRPO reward fusion — 0.25 × embedding + 0.75 × VLM confidence. ' +
        'Use when the user asks "who is this person?", "find matching faces", or needs POI identity matching. ' +
        'Returns ranked candidates with per-pass scores and VLM reasoning snippets.',
      parameters: {
        type: 'object',
        required: ['poiId'],
        properties: {
          poiId: { type: 'string', description: 'Reference POI UUID to match against all others' },
          limit: {
            type: 'number',
            description: 'Max candidates to evaluate (default: 10, max: 30)',
          },
          passes: {
            type: 'number',
            description: 'Reranking passes: 1=embed, 2=+VLM, 3=+GRPO (default: 3)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'research_glyph_search',
      description:
        'Fast parallel cache search over minified research summaries using GPU cosine reranking. ' +
        'Searches L1 Redis → L2 in-process LRU → L3 Qdrant ANN in parallel. ' +
        'Use when the user asks about prior research, past summaries, web crawl results, or corpus analysis. ' +
        'Returns top matching glyphs with attention scores and shared tag context.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Research query or topic to search' },
          pipeline: {
            type: 'string',
            description: 'Filter by pipeline: ace|rag|kag|dag|codebase|all (default: all)',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Entity tags to filter by (AND semantics)',
          },
          topK: { type: 'number', description: 'Max results (default: 8)' },
        },
      },
    },
  },
] as const;

const TOOL_TIMEOUT_MS: Record<string, number> = {
  glossary_search: 3_000,
  rag_search: 6_000,
  web_search: 8_000,
  graph_expand: 6_000,
  authority_drill: 8_000,
  case_search: 6_000,
  crawl_web_research: 25_000, // web search + LLM summarization
  crawl_legal_corpus: 20_000, // Qdrant hybrid + LLM summarization
  research_glyph_search: 4_000, // parallel L1-L3 + GPU rerank
  face_identify: 90_000, // gemma4 VLM × top-10 candidates (3-pass GRPO)
};

// ── Zod schemas for tool call argument validation ─────────────────────

const TOOL_ARG_SCHEMAS: Record<string, z.ZodType> = {
  glossary_search: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  rag_search: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  web_search: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(10).optional(),
  }),
  graph_expand: z.object({
    caseId: z.string().uuid(),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  authority_drill: z.object({
    query: z.string().min(1),
    maxHops: z.number().int().min(1).max(4).optional(),
  }),
  case_search: z.object({
    query: z.string().min(1),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  crawl_web_research: z.object({
    query: z.string().min(1).max(400),
    pipeline: z.string().max(20).optional(),
    maxResults: z.number().int().min(1).max(10).optional(),
  }),
  crawl_legal_corpus: z.object({
    query: z.string().min(1).max(400),
    pipeline: z.string().max(20).optional(),
    maxResults: z.number().int().min(1).max(8).optional(),
  }),
  research_glyph_search: z.object({
    query: z.string().min(1).max(400),
    pipeline: z.string().max(20).optional(),
    tags: z.array(z.string().max(60)).max(12).optional(),
    topK: z.number().int().min(1).max(12).optional(),
  }),
  face_identify: z.object({
    poiId: z.string().uuid(),
    limit: z.number().int().min(1).max(30).optional(),
    passes: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  }),
};

/** Validate tool call arguments against Zod schema. Returns sanitized args or null. */
function validateToolArgs(
  name: string,
  args: Record<string, unknown>
): Record<string, unknown> | null {
  const schema = TOOL_ARG_SCHEMAS[name];
  if (!schema) return args; // Unknown tool — pass through
  const result = schema.safeParse(args);
  if (result.success) return result.data as Record<string, unknown>;
  return null; // Invalid args
}

/** Execute a contextual tool call and return a normalized result */
export async function executeContextualTool(
  name: string,
  args: Record<string, unknown>,
  policyContext: ToolExecutionPolicyContext = {}
): Promise<ContextualToolResult> {
  const start = Date.now();
  const timeout = TOOL_TIMEOUT_MS[name] ?? 5_000;
  const completion = completeToolParameters(name, args, policyContext);
  args = completion.args;
  const metadata = {
    parameterCompletion: completion,
    retrievalConfidence: policyContext.retrievalConfidence ?? null,
  };
  if (name === 'web_search' && !shouldUseWebSearchFallback(policyContext.retrievalConfidence)) {
    return {
      ok: true,
      tool: name,
      result: 'Skipped web search because local retrieval confidence was already sufficient.',
      durationMs: Date.now() - start,
      metadata,
    };
  }
  if (completion.missing.length > 0) {
    return {
      ok: false,
      tool: name,
      result: `Missing required parameter(s): ${completion.missing.join(', ')}`,
      durationMs: Date.now() - start,
      metadata,
    };
  }
  try {
    switch (name) {
      case 'glossary_search': {
        const { fetchGlossaryMatches } = await import('$lib/server/ace/context-assembler.js');
        const matches = (await Promise.race([
          fetchGlossaryMatches(String(args.query || '')),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ])) as Awaited<ReturnType<typeof fetchGlossaryMatches>>;
        if (!matches || matches.length === 0)
          return {
            ok: true,
            tool: name,
            result: 'No glossary matches found.',
            durationMs: Date.now() - start,
            metadata,
          };
        const result = matches
          .slice(0, Number(args.limit ?? 5))
          .map(
            (m: Record<string, any>) =>
              `**${m.term}**: ${m.definition.slice(0, 300)}${m.category ? ` (${m.category})` : ''}`
          )
          .join('\n\n');
        return { ok: true, tool: name, result, durationMs: Date.now() - start, metadata };
      }
      case 'rag_search': {
        const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
        const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
        const queryText = String(args.query || '');
        const embResult = (await Promise.race([
          generateEmbeddings([queryText]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ])) as Awaited<ReturnType<typeof generateEmbeddings>>;
        if (!embResult.vectors[0]?.length)
          return {
            ok: false,
            tool: name,
            result: 'Failed to generate embedding.',
            durationMs: Date.now() - start,
            metadata,
          };
        const searchResult = await qdrant.hybridSearch({
          query: queryText,
          queryEmbedding: embResult.vectors[0],
          collection: 'documents' as string,
          limit: Number(args.limit ?? 3),
          scoreThreshold: 0.5,
        });
        const result =
          searchResult.results
            .map(
              (r: Record<string, any>, i: number) =>
                `${i + 1}. [${(r.score * 100).toFixed(0)}%] ${r.payload?.title || 'Untitled'}\n   ${(r.payload?.content || '').slice(0, 150)}`
            )
            .join('\n\n') || 'No relevant documents found.';
        return { ok: true, tool: name, result, durationMs: Date.now() - start, metadata };
      }
      case 'web_search': {
        const { webSearch, formatWebSearchResults } = await import('$lib/server/agent/tools/web-search.js');
        const searchResult = await Promise.race([
          webSearch({
            query: String(args.query || ''),
            maxResults: Number(args.maxResults ?? 5),
            searchType: 'general',
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ]);
        return {
          ok: true,
          tool: name,
          result: formatWebSearchResults(searchResult as Awaited<ReturnType<typeof webSearch>>),
          durationMs: Date.now() - start,
          metadata,
        };
      }
      case 'graph_expand': {
        const { getCaseGraphNeighborIds } = await import('$lib/server/retrieval/graph-context.js');
        const caseId = String(args.caseId || '');
        if (!caseId)
          return {
            ok: false,
            tool: name,
            result: 'Missing caseId',
            durationMs: Date.now() - start,
            metadata,
          };
        const neighbors = await Promise.race([
          getCaseGraphNeighborIds(caseId),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ]);
        if (!neighbors || (neighbors as any[]).length === 0)
          return {
            ok: true,
            tool: name,
            result: 'No graph neighbors found for this case.',
            durationMs: Date.now() - start,
            metadata,
          };
        const graphLimit = Number(args.limit ?? 8);
        const graphResult = (neighbors as any[])
          .slice(0, graphLimit)
          .map(
            (n: any) =>
              `- **${n.title || n.nodeId}** (${n.relationship || 'related'})${n.score ? ` — strength: ${Number(n.score).toFixed(2)}` : ''}`
          )
          .join('\n');
        return {
          ok: true,
          tool: name,
          result: `## Graph Neighbors (${(neighbors as any[]).length} found)\n${graphResult}`,
          durationMs: Date.now() - start,
          metadata,
        };
      }
      case 'authority_drill': {
        const { authorityChainExpansion } = await import(
          '$lib/server/retrieval/authority-chain.js'
        );
        const { generateEmbeddings: genEmbed } = await import(
          '$lib/server/grpc/embedding-client.js'
        );
        const { ENV: env } = await import('$lib/server/env.server.js');
        const authQuery = String(args.query || '');
        if (!authQuery)
          return {
            ok: false,
            tool: name,
            result: 'Missing query',
            durationMs: Date.now() - start,
            metadata,
          };
        const authEmb = (await Promise.race([
          genEmbed([authQuery]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ])) as Awaited<ReturnType<typeof genEmbed>>;
        if (!authEmb.vectors[0]?.length)
          return {
            ok: false,
            tool: name,
            result: 'Failed to generate embedding.',
            durationMs: Date.now() - start,
            metadata,
          };
        const embedFn = async (text: string) => {
          const r = await genEmbed([text]);
          return r.vectors[0] ?? null;
        };
        const seedDocs = [{ content: authQuery, similarity: 1.0, documentId: 'query' }];
        const authResult = await authorityChainExpansion(authEmb.vectors[0], seedDocs, embedFn, {
          qdrantUrl: env.QDRANT_URL,
          maxHops: Number(args.maxHops ?? 2),
        });
        if (authResult.expanded === 0)
          return {
            ok: true,
            tool: name,
            result: 'No authority sources found for this citation.',
            durationMs: Date.now() - start,
            metadata,
          };
        const authLines = authResult.docs
          .filter((d: any) => d.documentId !== 'query')
          .slice(0, 6)
          .map(
            (d: any, i: number) =>
              `${i + 1}. [${(d.similarity * 100).toFixed(0)}%] ${d.content.slice(0, 300)}`
          )
          .join('\n\n');
        const statutes = authResult.authorities.statutes.join(', ') || 'none';
        const cases = authResult.authorities.cases.join(', ') || 'none';
        return {
          ok: true,
          tool: name,
          result: `## Authority Chain (${authResult.hops} hop(s), ${authResult.expanded} sources)\nStatutes: ${statutes}\nCases: ${cases}\n\n${authLines}`,
          durationMs: Date.now() - start,
          metadata,
        };
      }
      case 'case_search': {
        const { generateEmbeddings: genEmbCS } = await import(
          '$lib/server/grpc/embedding-client.js'
        );
        const { ENV: envCS } = await import('$lib/server/env.server.js');
        const csQuery = String(args.query || '');
        if (!csQuery)
          return {
            ok: false,
            tool: name,
            result: 'Missing query',
            durationMs: Date.now() - start,
            metadata,
          };
        const csEmb = (await Promise.race([
          genEmbCS([csQuery]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), timeout)
          ),
        ])) as Awaited<ReturnType<typeof genEmbCS>>;
        if (!csEmb.vectors[0]?.length)
          return {
            ok: false,
            tool: name,
            result: 'Failed to generate embedding.',
            durationMs: Date.now() - start,
            metadata,
          };
        const searchRes = await fetch(`${envCS.QDRANT_URL}/collections/legal_cases/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: csEmb.vectors[0],
            limit: Number(args.limit ?? 5),
            with_payload: true,
            score_threshold: 0.3,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!searchRes.ok)
          return {
            ok: false,
            tool: name,
            result: 'Case search failed.',
            durationMs: Date.now() - start,
            metadata,
          };
        const csData = await searchRes.json();
        const csResults = csData.result ?? [];
        if (csResults.length === 0)
          return {
            ok: true,
            tool: name,
            result: 'No similar cases found.',
            durationMs: Date.now() - start,
            metadata,
          };
        const csLines = csResults
          .slice(0, Number(args.limit ?? 5))
          .map((r: any, i: number) => {
            const p = r.payload || {};
            return `${i + 1}. [${(r.score * 100).toFixed(0)}%] **${p.title || p.case_title || 'Untitled'}**${p.jurisdiction ? ` (${p.jurisdiction})` : ''}${p.status ? ` — ${p.status}` : ''}\n   ${(p.description || p.content || '').slice(0, 200)}`;
          })
          .join('\n\n');
        return {
          ok: true,
          tool: name,
          result: `## Similar Cases (${csResults.length} found)\n${csLines}`,
          durationMs: Date.now() - start,
          metadata,
        };
      }

      case 'research_glyph_search': {
        // Parallel L1-L3 cache + GPU attention rerank over minified research glyphs
        const { glyphSearch } = await import('$lib/server/analytics/minified-research-cache.js');
        const { generateEmbeddings: genGE } = await import('$lib/server/grpc/embedding-client.js');

        const glQuery = String(args.query || '');
        const glPipeline = String(args.pipeline ?? 'all');
        const glTags = Array.isArray(args.tags) ? args.tags.map(String) : [];
        const glTopK = Math.min(12, Math.max(1, Number(args.topK ?? 8)));

        if (!glQuery)
          return {
            ok: false,
            tool: name,
            result: 'Missing query',
            durationMs: Date.now() - start,
            metadata,
          };

        // FNV-1a query hash (same algorithm as research-summaries-db)
        let glHash = 2166136261;
        for (let i = 0; i < Math.min(glQuery.length, 512); i++) {
          glHash ^= glQuery.charCodeAt(i);
          glHash = Math.imul(glHash, 16777619) >>> 0;
        }
        const queryHash = glHash.toString(16).padStart(8, '0');

        // Embed query (non-blocking race with timeout)
        let queryEmbedding: Float32Array | null = null;
        try {
          const embResult = (await Promise.race([
            genGE([glQuery]),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2_500)),
          ])) as Awaited<ReturnType<typeof genGE>>;
          if (embResult.vectors[0]?.length === 768)
            queryEmbedding = new Float32Array(embResult.vectors[0]);
        } catch {
          /* fallback to DB-only search */
        }

        const result = await glyphSearch({
          queryText: glQuery,
          queryHash,
          queryEmbedding,
          tags: glTags.length ? glTags : undefined,
          pipeline: glPipeline !== 'all' ? glPipeline : undefined,
          topK: glTopK,
        });

        if (!result.glyphs.length)
          return {
            ok: true,
            tool: name,
            result: 'No research summaries found for this query.',
            durationMs: Date.now() - start,
            metadata,
          };

        const lines = result.glyphs
          .map((g, i) => {
            const pct = (g.score * 100).toFixed(0);
            const cache = result.cacheLevel.replace('l3-', 'L3/');
            return `${i + 1}. [${pct}% · ${cache}] **${g.summary.slice(0, 120)}**\n   Pipeline: ${g.pipeline} · Tags: ${[...g.tagMask.toString(2)].filter((c) => c === '1').length} matched`;
          })
          .join('\n\n');

        const tagCtx = result.tagMatches.length
          ? `\nShared tags: ${result.tagMatches.slice(0, 6).join(', ')}`
          : '';

        return {
          ok: true,
          tool: name,
          result: `## Research Glyph Search (${result.total} indexed · ${result.hitMs}ms · ${result.cacheLevel})\n${lines}${tagCtx}`,
          durationMs: Date.now() - start,
          metadata: { cacheLevel: result.cacheLevel, hitMs: result.hitMs, total: result.total },
        };
      }

      case 'crawl_web_research': {
        const { crawlWebResearch } = await import('$lib/server/analytics/web-research-crawler.js');
        const cwQuery = String(args.query || '');
        const cwPipeline = String(args.pipeline ?? 'ace');
        const cwMaxResults = Math.min(10, Math.max(1, Number(args.maxResults ?? 5)));
        if (!cwQuery)
          return {
            ok: false,
            tool: name,
            result: 'Missing query',
            durationMs: Date.now() - start,
            metadata,
          };
        const batch = await crawlWebResearch(cwQuery, cwPipeline, cwMaxResults);
        if (!batch.summaries.length)
          return {
            ok: true,
            tool: name,
            result: 'No web results found for this query.',
            durationMs: Date.now() - start,
            metadata,
          };
        const lines = batch.summaries
          .slice(0, 5)
          .map((s, i) => {
            const pct = (s.relevanceScore * 100).toFixed(0);
            const tag = s.entityTags.slice(0, 3).join(', ') || '—';
            return `${i + 1}. [${pct}%${s.snippetOnly ? ' · snippet' : ' · summarized'}] **${s.title.slice(0, 100)}**\n   ${s.summary.slice(0, 200)}\n   Tags: ${tag} · Source: ${s.provider}`;
          })
          .join('\n\n');
        return {
          ok: true,
          tool: name,
          result: `## Web Research: "${cwQuery}" (${batch.summaries.length} results · ${batch.searchMs}ms)\n${lines}`,
          durationMs: Date.now() - start,
          metadata: {
            provider: batch.provider,
            searchMs: batch.searchMs,
            indexed: batch.summaries.length,
          },
        };
      }

      case 'crawl_legal_corpus': {
        const { crawlLegalCorpus } = await import('$lib/server/analytics/web-research-crawler.js');
        const clQuery = String(args.query || '');
        const clPipeline = String(args.pipeline ?? 'ace');
        const clMaxResults = Math.min(8, Math.max(1, Number(args.maxResults ?? 4)));
        if (!clQuery)
          return {
            ok: false,
            tool: name,
            result: 'Missing query',
            durationMs: Date.now() - start,
            metadata,
          };
        const batch = await crawlLegalCorpus(clQuery, clPipeline, clMaxResults);
        if (!batch.summaries.length)
          return {
            ok: true,
            tool: name,
            result: 'No corpus results found for this query.',
            durationMs: Date.now() - start,
            metadata,
          };
        const lines = batch.summaries
          .slice(0, 6)
          .map((s, i) => {
            const pct = (s.relevanceScore * 100).toFixed(0);
            const cite = s.citationLabel ? ` · ${s.citationLabel.slice(0, 60)}` : '';
            const jur = s.jurisdiction ? ` (${s.jurisdiction})` : '';
            return `${i + 1}. [${pct}%] **${s.collectionLabel}${jur}**${cite}\n   ${s.summary.slice(0, 250)}`;
          })
          .join('\n\n');
        return {
          ok: true,
          tool: name,
          result: `## Legal Corpus: "${clQuery}" (${batch.summaries.length} chunks · ${batch.searchMs}ms)\nCollections: ${batch.collections.join(', ')}\n\n${lines}`,
          durationMs: Date.now() - start,
          metadata: {
            collections: batch.collections,
            searchMs: batch.searchMs,
            indexed: batch.summaries.length,
          },
        };
      }

      case 'face_identify': {
        // GRPO multi-pass face matching via gemma4 VLM.
        // Calls face-rerank logic directly (no HTTP round-trip — server-side).
        const poiId = String(args.poiId ?? '');
        if (!poiId)
          return {
            ok: false,
            tool: name,
            result: 'Missing poiId',
            durationMs: Date.now() - start,
            metadata,
          };

        const { db } = await import('$lib/server/db/client');
        const { personsOfInterest, poiPhotos } = await import('$lib/server/db/schema-postgres.js');
        const { and, eq, ne, isNull, or, desc, sql } = await import('drizzle-orm');
        const { ollamaFetch } = await import('$lib/server/ollama.js');
        const { ENV: env } = await import('$lib/server/env.server.js');

        const limit = Math.min(30, Math.max(1, Number(args.limit ?? 10)));
        const passes = Math.min(3, Math.max(1, Number(args.passes ?? 3))) as 1 | 2 | 3;

        // Load reference POI
        const [refPoi] = await db
          .select({ id: personsOfInterest.id, name: personsOfInterest.name })
          .from(personsOfInterest)
          .where(eq(personsOfInterest.id, poiId))
          .limit(1);

        if (!refPoi)
          return {
            ok: true,
            tool: name,
            result: 'POI not found.',
            durationMs: Date.now() - start,
            metadata,
          };

        // Reference photo embedding + thumbnail
        const [refPhoto] = await db
          .select({ faceEmbedding: poiPhotos.faceEmbedding, thumbnailUrl: poiPhotos.thumbnailUrl })
          .from(poiPhotos)
          .where(eq(poiPhotos.poiId, poiId))
          .orderBy(desc(poiPhotos.uploadedAt))
          .limit(1);

        const refEmb: number[] | null =
          Array.isArray(refPhoto?.faceEmbedding) && refPhoto.faceEmbedding.length === 768
            ? (refPhoto.faceEmbedding as number[])
            : null;

        // Cosine similarity (Pass 1)
        function cosine(a: number[], b: number[]): number {
          let dot = 0,
            na = 0,
            nb = 0;
          for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
          }
          return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
        }

        // Load candidates
        const candidates = await db
          .select({ id: personsOfInterest.id, name: personsOfInterest.name })
          .from(personsOfInterest)
          .where(and(ne(personsOfInterest.id, poiId), or(isNull(personsOfInterest.createdBy))))
          .limit(limit);

        const candIds = candidates.map((c: { id: string }) => c.id);
        const candPhotos =
          candIds.length > 0
            ? await db
                .select({
                  poiId: poiPhotos.poiId,
                  faceEmbedding: poiPhotos.faceEmbedding,
                  thumbnailUrl: poiPhotos.thumbnailUrl,
                })
                .from(poiPhotos)
                .where(sql`${poiPhotos.poiId} = ANY(${candIds})`)
                .orderBy(desc(poiPhotos.uploadedAt))
            : [];

        const photoMap = new Map<string, { emb: number[] | null; thumb: string | null }>();
        for (const p of candPhotos) {
          if (p.poiId && !photoMap.has(p.poiId)) {
            photoMap.set(p.poiId, {
              emb:
                Array.isArray(p.faceEmbedding) && (p.faceEmbedding as number[]).length === 768
                  ? (p.faceEmbedding as number[])
                  : null,
              thumb: p.thumbnailUrl ?? null,
            });
          }
        }

        type Match = {
          poiId: string;
          name: string;
          pass1: number;
          pass2: number;
          grpo: number;
          reasoning: string;
        };
        const matches: Match[] = candidates.map((c: { id: string; name: string | null }) => {
          const photo = photoMap.get(c.id);
          const p1 = refEmb && photo?.emb ? (cosine(refEmb, photo.emb) + 1) / 2 : 0;
          return {
            poiId: c.id,
            name: c.name ?? 'Unknown',
            pass1: p1,
            pass2: 0,
            grpo: 0,
            reasoning: '',
          };
        });

        matches.sort((a, b) => b.pass1 - a.pass1);

        // Pass 2: VLM reasoning on top-5
        if (passes >= 2 && refPhoto?.thumbnailUrl) {
          const OLLAMA = env.OLLAMA_BASE_URL.replace(/\/$/, '');
          const model = env.OLLAMA_VLM_MODEL ?? env.GEMMA4_MODEL ?? 'gemma4-legal-vlm:latest';

          async function fetchB64(url: string): Promise<string | null> {
            try {
              const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
              if (!r.ok) return null;
              return Buffer.from(await r.arrayBuffer()).toString('base64');
            } catch {
              return null;
            }
          }

          const refB64 = await fetchB64(refPhoto.thumbnailUrl);
          if (refB64) {
            await Promise.all(
              matches.slice(0, 5).map(async (m) => {
                const photo = photoMap.get(m.poiId);
                if (!photo?.thumb) return;
                const candB64 = await fetchB64(photo.thumb);
                if (!candB64) return;
                try {
                  const res = await ollamaFetch(`${OLLAMA}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model,
                      messages: [
                        {
                          role: 'user',
                          content: `Forensic face match. Reference: ${refPoi.name}, Candidate: ${m.name}. Same person? Reply only JSON: {"match":bool,"confidence":0-100,"reasoning":"1 sentence"}`,
                          images: [refB64, candB64],
                        },
                      ],
                      stream: false,
                      options: { temperature: 0.1, num_predict: 150 },
                    }),
                    signal: AbortSignal.timeout(55_000),
                  });
                  if (res.ok) {
                    const d = await res.json();
                    const txt: string = d?.message?.content ?? '';
                    const match = txt.match(/\{[\s\S]*?\}/);
                    if (match) {
                      const p = JSON.parse(match[0]);
                      m.pass2 = Math.min(100, Math.max(0, Number(p.confidence ?? 0))) / 100;
                      m.reasoning = String(p.reasoning ?? '').slice(0, 200);
                    }
                  }
                } catch {
                  /* VLM timeout — keep pass2=0 */
                }
              })
            );
          }
        }

        // Pass 3: GRPO reward fusion
        for (const m of matches) {
          m.grpo =
            passes === 1
              ? m.pass1
              : passes === 2
                ? 0.4 * m.pass1 + 0.6 * m.pass2
                : 0.25 * m.pass1 + 0.75 * m.pass2;
        }
        matches.sort((a, b) => b.grpo - a.grpo);

        const top = matches.slice(0, 5);
        const lines = top
          .map((m, i) => {
            const pct = (m.grpo * 100).toFixed(0);
            const v = passes >= 2 ? ` VLM:${(m.pass2 * 100).toFixed(0)}%` : '';
            return `${i + 1}. [GRPO:${pct}% Emb:${(m.pass1 * 100).toFixed(0)}%${v}] **${m.name}** (${m.poiId.slice(0, 8)})${m.reasoning ? `\n   ${m.reasoning}` : ''}`;
          })
          .join('\n\n');

        return {
          ok: true,
          tool: name,
          result: `## Face Identify — Reference: ${refPoi.name}\nPasses: ${passes} (gemma4 VLM + GRPO fusion)\n\n${lines || 'No candidates found.'}`,
          durationMs: Date.now() - start,
          metadata: { poiId, passes: String(passes), candidatesEvaluated: String(matches.length) },
        };
      }

      default:
        return {
          ok: false,
          tool: name,
          result: `Unknown tool: ${name}`,
          durationMs: Date.now() - start,
          metadata,
        };
    }
  } catch {
    return {
      ok: false,
      tool: name,
      result: `[${name} failed]`,
      durationMs: Date.now() - start,
      metadata,
    };
  }
}

/**
 * Run a pre-stream tool-detection pass via Ollama native function calling.
 * Returns tool results as context strings to inject into the system prompt.
 * Max 2 rounds, 3 total tool calls. Returns empty array if no tools needed.
 */
export async function runToolDetectionPass(
	ollamaUrl: string,
	modelName: string,
	systemPrompt: string,
	conversationHistory: Array<{ role: string; content: string }>,
	userMessage: string,
	keepAlive: string,
	policyContext: ToolExecutionPolicyContext = {}
): Promise<ContextualToolResult[]> {
	const MAX_TOOL_ROUNDS = 2;
	const MAX_TOTAL_TOOL_CALLS = 3;
	let toolRounds = 0;
	let totalToolCalls = 0;
	const allResults: ContextualToolResult[] = [];

	const messages: Array<{ role: string; content: string }> = [
		{ role: 'system', content: systemPrompt },
		...conversationHistory.slice(-10),
		{ role: 'user', content: userMessage },
	];

	const { ollamaFetch } = await import('$lib/server/ollama.js');

	while (toolRounds < MAX_TOOL_ROUNDS) {
		let res: Response;
		try {
			res = await ollamaFetch(`${ollamaUrl}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: modelName,
					messages,
					stream: false,
					tools: CONTEXTUAL_TOOLS,
					keep_alive: keepAlive,
					options: {
						temperature: 0.1,
						top_k: 20,
						top_p: 0.8,
						num_ctx: 4096,
						num_predict: 256, // Gemma 4 uses thinking tokens before tool calls
					},
				}),
				signal: AbortSignal.timeout(15_000),
			});
		} catch {
			// Timeout or network error — abort tool detection silently
			break;
		}

		if (!res.ok) break;

		let data: any;
		try {
			// Use SIMD JSON parsing for large Ollama responses (thinking tokens can be 10KB+)
			const rawText = await res.text();
			const { fastJsonParse } = await import('$lib/server/gpu/simdjson-bridge.js');
			data = fastJsonParse(rawText);
		} catch {
			break;
		}
		const toolCalls = data.message?.tool_calls;

		if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) break;

		messages.push({ role: 'assistant', content: data.message?.content || '' });

		for (const tc of toolCalls) {
			if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) break;
			const toolName = tc.function?.name;
			const rawArgs = tc.function?.arguments || {};
			if (!toolName) continue;

			// Validate arguments against Zod schema before execution
			const toolArgs = validateToolArgs(toolName, rawArgs);
			if (!toolArgs) {
				allResults.push({
					ok: false,
					tool: toolName,
					result: `Invalid tool arguments for ${toolName}`,
					durationMs: 0,
				});
				totalToolCalls++;
				messages.push({ role: 'tool', content: `Invalid arguments for ${toolName}` });
				continue;
			}

			const tr = await executeContextualTool(toolName, toolArgs, {
				...policyContext,
				message: policyContext.message ?? userMessage,
			});
			allResults.push(tr);
			totalToolCalls++;
			messages.push({ role: 'tool', content: tr.result });
		}

		toolRounds++;
	}

	return allResults;
}
