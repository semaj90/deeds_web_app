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
		// Fallback to Ollama SSE streaming
		const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
		try {
			const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt,
					stream: true,
					options: {
						temperature: temperature ?? 0.7,
						num_predict: maxTokens ?? 2048
					}
				}),
				signal: AbortSignal.timeout(120000)
			});

			if (ollamaRes.ok && ollamaRes.body) {
				const reader = ollamaRes.body.getReader();
				const encoder = new TextEncoder();
				const decoder = new TextDecoder();

				const stream = new ReadableStream({
					async pull(controller) {
						const { done, value } = await reader.read();
						if (done) {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '', done: true, backend: 'ollama' })}\n\n`));
							controller.close();
							return;
						}
						const text = decoder.decode(value, { stream: true });
						for (const line of text.split('\n').filter(Boolean)) {
							try {
								const parsed = JSON.parse(line);
								controller.enqueue(encoder.encode(`data: ${JSON.stringify({
									content: parsed.response ?? '',
									done: parsed.done ?? false,
									backend: 'ollama'
								})}\n\n`));
							} catch { /* skip malformed lines */ }
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
			}
		} catch { /* Ollama also unavailable */ }

		return new Response(JSON.stringify({ error: 'TensorRT-LLM and Ollama both unavailable' }), {
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