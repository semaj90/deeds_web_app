/**
 * GET /api/cases/[id]/related
 * Lightweight graph-only related cases via Neo4j entity connections.
 * Faster than /similar (no embedding, no reranking — pure graph walk).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isUuid } from '$lib/server/validation.js';
import { findConnectedCases } from '$lib/server/graph/graph-centrality.js';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const caseId = params.id;
	if (!isUuid(caseId)) return json({ error: 'Invalid case ID' }, { status: 400 });

	const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10), 1), 50);

	const related = await findConnectedCases(caseId, limit);

	return json({ caseId, related, count: related.length });
};
