import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/db/client';

export const load: PageServerLoad = async ({ params }) => {
	const { documentId } = params;

	try {
		const res = await pool.query(
			`SELECT ld.*, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
			        (SELECT COUNT(*)::int FROM legal_nodes ln WHERE ln.document_id = ld.id) AS node_count,
			        (
			        	SELECT COUNT(*)::int
			        	FROM legal_chunks lc
			        	JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			        	WHERE ln.document_id = ld.id
			        ) AS chunk_count
			 FROM library_documents ld
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE ld.id = $1`,
			[documentId]
		);

		if (!res.rows[0]) {
			return { document: null, toc: [], loadError: 'Document not found' };
		}

		// Fetch top-level TOC nodes (depth 0–1)
		const tocRes = await pool.query(
			`SELECT id, heading, citation_label, node_type, node_path, depth, page_start, page_end
			 FROM legal_nodes
			 WHERE document_id = $1 AND depth <= 1
			 ORDER BY node_path`,
			[documentId]
		);

		const row = res.rows[0];
		return {
			document: {
				id: row.id,
				title: row.title,
				citation: row.citation,
				corpusType: row.corpus_type,
				processingStatus: row.processing_status,
				pageCount: row.page_count,
				wordCount: row.word_count,
				chunkCount: row.chunk_count,
				nodeCount: row.node_count,
				isOfficial: row.is_official,
				officialUrl: row.official_url,
				effectiveDate: row.effective_date,
				createdAt: row.created_at,
				jurisdiction: row.jurisdiction_code
					? { code: row.jurisdiction_code, name: row.jurisdiction_name }
					: null,
			},
			toc: tocRes.rows,
			loadError: null,
		};
	} catch (err) {
		console.error('[library/[documentId]] load error:', err);
		return { document: null, toc: [], loadError: 'Failed to load document' };
	}
};
