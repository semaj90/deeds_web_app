/**
 * GET /api/library/document/[id]/node/[nodeId]
 * Returns node content, sibling navigation, and breadcrumbs.
 * Fast-path: Go search service for numeric IDs, SQL fallback for UUIDs.
 */
import { json } from '@sveltejs/kit';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { validateUuidParams } from '$lib/server/validation.js';

export async function GET({ params, locals }) {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const { id, nodeId } = params;
	const invalid = validateUuidParams(params, 'id', 'nodeId');
	if (invalid) return invalid;

	// Go fast-path: only works with integer IDs (Go service uses int32)
	const goUrl = ENV.GO_SEARCH_URL;
	if (goUrl && /^\d+$/.test(nodeId)) {
		try {
			const res = await fetch(`${goUrl}/node/${nodeId}`, {
				signal: AbortSignal.timeout(5000),
			});
			if (res.ok) {
				return new Response(res.body, {
					headers: { 'Content-Type': 'application/json' },
				});
			}
		} catch {
			// Go service unavailable — fall through to SQL
		}
	}

	// 1. Fetch the node
	// We join with jurisdictions/library_documents for context if needed, but the primary target is the node.
	const nodeRes = await pool.query(
		`SELECT ln.id, ln.heading, ln.full_text as "textContent", ln.citation_label as "citationLabel",
		        ln.page_start as "pageStart", ln.page_end as "pageEnd", ln.node_path, ln.ordinal,
		        ln.parent_node_id
		 FROM legal_nodes ln
		 WHERE ln.id = $1 AND ln.document_id = $2`,
		[nodeId, id]
	);

	if (!nodeRes.rows[0]) {
		return json({ error: 'Node not found' }, { status: 404 });
	}

	const node = nodeRes.rows[0];

	// 2. Fetch siblings for prev/next navigation
	// We look for nodes with the same parent_node_id (or parent_node_id IS NULL)
	const siblingsRes = await pool.query(
		`SELECT id, heading, ordinal
		 FROM legal_nodes
		 WHERE document_id = $1 AND (parent_node_id = $2 OR (parent_node_id IS NULL AND $2 IS NULL))
		 ORDER BY ordinal`,
		[id, node.parent_node_id]
	);

	const siblings = siblingsRes.rows;
	const currentIndex = siblings.findIndex(s => s.id === nodeId);
	const prev = currentIndex > 0 ? { id: siblings[currentIndex - 1].id, heading: siblings[currentIndex - 1].heading } : null;
	const next = currentIndex < siblings.length - 1 ? { id: siblings[currentIndex + 1].id, heading: siblings[currentIndex + 1].heading } : null;

	// 3. Build Breadcrumbs
	// We can derive breadcrumbs from the node_path or query ancestors.
	// Since node_path is a materialized string like 'article-1/section-2', we might need to query the actual headings.
	// For simplicity and speed, we'll split the path and if we need the *headings*, we query them.
	
	// Better approach: Recursive query for ancestors to get headings
	const ancestorsRes = await pool.query(
		`WITH RECURSIVE ancestors AS (
			SELECT id, parent_node_id, heading, depth
			FROM legal_nodes
			WHERE id = $1
			UNION ALL
			SELECT ln.id, ln.parent_node_id, ln.heading, ln.depth
			FROM legal_nodes ln
			INNER JOIN ancestors a ON a.parent_node_id = ln.id
		)
		SELECT heading FROM ancestors ORDER BY depth ASC`,
		[node.parent_node_id]
	);

	const breadcrumb = ancestorsRes.rows.map(r => r.heading);

	return json({
		node,
		prev,
		next,
		breadcrumb
	});
}
