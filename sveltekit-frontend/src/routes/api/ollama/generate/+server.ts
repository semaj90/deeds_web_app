import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const generateSchema = z.object({
  model: z.string().max(100).default('gemma4-rotorquant:latest'),
  prompt: z.string().min(1).max(100000),
  stream: z.boolean().default(true),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      num_ctx: z.number().min(512).max(65536).optional(),
      top_p: z.number().min(0).max(1).optional(),
      top_k: z.number().min(1).max(200).optional(),
    })
    .optional(),
});

/** POST /api/ollama/generate — Proxy to Ollama /api/generate with streaming support */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	let body: z.infer<typeof generateSchema>;
	try {
		const raw = await request.json();
		const parsed = generateSchema.safeParse(raw);
		if (!parsed.success) {
			return new Response(
				JSON.stringify({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } }
			);
		}
		body = parsed.data;
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Normalize model name — append ':latest' if no tag
	const model = body.model.includes(':') ? body.model : `${body.model}:latest`;

	try {
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt: body.prompt,
				stream: body.stream,
				options: body.options ?? {}
			}),
			signal: AbortSignal.timeout(120_000)
		});

		if (!res.ok) {
			return new Response(
				JSON.stringify({ error: `Ollama error: ${res.status}` }),
				{ status: 503, headers: { 'Content-Type': 'application/json' } }
			);
		}

		if (body.stream && res.body) {
			// Stream NDJSON directly to client
			return new Response(res.body, {
				headers: {
					'Content-Type': 'application/x-ndjson',
					'Cache-Control': 'no-cache',
					'Transfer-Encoding': 'chunked'
				}
			});
		}

		// Non-streaming: return JSON response
		const data = await res.json();
		return new Response(JSON.stringify(data), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		console.error('[/api/ollama/generate] error:', err);
		return new Response(
			JSON.stringify({ error: 'Ollama service unavailable' }),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
