/**
 * Bifrost L2 Semantic Cache — Store Endpoint
 *
 * POST /api/cache/bifrost/store
 *
 * Stores a prompt-response pair in Bifrost semantic cache for future matches.
 * Fire-and-forget from client — doesn't block on success/failure.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const requestSchema = z.object({
	prompt: z.string().min(1).max(10_000),
	response: z.string().min(1).max(50_000),
	model: z.string().optional().default('gemma4-legal'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const body = await request.json();
		const validated = requestSchema.parse(body);

		if (!ENV.BIFROST_ENABLED) {
			return json({ stored: false, error: 'Bifrost cache disabled' }, { status: 503 });
		}

		// Store in Bifrost by making a full inference call with cache enabled
		// Bifrost will embed the prompt, store the embedding + response, and cache it
		const res = await fetch(`${ENV.BIFROST_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-bf-cache-key': 'unified-client', // Same namespace as check endpoint
			},
			body: JSON.stringify({
				model: `ollama-local/${validated.model}`,
				messages: [
					{ role: 'user', content: validated.prompt },
					{ role: 'assistant', content: validated.response }, // Pre-computed response
				],
				max_tokens: 1, // Don't need actual generation
				temperature: 0.0,
				stream: false,
			}),
			signal: AbortSignal.timeout(2_000),
		});

		if (!res.ok) {
			return json({ stored: false, error: `Bifrost error: ${res.status}` }, { status: res.status });
		}

		return json({ stored: true });
	} catch (err) {
		console.error('[Bifrost] Store error:', err);
		return json(
      {
        stored: false,
        error: 'Cache store operation failed',
      },
      { status: 500 }
    );
	}
};
