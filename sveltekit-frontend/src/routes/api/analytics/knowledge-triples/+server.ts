import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client.js';
import { enhancedGraphMappings } from '$lib/server/db/schema/graph-mappings.js';
import { desc, sql } from 'drizzle-orm';

/**
 * GET /api/analytics/knowledge-triples
 * 
 * Returns recent knowledge triples from the enhanced graph mappings.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized', triples: [] }, { status: 401 });
	}

	const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);

	try {
		const results = await db
			.select({
				id: enhancedGraphMappings.id,
				kind: enhancedGraphMappings.kind,
				label: enhancedGraphMappings.label,
				edges: enhancedGraphMappings.edges,
				updatedAt: enhancedGraphMappings.updatedAt
			})
			.from(enhancedGraphMappings)
			.orderBy(desc(enhancedGraphMappings.updatedAt))
			.limit(limit);

		// Flatten edges into triples: [Source] --(Relation)--> [Target]
		const triples = results.flatMap(r => {
			return (r.edges || []).flatMap(edge => {
				return (edge.targets || []).map(target => ({
					source: { id: r.id, label: r.label, kind: r.kind },
					relation: edge.relation,
					target: { id: target },
					confidence: edge.confidence,
					metadata: { source: edge.source, updatedAt: r.updatedAt }
				}));
			});
		});

		return json({
			triples,
			count: triples.length,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('[knowledge-triples] Failed to fetch:', error);
		return json({ error: 'Internal Server Error', triples: [] }, { status: 500 });
	}
};
