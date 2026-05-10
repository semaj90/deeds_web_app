/**
 * /api/analytics/research-summaries/[id]
 *
 * GET — fetch a single research summary by ID
 *
 * GET ?mode=similar — HNSW nearest-neighbor search using pgvector <=> operator.
 *   Returns up to 6 most similar summaries (excluding self) ordered by cosine
 *   similarity.  Falls back to an empty array when embedding is NULL.
 *   Params:
 *     limit?  1-20 (default 6)
 *   Returns: { similar: ResearchSummary[] }
 *
 * DELETE — remove a research summary (owner or admin only)
 *
 * Auth: requires locals.user
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { researchSummaries } from '$lib/server/db/schema-postgres.js';
import { eq, and, sql, ne } from 'drizzle-orm';

// ── GET ──────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { id } = params;
	if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
		return json({ error: 'Invalid ID' }, { status: 400 });
	}

	// ── Similar mode (HNSW cosine nearest-neighbor) ───────────────────────────
	if (url.searchParams.get('mode') === 'similar') {
		const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit') ?? '6')));

		try {
			// 1. Fetch the source embedding
			const rows = await db
				.select({ embedding: researchSummaries.embedding })
				.from(researchSummaries)
				.where(eq(researchSummaries.id, id))
				.limit(1);

			const vec = rows[0]?.embedding;
			if (!vec || vec.length === 0) {
				return json({ similar: [] });
			}

			// 2. HNSW ANN search — pgvector <=> (cosine distance) operator
			// Drizzle doesn't support custom operators natively; use raw sql<>.
			const vecLiteral = `[${vec.join(',')}]`;
			const similar = await db.execute<{
				id: string; source: string; pipeline: string; entity_type: string;
				query: string; query_hash: string; title: string | null; url: string | null;
				collection: string | null; citation_label: string | null;
				section_path: string | null; jurisdiction: string | null;
				summary: string; entity_tags: string[]; relevance_score: number;
				saved_citation_id: string | null; user_id: string | null;
				created_at: string; score: number;
			}>(sql`
				SELECT
				  id, source, pipeline, entity_type, query, query_hash,
				  title, url, collection, citation_label, section_path, jurisdiction,
				  summary, entity_tags, relevance_score, saved_citation_id, user_id,
				  created_at,
				  1 - (embedding <=> ${vecLiteral}::vector) AS score
				FROM research_summaries
				WHERE id != ${id}::uuid
				  AND embedding IS NOT NULL
				ORDER BY embedding <=> ${vecLiteral}::vector
				LIMIT ${limit}
			`);

			const rows2 = (similar as unknown as { rows: unknown[] }).rows;

			return json({ similar: rows2 });
		} catch {
			return json({ similar: [] });
		}
	}

	// ── Fetch single summary ──────────────────────────────────────────────────
	try {
		const rows = await db
			.select()
			.from(researchSummaries)
			.where(eq(researchSummaries.id, id))
			.limit(1);

		if (!rows[0]) return json({ summary: null });
		return json({ summary: rows[0] });
	} catch {
		return json({ summary: null });
	}
};

// ── DELETE ────────────────────────────────────────────────────────────────────

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const { id } = params;
	if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
		return json({ error: 'Invalid ID' }, { status: 400 });
	}

	try {
		const [deleted] = await db
			.delete(researchSummaries)
			.where(
				and(
					eq(researchSummaries.id, id),
					eq(researchSummaries.userId, Number(locals.user.id)),
				)
			)
			.returning({ id: researchSummaries.id });

		if (!deleted) return json({ error: 'Not found or not owner' }, { status: 404 });
		return json({ deleted: true });
	} catch {
		return json({ error: 'DB error' }, { status: 500 });
	}
};
