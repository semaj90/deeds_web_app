/** POST /api/pgai/summarize — Queue-based document summarization via RabbitMQ + Ollama
 *  GET  /api/pgai/summarize — Health check */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { summarizeWithQueue } from '$lib/server/pgai/summarize.js';

const summarizeSchema = z.object({
	text: z.string().min(1, 'text is required').max(50000),
	documentId: z.string().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const parsed = summarizeSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { text, documentId = `temp-${Date.now()}` } = parsed.data;
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
