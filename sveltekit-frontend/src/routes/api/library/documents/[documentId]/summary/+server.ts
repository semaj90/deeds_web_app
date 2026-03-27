/**
 * GET /api/library/documents/[documentId]/summary
 * Returns document metadata + top-level summary shell.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { isUuid } from '$lib/server/validation.js';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { documentId } = params;
	if (!isUuid(documentId)) return json({ error: 'Invalid ID format' }, { status: 400 });

	const [docRes, statsRes] = await Promise.all([
		pool.query(
			`SELECT ld.id, ld.title, ld.short_title, ld.citation, ld.corpus_type, ld.source_type,
			        ld.official_url, ld.page_count, ld.effective_date, ld.is_official,
			        ld.processing_status, ld.created_at,
			        j.code AS jurisdiction_code, j.name AS jurisdiction_name, j.level AS jurisdiction_level
			 FROM library_documents ld
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE ld.id = $1`,
			[documentId]
		),
		pool.query(
			`SELECT
			   (SELECT count(*) FROM legal_nodes ln WHERE ln.document_id = $1) AS node_count,
			   (SELECT count(*) FROM legal_chunks lc JOIN legal_nodes ln ON ln.id = lc.legal_node_id WHERE ln.document_id = $1) AS chunk_count,
			   (SELECT count(*) FROM page_artifacts pa WHERE pa.document_id = $1) AS page_artifact_count`,
			[documentId]
		),
	]);

	if (!docRes.rows[0]) return json({ error: 'Document not found' }, { status: 404 });

	const doc = docRes.rows[0];
	const stats = statsRes.rows[0];

	return json({
		document: {
			id:               doc.id,
			title:            doc.title,
			shortTitle:       doc.short_title,
			citation:         doc.citation,
			corpusType:       doc.corpus_type,
			sourceType:       doc.source_type,
			officialUrl:      doc.official_url,
			pageCount:        doc.page_count,
			effectiveDate:    doc.effective_date,
			isOfficial:       doc.is_official,
			processingStatus: doc.processing_status,
			createdAt:        doc.created_at,
			jurisdiction: {
				code:  doc.jurisdiction_code,
				name:  doc.jurisdiction_name,
				level: doc.jurisdiction_level,
			},
		},
		stats: {
			nodeCount:         Number(stats.node_count),
			chunkCount:        Number(stats.chunk_count),
			pageArtifactCount: Number(stats.page_artifact_count),
		},
	});
};
