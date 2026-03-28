import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';

const graphExpandSchema = z.object({
	seed_uris: z.array(z.string().max(1000)).min(1, 'seed_uris must be a non-empty array').max(100),
	depth: z.number().int().min(1).max(10).optional().default(1)
});

/**
 * POST /api/phase89/graph/expand
 * Expands graph from seed nodes using KAG traversal
 *
 * Body: { seed_uris: string[], depth: number }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = graphExpandSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { seed_uris, depth } = parsed.data;

		// Use expand_graph function to get expanded nodes
		const expandedResult = await pool.query(
			`SELECT * FROM expand_graph($1::text[], $2::integer)`,
			[seed_uris, depth]
		);

		const expandedUris = expandedResult.rows.map((r: Record<string, any>) => r.uri);

		// Get full node data
		const nodesResult = await pool.query(`
			SELECT
				id, kind,
				label, uri,
				meta
			FROM kg_nodes
			WHERE uri = ANY($1)
		`, [expandedUris]);

		const nodes = nodesResult.rows.map((row: Record<string, any>) => ({
			uri: row.uri,
			label: row.label,
			kind: row.kind,
			...(row?.meta || {})
		}));

		// Get edges between expanded nodes
		const linksResult = await pool.query(`
			SELECT
				e.type,
				e.weight, n1.uri as source_uri, n2.uri as target_uri
			FROM kg_edges e
			JOIN kg_nodes n1 ON n1.id = e.from_id
			JOIN kg_nodes n2 ON n2.id = e.to_id
			WHERE n1.uri = ANY($1) AND n2.uri = ANY($1)
		`, [expandedUris]);

		const links = linksResult.rows.map((row: Record<string, any>) => ({
			source: row.source_uri,
			target: row.target_uri,
			type: row.type,
			weight: row.weight
		}));

		return json({ nodes, links });
	} catch (error) {
		console.error('Error expanding graph:', error);
		return json({ error: 'Failed to expand graph data' }, { status: 500 });
	}
};