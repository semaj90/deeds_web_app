/**
 * Bifrost L2 Semantic Cache — Check Endpoint
 *
 * POST /api/cache/bifrost/check
 *
 * Checks Bifrost semantic cache for a match. Fast probe (500ms timeout client-side).
 * Cache hits return in <100ms (Qdrant vector lookup → stored response).
 * Cache misses are handled server-side but aborted client-side at 500ms.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const requestSchema = z.object({
	prompt: z.string().min(1).max(10_000),
	threshold: z.number().min(0).max(1).default(0.8),
	model: z.string().optional().default('gemma4-legal'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const body = await request.json();
		const validated = requestSchema.parse(body);

		if (!ENV.BIFROST_ENABLED) {
			return json({ hit: false, error: 'Bifrost cache disabled' }, { status: 503 });
		}

		const start = performance.now();

		// Call Bifrost with cache-only mode (x-bf-cache-key enables caching)
		const res = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-bf-cache-key': 'unified-client', // Namespace for client-side cache
				'x-bf-cache-threshold': validated.threshold.toString(),
			},
			body: JSON.stringify({
				model: `ollama-local/${validated.model}`,
				messages: [{ role: 'user', content: validated.prompt }],
				max_tokens: 200, // Client-side requests are short
				temperature: 0.3,
				stream: false,
			}),
			signal: AbortSignal.timeout(5_000), // Server-side timeout (client aborts earlier)
		});

		const latencyMs = Math.round(performance.now() - start);

		if (!res.ok) {
			return json({ hit: false, latencyMs }, { status: res.status });
		}

		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
			extra_fields?: {
				cache_debug?: {
					cache_hit?: boolean;
					hit_type?: string;
					similarity?: number;
					threshold?: number;
				};
			};
		};

		const content = data.choices?.[0]?.message?.content ?? '';
		const debug = data.extra_fields?.cache_debug;
		const isCacheHit = debug?.cache_hit ?? false;
		const score = debug?.similarity ?? 0;

		if (isCacheHit && content && score >= validated.threshold) {
			return json({
				hit: true,
				response: content,
				score,
				threshold: validated.threshold,
				hitType: debug?.hit_type,
				latencyMs,
			});
		}

		// Cache miss or low similarity — client should run local inference
		return json({
			hit: false,
			score,
			threshold: validated.threshold,
			latencyMs,
		});
	} catch (err) {
		console.error('[Bifrost] Check error:', err);
		return json(
      {
        hit: false,
        error: 'Cache check failed',
      },
      { status: 500 }
    );
	}
};