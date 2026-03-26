/**
 * GET /api/graph/relationships — Get entity relationships from Neo4j
 * Query: ?entityId=xxx&depth=2
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

const querySchema = z.object({
	entityId: z.string().min(1, 'entityId required').max(200),
	depth: z.coerce.number().int().min(1).max(5).default(2)
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'entityId required' }, { status: 400 });
	}
	const { entityId, depth } = parsed.data;

	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const driver = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		try {
			const result = await session.run(
				`MATCH path = (n {id: $entityId})-[r*1..${depth}]-(m)
				 UNWIND relationships(path) AS rel
				 WITH startNode(rel) AS src, endNode(rel) AS tgt, type(rel) AS relType
				 RETURN DISTINCT
					 src.id AS sourceId, labels(src)[0] AS sourceLabel, src.title AS sourceTitle, src.name AS sourceName,
					 tgt.id AS targetId, labels(tgt)[0] AS targetLabel, tgt.title AS targetTitle, tgt.name AS targetName,
					 relType
				 LIMIT 100`,
				{ entityId }
			);

			const relationships = result.records.map((rec) => ({
				source: {
					id: rec.get('sourceId'),
					label: rec.get('sourceLabel'),
					title: rec.get('sourceTitle') || rec.get('sourceName') || ''
				},
				target: {
					id: rec.get('targetId'),
					label: rec.get('targetLabel'),
					title: rec.get('targetTitle') || rec.get('targetName') || ''
				},
				relationship: rec.get('relType')
			}));

			return json({ entityId, depth, relationships });
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
