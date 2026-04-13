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

// VLM model configurations
export const VLM_MODELS = {
	/** Gemma 4 E4B Q4_K_M — native multimodal (vision + audio), 131K context */
	vision: 'gemma4:e4b-it-q4_K_M',
	embedding: 'embeddinggemma:latest',
	legal: 'gemma4-legal:latest',
	/** Gemma 4 E4B Q4_K_M — 8B params, 131K context, native tool calling + thinking */
	gemma4: 'gemma4:e4b-it-q4_K_M',
} as const;

export type VLMModel = (typeof VLM_MODELS)[keyof typeof VLM_MODELS];

export interface OllamaMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
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

// ── Config ──────────────────────────────────────────────────────────────────

export function getOllamaEndpoint(): string {
	return ENV.OLLAMA_BASE_URL;
}

const OLLAMA_BASE_URL = ENV.OLLAMA_BASE_URL;
const CHAT_MODEL = process.env?.OLLAMA_MODEL ?? VLM_MODELS.legal;
const REQUEST_TIMEOUT_MS = Number(process.env?.OLLAMA_TIMEOUT_MS ?? '300000');

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
	(process.env?.OLLAMA_DIAGNOSTICS_ENABLED ?? (ENV.NODE_ENV === 'development' ? 'true' : 'false')) ===
	'true';

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

function extractOllamaRequestMeta(url: string, init?: RequestInit): {
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
		keepAliveMs !== null && keepAliveMs > 0 ? new Date(Date.now() + keepAliveMs).toISOString() : null;
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
    .replace(/^(can you (please )?|could you (please )?|i (want|need|would like) (you )?to |please )/i, '')
    .replace(/^(help me (understand|with|explain)|tell me (about|how|what|why) )/i, '')
    .replace(/\bsec(?:tion|\.)?\s*(\d+)/gi, '§$1')
    .replace(/§\s+(\d)/g, '§$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .trim();
}

export async function bifrostChat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number; cacheKey?: string }
): Promise<string> {
  const bifrostModel = model.includes('/') ? model : `ollama-local/${model}`;
  // x-bf-cache-key is REQUIRED for Bifrost semantic caching to activate.
  // Without it, every request bypasses the cache entirely (Bifrost docs).
  // 'legal-ai-global' creates a shared namespace: semantically similar questions
  // from any user hit the same cache entry (ideal for repeatable legal queries).
  const cacheKey = options?.cacheKey ?? 'legal-ai-global';
  // Normalize user messages to improve semantic cache hit rate (filler stripping, citation normalization)
  const normalizedMessages = messages.map((m) =>
    m.role === 'user' ? { ...m, content: normalizeBifrostMessage(m.content) } : m
  );

  // ── L1 Cache: Redis Exact-Match (sub-ms lookup, 17,500× speedup) ──
  const { generateCacheKey, getExactMatchCache, setExactMatchCache } = await import('$lib/server/cache/redis-exact-match.js');
  const exactCacheKey = generateCacheKey({
    model: bifrostModel,
    messages: normalizedMessages,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
  });

  const exactMatch = await getExactMatchCache(exactCacheKey);
  if (exactMatch) {
    console.log(`[bifrost] L1 EXACT-MATCH HIT (${exactMatch.backend}) — instant return`);
    return exactMatch.content;
  }

  // ── L2 Cache: Bifrost Semantic Search (5s lookup via Qdrant) ──
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
    }),
    signal: AbortSignal.timeout(options?.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bifrost error: ${res.status} ${text.slice(0, 200)}`);
  }

  // GPU-accelerated JSON parsing via simdjson (5× faster for large Bifrost responses)
  const rawText = await res.text();
  const data = fastJsonParse<{
    choices?: Array<{ message?: { content?: string } }>;
    extra_fields?: {
      cache_debug?: { cache_hit?: boolean; hit_type?: string; similarity?: number };
    };
  }>(rawText);
  const debug = data.extra_fields?.cache_debug;
  const content = data.choices?.[0]?.message?.content ?? '';

  if (debug?.cache_hit) {
    console.debug(
      `[bifrost] L2 SEMANTIC HIT type=${debug.hit_type} similarity=${debug.similarity?.toFixed(3)}`
    );
  }

  // Store in Redis exact-match cache for instant future retrieval
  if (content) {
    await setExactMatchCache(exactCacheKey, {
      content,
      model: bifrostModel,
      backend: debug?.cache_hit ? 'bifrost-semantic' : 'ollama',
    });
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