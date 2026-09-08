/**
 * Context Prompt Streaming to llama-server with KV caching
 *
 * Direct streaming to llama-server:8090/v1/chat/completions
 * - Streams context chunks as they're built (no wait for full ACE assembly)
 * - Prefills KV cache with prompt before user query arrives
 * - Supports cache_prompt:true for multi-turn reuse
 * - Native chunked encoding (no TextEncoder wrapping overhead)
 *
 * Flow:
 *   1. User sends query to SvelteKit facade OR direct to llama-server
 *   2. Facade assembles ACE context (async)
 *   3. Stream context chunks + system prompt to llama-server (prefill KV)
 *   4. User query appended after context is cached
 *   5. Model generates response using cached KV (fast inference)
 */

import { PassThrough, Readable } from 'node:stream';
import type { ACEContext } from '$lib/server/ace/types.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';
import {
  extractLlamaPromptCacheTelemetryV1,
  type LlamaPromptCacheTelemetryV1,
} from '$lib/server/atlas/prefill/llama-prompt-cache-telemetry-v1.js';
import {
  buildContextPrefixReuseObservationV1,
  type ContextPrefixIdentityV1,
  type ContextPrefixReuseObservationV1,
} from '$lib/server/atlas/prefill/context-prefix-identity-v1.js';

export interface ContextStreamConfig {
  llamaBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  cachePrompt?: boolean;  // Enable prompt/KV cache reuse
  /** llama.cpp cache_reuse: minimum token chunk eligible for KV shifting. */
  cacheReuseMinChunk?: number;
  telemetrySource?: KvCacheTelemetrySource;
  /** Optional verified identity; absent means telemetry remains model-level only. */
  contextPrefixIdentity?: ContextPrefixIdentityV1;
  previousStablePrefix?: string;
  onContextPrefixReuseObservation?: (observation: ContextPrefixReuseObservationV1) => void;
}

export const DEFAULT_CACHE_REUSE_MIN_CHUNK = 256;

/**
 * Build the llama.cpp prompt-cache controls.
 *
 * `cache_reuse` is a token threshold, not a TTL. Keep it disabled when
 * prompt caching is disabled so a caller cannot accidentally request reuse
 * while opting out of the cache.
 */
export function buildLlamaPromptCacheOptionsV1(input: {
  cachePrompt?: boolean;
  cacheReuseMinChunk?: number;
}): { cache_prompt: boolean; cache_reuse?: number } {
  const cachePrompt = input.cachePrompt ?? false;
  if (!cachePrompt) return { cache_prompt: false };

  const minChunk = input.cacheReuseMinChunk ?? DEFAULT_CACHE_REUSE_MIN_CHUNK;
  if (!Number.isInteger(minChunk) || minChunk < 0) {
    throw new Error('cacheReuseMinChunk must be a non-negative integer');
  }

  return { cache_prompt: true, cache_reuse: minChunk };
}

export type KvCacheTelemetrySource =
  | 'cline'
  | 'acp'
  | 'context-stream'
  | 'summary'
  | 'turboquant'
  | 'inference-router'
  | 'unknown';

export interface StreamedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * Record observed llama-server prompt-cache usage without persisting KV state.
 * A missing cache field remains unavailable and is deliberately not treated as
 * a cache miss or hit.
 */
export function recordLlamaPromptCacheTelemetry(
  modelId: string,
  response: unknown,
  source: KvCacheTelemetrySource = 'unknown',
): LlamaPromptCacheTelemetryV1 | null {
  const telemetry = extractLlamaPromptCacheTelemetryV1(response);
  if (!telemetry.cacheTelemetryAvailable) return null;

  kvCacheMonitor.recordCacheHit(
    modelId,
    telemetry.promptTokens,
    telemetry.cachedPrefillTokens,
    telemetry.newPrefillTokens,
    source,
  );
  return telemetry;
}

