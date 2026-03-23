/**
 * GET /api/glossary/terms
 *
 * List legal glossary terms with optional filtering by category or jurisdiction.
 *
 * Query params:
 *   category  — filter by category (e.g. "civil", "criminal")
 *   q         — simple text filter on term/definition (client-side autocomplete)
 *   limit     — max results (1-500, default 100)
 *   offset    — pagination offset (default 0)
 *
 * Response: { terms: Term[], count: number, total: number }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';

const querySchema = z.object({
	category: z.string().max(200).optional(),
	q: z.string().max(500).optional(),
	limit: z.coerce.number().int().min(1).max(500).default(100),
	offset: z.coerce.number().int().min(0).default(0)
});

export const GET: RequestHandler = async ({ url }) => {
	const start = performance.now();
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { category, q, limit, offset } = parsed.data;

	// Try fetching from legal_definitions (new hierarchical schema)
	try {
		const conditions: string[] = [];
		const params: unknown[] = [];
		let idx = 1;

		if (category) { conditions.push(`ld.normalized_term ILIKE $${idx++}`); params.push(`%${category}%`); }
		if (q) { conditions.push(`(ld.term ILIKE $${idx} OR ld.definition_text ILIKE $${idx})`); params.push(`%${q}%`); idx++; }

		const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		const res = await pool.query(
			`SELECT ld.id, ld.term, ld.definition_text AS definition,
			        ln.id AS node_id, ln.citation_label AS citation,
			        ld.confidence
			 FROM legal_definitions ld
			 LEFT JOIN legal_nodes ln ON ln.id = ld.defined_in_node_id
			 ${where}
			 ORDER BY ld.term
			 LIMIT $${idx++} OFFSET $${idx++}`,
			[...params, limit, offset]
		);

		if (res.rows.length > 0) {
			return json({
				terms: res.rows.map((r: Record<string, unknown>) => ({
					id: r.id,
					term: r.term,
					definition: r.definition,
					sourceNodeId: r.node_id,
					citation: r.citation,
					confidence: r.confidence,
				})),
				count: res.rows.length,
				total: res.rows.length,
				timing: { total_ms: Math.round(performance.now() - start) },
			});
		}
	} catch {
		console.log('legal_definitions not populated yet, falling back to legal_glossary');
	}

	// Legacy fallback: legal_glossary
	try {
		const conditions: string[] = [];
		const params: unknown[] = [];
		let idx = 1;

		if (category) { conditions.push(`lg.category ILIKE $${idx++}`); params.push(`%${category}%`); }
		if (q) { conditions.push(`(lg.term ILIKE $${idx} OR lg.definition ILIKE $${idx})`); params.push(`%${q}%`); idx++; }

		const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		const dataResult = await pool.query(
			`SELECT lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction
			 FROM legal_glossary lg
			 ${where}
			 ORDER BY lg.term
			 LIMIT $${idx++} OFFSET $${idx++}`,
			[...params, limit, offset]
		);

		return json({
			terms: dataResult.rows.map((r: Record<string, unknown>) => ({
				id: r.id,
				term: r.term,
				definition: r.definition,
				category: r.category,
				jurisdiction: r.jurisdiction,
			})),
			count: dataResult.rows.length,
			total: dataResult.rows.length,
			timing: { total_ms: Math.round(performance.now() - start) },
		});
	} catch {
		return json({ error: 'No glossary tables found' }, { status: 503 });
	}
};
