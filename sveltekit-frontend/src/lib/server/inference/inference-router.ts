/**
 * Server-Side Inference Router
 *
 * Routes LLM inference through the best available backend:
 *   1. TensorRT-LLM (INT4 AWQ on :8099) — if GPU lease available
 *   2. Triton TensorRT service (:8000) — production GPU fallback
 *   3. TurboQuant llama-server (:8090) — turbo3 KV cache compression (5x VRAM savings)
 *   4. Bifrost/LiteLLM (semantic cache) — when enabled
 *   5. VLM server (:8085) — Gemma 4 E4B HF Transformers + NF4, vision + text
 *   6. LiteRT-LM (:8070) — CPU sidecar, Gemma 4 E2B with MTP 4-head speculative decode
 *   7. Ollama (gemma4-legal, Q4_K_M + Q8_0 KV) — default local/dev fallback
 *
 * TurboQuant (ICLR 2026): Training-free KV cache quantization.
 * Runs same GGUF model as Ollama but with turbo3 compressed KV cache.
 * 8x attention speedup on GPU, 5x VRAM savings. OpenAI-compatible API.
 * Build: cmake -B build -DGGML_CUDA=ON && cmake --build build (turboquant_plus fork)
 * Run: llama-server -m gemma4-legal.gguf -ctk turbo3 -ctv turbo3 --port 8090
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
import { TURBOQUANT_BASE_URL, LITERT_BASE_URL, VLM_BASE_URL } from '$lib/ai/model-ids.js';

/** Minimum free VRAM (MB) required before routing to TensorRT-LLM */
const TRT_MIN_VRAM_MB = 4000;

export interface InferenceRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  preferTensorrt?: boolean;
  stream?: boolean;
  /** Base64-encoded image for VLM analysis (only VLM server supports this) */
  imageBase64?: string;
}

export interface InferenceResponse {
	text: string;
	model: string;
	backend: 'tensorrt' | 'triton' | 'turboquant' | 'vlm-hf' | 'litert' | 'bifrost' | 'ollama';
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
	latencyMs: number;
	error?: string;
}

/**
 * Route inference to the best available backend.
 * When images are present, routes to VLM server first (only backend with vision).
 * For text-only: TRT-LLM → Triton → TurboQuant → VLM → Bifrost → LiteRT → Ollama.
 */
