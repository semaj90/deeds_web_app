/**
 * GET /api/admin/atlas/docs-corpus/search?q=...&limit=10 (READ ONLY).
 * Precedence: canonical Postgres FTS when admitted rows exist, else local lexical over the
 * reference/generated corpora. No web search, no Qdrant.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { pool } from '$lib/server/db/client';
import { requireAdmin } from '$lib/server/auth-utils';
import { findRepoRoot, searchDocCorpus } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';

const querySchema = z.object({
	q: z.string().trim().min(2).max(300),
	limit: z.coerce.number().int().min(1).max(25).default(10)
});

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const parsed = querySchema.safeParse(Object.fromEntries(event.url.searchParams));
	if (!parsed.success) return json({ query: '', mode: 'LOCAL_LEXICAL', hits: [], postgresNote: null, error: 'INVALID_QUERY' }, { status: 400 });
	const result = await searchDocCorpus({ pool, root: findRepoRoot(), q: parsed.data.q, limit: parsed.data.limit });
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
