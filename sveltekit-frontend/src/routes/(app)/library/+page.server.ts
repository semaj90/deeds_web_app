import { pool } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) return { documents: [], loadError: null };

	const res = await pool.query(
		`SELECT ld.id, ld.title, ld.short_title, ld.citation, ld.corpus_type, ld.source_type,
		        ld.processing_status, ld.page_count, ld.effective_date, ld.is_official, ld.created_at,
		        j.code AS jurisdiction_code, j.name AS jurisdiction_name,
		        (SELECT count(*) FROM legal_nodes ln WHERE ln.document_id = ld.id) AS node_count,
		        (SELECT count(*) FROM legal_chunks lc JOIN legal_nodes ln ON ln.id = lc.legal_node_id WHERE ln.document_id = ld.id) AS chunk_count
		 FROM library_documents ld
		 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		 ORDER BY ld.created_at DESC
		 LIMIT 100`
	).catch(() => ({ rows: [] }));

	return {
		documents: res.rows.map((r) => ({
			id:               r.id,
			title:            r.title,
			shortTitle:       r.short_title,
			citation:         r.citation,
			corpusType:       r.corpus_type,
			sourceType:       r.source_type,
			processingStatus: r.processing_status,
			pageCount:        r.page_count,
			effectiveDate:    r.effective_date,
			isOfficial:       r.is_official,
			createdAt:        r.created_at,
			jurisdiction:     { code: r.jurisdiction_code, name: r.jurisdiction_name },
			nodeCount:        Number(r.node_count ?? 0),
			chunkCount:       Number(r.chunk_count ?? 0),
		})),
		loadError: null,
	};
};
