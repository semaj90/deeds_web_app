/** POST /api/pgai/summarize — Queue-based document summarization via RabbitMQ + Ollama
 *  GET  /api/pgai/summarize — Health check */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { summarizeWithQueue } from '$lib/server/pgai/summarize.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json().catch(() => ({}));
		const text = body.text;
		const documentId = body.documentId || `temp-${Date.now()}`;

		if (!text || typeof text !== 'string') {
			return json({ success: false, error: 'text is required' }, { status: 400 });
		}

		const result = await summarizeWithQueue(text.slice(0, 6000), documentId);
		return json(result);
	} catch (err) {
		console.error('[pgai/summarize] error:', err);
		return json({ success: false, error: 'Summarization failed' }, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	return json({ success: true, status: 'ok' });
};