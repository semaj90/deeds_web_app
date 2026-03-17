import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/db/client';

export const load: PageServerLoad = async ({ params, url }) => {
	const { documentId } = params;
	const selectedNodeId = url.searchParams.get('node') ?? null;

	try {
		// Document metadata
		const docRes = await pool.query(
			`SELECT ld.id, ld.title, ld.citation, ld.corpus_type, ld.processing_status,
			        ld.page_count, ld.word_count, ld.is_official, ld.official_url,
			        j.name AS jurisdiction_name, j.code AS jurisdiction_code
			 FROM library_documents ld
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE ld.id = $1`,
			[documentId]
		);

		if (!docRes.rows[0]) {
			return { document: null, toc: [], initialChunks: [], selectedNodeId: null, loadError: 'Document not found' };
		}

		// Full TOC
		const tocRes = await pool.query(
			`SELECT id, parent_node_id AS parent_id, heading, citation_label, node_type,
			        node_path, depth, page_start, page_end
			 FROM legal_nodes
			 WHERE document_id = $1
			 ORDER BY node_path`,
			[documentId]
		);

		// Initial chunks (for selected node or first 20)
		let chunksQuery = `
			SELECT lc.id,
			       lc.chunk_text AS "content",
			       lc.chunk_index AS "chunkIndex",
			       lc.page_start AS "pageStart",
			       lc.page_end AS "pageEnd",
			       lc.char_start AS "charStart",
			       lc.char_end AS "charEnd",
			       lc.token_count AS "tokenCount",
			       CASE
			        	WHEN ln.citation_label IS NOT NULL THEN ARRAY[ln.citation_label]
			        	ELSE ARRAY[]::text[]
			       END AS "citations",
			       ln.heading AS "nodeHeading",
			       ln.citation_label AS "nodeCitation",
			       ln.node_path AS "nodePath"
			FROM legal_chunks lc
			JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			WHERE ln.document_id = $1`;
		const queryParams: (string | number)[] = [documentId];

		if (selectedNodeId) {
			queryParams.push(selectedNodeId);
			chunksQuery += ` AND lc.legal_node_id = $${queryParams.length}`;
		}
		chunksQuery += ` ORDER BY ln.node_path ASC, lc.chunk_index ASC LIMIT 20`;

		const chunksRes = await pool.query(chunksQuery, queryParams);

		const row = docRes.rows[0];
		return {
			document: {
				id: row.id,
				title: row.title,
				citation: row.citation,
				corpusType: row.corpus_type,
				processingStatus: row.processing_status,
				pageCount: row.page_count,
				wordCount: row.word_count,
				isOfficial: row.is_official,
				officialUrl: row.official_url,
				jurisdiction: row.jurisdiction_code
					? { code: row.jurisdiction_code, name: row.jurisdiction_name }
					: null,
			},
			toc: tocRes.rows,
			initialChunks: chunksRes.rows,
			selectedNodeId,
			loadError: null,
		};
	} catch (err) {
		console.error('[reader] load error:', err);
		return { document: null, toc: [], initialChunks: [], selectedNodeId: null, loadError: 'Failed to load document' };
	}
};
