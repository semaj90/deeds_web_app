/**
 * Server-Side Inference Router
 *
 * Routes LLM inference through the best available backend:
 *   1. TensorRT-LLM (OpenAI-compatible service on :8099) — if GPU lease available
 *   2. Triton TensorRT service (:8000) — production GPU fallback before Ollama
 *   3. Ollama (gemma3-legal, FP16) — default local/dev fallback
 *
 * GPU arbiter ensures TRT-LLM and Ollama don't fight for VRAM.
 * All backends return the same response shape.
 */

import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { logLLMInference } from '$lib/server/observability/inference-log.js';
import { acquireGpuLease, releaseGpuLease, getGpuLeaseStatus } from './gpu-arbiter.js';
import { inferLLM, healthCheck as trtHealthCheck, streamLLM as streamTrtLLM } from '$lib/server/trt-llm.js';
import { inferLLM as inferTritonLLM, healthCheck as tritonHealthCheck, streamLLM as streamTritonLLM } from '$lib/server/triton-llm.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getGpuStats, type GpuMemory } from '$lib/server/gpu/gpu-monitor.js';

/** Minimum free VRAM (MB) required before routing to TensorRT-LLM */
const TRT_MIN_VRAM_MB = 4000;

export interface InferenceRequest {
	prompt: string;
	maxTokens?: number;
	temperature?: number;
	systemPrompt?: string;
	preferTensorrt?: boolean;
}

export interface InferenceResponse {
	text: string;
	model: string;
	backend: 'tensorrt' | 'triton' | 'bifrost' | 'ollama';
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
	latencyMs: number;
	error?: string;
}

/**
 * Route inference to the best available backend.
 * TRT-LLM is preferred when available and lease is free.
 */
export async function routeInference(request: InferenceRequest): Promise<InferenceResponse> {
	const start = performance.now();

	// Try TensorRT first if preferred and available
	if (request.preferTensorrt !== false) {
		const trtResult = await tryTensorRT(request);
		if (trtResult) {
			trtResult.latencyMs = Math.round(performance.now() - start);
			console.info(`[inference-router] backend=tensorrt latency=${trtResult.latencyMs}ms`);
			logLLMInference({ model: trtResult.model, backend: 'tensorrt', latencyMs: trtResult.latencyMs, tokenCount: trtResult.usage?.total_tokens });
			return trtResult;
		}
	}

	const tritonResult = await tryTriton(request);
	if (tritonResult) {
		tritonResult.latencyMs = Math.round(performance.now() - start);
		console.info(`[inference-router] backend=triton latency=${tritonResult.latencyMs}ms`);
		logLLMInference({ model: tritonResult.model, backend: 'triton', latencyMs: tritonResult.latencyMs });
		return tritonResult;
	}

	// Try Bifrost gateway (semantic caching) when enabled
	if (ENV.BIFROST_ENABLED) {
		const bifrostResult = await tryBifrost(request, start);
		if (bifrostResult) {
			console.info(`[inference-router] backend=bifrost latency=${bifrostResult.latencyMs}ms`);
			logLLMInference({ model: bifrostResult.model, backend: 'bifrost', latencyMs: bifrostResult.latencyMs, cacheHit: bifrostResult.latencyMs < 200 });
			return bifrostResult;
		}
	}

	// Fall back to direct Ollama
	const result = await ollamaInference(request, start);
	console.info(`[inference-router] backend=ollama latency=${result.latencyMs}ms${result.error ? ` error=${result.error}` : ''}`);
	logLLMInference({ model: result.model, backend: 'ollama', latencyMs: result.latencyMs, tokenCount: result.usage?.total_tokens, error: result.error });
	return result;
}

async function tryTensorRT(request: InferenceRequest): Promise<InferenceResponse | null> {
	const trtAvailable = await trtHealthCheck();
	if (!trtAvailable) return null;

	const lease = await getGpuLeaseStatus();
	if (lease && lease.backend !== 'tensorrt') return null; // another backend holds lease

	// P6: Check actual VRAM before acquiring lease — prevents OOM when Ollama models loaded
	if (!lease) {
		const gpu = await getGpuStats().catch(() => null);
		if (gpu?.available && gpu.memory.freeMB < TRT_MIN_VRAM_MB) {
			console.info(
				`[inference-router] Skipping TRT — insufficient VRAM: ${gpu.memory.freeMB}MB free, need ${TRT_MIN_VRAM_MB}MB`
			);
			return null;
		}
	}

	const acquired = await acquireGpuLease('tensorrt', 120);
	if (!acquired) return null;

	try {
		const result = await inferLLM({
			prompt: request.systemPrompt
				? `${request.systemPrompt}\n\n${request.prompt}`
				: request.prompt,
			maxTokens: request.maxTokens ?? 2048,
			temperature: request.temperature ?? 0.7
		});

		if (result.error) {
			return null; // fall through to Ollama
		}

		return {
			text: result.text,
			model: 'gemma3-legal-trt',
			backend: 'tensorrt',
			usage: result.usage,
			latencyMs: 0
		};
	} catch {
		return null;
	} finally {
		await releaseGpuLease('tensorrt').catch(() => {});
	}
}