function parseSsePayload(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === '[DONE]') return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function emitContextPrefixReuseObservation(
  config: ContextStreamConfig,
  stablePrefix: string,
  telemetry: LlamaPromptCacheTelemetryV1 | null,
): void {
  if (!config.contextPrefixIdentity || !telemetry?.cacheTelemetryAvailable) return;

  try {
    const observation = buildContextPrefixReuseObservationV1({
      identity: config.contextPrefixIdentity,
      stablePrefix,
      previousStablePrefix: config.previousStablePrefix,
      cachedPrefillTokens: telemetry.cachedPrefillTokens,
      newPrefillTokens: telemetry.newPrefillTokens,
    });
    config.onContextPrefixReuseObservation?.(observation);
  } catch {
    // Identity mismatch is a caller contract failure; do not infer or emit data.
  }
}

/**
 * Stream context chunks incrementally to llama-server
 * Prefills KV cache with system prompt + retrieval context
 */
export async function* streamContextPromptToKvCache(
  config: ContextStreamConfig,
  aceContext: ACEContext,
  userQuery: string,
  systemPrompt: string
): AsyncGenerator<string, void, unknown> {
  const llamaUrl = new URL('/v1/chat/completions', config.llamaBaseUrl);

  // Build messages with cache control on system prompt
  const messages: StreamedMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
      cache_control: config.cachePrompt ? { type: 'ephemeral' } : undefined,
    },
  ];

  // Stream context sections incrementally
  if (aceContext.ragChunks && aceContext.ragChunks.length > 0) {
    const contextText = aceContext.ragChunks
      .map((chunk, i) => `[Chunk ${i + 1}/${aceContext.ragChunks.length}]\n${chunk.content}`)
      .join('\n---\n');

    messages.push({
      role: 'user',
      content: `Context:\n${contextText}\n\nQuery: ${userQuery}`,
      cache_control: config.cachePrompt ? { type: 'ephemeral' } : undefined,
    });
  } else {
    messages.push({
      role: 'user',
      content: userQuery,
    });
  }

  // Stream to llama-server with cache hints
  const response = await fetch(llamaUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP ?? 0.9,
      stream: true,
      stream_options: { include_usage: true },
      ...buildLlamaPromptCacheOptionsV1(config),
    }),
  });

  if (!response.ok) {
    throw new Error(`llama-server error: ${response.status} ${response.statusText}`);
  }

  // Stream SSE chunks directly (no wrapping)
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let lastTelemetry: LlamaPromptCacheTelemetryV1 | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            yield 'data: [DONE]\n\n';
          } else {
            try {
              const parsed = JSON.parse(data);
              lastTelemetry = recordLlamaPromptCacheTelemetry(
                config.model,
                parsed,
                config.telemetrySource ?? 'context-stream',
              ) ?? lastTelemetry;
              if (parsed.choices?.[0]?.delta?.content) {
                yield `data: ${JSON.stringify(parsed)}\n\n`;
              }
            } catch (e) {
              // Ignore malformed JSON
            }
          }
        }
      }
    }

    // Parse an unterminated final SSE line so usage-only telemetry is not lost.
    const trailing = parseSsePayload(buffer);
    if (trailing) {
      lastTelemetry = recordLlamaPromptCacheTelemetry(
        config.model,
        trailing,
        config.telemetrySource ?? 'context-stream',
      ) ?? lastTelemetry;
      if ((trailing as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content) {
        yield `data: ${JSON.stringify(trailing)}\n\n`;
      }
    }
    emitContextPrefixReuseObservation(config, systemPrompt, lastTelemetry);
  } finally {
    reader.releaseLock();
  }
}

/**
 * For Cline/CLI: bypass SvelteKit, stream directly to llama-server
 * No ACE context assembly — just raw context + query
 */
