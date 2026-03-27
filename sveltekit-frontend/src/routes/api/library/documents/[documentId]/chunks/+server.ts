/**
 * GET /api/library/documents/[documentId]/chunks
 * Returns paginated chunks for a document (or for a specific node).
 * Query params: nodeId?, page?, limit?
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';
import { isUuid } from '$lib/server/validation.js';

const querySchema = z.object({
	nodeId: z.string().uuid().optional(),
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { documentId } = params;
	if (!isUuid(documentId)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { nodeId, page, limit } = parsed.data;
	const offset = (page - 1) * limit;

	let query: string;
	let queryParams: unknown[];

	if (nodeId) {
		// All chunks for a specific node
		query = `
			SELECT lc.id,
			       lc.chunk_index,
			       lc.chunk_text AS content,
			       lc.token_count,
			       lc.page_start,
			       lc.page_end,
			       lc.char_start,
			       lc.char_end,
			       lc.summary,
			       ln.heading AS node_heading,
			       ln.citation_label AS node_citation,
			       CASE
			        	WHEN ln.citation_label IS NOT NULL THEN ARRAY[ln.citation_label]
			        	ELSE ARRAY[]::text[]
			       END AS citations,
			       ln.node_path,
			       ln.node_type,
			       ln.depth
			FROM legal_chunks lc
			JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			WHERE lc.legal_node_id = $1
			ORDER BY lc.chunk_index
			LIMIT $2 OFFSET $3`;
		queryParams = [nodeId, limit, offset];
	} else {
		// All chunks for document, ordered by node path + chunk index
		query = `
			SELECT lc.id,
			       lc.chunk_index,
			       lc.chunk_text AS content,
			       lc.token_count,
			       lc.page_start,
			       lc.page_end,
			       lc.char_start,
			       lc.char_end,
			       lc.summary,
			       ln.heading AS node_heading,
			       ln.citation_label AS node_citation,
			       CASE
			        	WHEN ln.citation_label IS NOT NULL THEN ARRAY[ln.citation_label]
			        	ELSE ARRAY[]::text[]
			       END AS citations,
			       ln.node_path,
			       ln.node_type,
			       ln.depth
			FROM legal_chunks lc
			JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			WHERE ln.document_id = $1
			ORDER BY ln.node_path, lc.chunk_index
			LIMIT $2 OFFSET $3`;
		queryParams = [documentId, limit, offset];
	}

	const [res, countRes] = await Promise.all([
		pool.query(query, queryParams),
		nodeId
			? pool.query(`SELECT count(*) FROM legal_chunks WHERE legal_node_id = $1`, [nodeId])
			: pool.query(
				`SELECT count(*) FROM legal_chunks lc JOIN legal_nodes ln ON ln.id = lc.legal_node_id WHERE ln.document_id = $1`,
				[documentId]
			),
	]);

	const total = Number(countRes.rows[0]?.count ?? 0);

	return json({
		chunks:  res.rows,
		page,
		limit,
		total,
		pages:   Math.ceil(total / limit),
		hasMore: page * limit < total,
	});
};
