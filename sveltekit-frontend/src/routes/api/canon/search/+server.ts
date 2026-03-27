/**
 * POST /api/canon/search — Hybrid search across canonical legal chunks
 *
 * Body: { query, jurisdiction?, authorityLevel?, limit? }
 *
 * Pipeline: embed query → Qdrant dense search → payload filter → return ranked chunks
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';

const QDRANT_COLLECTION = 'legal_canon_chunks';

const searchSchema = z.object({
	query: z.string().min(1).max(2000),
	jurisdiction: z.string().max(10).optional(),
	authorityLevel: z.enum(['primary', 'persuasive', 'secondary', 'fictional']).optional(),
	docType: z.string().max(50).optional(),
	limit: z.number().int().min(1).max(50).optional(),
});

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		const raw = await request.json();
		const parsed = searchSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const { query, jurisdiction, authorityLevel, docType, limit: topK = 10 } = parsed.data;

		// 1. Embed query
		const embedStart = Date.now();
		let queryVector: number[];
		try {
			const result = await generateEmbeddings([query]);
			queryVector = result.vectors[0];
			if (!queryVector || queryVector.length !== 768) {
				return json({ error: 'Failed to generate query embedding' }, { status: 500 });
			}
		} catch (embedErr) {
			console.error('[canon/search] Embedding failed:', embedErr);
			return json({ error: 'Embedding service unavailable' }, { status: 503 });
		}
		const embedMs = Date.now() - embedStart;

		// 2. Build Qdrant filter
		const mustConditions: any[] = [];
		if (jurisdiction) {
			mustConditions.push({ key: 'jurisdiction', match: { value: jurisdiction } });
		}
		if (authorityLevel) {
			mustConditions.push({ key: 'authority_level', match: { value: authorityLevel } });
		}
		if (docType) {
			mustConditions.push({ key: 'doc_type', match: { value: docType } });
		}

		// 3. Search Qdrant
		const searchStart = Date.now();
		let results: any[] = [];
		try {
			const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

			const searchResult = await qdrant.client.search(QDRANT_COLLECTION, {
				vector: queryVector,
				limit: topK,
				with_payload: true,
				score_threshold: 0.3,
				...(mustConditions.length > 0 ? { filter: { must: mustConditions } } : {}),
			});

			results = searchResult.map((hit: any) => ({
				chunkId: hit.payload?.chunk_id,
				docId: hit.payload?.doc_id,
				docType: hit.payload?.doc_type,
				citation: hit.payload?.citation,
				jurisdiction: hit.payload?.jurisdiction,
				authorityLevel: hit.payload?.authority_level,
				content: hit.payload?.content,
				tokenCount: hit.payload?.token_count,
				domains: hit.payload?.domains ?? [],
				keyTerms: hit.payload?.key_terms ?? [],
				score: hit.score,
			}));
		} catch (qdrantErr) {
			console.warn('[canon/search] Qdrant search failed:', (qdrantErr as Error).message);
		}
		const searchMs = Date.now() - searchStart;

		return json({
			success: true,
			query,
			results,
			count: results.length,
			timing: {
				embedMs,
				searchMs,
				totalMs: Date.now() - startTime,
			},
		});
	} catch (err) {
		console.error('[canon/search] error:', err);
		return json({ error: 'Search failed' }, { status: 500 });
	}
};
