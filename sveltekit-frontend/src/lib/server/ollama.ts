/**
 * Ollama Integration Service — canonical Ollama client.
 *
 * Exports:
 *   - getOllamaEndpoint(): string — resolve Ollama URL from env
 *   - generateText(prompt): string — simple chat (non-streaming)
 *   - callOllamaChat(system, user): string — system+user chat with logging
 *   - bifrostChat(messages, model, options): string — OpenAI-format call via Bifrost gateway
 *   - checkOllamaHealth(): boolean — health probe via /api/tags
 *   - listAvailableModels(): string[] — available model names
 *   - VLM_MODELS — model name constants
 */

// VLM model configurations — resolved from ENV so .env overrides work without code changes.
// Keys are populated after ENV is imported below (see ── Config ──).
// Callers use VLM_MODELS.legal / .vision / .embedding / .gemma4 as before.
export const VLM_MODELS: Record<'vision' | 'embedding' | 'legal' | 'gemma4' | 'tool', string> = {
  /** Unified legal+VLM model (GRPO legal LoRA merged, mmproj vision, 5.3GB) */
  vision: 'gemma4-rotorquant:latest',
  embedding: 'embeddinggemma:latest',
  /** Legal text reasoning / chat / agentic tool-calling (same unified model) */
  legal: 'gemma4-rotorquant:latest',
  /** Gemma 4 unified — tool calling + thinking + vision */
  gemma4: 'gemma4-rotorquant:latest',
  /**
   * Structured-call translator (broker boundary).
   * Defaults to unified Gemma 4. Set FUNCTION_GEMMA_MODEL=functiongemma:latest
   * to route structured tool-call translation through the lighter 270M model
   * once `ollama pull functiongemma:latest` has completed.
   */
  tool: 'gemma4-rotorquant:latest',
};

export type VLMModel = string;

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
  }>;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

import { ollamaBreaker } from '$lib/server/circuit-breaker.js';
import { retry, retryPredicates } from '$lib/server/utils/retry.js';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { Agent } from 'undici';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { TURBOQUANT_BASE_URL } from '$lib/ai/model-ids.js';
import crypto from 'node:crypto';
import type { LlmCacheTrace } from '$lib/server/ai/llm-cache-trace.js';
import { resolveRuntimeConfig } from '$lib/server/ai/inference-configs.js';
import { canUseTurboQuant } from '$lib/server/ai/backend-runtime-guards.js';
import * as Hypergraph from '$lib/server/ai/hypergraph-store.js';

// ── Config ──────────────────────────────────────────────────────────────────

export function getOllamaEndpoint(): string {
  return ENV.OLLAMA_BASE_URL;
}

const OLLAMA_BASE_URL = ENV.OLLAMA_BASE_URL;
const CHAT_MODEL = ENV.OLLAMA_CHAT_MODEL;
const REQUEST_TIMEOUT_MS = Number(process.env?.OLLAMA_TIMEOUT_MS ?? '600000');

export function getOllamaRequestTimeoutMs(): number {
  return REQUEST_TIMEOUT_MS;
}

function parseTimeoutMs(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAbortTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || /abort|timeout/i.test(error.message);
}

const BIFROST_GATEWAY_TIMEOUT_MS = parseTimeoutMs(process.env?.BIFROST_TIMEOUT_MS, 30000);
const BIFROST_L2_EMBED_TIMEOUT_MS = parseTimeoutMs(process.env?.BIFROST_L2_EMBED_TIMEOUT_MS, 2000);
const BIFROST_L2_QDRANT_TIMEOUT_MS = parseTimeoutMs(
  process.env?.BIFROST_L2_QDRANT_TIMEOUT_MS,
  1500
);
const BIFROST_GATEWAY_FAILURE_COOLDOWN_MS = parseTimeoutMs(
  process.env?.BIFROST_GATEWAY_COOLDOWN_MS,
  30_000
);
let bifrostGatewayUnavailableUntil = 0;

export type DirectOllamaCapability =
  | 'json-schema'
  | 'tool-calls'
  | 'audit-planner'
  | 'error-summary';

const DIRECT_OLLAMA_ALLOWLIST: Readonly<Record<string, readonly DirectOllamaCapability[]>> = {
  'ace/gemma4-codeintel': ['json-schema', 'tool-calls'],
  'ace/ace-error-kag': ['error-summary'],
  'audit/gemma-tool-router': ['audit-planner'],
};

export function assertDirectOllamaAllowed(
  caller: string,
  capability: DirectOllamaCapability,
  note?: string
): void {
  const allowed = DIRECT_OLLAMA_ALLOWLIST[caller] ?? [];
  if (!allowed.includes(capability)) {
    throw new Error(
      `[bifrost-boundary] Direct Ollama denied for ${caller} (${capability}). Route this through bifrostChat or add explicit allowlist review.`
    );
  }
  if (note) {
    console.info(`[bifrost-boundary] direct allow ${caller}:${capability} - ${note}`);
  }
}

// Populate VLM_MODELS from ENV now that ENV is initialized
VLM_MODELS.vision = ENV.OLLAMA_VLM_MODEL;
VLM_MODELS.gemma4 = ENV.GEMMA4_MODEL;
VLM_MODELS.legal = ENV.OLLAMA_CHAT_MODEL;
VLM_MODELS.embedding = ENV.OLLAMA_EMBED_MODEL;
VLM_MODELS.tool = ENV.FUNCTION_GEMMA_MODEL;

// ── HTTP Keep-Alive Agent ───────────────────────────────────────────────────
// Reuses TCP connections to Ollama instead of creating new ones per request.
// keepAliveTimeout: 30s (Ollama inference can be slow, keep conn alive between calls)
// maxSockets: 10 (conservative for 8GB VRAM with NUM_PARALLEL=2)
const ollamaDispatcher = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 600_000,
  connections: 10,
  pipelining: 1,
});

