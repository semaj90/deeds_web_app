/**
 * GET /api/library/document/[id]/toc
 * Returns the legal node hierarchy as a TOC tree + document metadata.
 */
import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db/client';

export async function GET({ params }) {
	const { id } = params;

	// 1. Fetch document metadata
	const docRes = await pool.query(
		`SELECT ld.id, ld.title, j.code as jurisdiction, ld.corpus_type as "corpusType"
		 FROM library_documents ld
		 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		 WHERE ld.id = $1`,
		[id]
	);

	if (!docRes.rows[0]) {
		return json({ error: 'Document not found' }, { status: 404 });
	}

	const document = docRes.rows[0];

	// 2. Fetch all nodes for this document ordered by path (depth-first)
	const res = await pool.query(
		`SELECT id, parent_node_id, node_type, ordinal, heading, citation_label, node_path, depth,
		        page_start, page_end, char_start, char_end
		 FROM legal_nodes
		 WHERE document_id = $1
		 ORDER BY node_path, ordinal`,
		[id]
	);

	// 3. Build nested tree
	interface TocNode {
		id: string;
		parentId: string | null;
		nodeType: string;
		ordinal: number;
		heading: string;
		citationLabel: string | null;
		nodePath: string;
		depth: number;
		children: TocNode[];
	}

	const nodeMap = new Map<string, TocNode>();
	const toc: TocNode[] = [];

	for (const row of res.rows) {
		const node: TocNode = {
			id:           row.id,
			parentId:     row.parent_node_id,
			nodeType:     row.node_type,
			ordinal:      row.ordinal,
			heading:      row.heading,
			citationLabel: row.citation_label,
			nodePath:     row.node_path,
			depth:        row.depth,
			children:     [],
		};
		nodeMap.set(node.id, node);
	}

	for (const node of nodeMap.values()) {
		if (node.parentId && nodeMap.has(node.parentId)) {
			nodeMap.get(node.parentId)!.children.push(node);
		} else if (!node.parentId) {
			toc.push(node);
		}
	}

	// Double check sorting by ordinal for each child list
	const sortRecursive = (nodes: TocNode[]) => {
		nodes.sort((a, b) => a.ordinal - b.ordinal);
		for (const n of nodes) {
			if (n.children.length > 0) sortRecursive(n.children);
		}
	};
	sortRecursive(toc);

	return json({
		document,
		toc
	});
}
