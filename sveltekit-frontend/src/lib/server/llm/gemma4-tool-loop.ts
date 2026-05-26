/**
 * Gemma 4 + Ollama Multi-Step Tool-Calling Loop
 *
 * Implements the explicit agentic cycle:
 *   1. Define tools (JSON Schema function definitions)
 *   2. Send user query + tools to Ollama /api/chat
 *   3. Model emits tool_calls[] — execute each one locally
 *   4. Feed tool results back as role:"tool" messages
 *   5. Model generates final natural-language answer
 *
 * Supports:
 *   - Multiple tool calls per turn (parallel tool execution)
 *   - Multi-turn loops (model can call tools again after seeing results)
 *   - Structured output via `format` (JSON schema response shaping)
 *   - System prompt override for ACE/wiki/fix_recommend contexts
 *   - Configurable max iterations to prevent infinite loops
 *
 * Ollama API shape (POST /api/chat):
 *   Request:  { model, messages, tools, stream, format?, options?, keep_alive? }
 *   Response: { message: { role, content, tool_calls? }, done }
 *   Tool result: { role: "tool", content: "<json>", tool_name: "<name>" }
 */

import { ollamaFetch, getChatModelKeepAlive, VLM_MODELS } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { logToolTrace, type ToolTraceStatus } from '$lib/server/observability/tool-trace.js';

const RUNTIME_CONTEXT_SIZE = Number(
  process.env.LLM_CONTEXT_SIZE ??
    process.env.TURBO_CTX_SIZE ??
    process.env.LLAMA_CTX_SIZE ??
    process.env.TURBO_CTX ??
    process.env.LLAMA_SERVER_CTX ??
    process.env.OLLAMA_CONTEXT_LENGTH ??
    65536
);

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** JSON Schema parameter definition for an Ollama tool */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      enum?: string[];
      items?: Record<string, unknown>;
    }
  >;
  required?: string[];
}

/** A single tool definition in the Ollama /api/chat tools[] array */
export interface OllamaToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
  };
}

/** A tool call emitted by the model */
export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/** A message in the Ollama chat history */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
  images?: string[];
}

/** The raw response object from Ollama /api/chat (non-streaming) */
export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/** Handler function that executes a tool and returns a JSON-serializable result */
export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Configuration for callGemma4WithTools */
export interface Gemma4ToolLoopOpts {
  /** Ollama model name (default: ENV.GEMMA4_MODEL / gemma4-rotorquant:latest) */
  model?: string;
  /** Temperature (default: 0.1 for tool precision) */
  temperature?: number;
  /** Max completion tokens (default: 4096) */
  maxTokens?: number;
  /** System prompt override — replaces the default legal-assistant system prompt */
  systemPromptOverride?: string;
  /** JSON schema for structured final output (Ollama `format` field) */
  responseSchema?: Record<string, unknown>;
  /** Maximum tool-call loop iterations before forcing a text answer (default: 5) */
  maxIterations?: number;
  /** Ollama keep_alive (default: from getChatModelKeepAlive()) */
  keepAlive?: string;
  /** Request timeout in ms (default: 120_000) */
  timeoutMs?: number;
  /** Images to include with the user message (base64-encoded, for VLM) */
  images?: string[];
  /** Optional message ID to associate tool executions with a database chat message */
  messageId?: string;
}