/**
 * Keep the smaller embedding model resident, but let the large chat model
 * age out quickly on 8 GB GPUs to reduce eviction/reload churn.
 */
const CHAT_MODEL_KEEP_ALIVE = process.env?.OLLAMA_CHAT_KEEP_ALIVE ?? '10m';
const EMBEDDING_MODEL_KEEP_ALIVE =
  process.env?.OLLAMA_EMBED_KEEP_ALIVE ?? process.env?.OLLAMA_KEEP_ALIVE ?? '24h';
const OLLAMA_DIAGNOSTICS_ENABLED =
  (process.env?.OLLAMA_DIAGNOSTICS_ENABLED ??
    (ENV.NODE_ENV === 'development' ? 'true' : 'false')) === 'true';

export function getChatModelKeepAlive(): string {
  return CHAT_MODEL_KEEP_ALIVE;
}

export function getEmbeddingModelKeepAlive(): string {
  return EMBEDDING_MODEL_KEEP_ALIVE;
}

function parseKeepAliveMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 'ms') return amount;
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60_000;
  return amount * 3_600_000;
}

function extractOllamaRequestMeta(
  url: string,
  init?: RequestInit
): {
  endpoint: string;
  model?: string;
  keepAlive?: string | number;
} {
  const endpoint = new URL(url, OLLAMA_BASE_URL).pathname;
  if (typeof init?.body !== 'string') return { endpoint };

  try {
    const parsed = JSON.parse(init.body) as { model?: string; keep_alive?: string | number };
    return {
      endpoint,
      model: parsed.model,
      keepAlive: parsed.keep_alive,
    };
  } catch {
    return { endpoint };
  }
}

function logOllamaDiagnostics(
  phase: 'success' | 'error',
  meta: ReturnType<typeof extractOllamaRequestMeta>,
  durationMs: number,
  status?: number,
  error?: unknown,
  backend: 'ollama' | 'turboquant' = 'ollama'
): void {
  if (!OLLAMA_DIAGNOSTICS_ENABLED) return;

  const keepAliveMs = parseKeepAliveMs(meta.keepAlive);
  const residentUntil =
    keepAliveMs !== null && keepAliveMs > 0
      ? new Date(Date.now() + keepAliveMs).toISOString()
      : null;
  const details = [
    `backend=${backend}`,
    `profile=${runtimeConfig.profile}`,
    `endpoint=${meta.endpoint}`,
    `model=${meta.model ?? 'unknown'}`,
    `keep_alive=${String(meta.keepAlive ?? 'unset')}`,
    `duration_ms=${durationMs}`,
  ];

  if (typeof status === 'number') details.push(`status=${status}`);
  if (residentUntil && (meta.endpoint === '/api/chat' || meta.endpoint === '/api/generate')) {
    details.push(`resident_until~=${residentUntil}`);
  }

  if (phase === 'success') {
    console.log(`[ollama-diag] ${details.join(' ')}`);
    return;
  }

  const errorMessage = error instanceof Error ? error.message : String(error ?? 'unknown error');
  console.warn(`[ollama-diag] ${details.join(' ')} error=${errorMessage}`);
}

function buildBifrostCacheTrace(
  hitLevel: 'L1' | 'L2' | 'L3',
  latencyMs: number,
  similarity?: number
): LlmCacheTrace {
  return {
    modelRole: 'bifrost-chat-synthesis',
    cacheTier: hitLevel === 'L1' ? 'L1_exact' : hitLevel === 'L2' ? 'L2_semantic' : 'L3_ollama',
    tokenizerFamily: 'gemma',
    provider: hitLevel === 'L3' ? 'ollama' : 'bifrost',
    latencyMs,
    similarity,
  };
}

function logBifrostCacheTrace(
  model: string,
  trace: LlmCacheTrace,
  metadata: Record<string, unknown>
): void {
  logInference({
    type: 'llm',
    model,
    backend: trace.provider === 'ollama' ? 'ollama' : 'bifrost',
    latencyMs: trace.latencyMs ?? 0,
    cacheHit: trace.cacheTier !== 'L3_ollama',
    metadata: {
      model_role: trace.modelRole,
      cache_tier: trace.cacheTier,
      tokenizerFamily: trace.tokenizerFamily,
      ...metadata,
    },
  });
}

// ── TurboQuant Intercept ──────────────────────────────────────────────────
// When enabled, ollamaFetch() transparently routes /api/chat and /api/generate
// through TurboQuant llama-server (:8080) for ~78 tok/s GPU inference.
// Ollama remains as automatic fallback when TurboQuant is unavailable.
// Toggle: TURBOQUANT_INTERCEPT=false to disable.
const runtimeConfig = resolveRuntimeConfig();
const TURBOQUANT_INTERCEPT_ENABLED =
  (process.env?.TURBOQUANT_INTERCEPT ?? 'true') === 'true' && canUseTurboQuant(runtimeConfig);

/** Cached health status to avoid hitting /health on every single request */
let _turboHealthy = false;
let _turboHealthCheckedAt = 0;
const TURBO_HEALTH_CACHE_MS = 5_000;

async function isTurboQuantHealthy(): Promise<boolean> {
  if (Date.now() - _turboHealthCheckedAt < TURBO_HEALTH_CACHE_MS) {
    return _turboHealthy;
  }
  try {
    const res = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
      signal: AbortSignal.timeout(800),
    });
    _turboHealthy = res.ok;
  } catch {
    _turboHealthy = false;
  }
  _turboHealthCheckedAt = Date.now();
  return _turboHealthy;
}

/**
 * Try to intercept an Ollama /api/chat or /api/generate request and route
 * it through TurboQuant instead. Returns a Response in Ollama-compatible
 * format, or null to fall through to Ollama.
 *
 * Only intercepts non-streaming requests (stream: false). Streaming stays
 * on Ollama since TurboQuant SSE → Ollama ndjson conversion is non-trivial.
 */
