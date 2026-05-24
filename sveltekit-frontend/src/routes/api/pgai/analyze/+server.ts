/** POST /api/pgai/analyze — Custom analysis via Ollama gemma4-rotorquant:latest */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { runCustomAnalysis } from '$lib/server/pgai/analysis.js';

const analyzeSchema = z.object({
	content: z.string().min(1, 'content is required').max(100000),
	prompt: z.string().min(1, 'prompt is required').max(5000)
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json();
		const parsed = analyzeSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { content, prompt } = parsed.data;
		const response = await runCustomAnalysis(content, prompt);
		return json({ success: true, response });
	} catch (err) {
		console.error('[pgai/analyze] error:', err);
		return json({ success: false, error: 'Analysis failed' }, { status: 500 });
	}
};
