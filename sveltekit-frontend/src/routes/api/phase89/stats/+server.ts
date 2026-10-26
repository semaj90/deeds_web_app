import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';

const emptyStats = {
	file_nodes: 0,
	error_nodes: 0,
	symbol_nodes: 0,
	doc_nodes: 0,
	import_edges: 0,
	symbol_edges: 0,
	error_symbol_edges: 0,
	indexed_files: 0,
	error_embeddings: 0,
	error: null as string | null,
};

/**
 * GET /api/phase89/stats
 * Returns knowledge graph statistics
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ ...emptyStats, error: 'Unauthorized' }, { status: 401 });
	try {
		const result = await pool.query(`
			SELECT
				(SELECT COUNT(*) FROM kg_nodes WHERE node_type = 'file') as file_nodes,
				(SELECT COUNT(*) FROM kg_nodes WHERE node_type = 'error') as error_nodes,
				(SELECT COUNT(*) FROM kg_nodes WHERE node_type = 'symbol') as symbol_nodes,
				(SELECT COUNT(*) FROM kg_nodes WHERE node_type = 'doc') as doc_nodes,
				(SELECT COUNT(*) FROM phase89_import_edges) as import_edges,
				(SELECT COUNT(*) FROM cpg_edges WHERE edge_type = 'FILE_DEFINES_SYMBOL') as symbol_edges,
				(SELECT COUNT(*) FROM cpg_edges WHERE edge_type = 'ERROR_NEAR_SYMBOL') as error_symbol_edges,
				(SELECT COUNT(*) FROM file_index) as indexed_files,
				(SELECT COUNT(*) FROM raw_error_embeddings) as error_embeddings
		`);

		return json({ ...result.rows[0], error: null });
	} catch (error) {
		console.error('Error fetching stats:', error);
		return json({ ...emptyStats, error: 'Stats are temporarily unavailable' });
	}
};


