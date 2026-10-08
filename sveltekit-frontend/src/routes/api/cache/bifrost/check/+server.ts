/**
 * Bifrost L2 Semantic Cache — Check Endpoint
 *
 * POST /api/cache/bifrost/check
 *
 * Fail-closed boundary for Bifrost semantic reuse. This generic route has no
 * server-derived domain/revision context or cache-artifact readback contract.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { BIFROST_L2_MIN_SIMILARITY_V1, evaluateBifrostL2AdmissionV1 } from '$lib/server/cache/bifrost-l2-admission-v1.js';

const requestSchema = z.object({
	prompt: z.string().min(1).max(10_000),
	threshold: z.number().min(BIFROST_L2_MIN_SIMILARITY_V1).max(1).default(BIFROST_L2_MIN_SIMILARITY_V1),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const body = await request.json();
		const validated = requestSchema.parse(body);

		const admission = evaluateBifrostL2AdmissionV1({
			similarity: BIFROST_L2_MIN_SIMILARITY_V1,
			requestContext: null,
			cacheEntry: null,
		});

		// This generic route has neither a server-derived domain/revision context nor
		// cache-entry artifact metadata, so it must not contact the global Bifrost namespace.
		return json({
			hit: false,
			admission: 'MISS',
			reason: admission.reason,
			score: 0,
			threshold: validated.threshold,
		});
	} catch (err) {
		if (err instanceof z.ZodError) {
			return json({ hit: false, admission: 'MISS', error: 'Invalid request' }, { status: 400 });
		}
		return json({ hit: false, admission: 'MISS', error: 'Cache check failed' }, { status: 500 });
	}
};
