/**
 * GET /api/library/documents/[documentId]/toc
 * Returns the legal node hierarchy as a TOC tree.
 * Top-level nodes + one level of children for fast initial load.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { documentId } = params;

	// Fetch all nodes for this document ordered by path (depth-first)
	const res = await pool.query(
		`SELECT id, parent_node_id, node_type, ordinal, heading, citation_label, node_path, depth,
		        page_start, page_end, char_start, char_end,
		        (SELECT count(*) FROM legal_chunks lc WHERE lc.legal_node_id = ln.id) AS chunk_count
		 FROM legal_nodes ln
		 WHERE ln.document_id = $1
		 ORDER BY node_path`,
		[documentId]
	);

	// Build nested tree
	const nodeMap = new Map<string, TocNode>();
	const roots: TocNode[] = [];

	interface TocNode {
		id: string;
		parentId: string | null;
		nodeType: string;
		heading: string;
		citationLabel: string | null;
		nodePath: string;
		depth: number;
		pageStart: number | null;
		pageEnd: number | null;
		chunkCount: number;
		children: TocNode[];
	}

	for (const row of res.rows) {
		const node: TocNode = {
			id:           row.id,
			parentId:     row.parent_node_id,
			nodeType:     row.node_type,
			heading:      row.heading,
			citationLabel: row.citation_label,
			nodePath:     row.node_path,
			depth:        row.depth,
			pageStart:    row.page_start,
			pageEnd:      row.page_end,
			chunkCount:   Number(row.chunk_count),
			children:     [],
		};
		nodeMap.set(node.id, node);
	}

	for (const node of nodeMap.values()) {
		if (node.parentId && nodeMap.has(node.parentId)) {
			nodeMap.get(node.parentId)!.children.push(node);
		} else if (!node.parentId) {
			roots.push(node);
		}
	}

	return json({ toc: roots, total: res.rowCount });
};
