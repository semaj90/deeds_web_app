import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client.js';
import { enhancedGraphMappings } from '$lib/server/db/schema/graph-mappings.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const pruneSchema = z.object({
	threshold: z.number().min(0).max(1).optional().default(0.5)
});

/**
 * POST /api/analytics/knowledge-triples/prune
 * 
 * Removes all graph edges with confidence below the specified threshold.
 * Body: { threshold: number } (default 0.5)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const body = await request.json().catch(() => ({}));
		const parsed = pruneSchema.safeParse(body);
		
		if (!parsed.success) {
			return json({ error: 'Invalid threshold', details: parsed.error.format() }, { status: 400 });
		}

		const { threshold } = parsed.data;
		
		console.log(`🧹 [Prune-Triples] Removing edges with confidence < ${threshold}...`);

		// We use a raw SQL update to filter the edges array for all rows
		// This is more efficient than pulling everything into memory
		const result = await db.execute(sql`
			UPDATE enhanced_graph_mappings
			SET edges = (
				SELECT jsonb_agg(edge)
				FROM jsonb_array_elements(edges) AS edge
				WHERE (edge->>'confidence')::float >= ${threshold}
			)
			WHERE edges IS NOT NULL AND jsonb_array_length(edges) > 0
			RETURNING id;
		`);

		// Clean up rows that now have null edges (if all were pruned)
		await db.execute(sql`
			UPDATE enhanced_graph_mappings
			SET edges = '[]'::jsonb
			WHERE edges IS NULL;
		`);

		return json({
			success: true,
			threshold,
			message: `Pruning complete. Processed rows: ${result.length}`
		});
	} catch (error) {
		console.error('[knowledge-triples:prune] Failed:', error);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};
