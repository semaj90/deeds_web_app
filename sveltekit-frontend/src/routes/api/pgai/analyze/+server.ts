/** POST /api/pgai/analyze — Custom analysis via Ollama gemma4-legal */
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { runCustomAnalysis } from '$lib/server/pgai/analysis.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json().catch(() => ({}));
		const { content, prompt } = body;

		if (!content || typeof content !== 'string') {
			return json({ success: false, error: 'content is required' }, { status: 400 });
		}
		if (!prompt || typeof prompt !== 'string') {
			return json({ success: false, error: 'prompt is required' }, { status: 400 });
		}

		const response = await runCustomAnalysis(content, prompt);
		return json({ success: true, response });
	} catch (err) {
		console.error('[pgai/analyze] error:', err);
		return json({ success: false, error: 'Analysis failed' }, { status: 500 });
	}
};