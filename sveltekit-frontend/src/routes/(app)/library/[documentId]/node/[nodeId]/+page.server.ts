import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/db/client';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const { documentId, nodeId } = params;

	try {
		// 1. Fetch the node and its document
		const nodeRes = await pool.query(
			`SELECT ln.*, ld.title as doc_title, ld.corpus_type, ld.effective_date, ld.official_url,
			        j.code as jurisdiction_code, j.name as jurisdiction_name
			 FROM legal_nodes ln
			 JOIN library_documents ld ON ld.id = ln.document_id
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE ln.id = $1 AND ln.document_id = $2`,
			[nodeId, documentId]
		);

		if (!nodeRes.rows[0]) {
			throw error(404, 'Legal node not found');
		}

		const node = nodeRes.rows[0];

		// 2. Fetch children nodes (for Key Provisions)
		const childrenRes = await pool.query(
			`SELECT id, heading, citation_label, node_type, full_text
			 FROM legal_nodes
			 WHERE parent_node_id = $1
			 ORDER BY ordinal ASC, node_path ASC, char_start ASC NULLS LAST`,
			[nodeId]
		);

		// 3. Fetch definitions linked to this node
		const definitionsRes = await pool.query(
			`SELECT term, definition_text
			 FROM legal_definitions
			 WHERE defined_in_node_id = $1`,
			[nodeId]
		);

		// 4. Fetch siblings for prev/next
		const siblingsRes = await pool.query(
			`SELECT id, heading, citation_label
			 FROM legal_nodes
			 WHERE document_id = $1
			   AND (
			   	($2::uuid IS NULL AND parent_node_id IS NULL)
			   	OR parent_node_id = $2::uuid
			   )
			 ORDER BY ordinal ASC, node_path ASC, char_start ASC NULLS LAST`,
			[documentId, node.parent_node_id ?? null]
		);

		const siblingIdx = siblingsRes.rows.findIndex((s: any) => s.id === nodeId);
		const prev = siblingIdx > 0 ? siblingsRes.rows[siblingIdx - 1] : null;
		const next = siblingIdx < siblingsRes.rows.length - 1 ? siblingsRes.rows[siblingIdx + 1] : null;

		return {
			node: {
				id: node.id,
				heading: node.heading,
				citationLabel: node.citation_label,
				fullText: node.full_text,
				precedentCount: 0,
				type: node.node_type,
				path: node.node_path,
				pageStart: node.page_start,
			},
			document: {
				id: documentId,
				title: node.doc_title,
				corpusType: node.corpus_type,
				effectiveDate: node.effective_date,
				officialUrl: node.official_url,
				jurisdiction: node.jurisdiction_code ? {
					code: node.jurisdiction_code,
					name: node.jurisdiction_name
				} : null
			},
			children: childrenRes.rows,
			definitions: definitionsRes.rows,
			navigation: {
				prev,
				next
			}
		};
	} catch (err) {
		console.error('[node/[nodeId]] load error:', err);
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Failed to load legal node dashboard');
	}
};
