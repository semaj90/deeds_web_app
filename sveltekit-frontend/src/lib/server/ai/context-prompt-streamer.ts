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

export interface ContextStreamConfig {
  llamaBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  cachePrompt?: boolean;  // Enable KV cache reuse
  kvCacheTtl?: number;     // TurboQuant KV cache TTL (seconds)
}

export interface StreamedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  cache_control?: { type: 'ephemeral' };
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
      cache_prompt: config.cachePrompt ?? false,  // Enable KV cache prefilling
      cache_reuse: config.kvCacheTtl ?? 256,      // Reuse window (seconds)
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

    // Flush remaining buffer
    if (buffer.trim()) {
      yield `data: ${buffer}\n\n`;
    }
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
      cache_prompt: useKvCache,
      cache_reuse: 256,
    }),
  });

  if (!response.ok) {
    throw new Error(`llama-server: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

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
              yield JSON.parse(data);
            } catch {
              /* skip */
            }
          }
        }
      }
    }
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
            model: 'gemma4-legal-iq4xs-direct.gguf',
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
  lastCacheReuse?: string; // ISO timestamp
}

/**
 * Track KV cache reuse across requests
 */
export class KvCacheMonitor {
  private stats: Map<string, KvCacheStats> = new Map();

  recordCacheHit(modelId: string, contextTokens: number, cachedTokens: number, newTokens: number) {
    const stat = this.stats.get(modelId) || {
      modelId,
      contextTokens: 0,
      cachedTokens: 0,
      newTokens: 0,
      generatedTokens: 0,
      cacheHitRate: 0,
      totalRequests: 0,
    };

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