async function tryTurboQuantIntercept(url: string, init?: RequestInit): Promise<Response | null> {
  if (!TURBOQUANT_INTERCEPT_ENABLED) return null;
  if (typeof init?.body !== 'string') return null;

  // Detect endpoint from URL
  let urlPath: string;
  try {
    urlPath = new URL(url, OLLAMA_BASE_URL).pathname;
  } catch {
    return null;
  }
  const isChatEndpoint = urlPath === '/api/chat';
  const isGenerateEndpoint = urlPath === '/api/generate';
  if (!isChatEndpoint && !isGenerateEndpoint) return null;

  // Parse Ollama request body
  let ollamaBody: Record<string, any>;
  try {
    ollamaBody = JSON.parse(init.body);
  } catch {
    return null;
  }

  // Only intercept non-streaming requests
  if (ollamaBody.stream !== false) return null;

  // Check TurboQuant health (cached 5s)
  if (!(await isTurboQuantHealthy())) return null;

  try {
    const startMs = performance.now();

    // Convert Ollama format → OpenAI messages format
    const openaiMessages: Array<{ role: string; content: string }> = [];

    if (isChatEndpoint) {
      // /api/chat: { messages: [...], model, options: { temperature, num_predict } }
      if (Array.isArray(ollamaBody.messages)) {
        for (const msg of ollamaBody.messages) {
          openaiMessages.push({ role: msg.role, content: msg.content });
        }
      }
    } else {
      // /api/generate: { prompt: "...", system: "...", model, options: {...} }
      if (ollamaBody.system) {
        openaiMessages.push({ role: 'system', content: ollamaBody.system });
      }
      openaiMessages.push({ role: 'user', content: ollamaBody.prompt ?? '' });
    }

    if (openaiMessages.length === 0) return null;

    const temperature = ollamaBody.options?.temperature ?? 0.7;
    const maxTokens = ollamaBody.options?.num_predict ?? 2048;

    // Build TurboQuant request (OpenAI-compatible)
    const tqRequestBody: Record<string, unknown> = {
      messages: openaiMessages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
      cache_prompt: true,
    };

    // Pass through tools if present (llama-server supports OpenAI tool calling)
    if (ollamaBody.tools) {
      tqRequestBody.tools = ollamaBody.tools;
    }

    const tqRes = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tqRequestBody),
      signal: AbortSignal.timeout(120_000),
    });

    if (!tqRes.ok) return null;

    const tqData = (await tqRes.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: Array<{
            function: { name: string; arguments: string | Record<string, unknown> };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const choice = tqData.choices?.[0]?.message;
    const content = choice?.content ?? choice?.reasoning_content ?? '';
    // Don't require content if tool_calls are present (tool-calling responses may have empty content)
    if (!content && !choice?.tool_calls?.length) return null;

    const latencyMs = Math.round(performance.now() - startMs);
    const usage = tqData.usage ?? {};

    // Convert OpenAI tool_calls format to Ollama format
    // OpenAI: arguments is a JSON string; Ollama: arguments is a parsed object
    let ollamaToolCalls:
      | Array<{ function: { name: string; arguments: Record<string, unknown> } }>
      | undefined;
    if (choice?.tool_calls?.length) {
      ollamaToolCalls = choice.tool_calls.map((tc) => {
        let args: Record<string, unknown> = {};
        if (typeof tc.function.arguments === 'string') {
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            /* keep empty */
          }
        } else if (typeof tc.function.arguments === 'object' && tc.function.arguments !== null) {
          args = tc.function.arguments as Record<string, unknown>;
        }
        return { function: { name: tc.function.name, arguments: args } };
      });
    }

    // Convert response to Ollama format
    let ollamaResponse: Record<string, unknown>;

    if (isChatEndpoint) {
      const message: Record<string, unknown> = { role: 'assistant', content };
      if (ollamaToolCalls?.length) {
        message.tool_calls = ollamaToolCalls;
      }
      ollamaResponse = {
        model: ollamaBody.model ?? 'gemma4-rotorquant:latest',
        created_at: new Date().toISOString(),
        message,
        done: true,
        total_duration: latencyMs * 1_000_000,
        load_duration: 0,
        prompt_eval_count: usage.prompt_tokens ?? 0,
        prompt_eval_duration: 0,
        eval_count: usage.completion_tokens ?? 0,
        eval_duration: latencyMs * 1_000_000,
      };
    } else {
      // /api/generate response format
      ollamaResponse = {
        model: ollamaBody.model ?? 'gemma4-rotorquant:latest',
        created_at: new Date().toISOString(),
        response: content,
        done: true,
        total_duration: latencyMs * 1_000_000,
        load_duration: 0,
        prompt_eval_count: usage.prompt_tokens ?? 0,
        prompt_eval_duration: 0,
        eval_count: usage.completion_tokens ?? 0,
        eval_duration: latencyMs * 1_000_000,
      };
    }

    const tps =
      usage.completion_tokens && latencyMs > 0
        ? ((usage.completion_tokens / latencyMs) * 1000).toFixed(1)
        : '?';
    console.info(
      `[turbo-intercept] ${urlPath} → TurboQuant ${latencyMs}ms ` +
        `(${usage.completion_tokens ?? '?'} tokens, ${tps} tok/s)`
    );

    return new Response(JSON.stringify(ollamaResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.debug(
      `[turbo-intercept] Failed, falling back to Ollama: ${(err as Error)?.message?.slice(0, 100)}`
    );
    return null;
  }
}

/**
 * Check if the GPU is currently under heavy load from TurboQuant.
 * Used to avoid parallel VLM/Ollama contention on 8GB cards.
 */
async function isGpuCongested(): Promise<boolean> {
  // If TurboQuant is healthy, we assume it's holding VRAM/KVCache
  return await isTurboQuantHealthy();
}

/**
 * Shared fetch wrapper for Ollama requests with connection pooling.
 * All Ollama HTTP calls should use this instead of raw fetch().
 *
 * When TurboQuant (llama-server :8090) is running, /api/chat and /api/generate
 * requests are transparently routed through TurboQuant for ~78 tok/s GPU
 * inference. Ollama is used as automatic fallback.
 */
export async function ollamaFetch(url: string, init?: RequestInit): Promise<Response> {
  const meta = extractOllamaRequestMeta(url, init);
  const startedAt = Date.now();

  // TurboQuant intercept: route /api/chat and /api/generate through GPU llama-server
  const turboResponse = await tryTurboQuantIntercept(url, init);
  if (turboResponse && turboResponse.ok) {
    logOllamaDiagnostics('success', meta, Date.now() - startedAt, 200, undefined, 'turboquant');
    return turboResponse;
  }

  // VRAM Contention Guard: If this is a large model call (VLM/Gemma4) to Ollama,
  // but TurboQuant is already active, we risk an OOM or massive swapping.
  const isLargeModel = meta.model === VLM_MODELS.vision || meta.model === VLM_MODELS.gemma4;
  if (isLargeModel && (await isGpuCongested())) {
    const msg = `[ollama] VRAM congestion: skipping Ollama ${meta.model} while TurboQuant is active`;
    console.warn(msg);
    return new Response(JSON.stringify({ error: 'GPU_CONGESTION', message: msg }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const response = await fetch(url, {
      ...init,
      dispatcher: ollamaDispatcher,
    } as RequestInit);
    logOllamaDiagnostics(
      'success',
      meta,
      Date.now() - startedAt,
      response.status,
      undefined,
      'ollama'
    );
    return response;
  } catch (error) {
    const duration = Date.now() - startedAt;
    logOllamaDiagnostics('error', meta, duration, undefined, error);

    // Normalize error response so agents get a consistent JSON envelope
    return new Response(
      JSON.stringify({
        error: 'FETCH_ERROR',
        message: (error as Error)?.message ?? String(error),
        duration,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ── Bifrost Gateway (OpenAI-compatible gateway with semantic caching) ─────

/**
 * Call Bifrost gateway using OpenAI-compatible format.
 * Bifrost applies semantic caching before
 * forwarding to Ollama. Returns the content string.
 *
 * Exported so other modules can use it directly.
 */
/**
 * Normalize a user message before embedding for Bifrost semantic cache.
 * Strips filler preambles and normalizes legal citation variants so that
 * semantically equivalent queries consistently hit the same cache entry.
 */
function normalizeBifrostMessage(content: string): string {
  return content
    .replace(
      /^(can you (please )?|could you (please )?|i (want|need|would like) (you )?to |please )/i,
      ''
    )
    .replace(/^(help me (understand|with|explain)|tell me (about|how|what|why) )/i, '')
    .replace(/\bsec(?:tion|\.)?\s*(\d+)/gi, '§$1')
    .replace(/§\s+(\d)/g, '§$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

/** Options shared by all bifrostChat overloads */
type BifrostChatOptions = {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  cacheKey?: string;
  /**
   * Entity tags from Qdrant payload enrichment (e.g. from generateEmbeddingsWithTags).
   * Top-4 sorted tags are appended to the Bifrost x-bf-cache-key so that semantically
   * similar queries about different legal domains get distinct cache entries.
   * Example: 'hearsay evidence' vs 'hearsay objection' both embed similarly but
   * tag differently (evidence-rules vs courtroom-procedure) → separate cache slots.
   */
  entityTags?: string[];
  tools?: ReadonlyArray<unknown>;
  toolChoice?: string | object;
  lane?: Hypergraph.AgentLane;
  taskType?: Hypergraph.TaskType;
  sessionId?: string;
};

function normalizeToolCalls(toolCalls: unknown): any[] | undefined {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return undefined;

  return toolCalls
    .map((toolCall) => {
      const rawFunction =
        typeof toolCall === 'object' && toolCall !== null && 'function' in toolCall
          ? (toolCall as { function?: { name?: unknown; arguments?: unknown } }).function
          : undefined;
      const name = typeof rawFunction?.name === 'string' ? rawFunction.name : '';
      const rawArguments = rawFunction?.arguments;
      let parsedArguments: Record<string, unknown> = {};

      if (typeof rawArguments === 'string') {
        try {
          const parsed = JSON.parse(rawArguments);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedArguments = parsed as Record<string, unknown>;
          }
        } catch {
          parsedArguments = {};
        }
      } else if (rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
        parsedArguments = rawArguments as Record<string, unknown>;
      }

      if (!name) return null;
      return {
        function: {
          name,
          arguments: parsedArguments,
        },
      };
    })
    .filter(Boolean);
}

/** Overload: no tools → guaranteed string */
export function turboQuantChat(
  messages: Array<OllamaMessage>,
  model: string,
  options?: Omit<BifrostChatOptions, 'tools' | 'toolChoice'> & { tools?: never }
): Promise<string>;
/** Overload: with tools → may return tool_calls object */
export function turboQuantChat(
  messages: Array<OllamaMessage>,
  model: string,
  options: BifrostChatOptions & { tools: ReadonlyArray<unknown> }
): Promise<string | { content: string; tool_calls?: any[]; sessionId: string }>;
/** Implementation */
export async function turboQuantChat(
  messages: Array<OllamaMessage>,
  model: string,
  options?: BifrostChatOptions
): Promise<string | { content: string; tool_calls?: any[]; sessionId: string }> {
  const sessionId = options?.sessionId ?? crypto.randomUUID();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const healthRes = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
    signal: AbortSignal.timeout(Math.min(timeoutMs, 1_000)),
  }).catch(() => null);

  if (!healthRes?.ok) {
    throw new Error('TurboQuant is unavailable on :8090');
  }

  const normalizedMessages = messages.map((message) =>
    message.role === 'user'
      ? { ...message, content: normalizeBifrostMessage(message.content) }
      : message
  );

  const requestBody = {
    model,
    messages: normalizedMessages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    })),
    max_tokens: options?.maxTokens ?? 2048,
    temperature: options?.temperature ?? 0.2,
    stream: false,
    cache_prompt: true,
    ...(options?.tools ? { tools: options.tools } : {}),
    ...(options?.toolChoice ? { tool_choice: options.toolChoice } : {}),
  };

  const startedAt = Date.now();
  const res = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`TurboQuant chat failed (${res.status}): ${errorText.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    choices?: Array<{
      message?: {
        content?: string;
        reasoning_content?: string;
        tool_calls?: unknown;
      };
    }>;
  };

  const choice = data.choices?.[0]?.message;
  const content = choice?.content ?? choice?.reasoning_content ?? '';
  const toolCalls = normalizeToolCalls(choice?.tool_calls);

  logInference({
    type: 'llm',
    model,
    backend: 'turboquant',
    latencyMs: Date.now() - startedAt,
    cacheHit: false,
    metadata: {
      model_role: 'turboquant-chat',
      cache_tier: 'L4_none',
      tokenizerFamily: 'gemma',
      toolCalls: toolCalls?.length ?? 0,
      sessionId,
    },
  });

  if (options?.tools) {
    return { content, tool_calls: toolCalls, sessionId };
  }

  return content;
}

/** Overload: no tools → guaranteed string */
export function bifrostChat(
  messages: Array<OllamaMessage>,
  model: string,
  options?: Omit<BifrostChatOptions, 'tools' | 'toolChoice'> & { tools?: never }
): Promise<string>;
/** Overload: with tools → may return tool_calls object */
export function bifrostChat(
  messages: Array<OllamaMessage>,
  model: string,
  options: BifrostChatOptions & { tools: ReadonlyArray<unknown> }
): Promise<string | { content: string; tool_calls?: any[]; sessionId: string }>;
/** Implementation */
export async function bifrostChat(
  messages: Array<OllamaMessage>,
  model: string,
  options?: BifrostChatOptions
): Promise<string | { content: string; tool_calls?: any[]; sessionId: string }> {
  // ── Hypergraph Recording Start ──
  const sessionId = options?.sessionId ?? crypto.randomUUID();
  const lane = options?.lane ?? Hypergraph.AgentLane.Interactive;
  const taskType = options?.taskType ?? 'streaming-chat';

  if (lane === Hypergraph.AgentLane.Interactive && !options?.sessionId) {
    await Hypergraph.recordSessionStart({
      sessionId,
      lane,
      taskType,
      startTime: Date.now(),
      metadata: { model, options: { temperature: options?.temperature } },
    });
  }

  // ── Lane 1 Routing & VLM Escalation ──
  // Rule: VLM escalation only when images/screenshots are present, or as a fallback
  const hasImages = messages.some(
    (m) => m.content.includes('data:image/') || m.content.includes('base64')
  );
  const effectiveModel = hasImages ? VLM_MODELS.vision : model;

  const bifrostModel = effectiveModel.includes('/') ? effectiveModel : `ollama/${effectiveModel}`;
  // x-bf-cache-key is REQUIRED for Bifrost semantic caching to activate.
  // Without it, every request bypasses the cache entirely (Bifrost docs).
  // 'legal-ai-global' creates a shared namespace: semantically similar questions
  // from any user hit the same cache entry (ideal for repeatable legal queries).
  // If entityTags are provided, append top-4 sorted tags to differentiate legal domains.
  const baseKey = options?.cacheKey ?? 'legal-ai-global';
  const tagSuffix = options?.entityTags?.length
    ? ':' + [...options.entityTags].sort().slice(0, 4).join(',')
    : '';
  const cacheKey = `${baseKey}${tagSuffix}`;
  // Normalize user messages to improve semantic cache hit rate (filler stripping, citation normalization)
  const normalizedMessages = messages.map((m) =>
    m.role === 'user' ? { ...m, content: normalizeBifrostMessage(m.content) } : m
  );

  // ── L1 Cache: Redis Exact-Match (sub-ms lookup, 17,500× speedup) ──
  const { generateCacheKey, getExactMatchCache, setExactMatchCache } = await import(
    './cache/redis-exact-match.js'
  );
  const exactCacheKey = generateCacheKey({
    model: bifrostModel,
    messages: normalizedMessages,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });

  const t_start = performance.now();
  let t_l1 = 0;
  let t_embed = 0;
  let t_qdrant = 0;
  let t_l3 = 0;
  let cacheHitLevel: 'L1' | 'L2' | 'L3' = 'L3';
  let writebackQueued = false;

  const exactMatch = await getExactMatchCache(exactCacheKey);
  t_l1 = performance.now() - t_start;

  if (exactMatch) {
    cacheHitLevel = 'L1';
    console.log(`[bifrost] L1 EXACT-MATCH HIT (${exactMatch.backend}) — l1_ms=${t_l1.toFixed(2)}`);
    logBifrostCacheTrace(bifrostModel, buildBifrostCacheTrace('L1', Math.round(t_l1)), {
      source: 'bifrostChat',
      cache_backend: 'redis-exact-match',
    });
    return exactMatch.content;
  }

  // ── L2 Cache: Qdrant HTTP Semantic Search (bypasses Bifrost gRPC bug) ──
  // Bifrost's semantic_cache plugin uses gRPC to Qdrant which hangs due to Docker IPv6 resolution.
  // We implement equivalent functionality using Qdrant's HTTP REST API directly.
  const bifrostGatewayTimeoutMs = Math.min(
    options?.timeoutMs ?? BIFROST_GATEWAY_TIMEOUT_MS,
    BIFROST_GATEWAY_TIMEOUT_MS
  );
  const L2_SEMANTIC_THRESHOLD = 0.82;
  const BIFROST_CACHE_COLLECTION = 'BifrostSemanticCachePlugin';

  const lastUserMsg = normalizedMessages.findLast((m) => m.role === 'user')?.content ?? '';
  let l2CacheHit = false;
  if (lastUserMsg) {
    try {
      // Embed the query using Ollama (embeddinggemma, 768-dim)
      const t0_embed = performance.now();
      const embedRes = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: VLM_MODELS.embedding, input: lastUserMsg }),
        signal: AbortSignal.timeout(BIFROST_L2_EMBED_TIMEOUT_MS),
      });
      t_embed = performance.now() - t0_embed;

      if (embedRes.ok) {
        const embedData = (await embedRes.json()) as { embeddings?: number[][] };
        const vec = embedData.embeddings?.[0];
        if (vec?.length === 768) {
          // Search Qdrant HTTP for similar cached response (filter by model + cache_key)
          const t0_qdrant = performance.now();
          const searchRes = await fetch(
            `${ENV.QDRANT_URL}/collections/${BIFROST_CACHE_COLLECTION}/points/search`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                vector: vec,
                limit: 1,
                score_threshold: L2_SEMANTIC_THRESHOLD,
                with_payload: true,
                with_vector: false,
                filter: {
                  must: [
                    { key: 'model', match: { value: bifrostModel } },
                    { key: 'cache_key', match: { value: 'global' } },
                  ],
                },
              }),
              signal: AbortSignal.timeout(BIFROST_L2_QDRANT_TIMEOUT_MS),
            }
          );
          t_qdrant = performance.now() - t0_qdrant;

          if (searchRes.ok) {
            const searchData = (await searchRes.json()) as {
              result?: Array<{ score: number; payload?: { response?: string } }>;
            };
            const hit = searchData.result?.[0];
            if (hit && hit.score >= L2_SEMANTIC_THRESHOLD && hit.payload?.response) {
              try {
                const parsed = JSON.parse(hit.payload.response) as {
                  choices?: Array<{ message?: { content?: string } }>;
                };
                const cachedContent = parsed.choices?.[0]?.message?.content ?? '';
                if (cachedContent) {
                  cacheHitLevel = 'L2';
                  console.debug(
                    `[bifrost] L2 QDRANT-HTTP HIT score=${hit.score.toFixed(
                      3
                    )} — qdrant_ms=${t_qdrant.toFixed(2)}`
                  );
                  await setExactMatchCache(exactCacheKey, {
                    content: cachedContent,
                    model: bifrostModel,
                    backend: 'qdrant-semantic',
                  });
                  l2CacheHit = true;
                  logBifrostCacheTrace(
                    bifrostModel,
                    buildBifrostCacheTrace(
                      'L2',
                      Math.round(performance.now() - t_start),
                      hit.score
                    ),
                    {
                      source: 'bifrostChat',
                      cache_backend: 'qdrant-semantic',
                    }
                  );
                  return cachedContent;
                }
              } catch {
                // malformed response JSON in Qdrant payload — fall through
              }
            }
          }
        }
      }
    } catch {
      // L2 probe failed — fall through to Bifrost gateway (L3)
    }
  }
  // ── L3: Bifrost Gateway → Ollama ──────────────────────────────────────────
  // Bifrost acts as a pure forwarding gateway (vector_store removed from config to
  // avoid Docker gRPC hang). L1/L2 handled above; L3 does the actual inference.
  const bifrostStart = performance.now();
  let content = '';
  let cacheHit = false;
  let hitType: string | undefined;
  let tool_calls: any[] | undefined;

  const callDirectOllamaFallback = async () => {
    const ollamaRes = await ollamaFetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model, // use original model name (not bifrost prefixed)
        messages: normalizedMessages,
        stream: false,
        ...(options?.tools ? { tools: options.tools } : {}),
        options: {
          temperature: options?.temperature ?? 0.7,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
      signal: AbortSignal.timeout(options?.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama L3 error: ${ollamaRes.status}`);
    }

    const ollamaData = (await ollamaRes.json()) as OllamaResponse;
    content = ollamaData.message?.content ?? '';
    tool_calls = ollamaData.message?.tool_calls;
    t_l3 = performance.now() - bifrostStart;
    console.log(`[bifrost] L3 DIRECT OLLAMA OK (l3_ms=${Math.round(t_l3)})`);
  };

  try {
    await traceLLM(
      'bifrost_synthesis',
      {
        model: bifrostModel,
        messages: normalizedMessages,
        temperature: options?.temperature ?? 0.7,
        maxTokens: options?.maxTokens ?? 2048,
      },
      async (gen) => {
        if (Date.now() < bifrostGatewayUnavailableUntil) {
          logInference({
            type: 'llm',
            model: bifrostModel,
            backend: 'bifrost',
            latencyMs: 0,
            cacheHit: false,
            error: 'gateway cooldown active',
            metadata: {
              source: 'bifrostChat',
              stage: 'gateway-skip',
              fallback: 'ollama-direct',
              retryAt: new Date(bifrostGatewayUnavailableUntil).toISOString(),
            },
          });
          await callDirectOllamaFallback();
        } else {
          const res = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-bf-cache-key': cacheKey,
            },
            body: JSON.stringify({
              model: bifrostModel,
              messages: normalizedMessages,
              temperature: options?.temperature ?? 0.7,
              max_tokens: options?.maxTokens ?? 2048,
              stream: false,
              ...(options?.tools ? { tools: options.tools } : {}),
              ...(options?.toolChoice ? { tool_choice: options.toolChoice } : {}),
            }),
            signal: AbortSignal.timeout(bifrostGatewayTimeoutMs),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Bifrost error: ${res.status} ${text.slice(0, 200)}`);
          }

          // GPU-accelerated JSON parsing via simdjson (5× faster for large Bifrost responses)
          const rawText = await res.text();
          const data = fastJsonParse<{
            choices?: Array<{ message?: { content?: string; tool_calls?: any[] } }>;
            extra_fields?: {
              cache_debug?: { cache_hit?: boolean; hit_type?: string; similarity?: number };
            };
          }>(rawText);
          const debug = data.extra_fields?.cache_debug;
          const choice = data.choices?.[0]?.message;
          content = choice?.content ?? '';
          tool_calls = choice?.tool_calls;
          cacheHit = !!debug?.cache_hit;
          hitType = debug?.hit_type;
          bifrostGatewayUnavailableUntil = 0;

          t_l3 = performance.now() - bifrostStart;
          if (debug?.cache_hit) {
            console.debug(
              `[bifrost] L2 SEMANTIC HIT type=${debug.hit_type} similarity=${debug.similarity?.toFixed(3)}`
            );
          }
        }

        gen.end({
          output: content,
          usage: {
            totalTokens: Math.round(content.length / 4),
          },
        });
      }
    );

    if (tool_calls?.length) {
      logBifrostCacheTrace(
        bifrostModel,
        buildBifrostCacheTrace('L3', Math.round(performance.now() - t_start)),
        {
          source: 'bifrostChat',
          gatewayCacheHit: cacheHit,
          hitType: hitType ?? null,
          toolCalls: tool_calls.length,
        }
      );
      return { content, tool_calls, sessionId };
    }
  } catch (bifrostErr) {
    // ── L3 Fallback: Direct Ollama (bypasses broken Bifrost) ──
    const gatewayTimedOut = isAbortTimeoutError(bifrostErr);
    const errorMessage = (bifrostErr as Error)?.message?.slice(0, 120) ?? 'unknown error';
    bifrostGatewayUnavailableUntil = Date.now() + BIFROST_GATEWAY_FAILURE_COOLDOWN_MS;

    logInference({
      type: 'llm',
      model: bifrostModel,
      backend: 'bifrost',
      latencyMs: Math.round(performance.now() - bifrostStart),
      cacheHit: false,
      error: errorMessage,
      metadata: {
        source: 'bifrostChat',
        stage: 'gateway-error',
        fallback: 'ollama-direct',
        timedOut: gatewayTimedOut,
        cooldownMs: BIFROST_GATEWAY_FAILURE_COOLDOWN_MS,
        retryAt: new Date(bifrostGatewayUnavailableUntil).toISOString(),
      },
    });

    if (gatewayTimedOut) {
      console.info(
        `[bifrost] Gateway timeout after ${bifrostGatewayTimeoutMs}ms, falling back to direct Ollama`
      );
    } else {
      console.warn(`[bifrost] Gateway error (${errorMessage}), falling back to direct Ollama`);
    }

    await callDirectOllamaFallback();
    if (tool_calls?.length) {
      logBifrostCacheTrace(
        bifrostModel,
        buildBifrostCacheTrace('L3', Math.round(performance.now() - t_start)),
        {
          source: 'bifrostChat',
          fallback: 'ollama-direct',
          toolCalls: tool_calls.length,
        }
      );
      return { content, tool_calls, sessionId };
    }
  }

  // Store in Redis exact-match cache for instant future retrieval
  if (content && !l2CacheHit) {
    // Write-back to Qdrant semantic cache (L2) so future similar queries hit L2
    // Fire-and-forget (non-blocking) — we don't want to delay the response
    if (lastUserMsg) {
      writebackQueued = true;
      (async () => {
        try {
          const embedRes = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: VLM_MODELS.embedding, input: lastUserMsg }),
            signal: AbortSignal.timeout(5_000),
          });
          if (embedRes.ok) {
            const embedData = (await embedRes.json()) as { embeddings?: number[][] };
            const vec = embedData.embeddings?.[0];
            if (vec?.length === 768) {
              const pointId = crypto.randomUUID();
              const cachedResponse = JSON.stringify({
                id: `bifrost-l3-${Date.now()}`,
                object: 'chat.completion',
                model: bifrostModel,
                choices: [
                  { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
                ],
                usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
              });
              await fetch(`${ENV.QDRANT_URL}/collections/${BIFROST_CACHE_COLLECTION}/points`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  points: [
                    {
                      id: pointId,
                      vector: vec,
                      payload: {
                        request_hash: exactCacheKey,
                        params_hash: cacheKey,
                        cache_key: 'global',
                        model: bifrostModel,
                        provider: 'ollama',
                        response: cachedResponse,
                        stream_chunks: '',
                        from_bifrost_semantic_cache_plugin: true,
                        expires_at: Math.floor(Date.now() / 1000) + 7200, // 2h TTL
                      },
                    },
                  ],
                }),
                signal: AbortSignal.timeout(3_000),
              });
            }
          }
        } catch {
          // write-back failure is non-fatal
        }
      })();
    }
    await setExactMatchCache(exactCacheKey, {
      content,
      model: bifrostModel,
      backend: cacheHit ? `bifrost-semantic${hitType ? '-' + hitType : ''}` : 'ollama-direct',
    });
  }

  const total_ms = performance.now() - t_start;
  console.log(
    `[bifrost-stats] hit_level=${cacheHitLevel} total_ms=${total_ms.toFixed(
      2
    )} l1_ms=${t_l1.toFixed(2)} embed_ms=${t_embed.toFixed(2)} qdrant_ms=${t_qdrant.toFixed(
      2
    )} l3_ms=${t_l3.toFixed(2)} writeback=${writebackQueued}`
  );

  // ── Hypergraph Recording End ──
  if (lane === Hypergraph.AgentLane.Interactive && content) {
    await Hypergraph.recordInferenceStep(sessionId, { role: 'assistant', content }, total_ms);
    if (!options?.sessionId) {
      await Hypergraph.finalizeSession(sessionId, 'completed');
    }
  }

  if (content) {
    const trace = buildBifrostCacheTrace('L3', Math.round(total_ms));
    logBifrostCacheTrace(bifrostModel, trace, {
      source: 'bifrostChat',
      gatewayCacheHit: cacheHit,
      hitType: hitType ?? null,
      chatTemplate: 'gemma',
      response: content.slice(0, 20_000),
      temperature: options?.temperature ?? 0.7,
      writebackQueued,
    });
  }

  if (tool_calls?.length) {
    return { content, tool_calls, sessionId };
  }

  return content;
}

// ── Chat Functions (merged from ollama-service.ts) ──────────────────────

export async function generateText(prompt: string): Promise<string> {
  // Route through Bifrost gateway when enabled (gets semantic caching)
  if (ENV.BIFROST_ENABLED) {
    return traceLLM(
      'generate-text',
      { model: CHAT_MODEL, prompt: prompt.slice(0, 500) },
      async (gen) => {
        const content = await bifrostChat([{ role: 'user', content: prompt }], CHAT_MODEL);
        gen.end({ output: content.slice(0, 1000) });
        return content;
      }
    );
  }

  const body = {
    model: CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    keep_alive: getChatModelKeepAlive(),
  };

  return traceLLM(
    'generate-text',
    { model: CHAT_MODEL, prompt: prompt.slice(0, 500) },
    async (gen) => {
      const content = await ollamaBreaker.call(() =>
        retry(
          async () => {
            const res = await ollamaFetch(`${OLLAMA_BASE_URL}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            if (!res.ok) {
              const text = await res.text().catch(() => '');
              console.error('[ollama] /api/chat error:', res.status, text.slice(0, 200));
              throw new Error(`Ollama chat failed: ${res.status}`);
            }

            // GPU-accelerated JSON parsing via simdjson (5× faster for large LLM responses)
            const rawText = await res.text();
            const data = fastJsonParse<{ message?: { content: string } }>(rawText);
            return data.message?.content ?? '';
          },
          { maxAttempts: 2, baseDelayMs: 500, isRetryable: retryPredicates.networkOrServer }
        )
      );
      gen.end({ output: content.slice(0, 1000) });
      return content;
    }
  );
}

