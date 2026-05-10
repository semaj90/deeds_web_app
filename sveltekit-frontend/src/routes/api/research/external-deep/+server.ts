import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { performExternalResearch } from '$lib/server/ai/external-research-agent.js';

const bodySchema = z.object({
	query: z.string().min(3).max(1000),
	maxResults: z.number().int().min(1).max(20).optional().default(5),
	sessionId: z.string().optional(),
});

/**
 * POST /api/research/external-deep
 * 
 * Deep web research pipeline:
 * 1. Web search (SearXNG -> DDG fallback)
 * 2. Scrape & Summarize (Gemma4)
 * 3. Index to Qdrant (research_memory_768)
 * 4. Record to context_timeline
 * 5. Final Synthesis
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		raw = {};
	}

	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}

	const { query, maxResults, sessionId } = parsed.data;

	try {
		const result = await performExternalResearch(query, locals.user.id, {
			maxResults,
			sessionId
		});

		return json({
			success: true,
			data: result
		});
	} catch (err) {
		console.error('[/api/research/external-deep] error:', err);
		return json({
			success: false,
			error: (err as Error).message ?? 'External research failed'
		}, { status: 500 });
	}
};
