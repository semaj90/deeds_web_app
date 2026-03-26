/**
 * POST /api/graph/sync — Trigger PostgreSQL → Neo4j sync
 * Body: { caseId?: string } — sync specific case or all
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { syncCaseToGraph, syncAllCasesToGraph } from '$lib/server/graph/pg-neo4j-sync.js';
import { z } from 'zod';

const graphSyncSchema = z.object({
	caseId: z.string().max(500).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = graphSyncSchema.safeParse(body);
		if (!parsed.success) {
			return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
		}
		const caseId = parsed.data.caseId ?? null;

		const result = caseId ? await syncCaseToGraph(caseId) : await syncAllCasesToGraph();

		return json({
			ok: result.errors.length === 0,
			...result
		});
	} catch (err) {
		return json(
			{ ok: false, error: 'Sync failed' },
			{ status: 500 }
		);
	}
};
