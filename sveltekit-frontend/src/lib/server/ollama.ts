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
export const VLM_MODELS: Record<'vision' | 'embedding' | 'legal' | 'gemma4', string> = {
  /** Unified legal+VLM model (GRPO legal LoRA merged, mmproj vision, 5.3GB) */
  vision: 'gemma4-legal-vlm:latest',
  embedding: 'embeddinggemma:latest',
  /** Legal text reasoning / chat / agentic tool-calling (same unified model) */
  legal: 'gemma4-legal-vlm:latest',
  /** Gemma 4 unified — tool calling + thinking + vision */
  gemma4: 'gemma4-legal-vlm:latest',
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
import crypto from 'node:crypto';
import * as Hypergraph from './ai/hypergraph-store.js';

// ── Config ──────────────────────────────────────────────────────────────────

export function getOllamaEndpoint(): string {
  return ENV.OLLAMA_BASE_URL;
}

const OLLAMA_BASE_URL = ENV.OLLAMA_BASE_URL;
const CHAT_MODEL = ENV.OLLAMA_CHAT_MODEL;
const REQUEST_TIMEOUT_MS = Number(process.env?.OLLAMA_TIMEOUT_MS ?? '300000');

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

const BIFROST_GATEWAY_TIMEOUT_MS = parseTimeoutMs(process.env?.BIFROST_TIMEOUT_MS, 8000);
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

// Populate VLM_MODELS from ENV now that ENV is initialized
VLM_MODELS.vision = ENV.OLLAMA_VLM_MODEL;
VLM_MODELS.gemma4 = ENV.GEMMA4_MODEL;
VLM_MODELS.legal = ENV.OLLAMA_CHAT_MODEL;
VLM_MODELS.embedding = ENV.OLLAMA_EMBED_MODEL;

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
  error?: unknown
): void {
  if (!OLLAMA_DIAGNOSTICS_ENABLED) return;

  const keepAliveMs = parseKeepAliveMs(meta.keepAlive);
  const residentUntil =
    keepAliveMs !== null && keepAliveMs > 0
      ? new Date(Date.now() + keepAliveMs).toISOString()
      : null;
  const details = [
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

/**
 * Shared fetch wrapper for Ollama requests with connection pooling.
 * All Ollama HTTP calls should use this instead of raw fetch().
 */
export async function ollamaFetch(url: string, init?: RequestInit): Promise<Response> {
  const meta = extractOllamaRequestMeta(url, init);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      dispatcher: ollamaDispatcher,
    } as RequestInit);
    logOllamaDiagnostics('success', meta, Date.now() - startedAt, response.status);
    return response;
  } catch (error) {
    logOllamaDiagnostics('error', meta, Date.now() - startedAt, undefined, error);
    throw error;
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

    if (tool_calls?.length) {
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
    // Log L3 cold inference to CouchDB for QLoRA distillation
    if (!cacheHit) {
      logInference({
        type: 'llm',
        model: bifrostModel,
        backend: 'ollama',
        latencyMs: Math.round(performance.now() - bifrostStart),
        tokenCount: content.split(/\s+/).length,
        cacheHit: false,
        metadata: {
          response: content.slice(0, 20_000),
          temperature: options?.temperature ?? 0.7,
          source: 'bifrostChat',
        },
      });
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

  if (tool_calls?.length) {
    return { content, tool_calls, sessionId };
  }

  return content;
}

// ── Chat Functions (merged from ollama-service.ts) ──────────────────────

export async function generateText(prompt: string): Promise<string> {
	// Route through Bifrost gateway when enabled (gets semantic caching)
	if (ENV.BIFROST_ENABLED) {
		return traceLLM('generate-text', { model: CHAT_MODEL, prompt: prompt.slice(0, 500) }, async (gen) => {
			const content = await bifrostChat(
				[{ role: 'user', content: prompt }],
				CHAT_MODEL
			);
			gen.end({ output: content.slice(0, 1000) });
			return content;
		});
	}

	const body = {
		model: CHAT_MODEL,
		messages: [{ role: 'user', content: prompt }],
		stream: false,
		keep_alive: getChatModelKeepAlive(),
	};

	return traceLLM('generate-text', { model: CHAT_MODEL, prompt: prompt.slice(0, 500) }, async (gen) => {
		const content = await ollamaBreaker.call(() =>
			retry(async () => {
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
			}, { maxAttempts: 2, baseDelayMs: 500, isRetryable: retryPredicates.networkOrServer })
		);
		gen.end({ output: content.slice(0, 1000) });
		return content;
	});
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
            const data = fastJsonParse<{ message?: { content: string } }>(rawText);
            const result = data.message?.content ?? '';
            console.log(`[ollama] Chat completed in ${duration}ms (${result.length} chars)`);
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