/**
 * POST /api/analytics/codebase-research
 *   Execute codebase deep research (rg search + pipeline analysis + Ollama synthesis).
 *
 * GET /api/analytics/codebase-research
 *   Return cached results or run fresh analysis.
 *
 * DELETE /api/analytics/codebase-research
 *   Invalidate cached results.
 */
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	executeCodebaseResearch,
	invalidateCodebaseResearchCache,
} from '$lib/server/analytics/codebase-research.js';

const bodySchema = z.object({
	days:       z.number().int().min(1).max(30).default(7),
	query:      z.string().max(200).optional(),
	synthesize: z.boolean().default(true),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const refresh = url.searchParams.get('refresh') === 'true';
	const days = Math.min(parseInt(url.searchParams.get('days') ?? '7') || 7, 30);
	const query = url.searchParams.get('query') ?? undefined;

	try {
		if (refresh) {
			await invalidateCodebaseResearchCache(locals.user.id);
		}

		const result = await executeCodebaseResearch(locals.user.id, { days, query });
		return json(result);
	} catch (err) {
		console.error('Codebase research error:', err);
		return json({
			topics: [],
			searchHits: 0,
			filesScanned: 0,
			patterns: [],
			buildMs: 0,
			cached: false,
		});
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		await invalidateCodebaseResearchCache(locals.user.id);
		const result = await executeCodebaseResearch(locals.user.id, parsed.data);
		return json(result);
	} catch (err) {
		console.error('Codebase research error:', err);
		return json({
			topics: [],
			searchHits: 0,
			filesScanned: 0,
			patterns: [],
			buildMs: 0,
			cached: false,
		});
	}
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	await invalidateCodebaseResearchCache(locals.user.id);
	return json({ ok: true });
};
