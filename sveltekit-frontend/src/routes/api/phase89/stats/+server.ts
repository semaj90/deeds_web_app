import { json } from '@sveltejs/kit';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString, DATABASE_URL });

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
		return json({ error: error.message }, { status: 500 });
	}
};


