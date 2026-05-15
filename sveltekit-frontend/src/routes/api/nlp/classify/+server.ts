/**
 * POST /api/nlp/classify
 *
 * Classify legal document by type and practice area via Ollama.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { classifyDocument } from '$lib/server/nlp/analyzer.js';
import { z } from 'zod';

const classifySchema = z.object({
	text: z.string().min(1, 'text is required').max(50000)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json();
	const parsed = classifySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const result = await classifyDocument(parsed.data.text.slice(0, 5000));
		return json(result);
	} catch (err) {
		return json({ error: 'Classification failed' }, { status: 500 });
	}
}
