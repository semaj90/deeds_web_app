/**
 * Bifrost L2 Semantic Cache — Store Endpoint
 *
 * POST /api/cache/bifrost/store
 *
 * Rejects semantic-cache writes until server-owned admission metadata is wired.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const requestSchema = z.object({
	prompt: z.string().min(1).max(10_000),
	response: z.string().min(1).max(50_000),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const body = await request.json();
		requestSchema.parse(body);

		return json({ stored: false, admission: 'BLOCKED', reason: 'SERVER_ADMISSION_METADATA_UNAVAILABLE' });
	} catch (err) {
		if (err instanceof z.ZodError) {
			return json({ stored: false, error: 'Invalid request' }, { status: 400 });
		}
		return json(
      {
        stored: false,
        error: 'Cache store operation failed',
      },
      { status: 500 }
    );
	}
};
