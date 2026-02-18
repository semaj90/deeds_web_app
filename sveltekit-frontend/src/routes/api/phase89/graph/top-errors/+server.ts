import { json } from '@sveltejs/kit';
import pg from 'pg';
import { getDatabaseUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';

const pool = new pg.Pool({ connectionString: getDatabaseUrl() });

/**
 * GET /api/phase89/graph/top-errors?limit=20
 * Returns graph of files with most errors
 */
export const GET: RequestHandler = async ({ url }) => {
	const limit = parseInt(url.searchParams.get('limit') ?? '20');

	try {
		// Get top error files
		const filesResult = await pool.query(`
			SELECT DISTINCT
				n.id,
				n.uri, n.label,
				n.kind,
				(n.meta->>'error_count')::int as error_count, n.meta->>'module_kind' as module_kind
			FROM kg_nodes n
			WHERE n.kind = 'file'
			  AND (n.meta->>'error_count')::int > 0
			ORDER BY (n.meta->>'error_count')::int DESC
			LIMIT $1
		`, [limit]);

		const nodes: any[] = filesResult.rows.map((row: any) => ({
			uri: row.uri,
			label: row.label,
			kind: row.kind,
			error_count: row.error_count,
			module_kind: row.module_kind
		}));

		// Get errors for these files
		const fileUris = nodes.map(n => n.uri);
		const errorsResult = await pool.query(`
			SELECT DISTINCT
				n.id,
				n.uri, n.label,
				n.kind, n.meta->>'code' as code, n.meta->>'message' as message, n.meta->>'path' as path,
				(n.meta->>'line')::int as line,
				(n.meta->>'column')::int as column
			FROM kg_nodes n
			JOIN kg_edges e ON e.from_id = n.id
			JOIN kg_nodes f ON f.id = e.to_id
			WHERE n.kind = 'error'
			  AND e.type = 'ERROR_IN_FILE'
			  AND f.uri = ANY($1)
			LIMIT 100
		`, [fileUris]);

		nodes.push(...errorsResult.rows.map((row: any) => ({
			uri: row.uri,
			label: row.label,
			kind: row.kind,
			code: row.code,
			message: row.message,
			path: row.path,
			line: row.line,
			column: row.column
		})));

		// Get edges between files and errors
		const linksResult = await pool.query(`
			SELECT
				e.from_id, e.to_id,
				e.type,
				e.weight, n1.uri as source_uri, n2.uri as target_uri
			FROM kg_edges e
			JOIN kg_nodes n1 ON n1.id = e.from_id
			JOIN kg_nodes n2 ON n2.id = e.to_id
			WHERE (n1.uri = ANY($1) OR n2.uri = ANY($1))
			  AND e.type IN ('ERROR_IN_FILE', 'FILE_IMPORTS_FILE')
		`, [fileUris]);

		const links = linksResult.rows.map((row: any) => ({
			source: row.source_uri,
			target: row.target_uri,
			type: row.type,
			weight: row.weight
		}));

		return json({ nodes, links });
	} catch (error: any) {
		console.error('Error fetching graph:', error);
		return json({ error: error.message }, { status: 500 });
	}
};