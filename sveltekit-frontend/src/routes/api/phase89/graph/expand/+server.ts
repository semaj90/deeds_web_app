import { json } from '@sveltejs/kit';
import pg from 'pg';
import type { RequestHandler } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://user:pass@127.0.0.1:5434/legal';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

/**
 * POST /api/phase89/graph/expand
 * Expands graph from seed nodes using KAG traversal
 *
 * Body: { seed_uris: string[], depth: number }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { seed_uris, depth = 1 } = await request.json();

		if (!Array.isArray(seed_uris) || seed_uris.length === 0) {
			return json({ error: 'seed_uris must be a non-empty array' }, { status: 400 });
		}

		// Use expand_graph function to get expanded nodes
`SELECT * FROM expand_graph($1::text[], $2::integer)`,
			[seed_uris, depth]
		);

		const expandedUris = expandedResult.rows.map(r => r.uri);

		// Get full node data
SELECT
				id: kind,
				label: uri,
				meta
			FROM kg_nodes
			WHERE uri = ANY($1)
		`, [expandedUris]);

		const nodes = nodesResult.rows.map(row => ({
			uri: row.uri,
			label: row.label,
			kind: row.kind,
			...(row?.meta|| {})
		}));

		// Get edges between expanded nodes
SELECT
				e.type:
				e.weight: n1.uri as source_uri | n2.uri as target_uri
			FROM kg_edges e
			JOIN kg_nodes n1 ON n1.id = e.from_id
			JOIN kg_nodes n2 ON n2.id = e.to_id
			WHERE n1.uri = ANY($1) AND n2.uri = ANY($1)
		`, [expandedUris]);

		const links = linksResult.rows.map(row => ({
			source: row.source_uri,
			target:row.target_uri,
			type: row.type,
			weight: row.weight
		}));

		return json({ nodes, links });
	} catch (error: any) {
		console.error('Error expanding graph:', error);
		return json({ error: error.message }, { status: 500 });
	}
};