export async function callOllamaChat(
  systemPrompt: string,
  userPrompt: string,
  options?: { format?: 'json'; num_predict?: number; temperature?: number }
): Promise<string> {
  // Route through Bifrost gateway when enabled (gets semantic caching)
  if (ENV.BIFROST_ENABLED) {
    return traceLLM(
      'ollama-chat',
      { model: CHAT_MODEL, prompt: userPrompt.slice(0, 500) },
      async (gen) => {
        const content = await bifrostChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          CHAT_MODEL
        );
        gen.end({ output: content.slice(0, 1000) });
        return content;
      }
    );
  }

  const body: Record<string, unknown> = {
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: false,
    keep_alive: getChatModelKeepAlive(),
  };
  if (options?.format) body.format = options.format;
  if (options?.num_predict || options?.temperature !== undefined) {
    body.options = {
      ...(options.num_predict ? { num_predict: options.num_predict } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };
  }

  const startTime = Date.now();

  return traceLLM(
    'ollama-chat',
    { model: CHAT_MODEL, prompt: userPrompt.slice(0, 500) },
    async (gen) => {
      const content = await ollamaBreaker.call(() =>
        retry(
          async () => {
            const res = await ollamaFetch(`${OLLAMA_BASE_URL}/api/chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });

            const duration = Date.now() - startTime;

            if (!res.ok) {
              const text = await res.text().catch(() => '');
              console.error('[ollama] /api/chat error:', res.status, text.slice(0, 200));
              throw new Error(`Ollama chat failed: ${res.status}`);
            }

            // GPU-accelerated JSON parsing via simdjson (5× faster for large LLM responses)
            const rawText = await res.text();
            const data = fastJsonParse<{
              message?: { content: string };
              prompt_eval_count?: number;
              eval_count?: number;
            }>(rawText);
            const result = data.message?.content ?? '';
            console.log(`[ollama] Chat completed in ${duration}ms (${result.length} chars)`);

            // Fire-and-forget token tracking (covers all callOllamaChat callers)
            import('$lib/server/ai/token-tracker.js')
              .then(({ trackTokenUsage }) => {
                trackTokenUsage({
                  endpoint: 'callOllamaChat',
                  model: CHAT_MODEL,
                  promptTokens: data.prompt_eval_count ?? 0,
                  completionTokens: data.eval_count ?? 0,
                  durationMs: duration,
                  cached: false,
                  metadata: { chatTemplate: 'gemma' },
                });
              })
              .catch(() => {
                /* non-fatal */
              });

            return result;
          },
          { maxAttempts: 2, baseDelayMs: 500, isRetryable: retryPredicates.networkOrServer }
        )
      );
      gen.end({ output: content.slice(0, 1000) });
      return content;
    }
  );
}

// ── Health & Model Discovery ────────────────────────────────────────────

export async function checkOllamaHealth(): Promise<boolean> {
	try {
		const healthy = await ollamaBreaker.call(
			async () => {
				const res = await ollamaFetch(`${OLLAMA_BASE_URL}/api/tags`, {
					signal: AbortSignal.timeout(5000),
				});
				return res.ok;
			},
			() => false
		);
		return healthy;
	} catch {
		return false;
	}
}

export async function listAvailableModels(): Promise<string[]> {
	try {
		const res = await ollamaFetch(`${OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return [];
		// GPU-accelerated JSON parsing via simdjson (5× faster for model list responses)
		const rawText = await res.text();
		const data = fastJsonParse<{ models?: Array<{ name: string }> }>(rawText);
		return data.models?.map((m) => m.name) ?? [];
	} catch {
		return [];
	}
}
