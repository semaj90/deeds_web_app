import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';

const querySchema = z.object({
	q: z.string().min(1, 'Missing query').max(500)
});

/**
 * GET /api/library/resolve-citation?q=...
 * Resolves a citation string (e.g. "Art. I, § 1") to a specific legal node.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Missing query' }, { status: 400 });
	}
	const query = parsed.data.q.trim();

	try {
		// 1. Try exact match on citation_label
		const exactMatch = await pool.query(
			`SELECT ln.id as node_id, ln.document_id, ln.citation_label, ld.title as doc_title
			 FROM legal_nodes ln
			 JOIN library_documents ld ON ld.id = ln.document_id
			 WHERE ln.citation_label = $1
			 LIMIT 1`,
			[query]
		);

		if (exactMatch.rows.length > 0) {
			return json({ success: true, result: exactMatch.rows[0] });
		}

		// 2. Try fuzzy match (trigram or ILIKE) on citation_label and heading
		const fuzzyMatch = await pool.query(
			`SELECT ln.id as node_id, ln.document_id, ln.citation_label, ld.title as doc_title,
			        similarity(ln.citation_label, $1) as score
			 FROM legal_nodes ln
			 JOIN library_documents ld ON ld.id = ln.document_id
			 WHERE ln.citation_label % $1 OR ln.heading ILIKE $2
			 ORDER BY score DESC
			 LIMIT 1`,
			[query, `%${query}%`]
		);

		if (fuzzyMatch.rows.length > 0) {
			return json({ success: true, result: fuzzyMatch.rows[0], fuzzy: true });
		}

		return json({ success: false, error: 'Citation not found' }, { status: 404 });
	} catch (err) {
		console.error('[resolve-citation] error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
