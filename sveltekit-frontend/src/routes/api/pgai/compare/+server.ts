/** POST /api/pgai/compare — Compare two legal documents via Ollama */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { compareDocuments } from '$lib/server/pgai/compare.js';

const compareSchema = z.object({
	document1: z.string().min(1, 'document1 is required').max(100000),
	document2: z.string().min(1, 'document2 is required').max(100000)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const parsed = compareSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { document1, document2 } = parsed.data;
		const response = await compareDocuments(document1, document2);
		return json({ success: true, response });
	} catch (err) {
		console.error('[pgai/compare] error:', err);
		return json({ success: false, error: 'Comparison failed' }, { status: 500 });
	}
};