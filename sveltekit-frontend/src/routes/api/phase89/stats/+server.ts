import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pg from 'pg';

import { getDatabaseUrl } from '$lib/config/env.server.js';
const DATABASE_URL = getDatabaseUrl();
const pool = new pg.Pool({ connectionString: DATABASE_URL });

/**
 * GET /api/phase89/stats
 * Returns knowledge graph statistics
 */
export const GET: RequestHandler = async () => {
	try {
		const result = await pool.query(`
			SELECT
				(SELECT COUNT(*) FROM kg_nodes WHERE kind = 'file') as file_nodes,
				(SELECT COUNT(*) FROM kg_nodes WHERE kind = 'error') as error_nodes,
				(SELECT COUNT(*) FROM kg_nodes WHERE kind = 'symbol') as symbol_nodes,
				(SELECT COUNT(*) FROM kg_nodes WHERE kind = 'doc') as doc_nodes,
				(SELECT COUNT(*) FROM kg_edges WHERE type = 'FILE_IMPORTS_FILE') as import_edges,
				(SELECT COUNT(*) FROM kg_edges WHERE type = 'FILE_DEFINES_SYMBOL') as symbol_edges,
				(SELECT COUNT(*) FROM kg_edges WHERE type = 'ERROR_NEAR_SYMBOL') as error_symbol_edges,
				(SELECT COUNT(*) FROM file_index) as indexed_files,
				(SELECT COUNT(*) FROM error_embeddings) as error_embeddings
		`);

		return json(result.rows[0]);
	} catch (error: any) {
		console.error('Error fetching stats:', error);
		return json({ error: 'Failed to fetch stats' }, { status: 500 });
	}
};


