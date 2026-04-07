/** POST /api/pgai/compare — Compare two legal documents via Ollama */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { compareDocuments } from '$lib/server/pgai/compare.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json().catch(() => ({}));
		const { document1, document2 } = body;

		if (!document1 || typeof document1 !== 'string') {
			return json({ success: false, error: 'document1 is required' }, { status: 400 });
		}
		if (!document2 || typeof document2 !== 'string') {
			return json({ success: false, error: 'document2 is required' }, { status: 400 });
		}

		const response = await compareDocuments(document1, document2);
		return json({ success: true, response });
	} catch (err) {
		console.error('[pgai/compare] error:', err);
		return json({ success: false, error: 'Comparison failed' }, { status: 500 });
	}
};