/**
 * Gemma4 Tool-Calling Agent
 *
 * Runs an agentic loop against Ollama's native tool-calling API
 * (gemma4-legal-vlm:latest — unified legal+VLM for tool-calling + agentic tasks).
 *
 * Loop:
 *   1. Send messages + tool definitions to /api/chat
 *   2. If response.message.tool_calls → invoke each tool in-process
 *   3. Append role:"tool" result messages → re-send
 *   4. Repeat until final text response or MAX_ROUNDS exceeded
 *
 * All tool dispatch is in-process — no HTTP round-trip to localhost:
 *   rag_search      → Qdrant hybrid search (research_summaries + legal_documents)
 *   case_search     → Postgres full-text case search
 *   memory_recall   → selectAdaptiveMemory() — hyperedge X_prime similarity
 *   hyperedge_stats → queryTopHyperedges() — top Grade A/B knowledge clusters
 *
 * Timeline events are written to context_timeline for every agent run
 * (eventType: 'tool_call') so the RL loop can learn which tool chains
 * produce high-quality answers.
 */

import {
  ollamaFetch,
  VLM_MODELS,
  getOllamaEndpoint,
  bifrostChat,
  turboQuantChat,
} from '$lib/server/ollama.js';
import { generateEmbedding }                           from '$lib/server/grpc/embedding-client.js';
import { qdrant }                                      from '$lib/server/vector/qdrant-manager.js';
import { selectAdaptiveMemory, queryTopHyperedges }    from '$lib/server/graph/hypergraph-4d.js';
import { queryTopology }                               from '$lib/server/retrieval/topology-search-client.js';
import { db, pool }                                    from '$lib/server/db/client';
import { contextTimeline }                             from '$lib/server/db/schema-postgres.js';
import { trackTokenUsage }                             from '$lib/server/ai/token-tracker.js';
import { ENV } from '$lib/server/env.server.js';
import fs from 'fs/promises';
import path from 'path';
import { LinterService } from './linter-service.js';
import { tieredLLMQuery } from '$lib/server/ai/tiered-llm-cache.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import type { LlmCacheTrace } from '$lib/server/ai/llm-cache-trace.js';
import { getErrorFixMemory, saveErrorFixMemory } from '$lib/server/ai/error-fix-memory.js';
import { buildAgentSystemPrompt } from '$lib/ai/prompts.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUNDS = 5;    // max tool-call rounds before forcing a final answer
const TIMEOUT_MS = 90_000;

// ── Model broker boundary ─────────────────────────────────────────────────────
// PLANNER_MODEL  — Gemma 4 legal VLM: planning, reasoning, synthesis (5.3GB)
// TOOL_MODEL     — FunctionGemma (or same VLM until model is available):
//                  structured-call translation / function-call parsing (270M target)
// EMBED_MODEL    — embeddinggemma: retrieval embeddings (separate, always)
//
// To activate FunctionGemma once pulled:
//   Set FUNCTION_GEMMA_MODEL=functiongemma:latest in .env
//   The TOOL_MODEL slot will route structured calls through it automatically.
const PLANNER_MODEL = VLM_MODELS.legal;  // full reasoning + synthesis
const TOOL_MODEL    = VLM_MODELS.tool;   // structured-call translation (FunctionGemma when available)

// ── Ollama wire types ──────────────────────────────────────────────────────────

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaChatResponse {
  message: OllamaMessage;
  done: boolean;
}

