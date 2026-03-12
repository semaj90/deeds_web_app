/**
 * POST /api/ai/tensorrt
 *
 * GPU-accelerated LLM inference via TensorRT-LLM engine.
 * Acquires GPU lease, unloads Ollama if needed, runs inference, releases lease.
 * Falls back to Ollama if TRT-LLM is unavailable.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { inferLLM, healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const tensorrtSchema = z.object({
	prompt: z.string().min(1, 'prompt is required').max(10000),
	maxTokens: z.number().int().min(64).max(8192).optional().default(2048),
	temperature: z.number().min(0).max(2).optional().default(0.7),
	fallbackToOllama: z.boolean().optional().default(true)
});

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.json();
	const parsed = tensorrtSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { prompt, maxTokens, temperature, fallbackToOllama } = parsed.data;

	// Check if TRT-LLM is available
	const trtAvailable = await trtHealthCheck();
	if (!trtAvailable) {
		if (fallbackToOllama) {
			// Fallback to Ollama via existing /api/chat
			return json({
				text: '',
				error: 'TensorRT-LLM unavailable, use /api/chat for Ollama fallback',
				fallback: 'ollama',
				trtAvailable: false
			}, { status: 503 });
		}
		return json({ error: 'TensorRT-LLM service unavailable' }, { status: 503 });
	}

	// Acquire GPU lease for TensorRT
	const lease = await acquireGpuLease('tensorrt', 120);
	if (!lease) {
		return json({
			error: 'GPU lease held by another backend. Try again shortly.',
			trtAvailable: true
		}, { status: 409 });
	}

	try {
		const result = await inferLLM({
			prompt,
			maxTokens: maxTokens ?? 2048,
			temperature: temperature ?? 0.7
		});

		if (result.error) {
			return json({
				text: '',
				error: result.error,
				model: 'tensorrt',
				trtAvailable: true
			}, { status: 500 });
		}

		return json({
			text: result.text,
			usage: result.usage,
			model: 'tensorrt',
			trtAvailable: true,
			leaseBackend: lease.backend
		});
	} finally {
		// Release lease after inference
		await releaseGpuLease('tensorrt').catch(() => {});
	}
};