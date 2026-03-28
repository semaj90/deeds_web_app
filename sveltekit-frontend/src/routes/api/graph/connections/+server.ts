/**
 * GET /api/graph/connections — Find cases connected via shared entities
 * Query: ?caseId=xxx
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const querySchema = z.object({
	caseId: z.string().min(1, 'caseId required').max(200)
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'caseId required' }, { status: 400 });
	}
	const { caseId } = parsed.data;

	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			const result = await session.run(
				`MATCH (c1:Case {id: $caseId})-[:INVOLVES|BELONGS_TO|REFERENCES]-(shared)-[:INVOLVES|BELONGS_TO|REFERENCES]-(c2:Case)
				 WHERE c1 <> c2
				 WITH c2, collect(DISTINCT {type: labels(shared)[0], title: coalesce(shared.title, shared.name, shared.code, '')}) AS sharedEntities, count(shared) AS strength
				 RETURN c2.id AS connectedCaseId, c2.title AS connectedCaseTitle, c2.status AS status,
						strength, sharedEntities[0..5] AS sharedEntities
				 ORDER BY strength DESC
				 LIMIT 20`,
				{ caseId }
			);

			const connections = result.records.map((rec) => ({
				caseId: rec.get('connectedCaseId'),
				title: rec.get('connectedCaseTitle') || '',
				status: rec.get('status') || '',
				strength: rec.get('strength')?.toNumber?.() ?? rec.get('strength'),
				sharedEntities: rec.get('sharedEntities') || []
			}));

			return json({ caseId, connections });
		} finally {
			await session.close();
		}
	} catch (err) {
		return json(
			{ error: 'Neo4j unavailable' },
			{ status: 503 }
		);
	}
};