/** Result returned from the tool-calling loop */
export interface Gemma4ToolLoopResult {
  /** The model's final text answer (after all tool calls resolved) */
  answer: string;
  /** Full message history including all tool call / tool result turns */
  history: ChatMessage[];
  /** Log of every tool call made during the loop */
  toolCallLog: Array<{
    iteration: number;
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
    durationMs: number;
  }>;
  /** Number of loop iterations executed */
  iterations: number;
  /** Model used */
  model: string;
  /** Total wall-clock duration in ms */
  totalDurationMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Default system prompt
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_SYSTEM_PROMPT = `You are a legal-domain AI assistant with access to tools.
When a user asks a question, decide whether you need to call one or more tools to gather information.
If you call tools, wait for their results before answering.
Always cite the tool results in your final answer.
Be precise, accurate, and grounded in the tool output.`;

// ═══════════════════════════════════════════════════════════════════════════
// Core: Multi-step tool-calling loop
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute the full Gemma 4 + Ollama agentic tool-calling loop.
 *
 * ```
 *  ┌──────────────────────────────────────────────────────┐
 *  │  USER provides:                                       │
 *  │    • query (string)                                   │
 *  │    • tools (OllamaToolDef[] + handlers Map)           │
 *  │    • opts  (model, temp, system prompt, schema, …)    │
 *  └──────────────────┬───────────────────────────────────┘
 *                     │
 *  ┌──────────────────▼───────────────────────────────────┐
 *  │  STEP 1: Build initial messages[]                     │
 *  │    [system, user]                                     │
 *  └──────────────────┬───────────────────────────────────┘
 *                     │
 *  ┌──────────────────▼───────────────────────────────────┐
 *  │  STEP 2: POST /api/chat { messages, tools, … }       │
 *  │    Ollama returns { message.tool_calls? }             │
 *  └──────────────────┬───────────────────────────────────┘
 *                     │
 *          ┌──────────▼──────────┐
 *          │  tool_calls exist?  │───── NO ──▶ return message.content
 *          └──────────┬──────────┘
 *                     │ YES
 *  ┌──────────────────▼───────────────────────────────────┐
 *  │  STEP 3: Execute each tool_call via handler Map       │
 *  │    Collect results as { role:"tool", content, … }     │
 *  └──────────────────┬───────────────────────────────────┘
 *                     │
 *  ┌──────────────────▼───────────────────────────────────┐
 *  │  STEP 4: Append assistant msg + tool results to       │
 *  │          messages[], loop back to STEP 2              │
 *  └──────────────────────────────────────────────────────┘
 * ```
 */
export async function callGemma4WithTools(
  query: string,
  tools: OllamaToolDef[],
  handlers: Map<string, ToolHandler>,
  opts: Gemma4ToolLoopOpts = {}
): Promise<Gemma4ToolLoopResult> {
  const model = opts.model ?? VLM_MODELS.gemma4;
  const maxIter = opts.maxIterations ?? 5;
  const timeout = opts.timeoutMs ?? 120_000;
  const keepAlive = opts.keepAlive ?? getChatModelKeepAlive();
  const loopStart = performance.now();

  // ── Step 1: Build initial messages ──────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPromptOverride ?? DEFAULT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: query,
      ...(opts.images?.length ? { images: opts.images } : {}),
    },
  ];

  const toolCallLog: Gemma4ToolLoopResult['toolCallLog'] = [];
  let iterations = 0;

  // ── Step 2–4: Agentic loop ─────────────────────────────────────────────
  for (let i = 0; i < maxIter; i++) {
    iterations = i + 1;

    const ollamaBody: Record<string, unknown> = {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: false,
      keep_alive: keepAlive,
      options: {
        temperature: opts.temperature ?? 0.1,
        num_predict: opts.maxTokens ?? 4096,
        num_ctx: RUNTIME_CONTEXT_SIZE,
      },
      ...(opts.responseSchema ? { format: opts.responseSchema } : {}),
    };

    console.log(
      `[gemma4-tool-loop] Iteration ${i + 1}/${maxIter} — ` +
        `${messages.length} messages, ${tools.length} tools`
    );

    // ── POST /api/chat ──────────────────────────────────────────────────
    const chatResponse = await traceLLM(
      'gemma4-tool-loop',
      { model, prompt: query.slice(0, 500), iteration: i + 1 },
      async (gen) => {
        const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ollamaBody),
          signal: AbortSignal.timeout(timeout),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Ollama /api/chat failed: ${res.status} ${errText.slice(0, 200)}`);
        }

        const data = (await res.json()) as OllamaChatResponse;
        gen.end({
          output: (data.message?.content ?? '').slice(0, 1000),
          usage: {
            promptTokens: data.prompt_eval_count,
            completionTokens: data.eval_count,
          },
        });
        return data;
      }
    );

    const assistantMsg = chatResponse.message;

    // ── No tool calls? The model is done — return final answer ───────────
    if (!assistantMsg.tool_calls?.length) {
      messages.push({
        role: 'assistant',
        content: assistantMsg.content,
      });

      logInference({
        type: 'llm',
        model,
        backend: 'ollama',
        latencyMs: Math.round(performance.now() - loopStart),
        tokenCount: chatResponse.eval_count ?? 0,
        cacheHit: false,
        metadata: {
          source: 'gemma4-tool-loop',
          iterations,
          toolCalls: toolCallLog.length,
        },
      });

      return {
        answer: assistantMsg.content,
        history: messages,
        toolCallLog,
        iterations,
        model,
        totalDurationMs: Math.round(performance.now() - loopStart),
      };
    }

    // ── Tool calls emitted — append assistant message to history ─────────
    messages.push({
      role: 'assistant',
      content: assistantMsg.content || '',
      tool_calls: assistantMsg.tool_calls,
    });

    // ── Step 3: Execute each tool call ──────────────────────────────────
    for (const tc of assistantMsg.tool_calls) {
      const fnName = tc.function.name;
      const fnArgs = tc.function.arguments ?? {};
      const handler = handlers.get(fnName);

      console.log(
        `[gemma4-tool-loop]   → calling tool: ${fnName}(${JSON.stringify(fnArgs).slice(0, 200)})`
      );

      const toolStart = performance.now();
      let result: unknown;

      if (!handler) {
        result = {
          error: `Unknown tool: ${fnName}. Available: ${[...handlers.keys()].join(', ')}`,
        };
        console.warn(`[gemma4-tool-loop]   ⚠ no handler for tool "${fnName}"`);
      } else {
        try {
          result = await handler(fnArgs);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
          console.error(`[gemma4-tool-loop]   ✗ tool "${fnName}" threw:`, err);
        }
      }

      const toolDuration = Math.round(performance.now() - toolStart);
      let toolStatus: ToolTraceStatus = 'ok';
      let toolError: string | null = null;

      if (!handler) {
        toolStatus = 'error';
        toolError = `Unknown tool: ${fnName}`;
      } else if (typeof result === 'object' && result !== null && 'error' in result) {
        const rawError = (result as { error?: unknown }).error;
        toolStatus = 'error';
        toolError =
          rawError == null
            ? null
            : typeof rawError === 'string'
              ? rawError
              : JSON.stringify(rawError);
      }

      const resultSummary =
        typeof result === 'string'
          ? result.slice(0, 1000)
          : (JSON.stringify(result ?? null) ?? '').slice(0, 1000);

      toolCallLog.push({
        iteration: i + 1,
        toolName: fnName,
        args: fnArgs,
        result,
        durationMs: toolDuration,
      });

      if (opts.messageId) {
        logToolTrace({
          messageId: opts.messageId,
          toolName: fnName,
          args: fnArgs,
          resultSummary,
          durationMs: toolDuration,
          status: toolStatus,
          error: toolError,
        });
      }

      // ── Step 4: Append tool result to messages ──────────────────────
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_name: fnName,
      });

      console.log(
        `[gemma4-tool-loop]   ✓ tool "${fnName}" returned in ${toolDuration}ms ` +
          `(${JSON.stringify(result).length} chars)`
      );
    }

    // Loop back to Step 2 — model sees tool results and decides next action
  }

  // ── Max iterations reached — force a text answer ──────────────────────
  console.warn(`[gemma4-tool-loop] Max iterations (${maxIter}) reached, forcing final answer`);

  // One last call without tools to force a text response
  const finalBody = {
    model,
    messages: [
      ...messages,
      {
        role: 'user' as const,
        content: 'Please provide your final answer based on the tool results above.',
      },
    ],
    stream: false,
    keep_alive: keepAlive,
    options: {
      temperature: opts.temperature ?? 0.1,
      num_predict: opts.maxTokens ?? 4096,
      num_ctx: RUNTIME_CONTEXT_SIZE,
      repeat_penalty: 1.05,
    },
    ...(opts.responseSchema ? { format: opts.responseSchema } : {}),
  };

  const finalRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(finalBody),
    signal: AbortSignal.timeout(timeout),
  });

  const finalData = (await finalRes.json()) as OllamaChatResponse;
  const finalAnswer = finalData.message?.content ?? '';

  messages.push({ role: 'assistant', content: finalAnswer });

  return {
    answer: finalAnswer,
    history: messages,
    toolCallLog,
    iterations: maxIter,
    model,
    totalDurationMs: Math.round(performance.now() - loopStart),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Build an OllamaToolDef from a simple description
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convenience builder — creates an OllamaToolDef without manually
 * writing the full JSON Schema wrapper.
 *
 * ```ts
 * const weatherTool = defineOllamaTool(
 *   'get_weather',
 *   'Get current weather for a city',
 *   {
 *     city: { type: 'string', description: 'City name' },
 *     units: { type: 'string', description: 'celsius or fahrenheit', enum: ['celsius', 'fahrenheit'] },
 *   },
 *   ['city']
 * );
 * ```
 */
export function defineOllamaTool(
  name: string,
  description: string,
  properties: ToolParameterSchema['properties'],
  required?: string[]
): OllamaToolDef {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        ...(required?.length ? { required } : {}),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Pre-built tool definitions for the ACE stack
// ═══════════════════════════════════════════════════════════════════════════

/** Search the codebase via Qdrant codebase_chunks_768 */
export const TOOL_CODEBASE_SEARCH = defineOllamaTool(
  'codebase_search',
  'Search the SvelteKit codebase for files, functions, routes, or patterns. Returns matching code chunks with file paths, scores, and metadata.',
  {
    query: { type: 'string', description: 'Natural-language search query about the codebase' },
    limit: { type: 'number', description: 'Max results to return (1-20, default 5)' },
  },
  ['query']
);

/** Search the legal knowledge base */
export const TOOL_KB_SEARCH = defineOllamaTool(
  'knowledge_search',
  'Search the legal knowledge base (statutes, case law, evidence, briefs). Returns relevant document chunks with citations.',
  {
    query: { type: 'string', description: 'Legal search query' },
    collection: { type: 'string', description: 'Qdrant collection to search', enum: ['knowledge_base', 'legal_docs', 'case_evidence'] },
    limit: { type: 'number', description: 'Max results (1-20, default 5)' },
  },
  ['query']
);

/** Generate a wiki article on a topic */
export const TOOL_WIKI_GENERATE = defineOllamaTool(
  'wiki_generate',
  'Generate a structured wiki article on a legal or codebase topic. Returns a markdown article with sections, citations, and metadata.',
  {
    topic: { type: 'string', description: 'Topic to generate a wiki article about' },
    context: { type: 'string', description: 'Additional context or constraints for the article' },
    maxLength: { type: 'number', description: 'Max words in the article (default 500)' },
  },
  ['topic']
);

/** Recommend fixes for an error or issue */
export const TOOL_FIX_RECOMMEND = defineOllamaTool(
  'fix_recommend',
  'Analyze an error message, stack trace, or code issue and recommend fixes. Returns structured suggestions with confidence scores.',
  {
    error: { type: 'string', description: 'Error message or stack trace' },
    filePath: { type: 'string', description: 'File path where the error occurs' },
    codeSnippet: { type: 'string', description: 'Relevant code snippet (optional)' },
  },
  ['error']
);

/** Read a file from the repository */
export const TOOL_READ_FILE = defineOllamaTool(
  'read_file',
  'Read the contents of a file from the SvelteKit project. Returns the file content as text.',
  {
    path: { type: 'string', description: 'Relative path from the project root (e.g. src/lib/server/ollama.ts)' },
    startLine: { type: 'number', description: 'Start reading from this line (1-indexed, optional)' },
    endLine: { type: 'number', description: 'Stop reading at this line (inclusive, optional)' },
  },
  ['path']
);

/** Web search fallback — deep research when local KB has no answers */
export const TOOL_WEB_SEARCH = defineOllamaTool(
  'web_search',
  'Search the web for information when local codebase and knowledge base searches return insufficient results. Use as a fallback for external documentation, Stack Overflow solutions, or library API references. Results are cached in Redis and stored in Postgres for future retrieval.',
  {
    query: { type: 'string', description: 'Web search query' },
    maxResults: { type: 'number', description: 'Max web results to crawl and summarize (1-5, default 3)' },
    pipeline: { type: 'string', description: 'Pipeline hint for result categorization', enum: ['ace', 'kag', 'rag', 'codebase'] },
  },
  ['query']
);

/** Error summarization → KAG storage for future retrieval */
export const TOOL_ERROR_SUMMARIZE = defineOllamaTool(
  'error_summarize',
  'Summarize an error, stack trace, or failure context and store it in the Knowledge-Augmented Generation stores (Postgres pgvector + Qdrant tags + Redis cache). Future queries about similar errors will retrieve this context automatically. Use this when you encounter an error during agentic work.',
  {
    error: { type: 'string', description: 'Error message or stack trace to summarize' },
    query: { type: 'string', description: 'The original query that led to this error' },
    filePath: { type: 'string', description: 'File path where the error occurred (optional)' },
    pipeline: { type: 'string', description: 'Pipeline context', enum: ['ace', 'kag', 'rag', 'codebase'] },
  },
  ['error', 'query']
);

// ═══════════════════════════════════════════════════════════════════════════
// web_search handler  (SearXNG → Qdrant research_summaries fallback → Redis cache)
//
// Priority:
//   1. Redis exact-match cache (key: websearch:<fnv1a(query)>)  → ~5 ms
//   2. SearXNG (ENV.SEARXNG_URL)                                → ~1-2 s
//   3. Qdrant research_summaries semantic fallback               → ~300 ms
//
// Successful web results are written back to Redis (TTL 1h).
// Cached or synthesised results can be stored to Postgres separately
// by callers who want KAG persistence.
// ═══════════════════════════════════════════════════════════════════════════

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'searxng' | 'qdrant_fallback' | 'cache';
}

interface WebSearchHandlerResult {
  results: WebSearchResult[];
  cached: boolean;
  source: 'searxng' | 'qdrant_fallback' | 'cache';
  query: string;
}

/** FNV-1a 32-bit hash for Redis cache keying (no crypto dependency) */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h.toString(16);
}

/**
 * Build the `web_search` ToolHandler.
 *
 * Imported from `$lib/server/redis.js` and `$lib/server/vector/qdrant-manager.js` lazily
 * so this module remains side-effect-free at import time.
 */
export function makeWebSearchHandler(): ToolHandler {
  return async (args: Record<string, unknown>): Promise<WebSearchHandlerResult> => {
    const query = String(args.query ?? '').trim();
    const maxResults = Math.min(Math.max(Number(args.maxResults ?? 3), 1), 5);
    if (!query) return { results: [], cached: false, source: 'cache', query };

    const cacheKey = `websearch:${fnv1a32(query)}`;

    // ── 1. Redis cache hit ──────────────────────────────────────────────
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as WebSearchResult[];
        return { results: parsed, cached: true, source: 'cache', query };
      }
    } catch { /* Redis unavailable — continue */ }

    // ── 2. SearXNG ─────────────────────────────────────────────────────
    try {
      const searxUrl = ENV.SEARXNG_URL;
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        engines: 'google,duckduckgo,bing',
        language: 'en',
        safesearch: '1',
      });
      const res = await fetch(`${searxUrl}/search?${params}`, {
        signal: ctrl.signal,
        headers: { 'Accept': 'application/json' },
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
          // Cache for 1 hour
          try {
            const { getRedis } = await import('$lib/server/redis.js');
            const redis = getRedis();
            await redis.set(cacheKey, JSON.stringify(hits), 'EX', 3600);
          } catch { /* non-fatal */ }
          return { results: hits, cached: false, source: 'searxng', query };
        }
      }
    } catch { /* SearXNG unreachable — fall through to Qdrant */ }

    // ── 3. Qdrant research_summaries semantic fallback ──────────────────
    try {
      const { generateEmbedding } = await import('$lib/server/grpc/embedding-client.js');
      const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

      const embedding = await generateEmbedding(query);
      if (embedding) {
        const hits = await qdrant.hybridSearch({
          collection: 'research_summaries',
          query,
          queryEmbedding: embedding,
          limit: maxResults,
        });

        const results: WebSearchResult[] = hits.results
          .filter((h) => h.score > 0.5)
          .map((h) => ({
            title: String(h.payload?.['title'] ?? 'Research Note'),
            url: String(h.payload?.['source'] ?? ''),
            snippet: String(h.payload?.['summary'] ?? '').slice(0, 400),
            source: 'qdrant_fallback' as const,
          }));

        if (results.length > 0) {
          return { results, cached: false, source: 'qdrant_fallback', query };
        }
      }
    } catch { /* non-fatal */ }

    return { results: [], cached: false, source: 'qdrant_fallback', query };
  };
}

