/**
 * Server-Side Inference Router
 *
 * Routes LLM inference through the best available backend:
 *   1. TensorRT-LLM (INT4 AWQ, ~3x faster) — if GPU lease available
 *   2. Ollama (gemma3-legal, FP16) — default, always available
 *
 * GPU arbiter ensures TRT-LLM and Ollama don't fight for VRAM.
 * All backends return the same response shape.
 */

import { ENV } from '$lib/server/env.server.js';
import { acquireGpuLease, releaseGpuLease, getGpuLeaseStatus } from './gpu-arbiter.js';
import { inferLLM, healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';

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
	backend: 'tensorrt' | 'ollama';
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
			return trtResult;
		}
	}

	// Fall back to Ollama
	return ollamaInference(request, start);
}

async function tryTensorRT(request: InferenceRequest): Promise<InferenceResponse | null> {
	const trtAvailable = await trtHealthCheck();
	if (!trtAvailable) return null;

	const lease = await getGpuLeaseStatus();
	if (lease && lease.backend !== 'tensorrt') return null; // another backend holds lease

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

async function ollamaInference(request: InferenceRequest, startTime: number): Promise<InferenceResponse> {
	const model = 'gemma3-legal:latest';
	const prompt = request.systemPrompt
		? `${request.systemPrompt}\n\n${request.prompt}`
		: request.prompt;

	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
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
			return {
				text: '',
				model,
				backend: 'ollama',
				latencyMs: Math.round(performance.now() - startTime),
				error: `Ollama error: ${res.status}`
			};
		}

		const data = await res.json();
		return {
			text: data.response ?? '',
			model,
			backend: 'ollama',
			usage: {
				prompt_tokens: data.prompt_eval_count ?? 0,
				completion_tokens: data.eval_count ?? 0,
				total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0)
			},
			latencyMs: Math.round(performance.now() - startTime)
		};
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

/**
 * Get current inference router status.
 */
export async function getRouterStatus() {
	const [trtOk, lease] = await Promise.all([
		trtHealthCheck(),
		getGpuLeaseStatus().catch(() => null)
	]);

	return {
		tensorrt: { available: trtOk, url: ENV.TENSORRT_URL },
		ollama: { url: ENV.OLLAMA_BASE_URL },
		gpu: {
			leaseHolder: lease?.backend ?? null,
			leaseFree: !lease,
		},
		preferredBackend: trtOk && !lease ? 'tensorrt' : 'ollama'
	};
}
