/**
 * POST /api/ai/tensorrt/stream
 *
 * SSE streaming inference via TensorRT-LLM engine.
 * GPU lease is acquired before streaming, released on completion.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { streamLLM, healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const trtStreamSchema = z.object({
	prompt: z.string().min(1, 'prompt is required').max(50000),
	maxTokens: z.number().int().min(1).max(8192).optional(),
	temperature: z.number().min(0).max(2).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = trtStreamSchema.safeParse(await request.json());
	if (!parsed.success) {
		return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	const { prompt, maxTokens, temperature } = parsed.data;

	const trtAvailable = await trtHealthCheck();
	if (!trtAvailable) {
		// Fallback to llama-server (:8090) SSE streaming — never Ollama for chat/synthesis
		const llamaServerUrl = ENV.TURBOQUANT_BASE_URL ?? ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
		try {
			const llamaRes = await fetch(`${llamaServerUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma4-legal-iq4xs-direct.gguf',
					messages: [{ role: 'user', content: prompt }],
					stream: true,
					temperature: temperature ?? 0.7,
					max_tokens: maxTokens ?? 2048
				}),
				signal: AbortSignal.timeout(120000)
			});

			if (llamaRes.ok && llamaRes.body) {
				const reader = llamaRes.body.getReader();
				const encoder = new TextEncoder();
				const decoder = new TextDecoder();
				let buffer = '';

				const stream = new ReadableStream({
					async pull(controller) {
						const { done, value } = await reader.read();
						if (done) {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: '', done: true, backend: 'llama-server' })}\n\n`));
							controller.close();
							return;
						}
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split('\n');
						buffer = lines.pop() ?? '';
						for (const line of lines) {
							const trimmed = line.trim();
							if (!trimmed.startsWith('data:')) continue;
							const payload = trimmed.slice(5).trim();
							if (payload === '[DONE]') continue;
							try {
								const parsed = JSON.parse(payload);
								const delta = parsed.choices?.[0]?.delta?.content ?? '';
								const finished = parsed.choices?.[0]?.finish_reason != null;
								if (!delta && !finished) continue;
								controller.enqueue(encoder.encode(`data: ${JSON.stringify({
									content: delta,
									done: finished,
									backend: 'llama-server'
								})}\n\n`));
							} catch { /* skip malformed SSE line */ }
						}
					},
					cancel() {
						reader.cancel();
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
		} catch { /* llama-server also unavailable */ }

		return new Response(JSON.stringify({ error: 'TensorRT-LLM and llama-server both unavailable' }), {
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
				const errMsg = 'Stream error';
				controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg, done: true })}\n\n`));
			} finally {
				await releaseGpuLease('tensorrt').catch((e) =>
          console.warn('[trt/stream] GPU lease release failed:', e)
        );
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
