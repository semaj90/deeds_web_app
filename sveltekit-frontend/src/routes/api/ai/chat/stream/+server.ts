import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { routeStreamingInference } from '$lib/server/inference/inference-router.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { checkSemanticCache, saveToSemanticCache } from '$lib/server/cache/semantic-cache.js';
import {
	resolvePacketForQuery,
	writeStreamResultToMemory,
	buildSystemPrompt,
} from '$lib/server/ai/packet-stream-cache.js';
import { runLocalAi } from '$lib/server/ai/run-local-ai.js';

const STREAM_MODEL = 'gemma4-rotorquant:latest';
const CACHE_REPLAY_CHUNK = 32;

const streamSchema = z.object({
	query: z.string().min(1).max(50000).optional(),
	message: z.string().min(1).max(50000).optional(),
	temperature: z.number().min(0).max(2).optional().default(0.7),
	history: z
		.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() }))
		.max(50)
		.optional()
		.default([]),
	noCache: z.boolean().optional().default(false),
	// VLM lane inputs (optional — triggers vision-first routing when present)
	imageUrls: z.array(z.string().url()).max(4).optional(),
	imageBase64: z.array(z.string()).max(4).optional(),
}).refine((d) => d.query?.trim() || d.message?.trim(), { message: 'query or message required' });

/** POST /api/ai/chat/stream — Streaming chat via llama-server with semantic cache */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let body: z.infer<typeof streamSchema>;
	try {
		const raw = await request.json();
		const parsed = streamSchema.safeParse(raw);
		if (!parsed.success) {
			return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		body = parsed.data;
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const prompt = body.query || body.message || '';
	const encoder = new TextEncoder();

	// ── VLM pre-routing (vision-first: images or vision keywords → local llama-server) ──
	// Runs before the semantic cache so vision requests never hit the Ollama cache path.
	const vlmResult = await runLocalAi({
		query: prompt,
		imageUrls: body.imageUrls,
		imageBase64: body.imageBase64,
	}).catch(() => null);

	if (vlmResult?.lane === 'vlm' && vlmResult.answer) {
		const answer = vlmResult.answer;
		const stream = new ReadableStream({
			start(controller) {
				for (let i = 0; i < answer.length; i += CACHE_REPLAY_CHUNK) {
					controller.enqueue(encoder.encode(answer.slice(i, i + CACHE_REPLAY_CHUNK)));
				}
				controller.close();
			},
		});
		logInference({
			type: 'llm',
			model: vlmResult.vlm?.model ?? 'vlm',
			backend: 'tensorrt',
			latencyMs: vlmResult.vlm?.durationMs ?? 0,
			tokenCount: Math.ceil(answer.length / 4),
			cacheHit: false,
		});
		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'no-cache',
				'X-Cache': 'MISS',
				'X-Lane': 'vlm',
			},
		});
	}

	// ── Semantic cache check (skip when noCache=true or temperature > 0.3) ───────
	// High-temperature / creative requests bypass cache — results won't be reusable.
	const cacheEligible = !body.noCache && body.temperature <= 0.3;
	if (cacheEligible) {
		try {
			const hit = await checkSemanticCache(prompt, STREAM_MODEL, 0.90);
			if (hit) {
				console.log(`[chat/stream] Semantic cache HIT source=${hit.source}`);
				// Replay as chunked stream — same progressive feel as live inference
				const stream = new ReadableStream({
					async start(controller) {
						for (let i = 0; i < hit.response.length; i += CACHE_REPLAY_CHUNK) {
							controller.enqueue(encoder.encode(hit.response.slice(i, i + CACHE_REPLAY_CHUNK)));
						}
						controller.close();
					},
				});
				return new Response(stream, {
					headers: {
						'Content-Type': 'text/plain; charset=utf-8',
						'Cache-Control': 'no-cache',
						'X-Cache': `HIT:${hit.source}`,
					},
				});
			}
		} catch (err) {
			// Cache failure is non-fatal — fall through to live inference
			console.warn('[chat/stream] Cache check failed (non-fatal):', err);
		}
	}

	// ── Cache miss: stream from llama-server via routeStreamingInference ─────────
	let assembled = '';
	const stream = new ReadableStream({
		async start(controller) {
			const start = performance.now();
			let tokenCount = 0;
			let backend = 'llama-server';

			try {
				const systemPrompt =
					'You are a legal AI assistant. Provide concise, professional legal analysis.';
				const messages = [
					{ role: 'system', content: systemPrompt },
					...body.history,
					{ role: 'user', content: prompt },
				];

				for await (const chunk of routeStreamingInference({
					prompt,
					systemPrompt,
					messages,
					temperature: body.temperature,
				})) {
					if (chunk.done) break;
					if (chunk.content) {
						controller.enqueue(encoder.encode(chunk.content));
						assembled += chunk.content;
						tokenCount++;
						if (chunk.backend) backend = chunk.backend;
					}
				}

				logInference({
					type: 'llm',
					model: STREAM_MODEL,
					backend: backend as 'ollama' | 'tensorrt' | 'triton',
					latencyMs: Math.round(performance.now() - start),
					tokenCount,
					cacheHit: false,
				});

				controller.close();

				// Write to semantic cache after stream completes (non-blocking)
				if (cacheEligible && assembled.length > 0) {
					saveToSemanticCache(prompt, assembled, STREAM_MODEL).catch((err) =>
						console.warn('[chat/stream] Cache write failed (non-fatal):', err)
					);
				}
			} catch {
				controller.enqueue(encoder.encode('\n\nError: Stream failed'));
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-cache',
			'X-Cache': 'MISS',
			'Transfer-Encoding': 'chunked',
		},
	});
};
