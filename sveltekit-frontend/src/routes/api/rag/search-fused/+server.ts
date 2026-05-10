/**
 * POST /api/rag/search-fused
 *
 * Sparse + dense hybrid retrieval over `legal_documents`, fused via RRF.
 *
 * This route is the live demo of Phase 1 (rrf-fuse + sparse-bm25). The legacy
 * /api/rag/search route is intentionally left alone — that codepath has 1000+
 * lines of corrective-RAG / cache / TFIDF logic that wraps Qdrant only.
 *
 * Pipeline:
 *   1. Embed query (existing embedding-client cascade)
 *   2. Parallel:
 *        a. Qdrant hybridSearch on legal_documents (dense lane)
 *        b. Postgres sparseLegalSearch (BM25-style lane via content_tsv GIN)
 *   3. Fuse with rrfFuseDenseSparse (k=60, weights 0.6 dense / 0.4 sparse)
 *   4. Return top-K with provenance breakdown
 *
 * Auth: requires `locals.user` (DEV_BYPASS_AUTH is honored upstream).
 * Rate limit: 30 req/min/user (medium — heavier than analytics, lighter than upload).
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client';
import { qdrant } from '$lib/server/vector/qdrant-manager';
import { rrfFuseDenseSparse, type RrfHit } from '$lib/server/retrieval/rrf-fuse';
import { sparseLegalSearch } from '$lib/server/retrieval/sparse-bm25';

const bodySchema = z.object({
	query:        z.string().min(2).max(2000),
	limit:        z.number().int().min(1).max(50).default(10),
	jurisdiction: z.string().max(32).optional(),
	denseWeight:  z.number().min(0).max(2).optional(),
	sparseWeight: z.number().min(0).max(2).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
	}

	let parsed;
	try {
		const raw = await request.json();
		parsed = bodySchema.safeParse(raw);
	} catch {
		return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!parsed.success) {
		return json(
			{ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
			{ status: 400 }
		);
	}

	const { query, limit, jurisdiction, denseWeight, sparseWeight } = parsed.data;
	const startedAt = Date.now();

	// 1. Embed query (single-text batch) — embedding-client handles fallbacks.
	const embedStart = Date.now();
	let queryVector: number[] | null = null;
	try {
		const embeddingResult = await generateEmbeddings([query]);
		queryVector = embeddingResult.vectors?.[0] ?? null;
	} catch (err) {
		console.warn('[search-fused] embedding failed:', err instanceof Error ? err.message : err);
	}
	const embedMs = Date.now() - embedStart;

	// 2a. Dense lane (Qdrant) — skip gracefully if embedding failed.
	const denseStart = Date.now();
	let denseHits: RrfHit[] = [];
	let denseErr: string | null = null;
	if (queryVector) {
		try {
			const qdrantResult = await qdrant.hybridSearch({
				query,
				queryEmbedding: queryVector,
				collection:     'legal_documents',
				limit:          Math.min(limit * 3, 50), // overfetch for better fusion
				filters: jurisdiction
					? { must: [{ key: 'jurisdiction', match: { value: jurisdiction } }] }
					: undefined,
			});
			denseHits = qdrantResult.results.map((r) => ({
				id:      String(r.id),
				score:   r.score,
				payload: r.payload,
			}));
		} catch (err) {
			denseErr = err instanceof Error ? err.message : String(err);
			console.warn('[search-fused] dense lane failed:', denseErr);
		}
	}
	const denseMs = Date.now() - denseStart;

	// 2b. Sparse lane (Postgres tsvector + GIN) — independent of embeddings.
	const sparseStart = Date.now();
	let sparseHits: RrfHit[] = [];
	let sparseErr: string | null = null;
	try {
		const pool = (db as unknown as { $client?: unknown }).$client as
			| import('pg').Pool
			| undefined;
		if (!pool) throw new Error('pg.Pool not exposed on Drizzle client');
		const rows = await sparseLegalSearch(pool, query, {
			limit:        Math.min(limit * 3, 50),
			jurisdiction: jurisdiction,
		});
		sparseHits = rows.map((row) => ({
			id:      row.id,
			score:   row.score,
			payload: row.payload,
		}));
	} catch (err) {
		sparseErr = err instanceof Error ? err.message : String(err);
		console.warn('[search-fused] sparse lane failed:', sparseErr);
	}
	const sparseMs = Date.now() - sparseStart;

	// 3. RRF fusion.
	const fused = rrfFuseDenseSparse(denseHits, sparseHits, {
		topK:         limit,
		denseWeight:  denseWeight  ?? 0.6,
		sparseWeight: sparseWeight ?? 0.4,
	});

	return json({
		ok:      true,
		query,
		results: fused,
		timing: {
			embedMs,
			denseMs,
			sparseMs,
			totalMs: Date.now() - startedAt,
		},
		lanes: {
			dense:  { hits: denseHits.length,  error: denseErr },
			sparse: { hits: sparseHits.length, error: sparseErr },
		},
	});
};
