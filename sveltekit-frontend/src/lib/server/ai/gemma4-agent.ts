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

import { ollamaFetch, VLM_MODELS, getOllamaEndpoint, bifrostChat } from '$lib/server/ollama.js';
import { generateEmbedding }                           from '$lib/server/grpc/embedding-client.js';
import { qdrant }                                      from '$lib/server/vector/qdrant-manager.js';
import { selectAdaptiveMemory, queryTopHyperedges }    from '$lib/server/graph/hypergraph-4d.js';
import { db, pool }                                    from '$lib/server/db/client';
import { contextTimeline }                             from '$lib/server/db/schema-postgres.js';
import { trackTokenUsage }                             from '$lib/server/ai/token-tracker.js';
import { ENV } from '$lib/server/env.server.js';
import fs from 'fs/promises';
import path from 'path';
import { LinterService } from './linter-service.js';
import { tieredLLMQuery } from '$lib/server/ai/tiered-llm-cache.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROUNDS  = 5;   // max tool-call rounds before forcing a final answer
const TOOL_MODEL  = VLM_MODELS.legal;   // gemma4-legal-vlm:latest (unified)
const TIMEOUT_MS  = 90_000;

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

      const emb = await generateEmbedding(query);
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable' };

      const VALID = ['research_summaries', 'legal_documents', 'evidence_items'] as const;
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

      const emb = await generateEmbedding(query);
      if (!emb) return { tool: name, result: [], errorMsg: 'Embedding unavailable' };

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
        const emb = await generateEmbedding(query);
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

    return { tool: name, result: null, errorMsg: `Unknown tool: ${name}` };
  } catch (err) {
    return { tool: name, result: null, errorMsg: (err as Error).message };
  }
}

// ── Public result type ────────────────────────────────────────────────────────

export interface AgentRunResult {
  answer:     string;
  toolsUsed:  string[];
  rounds:     number;
  sources:    unknown[];
  durationMs: number;
  cacheTier?: 'L1_redis' | 'L2_qdrant' | 'L3_ollama';
  cacheLatencyMs?: number;
}

// ── Agent loop ────────────────────────────────────────────────────────────────

// Tools that write state — their results must never be served from cache.
// Serving a stale "patch applied" or "file written" response to a different
// caller would silently corrupt state (side-effect cache poisoning).
const SIDE_EFFECT_TOOLS = new Set(['apply_shadow_patch', 'revert_fix', 'verify_fix']);

export async function runGemma4Agent(
  query:       string,
  options?: {
    systemPrompt?: string;
    pipeline?:     string;
    userId?:       string;
    sessionId?:    string;
    bypassCache?:  boolean;
  },
): Promise<AgentRunResult> {
  const t0          = Date.now();
  const pipeline    = options?.pipeline ?? 'ace';
  const toolsUsed:  string[]  = [];
  const sources:    unknown[] = [];
  // Bypass cache when caller requests it, or when side-effect tools were used
  let hasSideEffect = false;
  let bypassCache   = options?.bypassCache ?? false;

  const system = options?.systemPrompt ??
    'You are a legal research assistant with access to a knowledge graph and case database. ' +
    'Use the provided tools to gather information before answering. ' +
    'Be precise and cite your sources.';

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

  // ── Pre-loop cache check (L1 Redis → L2 Qdrant) ──────────────────────────
  // Skip the entire tool-calling loop if a cached final answer exists.
  // Only applies when bypassCache is false AND caller didn't force fresh inference.
  if (!bypassCache) {
    try {
      const cached = await tieredLLMQuery(messages, {
        model:       TOOL_MODEL,
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
        round = 0; // no tool rounds consumed
      }
    } catch {
      // Cache unavailable — proceed normally
    }
  }

  while (!finalAnswer && round < MAX_ROUNDS) {
    round++;

    const rawResult = await bifrostChat(messages, TOOL_MODEL, {
      tools: AGENT_TOOLS,
      temperature: 0.2,
      maxTokens: 2048,
      timeoutMs: TIMEOUT_MS,
      cacheKey: `agent-tool-loop:${pipeline}`,
    });

    // Accumulate token counts across rounds (Ollama returns these on non-streaming calls)
    if (typeof rawResult === 'object' && rawResult !== null) {
      const rd = rawResult as Record<string, unknown>;
      if (typeof rd.prompt_eval_count === 'number')  totalPromptTokens     += rd.prompt_eval_count;
      if (typeof rd.eval_count         === 'number')  totalCompletionTokens += rd.eval_count;
    }

    const msg: OllamaMessage = typeof rawResult === 'string'
      ? { role: 'assistant', content: rawResult }
      : { role: 'assistant', content: rawResult.content, tool_calls: rawResult.tool_calls };

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
    const forced = await tieredLLMQuery(
      [
        ...messages,
        { role: 'user', content: 'Please now provide a final answer based on what you found.' },
      ],
      {
        model:       TOOL_MODEL,
        temperature: 0.2,
        maxTokens:   2048,
        context:     pipeline,
        bypassCache,
      },
    );
    finalAnswer = forced.response;
  }

  const durationMs = Date.now() - t0;

  // Fire-and-forget token usage log (with template + pipeline context in metadata JSONB)
  trackTokenUsage({
    userId:           options?.userId,
    endpoint:         '/api/ai/agent',
    model:            TOOL_MODEL,
    promptTokens:     totalPromptTokens,
    completionTokens: totalCompletionTokens,
    durationMs,
    cached:           resultCacheTier !== undefined,
    metadata: {
      chatTemplate:  'gemma',
      pipeline,
      rounds:        round,
      toolsUsed,
      cachedTier:    resultCacheTier ?? null,
    },
  });

  // Fire-and-forget timeline record
  db.insert(contextTimeline).values({
    userId:    options?.userId    ?? undefined,
    sessionId: options?.sessionId ?? '',
    eventType: 'tool_call',
    pipeline,
    payload: {
      query,
      toolsUsed,
      rounds: round,
      durationMs,
    } as Record<string, unknown>,
  }).catch(() => { /* non-fatal */ });

  return {
    answer:        finalAnswer,
    toolsUsed,
    rounds:        round,
    sources,
    durationMs,
    cacheTier:     resultCacheTier,
    cacheLatencyMs: resultCacheMs,
  };
}