// ── Tool definitions (Ollama function-calling schema) ─────────────────────────

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'rag_search',
      description:
        'Semantic search across legal research summaries and documents. ' +
        'Use this to retrieve relevant case law, statutes, or research on a topic.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          collection: {
            type: 'string',
            enum: ['research_summaries', 'legal_documents', 'evidence_items'],
            description: 'Which knowledge collection to search (default: research_summaries)',
          },
          topK: { type: 'number', description: 'Max results to return (default 5, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'case_search',
      description:
        'Search legal cases in the database by keyword or description. ' +
        'Returns case title, status, and summary.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or case description' },
          limit: { type: 'number', description: 'Max results (default 5, max 20)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory_recall',
      description:
        'Retrieve the most relevant hyperedge memory modules from the 4D knowledge graph. ' +
        'These are HGNN-enriched summaries of clusters of related research that the system ' +
        'has learned are high-quality for a given topic (Grade A/B hyperedges). ' +
        'Use this when you need background context or prior learned knowledge on a subject.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Topic or question to recall memories for' },
          topK: { type: 'number', description: 'Number of memory modules to return (default 3)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hyperedge_stats',
      description:
        'Get statistics about the top knowledge clusters (hyperedges) currently in the graph. ' +
        'Shows which topic clusters have the highest quality scores and how many summaries they contain. ' +
        'Use this to understand what the system knows well.',
      parameters: {
        type: 'object',
        properties: {
          minGrade: {
            type: 'string',
            enum: ['A', 'B', 'C'],
            description: 'Minimum grade threshold (default B)',
          },
          limit: { type: 'number', description: 'Number of hyperedges to return (default 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a source file to understand the current code or structure.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file relative to workspace root (e.g., src/routes/+page.svelte)' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'topology_search',
      description:
        'Search the 4D topology-indexed codebase using cosine retrieval (Qdrant 768-dim) ' +
        'followed by manifold4 Euclidean neighborhood expansion. ' +
        'The four manifold dimensions are: som_x/som_y (SOM grid — structural topology), ' +
        'semantic_z (embedding centroid projection), grpo_w (RL quality signal). ' +
        'Returns files closest in the combined vector+topology space. ' +
        'Use this when you need to find structurally-related or topologically-adjacent files ' +
        'beyond simple keyword or semantic search.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language query — embedded and used to find the 4D centroid',
          },
          radius: {
            type: 'number',
            description: 'Euclidean radius in manifold4 space (default 0.25, range 0.05–2.0)',
          },
          limit: {
            type: 'number',
            description: 'Max results to return (default 15, max 40)',
          },
          somCluster: {
            type: 'number',
            description: 'Restrict search to a specific SOM cluster index (optional)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agents_md',
      description:
        'Quick-hit fetch of the per-directory AGENTS.md (agents.md spec) for a path. ' +
        'Returns pre-rendered Markdown with: directory purpose, audit score, ' +
        'top warnings (auth/Zod/SSR/Svelte4/localhost), dominant tags, ' +
        'topological neighbors, and representative files. Walks UP the tree to ' +
        'the nearest AGENTS.md (Cursor/Codex/Aider use the same convention). ' +
        'Use this BEFORE editing files in an unfamiliar directory — it gives you ' +
        'the same snapshot a human reviewer would expect from the dir README. ' +
        'Sub-5ms latency vs ~50-100ms for the full KAG pipeline.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Directory or file path. If a file, the dirname is used. ' +
              'Examples: "src/lib/server/ace", "src/routes/api/cases/[id]/+server.ts".',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verify_fix',
      description: 'Run svelte-check or tsc on a specific file to verify it is free of syntax/type errors. Use this AFTER applying a shadow patch.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file to verify (e.g., src/routes/+page.svelte)' },
          checkFull: { type: 'boolean', description: 'Whether to check the entire project for regressions (default: false)' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_shadow_patch',
      description: 'Apply a temporary patch to a file for verification. This creates a .bak file automatically.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the target file' },
          patch: { type: 'string', description: 'The code content to write' },
        },
        required: ['filePath', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revert_fix',
      description: 'Revert a shadow patch by restoring the .bak file. Use this to cleanup after verification.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to the file to revert' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'graph_search',
      description:
        'Search the fast-AST codebase graph (docs/graph/codebase-graph.json) by keyword. ' +
        'Returns matching source files with their tags, TODO count, auth status, and audit score. ' +
        'Use this to locate relevant files before reading or patching them.',
      parameters: {
        type: 'object',
        properties: {
          query:       { type: 'string',  description: 'Keywords to search for (file path, tags, or summary words)' },
          topK:        { type: 'number',  description: 'Max files to return (default 8, max 20)' },
          onlyRoutes:  { type: 'boolean', description: 'Restrict to SvelteKit route files (+server.ts, +page.server.ts)' },
          onlyNoAuth:  { type: 'boolean', description: 'Return only routes missing auth guard (locals.user check)' },
          hasTodos:    { type: 'boolean', description: 'Return only files with at least one TODO/FIXME' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wiki_note_lookup',
      description:
        'Look up KAG wiki notes (wiki:note:dir:*) from Redis for directories matching a query. ' +
        'Each note contains an AI-written directory summary, audit score, and SOM topology coordinates ' +
        'written by the directory summarizer pipeline. Use this to understand what a directory does before editing.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Directory name, tag, or topic to look up (e.g. "server/cache", "auth", "embedding")' },
          limit: { type: 'number', description: 'Max notes to return (default 5, max 15)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_hotspots',
      description:
        'Return the worst-scoring directories from the fast-AST codebase audit. ' +
        'Each result explains WHY the directory scored low: low audit score, TODO density, or missing auth on API routes. ' +
        'Use this first when asked to improve code quality or find areas needing attention.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many hotspot directories to return (default 10, max 30)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trace_search',
      description:
        'Advanced multi-lens retrieval across codebase chunks, architectural summaries, and synthesis memory. ' +
        'Use this for complex coding questions, architecture analysis, or finding the "why" behind code.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Technical query or coding problem' },
          topK: { type: 'number', description: 'Max results to return (default 5, max 15)' },
          intent: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional intent lenses: purpose, risk, api_surface, dependencies, retrieval_role',
          },
        },
        required: ['query'],
      },
    },
  },
] as const;