async function tryTriton(request: InferenceRequest): Promise<InferenceResponse | null> {
	const tritonAvailable = await tritonHealthCheck();
	if (!tritonAvailable) return null;

	try {
		const result = await inferTritonLLM({
			prompt: request.systemPrompt
				? `${request.systemPrompt}\n\n${request.prompt}`
				: request.prompt,
			maxTokens: request.maxTokens ?? 2048,
			temperature: request.temperature ?? 0.7
		});

		if (result.error || !result.text) {
			return null;
		}

		return {
			text: result.text,
			model: ENV.TRITON_LLM_MODEL ?? 'legal-llm',
			backend: 'triton',
			latencyMs: 0
		};
	} catch {
		return null;
	}
}

async function tryBifrost(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	const model = 'gemma3-legal';
	const messages: Array<{ role: string; content: string }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
	messages.push({ role: 'user', content: request.prompt });

	try {
		const text = await traceLLM('inference-router-bifrost', { model, prompt: request.prompt.slice(0, 500) }, async (gen) => {
			const content = await bifrostChat(messages, model, {
				temperature: request.temperature,
				maxTokens: request.maxTokens,
				timeoutMs: 120_000
			});
			gen.end({ output: content.slice(0, 1000) });
			return content;
		});

		return {
			text,
			model: 'gemma3-legal-bifrost',
			backend: 'bifrost',
			latencyMs: Math.round(performance.now() - startTime)
		};
	} catch {
		return null; // fall through to direct Ollama
	}
}

async function ollamaInference(request: InferenceRequest, startTime: number): Promise<InferenceResponse> {
	const model = 'gemma3-legal:latest';
	const prompt = request.systemPrompt
		? `${request.systemPrompt}\n\n${request.prompt}`
		: request.prompt;

	try {
		return await traceLLM('inference-router-ollama', { model, prompt: prompt.slice(0, 500) }, async (gen) => {
			const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model,
					prompt,
					stream: false,
					options: {
						num_predict: request.maxTokens ?? 2048,
						temperature: request.temperature ?? 0.7
					}
				}),
				signal: AbortSignal.timeout(120_000)
			});

			if (!res.ok) {
				gen.end({ output: `error:${res.status}`, level: 'WARNING' });
				return {
					text: '',
					model,
					backend: 'ollama' as const,
					latencyMs: Math.round(performance.now() - startTime),
					error: `Ollama error: ${res.status}`
				};
			}

			const data = await res.json();
			gen.end({ output: (data.response ?? '').slice(0, 1000), usage: { promptTokens: data.prompt_eval_count, completionTokens: data.eval_count } });
			return {
				text: data.response ?? '',
				model,
				backend: 'ollama' as const,
				usage: {
					prompt_tokens: data.prompt_eval_count ?? 0,
					completion_tokens: data.eval_count ?? 0,
					total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
				},
				latencyMs: Math.round(performance.now() - startTime)
			};
		});
	} catch (err) {
		return {
			text: '',
			model,
			backend: 'ollama',
			latencyMs: Math.round(performance.now() - startTime),
			error: err instanceof Error ? err.message : 'Ollama inference failed'
		};
	}
}

export interface StreamingInferenceRequest {
	prompt: string;
	systemPrompt?: string;
	messages?: Array<{ role: string; content: string }>;
	maxTokens?: number;
	temperature?: number;
	model?: string;
}

export interface StreamChunk {
	content: string;
	done: boolean;
	backend?: 'tensorrt' | 'triton' | 'ollama';
}

/**
 * Streaming inference cascade: TRT-LLM → Triton → Ollama.
 * Returns an async generator of text chunks.
 * Use for SSE endpoints, streaming chat, etc.
 */