export async function routeInference(request: InferenceRequest): Promise<InferenceResponse> {
	const start = performance.now();

	// VLM-first: when image is present, only the VLM server can handle it
	if (request.imageBase64) {
		const vlmResult = await tryVlmServer(request, start);
		if (vlmResult) {
			console.info(`[inference-router] backend=${vlmResult.backend} latency=${vlmResult.latencyMs}ms (vision)`);
			logLLMInference({ model: vlmResult.model, backend: vlmResult.backend as 'vlm-hf' | 'ollama', latencyMs: vlmResult.latencyMs, tokenCount: vlmResult.usage?.total_tokens });
			return vlmResult;
		}
		// Both HF VLM server and Ollama VLM failed — no vision backend available
		return {
			text: '',
			model: 'gemma4-legal-vlm',
			backend: 'vlm-hf',
			latencyMs: Math.round(performance.now() - start),
			error: 'No VLM backend available — HF server (:8085) and Ollama gemma4:e4b-it-q4_K_M both failed',
		};
	}

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
		logLLMInference({ model: tritonResult.model, backend: 'triton', latencyMs: tritonResult.latencyMs, tokenCount: tritonResult.usage?.total_tokens });
		return tritonResult;
	}

	// Tier 3: TurboQuant llama-server (turbo3 KV cache, same model, better VRAM usage)
	const tqResult = await tryTurboQuant(request, start);
	if (tqResult) {
		console.info(`[inference-router] backend=turboquant latency=${tqResult.latencyMs}ms`);
		logLLMInference({ model: tqResult.model, backend: 'turboquant', latencyMs: tqResult.latencyMs, tokenCount: tqResult.usage?.total_tokens });
		return tqResult;
	}

	// Try Bifrost gateway (semantic caching) when enabled
	if (ENV.BIFROST_ENABLED) {
		const bifrostResult = await tryBifrost(request, start);
		if (bifrostResult) {
			console.info(`[inference-router] backend=bifrost latency=${bifrostResult.latencyMs}ms`);
			logLLMInference({ model: bifrostResult.model, backend: 'bifrost', latencyMs: bifrostResult.latencyMs, tokenCount: bifrostResult.usage?.total_tokens, cacheHit: bifrostResult.latencyMs < 200 });
			return bifrostResult;
		}
	}

	// Tier 5: VLM server (HF Transformers + NF4, text fallback — also handles images)
	const vlmResult = await tryVlmServer(request, start);
	if (vlmResult) {
		console.info(`[inference-router] backend=vlm-hf latency=${vlmResult.latencyMs}ms`);
		logLLMInference({ model: vlmResult.model, backend: 'vlm-hf', latencyMs: vlmResult.latencyMs, tokenCount: vlmResult.usage?.total_tokens });
		return vlmResult;
	}

	// Tier 6: LiteRT-LM (CPU sidecar, no VRAM needed, Gemma 4 E2B with MTP heads)
	const litertResult = await tryLiteRT(request, start);
	if (litertResult) {
		console.info(`[inference-router] backend=litert latency=${litertResult.latencyMs}ms`);
		logLLMInference({ model: litertResult.model, backend: 'litert', latencyMs: litertResult.latencyMs, tokenCount: litertResult.usage?.total_tokens });
		return litertResult;
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
			model: 'gemma4-legal-trt',
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

/**
 * Try TurboQuant llama-server (turboquant_plus fork of llama.cpp).
 * OpenAI-compatible API on :8090. Same GGUF model but with turbo3 KV cache
 * compression — 5x VRAM savings, 8x attention kernel speedup on CUDA.
 */
async function tryTurboQuant(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	try {
		// Health check: GET /health returns 200 when server is ready
		const healthRes = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		if (!healthRes.ok) return null;
	} catch {
		return null; // TurboQuant server not running
	}

	const messages: Array<{ role: string; content: string }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
	messages.push({ role: 'user', content: request.prompt });

	try {
		// OpenAI-compatible /v1/chat/completions — llama-server b8757+
		// When model uses thinking mode, content may be empty and reasoning in reasoning_content
		const res = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages,
				max_tokens: request.maxTokens ?? 2048,
				temperature: request.temperature ?? 0.7,
				stream: false,
			}),
			signal: AbortSignal.timeout(120_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const msg = data.choices?.[0]?.message;
		const content = msg?.content ?? '';
		const reasoning = msg?.reasoning_content ?? '';
		// Prefer content (the actual answer); fall back to reasoning if model spent all tokens thinking
		const text = content || reasoning;
		if (!text) return null;

		return {
			text,
			model: 'gemma4-legal-turbo3',
			backend: 'turboquant',
			usage: data.usage ? {
				prompt_tokens: data.usage.prompt_tokens ?? 0,
				completion_tokens: data.usage.completion_tokens ?? 0,
				total_tokens: data.usage.total_tokens ?? 0,
			} : undefined,
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

async function tryBifrost(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	const model = 'gemma4-legal';
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
			model: 'gemma4-legal-bifrost',
			backend: 'bifrost',
			latencyMs: Math.round(performance.now() - startTime)
		};
	} catch {
		return null; // fall through to direct Ollama
	}
}

/**
 * Try VLM inference for vision+text requests.
 *
 * Cascade:
 *   1. HF Transformers server (:8085) — legal fine-tuned NF4, if running
 *   2. Ollama native multimodal — gemma4:e4b-it-q4_K_M with /api/chat images field
 *      (Stock E4B has identical SigLIP vision tower — frozen during GRPO training)
 *
 * For text-only requests that reach this function, only try HF server (Ollama
 * text-only is handled by the main cascade's ollamaInference fallback).
 */
async function tryVlmServer(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	// ── Attempt 1: HF Transformers VLM server on :8085 ──
	const hfResult = await tryHfVlmServer(request, startTime);
	if (hfResult) return hfResult;

	// ── Attempt 2: Ollama native multimodal (only for image requests) ──
	if (request.imageBase64) {
		return tryOllamaVlm(request, startTime);
	}

	return null;
}

async function tryHfVlmServer(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	try {
		const healthRes = await fetch(`${VLM_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		if (!healthRes.ok) return null;
	} catch {
		return null;
	}

	const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });

	if (request.imageBase64) {
		messages.push({
			role: 'user',
			content: [
				{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${request.imageBase64}` } },
				{ type: 'text', text: request.prompt },
			],
		});
	} else {
		messages.push({ role: 'user', content: request.prompt });
	}

	try {
		const res = await fetch(`${VLM_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-legal-vlm',
				messages,
				max_tokens: request.maxTokens ?? 512,
				temperature: request.temperature ?? 0.3,
				stream: false,
			}),
			signal: AbortSignal.timeout(120_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const text = data.choices?.[0]?.message?.content ?? '';
		if (!text) return null;

		return {
			text,
			model: 'gemma4-legal-vlm',
			backend: 'vlm-hf',
			usage: data.usage ? {
				prompt_tokens: data.usage.prompt_tokens ?? 0,
				completion_tokens: data.usage.completion_tokens ?? 0,
				total_tokens: data.usage.total_tokens ?? 0,
			} : undefined,
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

/**
 * Ollama native VLM fallback — uses gemma4:e4b-it-q4_K_M with /api/chat images field.
 * Same SigLIP vision tower as the legal fine-tune (frozen during GRPO training).
 * No extra VRAM — Ollama manages the model lifecycle.
 */
async function tryOllamaVlm(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	const model = 'gemma4:e4b-it-q4_K_M';
	const messages: Array<{ role: string; content: string; images?: string[] }> = [];

	if (request.systemPrompt) {
		messages.push({ role: 'system', content: request.systemPrompt });
	}
	messages.push({
		role: 'user',
		content: request.prompt,
		images: request.imageBase64 ? [request.imageBase64] : undefined,
	});

	try {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages,
				stream: false,
				keep_alive: '24h',
				options: {
					num_predict: request.maxTokens ?? 512,
					temperature: request.temperature ?? 0.3,
				},
			}),
			signal: AbortSignal.timeout(120_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const text = data.message?.content ?? '';
		if (!text) return null;

		return {
			text,
			model,
			backend: 'ollama',
			usage: {
				prompt_tokens: data.prompt_eval_count ?? 0,
				completion_tokens: data.eval_count ?? 0,
				total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
			},
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

/**
 * Try LiteRT-LM sidecar (CPU, Gemma 4 E2B, MTP 4-head speculative decode).
 * OpenAI-compatible on :8070. No VRAM needed — runs on XNNPACK CPU backend.
 */
async function tryLiteRT(request: InferenceRequest, startTime: number): Promise<InferenceResponse | null> {
	try {
		const healthRes = await fetch(`${LITERT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		});
		if (!healthRes.ok) return null;
	} catch {
		return null; // LiteRT server not running
	}

	const messages: Array<{ role: string; content: string }> = [];
	if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
	messages.push({ role: 'user', content: request.prompt });

	try {
		const res = await fetch(`${LITERT_BASE_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'litert-lm',
				messages,
				max_tokens: request.maxTokens ?? 2048,
				temperature: request.temperature ?? 0.3,
				stream: false,
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) return null;

		const data = await res.json();
		const text = data.choices?.[0]?.message?.content ?? '';
		if (!text) return null;

		return {
			text,
			model: 'gemma4-e2b-litert',
			backend: 'litert',
			usage: data.usage ? {
				prompt_tokens: data.usage.prompt_tokens ?? 0,
				completion_tokens: data.usage.completion_tokens ?? 0,
				total_tokens: data.usage.total_tokens ?? 0,
			} : undefined,
			latencyMs: Math.round(performance.now() - startTime),
		};
	} catch {
		return null;
	}
}

async function ollamaInference(request: InferenceRequest, startTime: number): Promise<InferenceResponse> {
	const model = 'gemma4-legal:latest';
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
	backend?: 'tensorrt' | 'triton' | 'turboquant' | 'vlm-hf' | 'litert' | 'ollama';
}

/**
 * Streaming inference cascade: TRT-LLM → Triton → TurboQuant → Ollama.
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

	// Tier 3: TurboQuant llama-server (streaming via OpenAI-compatible SSE)
	try {
		const tqHealthRes = await fetch(`${TURBOQUANT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		}).catch(() => null);
		if (tqHealthRes?.ok) {
			const tqMessages: Array<{ role: string; content: string }> = request.messages ?? [];
			if (!tqMessages.length) {
				if (request.systemPrompt) tqMessages.push({ role: 'system', content: request.systemPrompt });
				tqMessages.push({ role: 'user', content: request.prompt });
			}
			const tqRes = await fetch(`${TURBOQUANT_BASE_URL}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					messages: tqMessages,
					max_tokens: request.maxTokens ?? 2048,
					temperature: request.temperature ?? 0.7,
					stream: true,
				}),
				signal: AbortSignal.timeout(120_000),
			});
			if (tqRes.ok && tqRes.body) {
				const reader = tqRes.body.getReader();
				const decoder = new TextDecoder();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const text = decoder.decode(value, { stream: true });
					for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
						const payload = line.slice(6).trim();
						if (payload === '[DONE]') break;
						try {
							const parsed = JSON.parse(payload);
							const delta = parsed.choices?.[0]?.delta;
							// llama-server b8757: streaming thinking in delta.reasoning_content, answer in delta.content
							const chunk = delta?.content ?? delta?.reasoning_content ?? '';
							if (chunk) yield { content: chunk, done: false, backend: 'turboquant' };
						} catch {
							// skip malformed SSE
						}
					}
				}
				yield { content: '', done: true, backend: 'turboquant' };
				return;
			}
		}
	} catch {
		// TurboQuant unavailable
	}

	// Tier 4: LiteRT-LM (CPU sidecar, fake-streaming — sends full response as SSE)
	try {
		const litertHealth = await fetch(`${LITERT_BASE_URL}/health`, {
			signal: AbortSignal.timeout(1_000),
		}).catch(() => null);
		if (litertHealth?.ok) {
			const messages: Array<{ role: string; content: string }> = request.messages ?? [];
			if (!messages.length) {
				if (request.systemPrompt) messages.push({ role: 'system', content: request.systemPrompt });
				messages.push({ role: 'user', content: request.prompt });
			}
			const litertRes = await fetch(`${LITERT_BASE_URL}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'litert-lm',
					messages,
					max_tokens: request.maxTokens ?? 2048,
					temperature: request.temperature ?? 0.3,
					stream: false,
				}),
				signal: AbortSignal.timeout(60_000),
			});
			if (litertRes.ok) {
				const data = await litertRes.json();
				const text = data.choices?.[0]?.message?.content ?? '';
				if (text) {
					yield { content: text, done: false, backend: 'litert' };
					yield { content: '', done: true, backend: 'litert' };
					return;
				}
			}
		}
	} catch {
		// LiteRT unavailable
	}

	// Tier 5: Ollama (uses /api/chat if messages provided, /api/generate otherwise)
	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	const model = request.model ?? 'gemma4-legal:latest';

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
	const [trtOk, tritonOk, tqOk, vlmOk, litertOk, ollamaVlmOk, lease, gpuStats] = await Promise.all([
		trtHealthCheck(),
		tritonHealthCheck(),
		fetch(`${TURBOQUANT_BASE_URL}/health`, { signal: AbortSignal.timeout(1_000) })
			.then(r => r.ok).catch(() => false),
		fetch(`${VLM_BASE_URL}/health`, { signal: AbortSignal.timeout(1_000) })
			.then(r => r.ok).catch(() => false),
		fetch(`${LITERT_BASE_URL}/health`, { signal: AbortSignal.timeout(1_000) })
			.then(r => r.ok).catch(() => false),
		// Check if Ollama has the VLM model available (list models, check for e4b)
		ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2_000) })
			.then(r => r.ok ? r.json() : null)
			.then(d => d?.models?.some((m: { name: string }) => m.name.includes('e4b-it')) ?? false)
			.catch(() => false),
		getGpuLeaseStatus().catch(() => null),
		getGpuStats().catch(() => null)
	]);

	const vram: GpuMemory | null = gpuStats?.available ? gpuStats.memory : null;
	const vramSufficient = !vram || vram.freeMB >= TRT_MIN_VRAM_MB;
	const trtReady = trtOk && !lease && vramSufficient;
	const visionAvailable = vlmOk || ollamaVlmOk;

	return {
		tensorrt: { available: trtOk, url: ENV.TENSORRT_URL, vramSufficient },
		triton: { available: tritonOk, url: ENV.TRITON_URL, model: ENV.TRITON_LLM_MODEL },
		turboquant: { available: tqOk, url: TURBOQUANT_BASE_URL, kvCache: 'turbo3' },
		vlm: { available: vlmOk, url: VLM_BASE_URL, model: 'gemma4-legal-vlm', backend: 'hf-nf4', visionCapable: true },
		ollamaVlm: { available: ollamaVlmOk, model: 'gemma4:e4b-it-q4_K_M', visionCapable: true },
		bifrost: { enabled: ENV.BIFROST_ENABLED, url: ENV.BIFROST_URL },
		litert: { available: litertOk, url: LITERT_BASE_URL, model: 'gemma-4-E2B-it', backend: 'cpu' },
		ollama: { url: ENV.OLLAMA_BASE_URL },
		gpu: {
			leaseHolder: lease?.backend ?? null,
			leaseFree: !lease,
			vram,
			temperature: gpuStats?.temperatureCelsius ?? null,
			utilization: gpuStats?.utilizationPercent ?? null,
		},
		visionAvailable,
		preferredBackend:
			trtReady ? 'tensorrt' : tritonOk ? 'triton' : tqOk ? 'turboquant' : vlmOk ? 'vlm-hf' : ENV.BIFROST_ENABLED ? 'bifrost' : litertOk ? 'litert' : 'ollama'
	};
}
