import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => ({}));
	const query = (body as Record<string, unknown>).query as string ?? '';
	// TODO: Wire to Qdrant vector search over error_analysis collection
	return json({
		query,
		results: [],
		total: 0,
		timestamp: new Date().toISOString(),
	});
};