export async function* streamDirectToLlamaServer(
  config: ContextStreamConfig,
  userMessages: { role: 'system' | 'user'; content: string }[],
  useKvCache: boolean = true
): AsyncGenerator<{ id: string; object: string; choices: Array<{ delta: { content?: string } }> }, void, unknown> {
  const llamaUrl = new URL('/v1/chat/completions', config.llamaBaseUrl);

  // Add cache control hints if KV caching enabled
  const messages = userMessages.map((msg, i) => ({
    ...msg,
    cache_control:
      useKvCache && (i === 0 || i === userMessages.length - 1)
        ? { type: 'ephemeral' as const }
        : undefined,
  }));

  const response = await fetch(llamaUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      ...buildLlamaPromptCacheOptionsV1({
        cachePrompt: useKvCache,
        cacheReuseMinChunk: config.cacheReuseMinChunk,
      }),
    }),
  });

  if (!response.ok) {
    throw new Error(`llama-server: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let lastTelemetry: LlamaPromptCacheTelemetryV1 | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              lastTelemetry = recordLlamaPromptCacheTelemetry(
                config.model,
                parsed,
                config.telemetrySource ?? 'unknown',
              ) ?? lastTelemetry;
              yield parsed;
            } catch {
              /* skip */
            }
          }
        }
      }
    }
    const trailing = parseSsePayload(buffer);
    if (trailing) {
      lastTelemetry = recordLlamaPromptCacheTelemetry(
        config.model,
        trailing,
        config.telemetrySource ?? 'unknown',
      ) ?? lastTelemetry;
      yield trailing as { id: string; object: string; choices: Array<{ delta: { content?: string } }> };
    }
    const stablePrefix = userMessages.find((message) => message.role === 'system')?.content;
    if (stablePrefix) emitContextPrefixReuseObservation(config, stablePrefix, lastTelemetry);
  } finally {
    reader.releaseLock();
  }
}

/**
 * For OpenAI-compatible clients: wrap direct stream in SSE format
 * Used by /api/v1/chat/completions when stream:true
 */
export function wrapLlamaStreamAsSSE(stream: AsyncGenerator<any, void, unknown>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const sseChunk = `data: ${JSON.stringify({
            id: `chatcmpl-${Date.now()}-${index++}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: LLM_MODEL_ID,
            choices: [
              {
                index: 0,
                delta: { content: chunk.choices?.[0]?.delta?.content ?? '' },
                finish_reason: null,
              },
            ],
          })}\n\n`;
          controller.enqueue(encoder.encode(sseChunk));
        }

        // Send completion marker
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }] })}\n\n`)
        );
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * KV cache stats for monitoring
 */
export interface KvCacheStats {
  modelId: string;
  contextTokens: number;
  cachedTokens: number;
  newTokens: number;
  generatedTokens: number;
  cacheHitRate: number;
  totalRequests: number;
  consumerCounts: Record<KvCacheTelemetrySource, number>;
  lastCacheReuse?: string; // ISO timestamp
}

/**
 * Track KV cache reuse across requests
 */
export class KvCacheMonitor {
  private stats: Map<string, KvCacheStats> = new Map();

  recordCacheHit(
    modelId: string,
    contextTokens: number,
    cachedTokens: number,
    newTokens: number,
    source: KvCacheTelemetrySource = 'unknown',
  ) {
    const stat = this.stats.get(modelId) || {
      modelId,
      contextTokens: 0,
      cachedTokens: 0,
      newTokens: 0,
      generatedTokens: 0,
      cacheHitRate: 0,
      totalRequests: 0,
      consumerCounts: {
        cline: 0,
        acp: 0,
        'context-stream': 0,
        summary: 0,
        turboquant: 0,
        'inference-router': 0,
        unknown: 0,
      },
    };

    stat.consumerCounts[source] = (stat.consumerCounts[source] ?? 0) + 1;

    stat.contextTokens += contextTokens;
    stat.cachedTokens += cachedTokens;
    stat.newTokens += newTokens;
    stat.totalRequests++;
    stat.lastCacheReuse = new Date().toISOString();
    stat.cacheHitRate = stat.cachedTokens / (stat.cachedTokens + stat.newTokens) || 0;

    this.stats.set(modelId, stat);
  }

  getStats(modelId: string): KvCacheStats | undefined {
    return this.stats.get(modelId);
  }

  getAllStats(): KvCacheStats[] {
    return Array.from(this.stats.values());
  }
}

export const kvCacheMonitor = new KvCacheMonitor();