// ── FNV-1a 32-bit hash (for Redis cache keys) ─────────────────────────────────
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h.toString(16);
}

// ── In-process tool dispatch ───────────────────────────────────────────────────

interface ToolResult {
  tool:    string;
  result:  unknown;
  errorMsg?: string;
}

async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    if (name === 'rag_search') {
      const query      = String(args.query ?? '');
      const collection = String(args.collection ?? 'research_summaries');
      const topK       = Math.min(Number(args.topK ?? 5), 20);

      let emb: number[] | null = null;
      try {
        emb = await Promise.race([
          generateEmbedding(query),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('embed-timeout')), 12_000)),
        ]);
      } catch { emb = null; }
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable (VRAM contention)' };

      const VALID = ['research_summaries', 'codebase_chunks_768', 'legal_documents', 'evidence_items'] as const;
      const col   = VALID.includes(collection as typeof VALID[number])
        ? (collection as typeof VALID[number])
        : 'research_summaries';

      const hits = await qdrant.hybridSearch({
        collection:     col,
        query,
        queryEmbedding: emb,
        limit:          topK,
      });

      return {
        tool: name,
        result: hits.results.map((h) => ({
          id:       h.id,
          score:    h.score,
          summary:  (h.payload?.['summary']  ?? h.payload?.['content'] ?? '') as string,
          title:    (h.payload?.['title']    ?? '') as string,
          source:   (h.payload?.['source']   ?? col) as string,
          pipeline: (h.payload?.['pipeline'] ?? '') as string,
        })),
      };
    }

    if (name === 'case_search') {
      const query = String(args.query ?? '');
      const limit = Math.min(Number(args.limit ?? 5), 20);

      const { rows } = await pool.query<{
        id: string; title: string; status: string; description: string | null;
      }>(
        `SELECT id, title, status, description
           FROM cases
          WHERE to_tsvector('english', title || ' ' || COALESCE(description, ''))
                  @@ plainto_tsquery('english', $1)
          ORDER BY ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')),
                           plainto_tsquery('english', $1)) DESC
          LIMIT $2`,
        [query, limit],
      );

      return { tool: name, result: rows };
    }

    if (name === 'memory_recall') {
      const query = String(args.query ?? '');
      const topK  = Math.min(Number(args.topK ?? 3), 10);

      let emb: number[] | null = null;
      try {
        emb = await Promise.race([
          generateEmbedding(query),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('embed-timeout')), 12_000)),
        ]);
      } catch { emb = null; }
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable (VRAM contention)' };

      const modules = await selectAdaptiveMemory(emb, topK);
      return {
        tool: name,
        result: modules.map((m) => ({
          hash:        m.hyperedgeHash,
          grade:       m.gradeLabel,
          score:       m.gradeScore,
          pipeline:    m.pipeline,
          summary:     m.summary,
          members:     m.memberCount,
          similarity:  m.similarity,
          loraHint:    m.loraHint,
        })),
      };
    }

    if (name === 'hyperedge_stats') {
      const minGrade = (args.minGrade as 'A' | 'B' | 'C') ?? 'B';
      const limit    = Math.min(Number(args.limit ?? 5), 20);

      const edges = await queryTopHyperedges(minGrade, limit);
      return {
        tool: name,
        result: edges.map((e) => ({
          hash:      e.hash,
          grade:     e.gradeLabel,
          score:     e.gradeScore,
          pipeline:  e.pipeline,
          members:   e.memberIds.length,
          summary:   e.summary?.slice(0, 300) ?? '',
        })),
      };
    }

    if (name === 'topology_search') {
      const query      = String(args.query ?? '').trim();
      const radius     = Math.min(Math.max(Number(args.radius ?? 0.25), 0.05), 2.0);
      const limit      = Math.min(Number(args.limit ?? 15), 40);
      const somCluster = args.somCluster != null ? Number(args.somCluster) : undefined;

      const result = await queryTopology(query, { radius, limit, somCluster });
      if (!result) {
        return {
          tool: name,
          result: [],
          errorMsg: 'Topology search engine unavailable (port 8101). Run: node scripts/topology-search-server.mjs',
        };
      }

      return {
        tool: name,
        result: {
          center:     result.center,
          radius:     result.radius,
          totalFound: result.totalFound,
          durationMs: result.durationMs,
          hits: (result.hits ?? []).slice(0, limit).map((h) => ({
            path:               h.path,
            topoClass:          h.topoClass,
            topoHex:            h.topoHex,
            somCluster:         h.somCluster,
            hybridScore:        h.hybridScore ?? h.manifoldScore,
            cosineScore:        h.cosineScore ?? null,
            manifoldDistance:   h.manifoldDistance ?? null,
            graphAuthorityScore: h.graphAuthorityScore ?? null,
            summary:            (h.summary ?? h.contentPreview ?? ''),
          })),
        },
      };
    }

    if (name === 'web_search') {
      const query = String(args.query ?? '').trim();
      const maxResults = Math.min(Math.max(Number(args.maxResults ?? 3), 1), 5);
      if (!query) return { tool: name, result: [] };

      const cacheKey = `websearch:${fnv1a32(query)}`;

      // 1. Redis cache hit
      try {
        const { getRedis } = await import('$lib/server/redis.js');
        const redis = getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { tool: name, result: JSON.parse(cached) };
        }
      } catch {
        /* Redis unavailable — continue */
      }

      // 2. SearXNG
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        const params = new URLSearchParams({
          q: query,
          format: 'json',
          engines: 'google,duckduckgo,bing',
          language: 'en',
          safesearch: '1',
        });
        const res = await fetch(`${ENV.SEARXNG_URL}/search?${params}`, {
          signal: ctrl.signal,
          headers: { Accept: 'application/json' },
        }).finally(() => clearTimeout(tid));

        if (res.ok) {
          const body = (await res.json()) as {
            results?: Array<{ title?: string; url?: string; content?: string }>;
          };
          const hits = (body.results ?? []).slice(0, maxResults).map((r) => ({
            title: String(r.title ?? '').slice(0, 120),
            url: String(r.url ?? ''),
            snippet: String(r.content ?? '').slice(0, 400),
            source: 'searxng' as const,
          }));

          if (hits.length > 0) {
            try {
              const { getRedis } = await import('$lib/server/redis.js');
              const redis = getRedis();
              await redis.set(cacheKey, JSON.stringify(hits), 'EX', 3600);
            } catch {
              /* non-fatal */
            }
            return { tool: name, result: hits };
          }
        }
      } catch {
        /* SearXNG unreachable — fall through to Qdrant */
      }

      // 3. Qdrant research_summaries semantic fallback
      try {
        const emb = await Promise.race([
          generateEmbedding(query),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('embed-timeout')), 12_000)),
        ]).catch(() => null);
        if (emb) {
          const hits = await qdrant.hybridSearch({
            collection: 'research_summaries',
            query,
            queryEmbedding: emb,
            limit: maxResults,
          });
          const results = hits.results
            .filter((h) => h.score > 0.5)
            .map((h) => ({
              title: String(h.payload?.['title'] ?? 'Research Note'),
              url: String(h.payload?.['source'] ?? ''),
              snippet: String(h.payload?.['summary'] ?? '').slice(0, 400),
              source: 'qdrant_fallback' as const,
            }));
          if (results.length > 0) return { tool: name, result: results };
        }
      } catch {
        /* non-fatal */
      }

      return { tool: name, result: [] };
    }

    if (name === 'read_file') {
      const fp = String(args.filePath ?? '');
      if (!fp.startsWith('src/')) return { tool: name, result: null, errorMsg: 'Access denied: outside src/' };
      const abs = path.join(process.cwd(), fp);
      try {
        const content = await fs.readFile(abs, 'utf-8');
        return { tool: name, result: { content, lines: content.split('\n').length } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'agents_md') {
      const p = String(args.path ?? '');
      if (!p) return { tool: name, result: null, errorMsg: 'path is required' };
      try {
        const { resolveAgentsMdQuickHit } = await import('$lib/server/graph/community-graph.js');
        const hit = await resolveAgentsMdQuickHit(p);
        if (!hit) {
          return {
            tool: name,
            result: null,
            errorMsg: 'No AGENTS.md found for this path (run `npm run agents:write`)',
          };
        }
        return {
          tool: name,
          result: {
            path: p,
            markdown: hit.markdown,
            length: hit.markdown.length,
            resolvedBy: hit.source,
            resolvedPath: hit.resolvedPath,
            resolvedKey: hit.resolvedKey ?? null,
          },
        };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'verify_fix') {
      const fp = String(args.filePath ?? '');
      const full = Boolean(args.checkFull ?? false);
      const res = await LinterService.verifySvelteFile(fp, { checkFull: full });
      return { tool: name, result: res };
    }

    if (name === 'apply_shadow_patch') {
      const fp = String(args.filePath ?? '');
      const patch = String(args.patch ?? '');
      if (!fp.startsWith('src/')) return { tool: name, result: null, errorMsg: 'Access denied: outside src/' };
      const abs = path.join(process.cwd(), fp);
      const bak = `${abs}.bak`;

      try {
        if (!process.env.DEV_BYPASS_AUTH) return { tool: name, result: null, errorMsg: 'Write access disabled' };
        await fs.copyFile(abs, bak);
        await fs.writeFile(abs, patch, 'utf-8');
        return { tool: name, result: { success: true, backup: bak } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'revert_fix') {
      const fp = String(args.filePath ?? '');
      const abs = path.join(process.cwd(), fp);
      const bak = `${abs}.bak`;
      try {
        await fs.copyFile(bak, abs);
        await fs.unlink(bak);
        return { tool: name, result: { success: true } };
      } catch (e: any) {
        return { tool: name, result: null, errorMsg: e.message };
      }
    }

    if (name === 'graph_search') {
      const { searchGraph } = await import('$lib/server/graph/graph-intel.js');
      const query      = String(args.query ?? '');
      const topK       = Math.min(Number(args.topK ?? 8), 20);
      const onlyRoutes = Boolean(args.onlyRoutes ?? false);
      const onlyNoAuth = Boolean(args.onlyNoAuth ?? false);
      const hasTodos   = Boolean(args.hasTodos   ?? false);
      const hits       = await searchGraph(query, topK, { onlyRoutes, onlyNoAuth, hasTodos });
      return { tool: name, result: hits };
    }

    if (name === 'wiki_note_lookup') {
      const { lookupWikiNotes } = await import('$lib/server/graph/graph-intel.js');
      const query  = String(args.query ?? '');
      const limit  = Math.min(Number(args.limit ?? 5), 15);
      const notes  = await lookupWikiNotes(query, limit);
      return { tool: name, result: notes };
    }

    if (name === 'audit_hotspots') {
      const { getAuditHotspots } = await import('$lib/server/graph/graph-intel.js');
      const limit    = Math.min(Number(args.limit ?? 10), 30);
      const hotspots = await getAuditHotspots(limit);
      return { tool: name, result: hotspots };
    }

    if (name === 'trace_search') {
      const query = String(args.query ?? '');
      const topK  = Math.min(Number(args.topK ?? 5), 15);
      const intent = Array.isArray(args.intent) ? args.intent.map(String) : undefined;

      const emb = await generateEmbedding(query).catch(() => null);
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable' };

      const { traceRerank } = await import('./trace-reranker.js');
      const hits = await traceRerank({
        query,
        queryEmbedding: emb,
        limit: topK,
        intentOverride: intent
      });

      return {
        tool: name,
        result: hits.map(h => ({
          id: h.id,
          score: h.score,
          path: h.payload?.path,
          content: (h.payload?.content ?? '').slice(0, 1000),
          lenses: h.lenses,
          tags: h.payload?.tags
        }))
      };
    }

    return { tool: name, result: null, errorMsg: `Unknown tool: ${name}` };
  } catch (err) {
    return { tool: name, result: null, errorMsg: (err as Error).message };
  }
}

// ── Public result type ────────────────────────────────────────────────────────

export interface AgentRunResult {
  answer: string;
  toolsUsed: string[];
  rounds: number;
  sources: unknown[];
  durationMs: number;
  cacheTier?: 'L1_redis' | 'L2_qdrant' | 'L3_ollama';
  cacheLatencyMs?: number;
  cacheTrace?: LlmCacheTrace;
  errorFixMemoryHit?: boolean;
  verificationStatus?: string;
  requestedBackend?: 'bifrost' | 'turboquant';
  inferenceBackend?: 'bifrost' | 'turboquant' | 'ollama' | 'cache';
  backendFallbackReason?: string;
  yorha?: Record<string, unknown>;
}

// ── Agent loop ────────────────────────────────────────────────────────────────

// Tools that write state — their results must never be served from cache.
// Serving a stale "patch applied" or "file written" response to a different
// caller would silently corrupt state (side-effect cache poisoning).
const SIDE_EFFECT_TOOLS = new Set(['apply_shadow_patch', 'revert_fix', 'verify_fix']);

function getPreferredBackend(metadata?: Record<string, unknown>): 'bifrost' | 'turboquant' {
  return metadata?.preferredBackend === 'turboquant' ? 'turboquant' : 'bifrost';
}

export async function runGemma4Agent(
  query:       string,
  options?: {
    systemPrompt?: string;
    pipeline?:     string;
    userId?:       string;
    sessionId?:    string;
    bypassCache?:  boolean;
    metadata?:     Record<string, unknown>;
  },
): Promise<AgentRunResult> {
  const t0          = Date.now();
  const pipeline    = options?.pipeline ?? 'ace';
  const toolsUsed:  string[]  = [];
  const sources:    unknown[] = [];
  // Bypass cache when caller requests it, or when side-effect tools were used
  let hasSideEffect = false;
  let bypassCache   = options?.bypassCache ?? false;

  const system = buildAgentSystemPrompt(options?.systemPrompt);

  const messages: OllamaMessage[] = [
    { role: 'system',  content: system },
    { role: 'user',    content: query  },
  ];

  let finalAnswer    = '';
  let round          = 0;
  let resultCacheTier: AgentRunResult['cacheTier']  = undefined;
  let resultCacheMs:   number | undefined           = undefined;
  let totalPromptTokens     = 0;
  let totalCompletionTokens = 0;
  const requestedBackend = getPreferredBackend(options?.metadata);
  let inferenceBackend: AgentRunResult['inferenceBackend'] = requestedBackend;
  let backendFallbackReason: string | undefined;

  // Error-fix memory pre-flight: if the query references an error / file /
  // route, look up any previously verified fix for it. Populates the
  // `errorFixMemoryHit` + `verificationStatus` fields on the result.
  const filePathMeta = typeof options?.metadata?.filePath === 'string' ? options.metadata.filePath : undefined;
  const routeMeta    = typeof options?.metadata?.route    === 'string' ? options.metadata.route    : undefined;
  let errorFixMemoryHit = false;
  let verificationStatus: string | undefined;
  try {
    const prior = await getErrorFixMemory({ errorText: query, filePath: filePathMeta, route: routeMeta });
    if (prior) {
      errorFixMemoryHit  = true;
      verificationStatus = prior.verificationStatus;
      // Inject the prior fix as a system hint so the model can reuse / refine
      messages.splice(1, 0, {
        role: 'system',
        content: `## Prior fix memory\n` +
          `Verification: ${prior.verificationStatus} · path: ${prior.filePath ?? 'n/a'} · tools: ${prior.toolCalls.join(', ')}\n\n` +
          `Diagnosis: ${prior.diagnosis}\n\n` +
          `Patch summary: ${prior.patchSummary}`.trim(),
      });
    }
  } catch { /* non-fatal — Redis miss is fine */ }

  const runPreferredToolCall = async (currentMessages: OllamaMessage[]) => {
    if (requestedBackend !== 'turboquant') {
      inferenceBackend = 'bifrost';
      return bifrostChat(currentMessages, TOOL_MODEL, {
        tools: AGENT_TOOLS,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: TIMEOUT_MS,
        cacheKey: `agent-tool-loop:${pipeline}`,
      });
    }

    try {
      inferenceBackend = 'turboquant';
      return await turboQuantChat(currentMessages, TOOL_MODEL, {
        tools: AGENT_TOOLS,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: TIMEOUT_MS,
      });
    } catch (error) {
      backendFallbackReason = (error as Error).message;
      inferenceBackend = 'bifrost';
      return bifrostChat(currentMessages, TOOL_MODEL, {
        tools: AGENT_TOOLS,
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: TIMEOUT_MS,
        cacheKey: `agent-tool-loop:${pipeline}`,
      });
    }
  };

  // ── Pre-loop cache check (L1 Redis → L2 Qdrant) ──────────────────────────
  // Skip the entire tool-calling loop if a cached final answer exists.
  // Only applies when bypassCache is false AND caller didn't force fresh inference.
  if (!bypassCache) {
    try {
      const cached = await tieredLLMQuery(messages, {
        model:       PLANNER_MODEL,
        temperature: 0.2,
        maxTokens:   2048,
        context:     pipeline,
        bypassCache: false,
      });
      // Only accept cache hits — L3 would just be a cold Ollama call with no tools
      if (cached.tier !== 'L3_ollama') {
        finalAnswer    = cached.response;
        resultCacheTier = cached.tier;
        resultCacheMs   = cached.latencyMs;
        inferenceBackend = 'cache';
        round = 0; // no tool rounds consumed
      }
    } catch {
      // Cache unavailable — proceed normally
    }
  }

  while (!finalAnswer && round < MAX_ROUNDS) {
    round++;

    const rawResult = await runPreferredToolCall(messages);

    // Accumulate token counts across rounds (Ollama returns these on non-streaming calls)
    if (typeof rawResult === 'object' && rawResult !== null) {
      const rd = rawResult as Record<string, unknown>;
      if (typeof rd.prompt_eval_count === 'number')  totalPromptTokens     += rd.prompt_eval_count;
      if (typeof rd.eval_count         === 'number')  totalCompletionTokens += rd.eval_count;
    }

    const raw = rawResult as { content?: string; tool_calls?: OllamaToolCall[] } | string;
    const msg: OllamaMessage = typeof raw === 'string'
      ? { role: 'assistant', content: raw }
      : { role: 'assistant', content: raw.content ?? '', tool_calls: raw.tool_calls };

    // Final answer — no tool calls
    if (!msg.tool_calls?.length) {
      finalAnswer = msg.content ?? '';
      break;
    }

    // Append the assistant's tool-call request to the conversation
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });

    // Execute each tool call in-process
    for (const tc of msg.tool_calls) {
      const { name, arguments: tArgs } = tc.function;
      toolsUsed.push(name);
      if (SIDE_EFFECT_TOOLS.has(name)) hasSideEffect = true;

      const result = await dispatchTool(name, tArgs ?? {});
      if (Array.isArray(result.result)) sources.push(...result.result);

      // Ollama expects role:"tool" messages with the result as content
      messages.push({
        role:    'tool',
        content: JSON.stringify(result.errorMsg
          ? { error: result.errorMsg }
          : result.result
        ),
      });
    }
  }

  // If we ran out of rounds without a final answer, synthesise one.
  // Use tieredLLMQuery so the synthesis is cached (L1→L2→L3).
  // Bypass cache when any side-effect tool ran — stale "patch applied"
  // answers must never be served to a different caller.
  if (!finalAnswer && round >= MAX_ROUNDS) {
    bypassCache = bypassCache || hasSideEffect;
    const finalMessages = [
      ...messages,
      {
        role: 'user' as const,
        content: 'Please now provide a final answer based on what you found.',
      },
    ];

    if (requestedBackend === 'turboquant') {
      try {
        inferenceBackend = 'turboquant';
        const forced = await turboQuantChat(finalMessages, PLANNER_MODEL, {
          temperature: 0.2,
          maxTokens: 2048,
          timeoutMs: TIMEOUT_MS,
        });
        finalAnswer = forced;
      } catch (error) {
        backendFallbackReason = backendFallbackReason ?? (error as Error).message;
        const forced = await tieredLLMQuery(finalMessages, {
          model: PLANNER_MODEL,
          temperature: 0.2,
          maxTokens: 2048,
          context: pipeline,
          bypassCache,
        });
        finalAnswer = forced.response;
        inferenceBackend = forced.tier === 'L3_ollama' ? 'ollama' : 'cache';
      }
    } else {
      const forced = await tieredLLMQuery(finalMessages, {
        model: PLANNER_MODEL,
        temperature: 0.2,
        maxTokens: 2048,
        context: pipeline,
        bypassCache,
      });
      finalAnswer = forced.response;
      inferenceBackend = forced.tier === 'L3_ollama' ? 'ollama' : 'cache';
    }
  }

  const durationMs = Date.now() - t0;
  const cacheTrace: LlmCacheTrace = {
    modelRole: 'gemma4-agent-planner',
    cacheTier: resultCacheTier ?? 'L4_none',
    tokenizerFamily: 'gemma',
    provider:
      inferenceBackend === 'turboquant'
        ? 'turboquant'
        : inferenceBackend === 'bifrost'
          ? 'bifrost'
          : inferenceBackend === 'ollama'
            ? 'ollama'
            : 'tiered-llm-cache',
    latencyMs: resultCacheMs ?? durationMs,
  };

  // Fire-and-forget token usage log (with template + pipeline context in metadata JSONB)
  trackTokenUsage({
    userId: options?.userId,
    endpoint: '/api/ai/agent',
    model: TOOL_MODEL,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    durationMs,
    cached: resultCacheTier !== undefined,
    metadata: {
      chatTemplate: 'gemma',
      pipeline,
      rounds: round,
      toolsUsed,
      cachedTier: resultCacheTier ?? null,
      cacheTrace,
      plannerModel: PLANNER_MODEL,
      toolModel: TOOL_MODEL,
      requestedBackend,
      inferenceBackend,
      backendFallbackReason: backendFallbackReason ?? null,
    },
  });

  // Inference observability — model_role + cache_tier for CI gate
  logInference({
    type: 'llm',
    model: PLANNER_MODEL,
    backend:
      inferenceBackend === 'turboquant'
        ? 'turboquant'
        : inferenceBackend === 'bifrost'
          ? 'bifrost'
          : 'ollama',
    latencyMs: durationMs,
    cacheHit: resultCacheTier !== undefined,
    metadata: {
      model_role: cacheTrace.modelRole,
      cache_tier: cacheTrace.cacheTier,
      toolsUsed,
      rounds: round,
      pipeline,
      requested_backend: requestedBackend,
      inference_backend: inferenceBackend,
      turbo_fallback_reason: backendFallbackReason ?? null,
    },
  });

  // Fire-and-forget timeline record
  db.insert(contextTimeline)
    .values({
      userId: options?.userId ?? undefined,
      sessionId: options?.sessionId ?? '',
      eventType: 'tool_call',
      pipeline,
      payload: {
        query,
        toolsUsed,
        rounds: round,
        durationMs,
        requestedBackend,
        inferenceBackend,
        backendFallbackReason: backendFallbackReason ?? null,
      } as Record<string, unknown>,
    })
    .catch(() => {
      /* non-fatal */
    });

  // Persist a fresh fix-memory entry when the agent ran a side-effect tool
  // (apply_shadow_patch / revert_fix / verify_fix). Verification status is
  // 'unknown' until the next agent run probes the same error and confirms
  // — that flips it to 'passed' or 'failed' via a separate update path.
  if (hasSideEffect && !errorFixMemoryHit) {
    void saveErrorFixMemory(
      { errorText: query, filePath: filePathMeta, route: routeMeta },
      {
        diagnosis:          finalAnswer.slice(0, 600),
        patchSummary:       toolsUsed.includes('apply_shadow_patch')
          ? 'Patch applied via apply_shadow_patch'
          : 'Side-effect tool sequence executed',
        verificationStatus: 'unknown',
        toolCalls:          toolsUsed.filter((t) => SIDE_EFFECT_TOOLS.has(t)),
      },
    ).catch(() => null);
  }

  // ── 7. Encode (Long-term Memory) ───────────────────────────────────────────
  const MEMORY_THRESHOLDS = {
    synthesis_memory: 0.30,
    architecture_note: 0.35,
    bug_fix_memory: 0.25,
    audit_discovery: 0.20,
    user_instruction: 0.10,
    cluster_summary: 0.40,
    directory_summary: 0.35
  };

  let yorhaMetadata: any = {
    traceUsed: true,
    memoryEncoded: false,
    informationGain: null
  };

  // If the answer is substantial and successful, archive it as synthesis memory
  if (finalAnswer.length > 500 && !finalAnswer.includes('I don\'t know') && !finalAnswer.includes('error')) {
    try {
      const { validateInformationGain, heuristicQualityCheck } = await import('./information-gain-validator.js');
      
      if (heuristicQualityCheck(finalAnswer)) {
        // 1. Look up existing memory for this query
        const emb = await generateEmbedding(query).catch(() => null);
        let existingText = '';
        
        if (emb) {
          const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
          const existing = await qdrant.hybridSearch({
            collection: 'synthesis_memory',
            query,
            queryEmbedding: emb,
            limit: 1
          });
          existingText = (existing.results[0]?.payload?.content as string) ?? '';
        }

        // 2. Validate Information Gain via Gemma4
        const validation = await validateInformationGain({
          context: query,
          existing: existingText,
          candidate: finalAnswer
        });

        // 3. Populate YorHA UI metadata
        yorhaMetadata.informationGain = {
          score: validation.gainScore,
          decision: validation.shouldUpdate ? 'accepted' : 'rejected',
          reason: validation.reasoning
        };

        // 4. Archive only if it provides significant improvement (respecting threshold)
        const threshold = MEMORY_THRESHOLDS.synthesis_memory;
        if (validation.success && validation.shouldUpdate && (validation.gainScore ?? 0) >= threshold) {
          const { archiveSynthesisMemory } = await import('$lib/server/indexer/synthesis-memory-archiver.js');
          await archiveSynthesisMemory({
            title: query.slice(0, 60),
            content: finalAnswer,
            source: `chat:${options?.sessionId ?? 'anon'}`,
            tags: toolsUsed,
            metadata: { 
              gainScore: validation.gainScore, 
              reasoning: validation.reasoning,
              validated_at: new Date().toISOString()
            }
          });
          yorhaMetadata.memoryEncoded = true;
          console.log(`[agent] High-gain memory encoded: ${query.slice(0, 30)}... (Gain: ${validation.gainScore})`);
        }
      }
    } catch (e) {
      console.error('[agent] Memory encoding failed:', e);
      /* non-fatal */
    }
  }

  return {
    answer:      finalAnswer,
    toolsUsed,
    rounds:      round,
    sources,
    durationMs:  Date.now() - t0,
    cacheTier:   resultCacheTier,
    cacheLatencyMs: resultCacheMs,
    errorFixMemoryHit,
    verificationStatus,
    inferenceBackend,
    requestedBackend,
    backendFallbackReason,
    yorha: yorhaMetadata
  };
}
