/**
 * GET/PUT/DELETE /api/library/documents/[documentId]
 * Single document CRUD with full metadata + versions.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { documentId } = params;

	const docRes = await pool.query(`
		SELECT ld.*, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
		       COALESCE(nc.c, 0)::int AS node_count,
		       COALESCE(cc.c, 0)::int AS chunk_count
		FROM library_documents ld
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		LEFT JOIN LATERAL (SELECT count(*) AS c FROM legal_nodes WHERE document_id = ld.id) nc ON true
		LEFT JOIN LATERAL (SELECT count(*) AS c FROM legal_chunks lc
		  JOIN legal_nodes ln ON ln.id = lc.legal_node_id WHERE ln.document_id = ld.id) cc ON true
		WHERE ld.id = $1
	`, [documentId]);

	if (docRes.rowCount === 0) return json({ error: 'Not found' }, { status: 404 });
	const doc = docRes.rows[0];

	const versionsRes = await pool.query(`
		SELECT id, version_label, source_date, is_current, amendment_note, created_at
		FROM library_document_versions
		WHERE document_id = $1
		ORDER BY created_at DESC
	`, [documentId]);

	return json({
		document: {
			id: doc.id,
			title: doc.title,
			shortTitle: doc.short_title,
			citation: doc.citation,
			jurisdiction: doc.jurisdiction_name,
			jurisdictionCode: doc.jurisdiction_code,
			corpusType: doc.corpus_type,
			sourceType: doc.source_type,
			processingStatus: doc.processing_status,
			effectiveDate: doc.effective_date,
			sourceConfidence: doc.source_confidence,
			pageCount: doc.page_count,
			isOfficial: doc.is_official,
			officialUrl: doc.official_url,
			sourceHash: doc.source_hash,
			mimeType: doc.mime_type,
			minioKey: doc.minio_key,
			nodeCount: doc.node_count,
			chunkCount: doc.chunk_count,
			createdAt: doc.created_at,
		},
		versions: versionsRes.rows.map((v: Record<string, unknown>) => ({
			id: v.id,
			versionLabel: v.version_label,
			sourceDate: v.source_date,
			isCurrent: v.is_current,
			amendmentNote: v.amendment_note,
		})),
	});
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { documentId } = params;
	const body = await request.json();

	const fields: string[] = [];
	const values: unknown[] = [];
	let idx = 1;

	for (const [key, val] of Object.entries(body)) {
		const col = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`); // camelCase → snake_case
		const allowed = ['title', 'short_title', 'citation', 'corpus_type', 'official_url',
			'effective_date', 'source_confidence', 'is_official'];
		if (allowed.includes(col)) {
			fields.push(`${col} = $${idx++}`);
			values.push(val);
		}
	}

	if (fields.length === 0) return json({ error: 'No valid fields to update' }, { status: 400 });

	fields.push(`updated_at = now()`);
	values.push(documentId);

	await pool.query(
		`UPDATE library_documents SET ${fields.join(', ')} WHERE id = $${idx}`,
		values
	);

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { documentId } = params;

	// Cascading delete: nodes, chunks, versions, page_artifacts, ingestion_jobs
	await pool.query('DELETE FROM library_documents WHERE id = $1', [documentId]);

	return json({ success: true });
};