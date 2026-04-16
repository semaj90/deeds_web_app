/**
 * GET /api/library/documents
 * List all library documents with aggregated node/chunk counts.
 * Supports ?corpusType, ?jurisdiction, ?status, ?q, ?limit, ?offset
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';
import { pool } from '$lib/server/db/client';

const querySchema = z.object({
	corpusType: z.string().max(100).optional(),
	jurisdiction: z.string().max(100).optional(),
	status: z.string().max(50).optional(),
	q: z.string().max(500).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0)
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { corpusType, jurisdiction, status, q, limit, offset } = parsed.data;

	const conditions: string[] = [];
	const params: unknown[] = [];
	let idx = 1;

	if (corpusType) { conditions.push(`ld.corpus_type = $${idx++}`); params.push(corpusType); }
	if (jurisdiction) { conditions.push(`j.code = $${idx++}`); params.push(jurisdiction); }
	if (status) { conditions.push(`ld.processing_status = $${idx++}`); params.push(status); }
	if (q) { conditions.push(`(ld.title ILIKE $${idx} OR ld.short_title ILIKE $${idx} OR ld.citation ILIKE $${idx})`); params.push(`%${q}%`); idx++; }

	const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

	const sql = `
		SELECT ld.id, ld.title, ld.short_title, ld.citation, ld.corpus_type, ld.source_type,
		       ld.processing_status, ld.effective_date, ld.source_confidence, ld.page_count,
		       ld.is_official, ld.created_at,
		       j.name AS jurisdiction_name, j.code AS jurisdiction_code,
		       COALESCE(nc.node_count, 0)::int  AS node_count,
		       COALESCE(cc.chunk_count, 0)::int AS chunk_count
		FROM library_documents ld
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		LEFT JOIN LATERAL (SELECT count(*) AS node_count FROM legal_nodes ln WHERE ln.document_id = ld.id) nc ON true
		LEFT JOIN LATERAL (SELECT count(*) AS chunk_count FROM legal_chunks lc
		  JOIN legal_nodes ln2 ON ln2.id = lc.legal_node_id WHERE ln2.document_id = ld.id) cc ON true
		${where}
		ORDER BY ld.created_at DESC
		LIMIT $${idx++} OFFSET $${idx++}
	`;
	params.push(limit, offset);

	const countSql = `SELECT count(*)::int AS total FROM library_documents ld
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id ${where}`;

	const [res, countRes] = await Promise.all([
		pool.query(sql, params),
		pool.query(countSql, params.slice(0, params.length - 2)), // exclude limit/offset
	]);

	const documents = res.rows.map((r: Record<string, unknown>) => ({
		id: r.id,
		title: r.title,
		shortTitle: r.short_title,
		citation: r.citation,
		jurisdiction: r.jurisdiction_name,
		jurisdictionCode: r.jurisdiction_code,
		corpusType: r.corpus_type,
		sourceType: r.source_type,
		processingStatus: r.processing_status,
		effectiveDate: r.effective_date,
		sourceConfidence: r.source_confidence,
		pageCount: r.page_count,
		isOfficial: r.is_official,
		nodeCount: r.node_count,
		chunkCount: r.chunk_count,
		createdAt: r.created_at,
	}));

	return json(
    {
      documents,
      total: countRes.rows[0]?.total ?? 0,
      limit,
      offset,
    },
    { headers: cacheControl.medium }
  );
};
