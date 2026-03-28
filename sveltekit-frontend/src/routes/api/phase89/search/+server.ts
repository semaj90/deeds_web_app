import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const searchSchema = z.object({
	query: z.string().min(1).max(2000),
	limit: z.number().int().min(1).max(100).optional().default(20),
});

/**
 * GET/POST /api/phase89/search
 * Phase89 error search — semantic search over indexed error patterns.
 * Currently a stub — returns empty results.
 */
export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	// TODO: Wire to Qdrant vector search over error_analysis collection
	return json({
		query: q,
		results: [],
		total: 0,
		timestamp: new Date().toISOString(),
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const raw = await request.json().catch(() => ({}));
	const parsed = searchSchema.safeParse(raw);
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	const { query } = parsed.data;
	// TODO: Wire to Qdrant vector search over error_analysis collection
	return json({
		query,
		results: [],
		total: 0,
		timestamp: new Date().toISOString(),
	});
};
