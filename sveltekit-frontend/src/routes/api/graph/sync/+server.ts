/**
 * POST /api/graph/sync — Trigger PostgreSQL → Neo4j sync
 * Body: { caseId?: string } — sync specific case or all
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { syncCaseToGraph, syncAllCasesToGraph } from '$lib/server/graph/pg-neo4j-sync.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const caseId = typeof body.caseId === 'string' ? body.caseId : null;

		const result = caseId ? await syncCaseToGraph(caseId) : await syncAllCasesToGraph();

		return json({
			ok: result.errors.length === 0,
			...result
		});
	} catch (err) {
		return json(
			{ ok: false, error: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
};
