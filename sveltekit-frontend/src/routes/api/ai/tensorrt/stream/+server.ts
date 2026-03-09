/**
 * POST /api/ai/tensorrt/stream
 *
 * SSE streaming inference via TensorRT-LLM engine.
 * GPU lease is acquired before streaming, released on completion.
 */
import type { RequestHandler } from './$types';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { streamLLM, healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { prompt, maxTokens, temperature } = body as {
		prompt: string;
		maxTokens?: number;
		temperature?: number;
	};

	if (!prompt || typeof prompt !== 'string') {
		return new Response(JSON.stringify({ error: 'prompt is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const trtAvailable = await trtHealthCheck();
	if (!trtAvailable) {
		return new Response(JSON.stringify({ error: 'TensorRT-LLM unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const lease = await acquireGpuLease('tensorrt', 120);
	if (!lease) {
		return new Response(JSON.stringify({ error: 'GPU lease unavailable' }), {
			status: 409,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			try {
				const gen = streamLLM({
					prompt,
					maxTokens: maxTokens ?? 2048,
					temperature: temperature ?? 0.7,
					stream: true
				});

				for await (const chunk of gen) {
					const event = `data: ${JSON.stringify(chunk)}\n\n`;
					controller.enqueue(encoder.encode(event));
					if (chunk.done) break;
				}
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : 'Stream error';
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`));
			} finally {
				await releaseGpuLease('tensorrt').catch(() => {});
				controller.close();
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};