export async function* routeStreamingInference(
	request: StreamingInferenceRequest
): AsyncGenerator<StreamChunk> {
	const flatPrompt = request.systemPrompt
		? `${request.systemPrompt}\n\n${request.prompt}`
		: request.prompt;

	// Tier 1: TRT-LLM
	try {
		let trtOk = await trtHealthCheck().catch(() => false);
		if (trtOk) {
			// P6: VRAM gate — skip TRT if GPU memory too low
			const existingLease = await getGpuLeaseStatus().catch(() => null);
			if (!existingLease) {
				const gpu = await getGpuStats().catch(() => null);
				if (gpu?.available && gpu.memory.freeMB < TRT_MIN_VRAM_MB) {
					console.info(`[inference-router/stream] Skipping TRT — ${gpu.memory.freeMB}MB free < ${TRT_MIN_VRAM_MB}MB required`);
					trtOk = false;
				}
			}
		}
		if (trtOk) {
			const lease = await acquireGpuLease('tensorrt', 120).catch(() => null);
			if (lease) {
				try {
					for await (const chunk of streamTrtLLM({ prompt: flatPrompt, maxTokens: request.maxTokens, temperature: request.temperature })) {
						yield { ...chunk, backend: 'tensorrt' };
					}
					return;
				} catch {
					// Fall through
				} finally {
					releaseGpuLease('tensorrt').catch(() => {});
				}
			}
		}
	} catch {
		// TRT-LLM unavailable
	}

	// Tier 2: Triton
	try {
		const tritonOk = await tritonHealthCheck().catch(() => false);
		if (tritonOk) {
			for await (const chunk of streamTritonLLM({ prompt: flatPrompt, maxTokens: request.maxTokens, temperature: request.temperature })) {
				yield { ...chunk, backend: 'triton' };
			}
			return;
		}
	} catch {
		// Triton unavailable
	}

	// Tier 3: Ollama (uses /api/chat if messages provided, /api/generate otherwise)
	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	const model = request.model ?? 'gemma3-legal:latest';

	const [endpoint, body] = request.messages
		? [`${ollamaUrl}/api/chat`, { model, messages: request.messages, stream: true, keep_alive: '24h' }]
		: [`${ollamaUrl}/api/generate`, { model, prompt: flatPrompt, stream: true, options: { num_predict: request.maxTokens ?? 2048, temperature: request.temperature ?? 0.7 } }];

	const res = await ollamaFetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(120_000),
	});

	if (!res.ok || !res.body) {
		yield { content: '', done: true, backend: 'ollama' };
		return;
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const text = decoder.decode(value, { stream: true });
		for (const line of text.split('\n').filter(Boolean)) {
			try {
				const parsed = JSON.parse(line);
				const chunk = parsed.message?.content ?? parsed.response ?? '';
				if (chunk) yield { content: chunk, done: false, backend: 'ollama' };
			} catch {
				// skip malformed
			}
		}
	}

	yield { content: '', done: true, backend: 'ollama' };
}

/**
 * Get current inference router status.
 */
export async function getRouterStatus() {
	const [trtOk, tritonOk, lease, gpuStats] = await Promise.all([
		trtHealthCheck(),
		tritonHealthCheck(),
		getGpuLeaseStatus().catch(() => null),
		getGpuStats().catch(() => null)
	]);

	const vram: GpuMemory | null = gpuStats?.available ? gpuStats.memory : null;
	const vramSufficient = !vram || vram.freeMB >= TRT_MIN_VRAM_MB;
	const trtReady = trtOk && !lease && vramSufficient;

	return {
		tensorrt: { available: trtOk, url: ENV.TENSORRT_URL, vramSufficient },
		triton: { available: tritonOk, url: ENV.TRITON_URL, model: ENV.TRITON_LLM_MODEL },
		bifrost: { enabled: ENV.BIFROST_ENABLED, url: ENV.BIFROST_URL },
		ollama: { url: ENV.OLLAMA_BASE_URL },
		gpu: {
			leaseHolder: lease?.backend ?? null,
			leaseFree: !lease,
			vram,
			temperature: gpuStats?.temperatureCelsius ?? null,
			utilization: gpuStats?.utilizationPercent ?? null,
		},
		preferredBackend:
			trtReady ? 'tensorrt' : tritonOk ? 'triton' : ENV.BIFROST_ENABLED ? 'bifrost' : 'ollama'
	};
}
