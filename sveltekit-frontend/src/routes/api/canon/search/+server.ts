/**
 * POST /api/canon/search — Hybrid search across canonical legal chunks
 *
 * Body: { query, jurisdiction?, authorityLevel?, docType?, limit? }
 *
 * Pipeline:
 *   1. Embed query → 768-dim vector
 *   2. Qdrant hybrid search (dense + BM42 sparse, RRF fusion)
 *   3. Payload filter (jurisdiction, authority_level, doc_type)
 *   4. Fallback: pgvector cosine search on canonical_chunks table
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

const QDRANT_COLLECTION = 'legal_canon_chunks';

const searchSchema = z.object({
	query: z.string().min(1).max(2000),
	jurisdiction: z.string().max(10).optional(),
	authorityLevel: z.enum(['primary', 'persuasive', 'secondary', 'fictional']).optional(),
	docType: z.string().max(50).optional(),
	limit: z.number().int().min(1).max(50).optional(),
});

interface CanonSearchResult {
	chunkId: string;
	docId: string;
	docType: string;
	citation: string;
	jurisdiction: string;
	authorityLevel: string;
	content: string;
	tokenCount: number;
	domains: string[];
	keyTerms: string[];
	score: number;
	source: 'qdrant' | 'pgvector';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
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
		const mustConditions: Array<{ key: string; match: { value: string } }> = [];
		if (jurisdiction) {
			mustConditions.push({ key: 'jurisdiction', match: { value: jurisdiction } });
		}
		if (authorityLevel) {
			mustConditions.push({ key: 'authority_level', match: { value: authorityLevel } });
		}
		if (docType) {
			mustConditions.push({ key: 'doc_type', match: { value: docType } });
		}

		// 3. Qdrant hybrid search (dense + BM42 sparse → RRF fusion)
		const searchStart = Date.now();
		let results: CanonSearchResult[] = [];
		try {
			const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

			const hits = await qdrant.hybridSearch({
				collection: QDRANT_COLLECTION,
				queryEmbedding: queryVector,
				query,
				limit: topK,
				scoreThreshold: 0.3,
				filters: mustConditions.length > 0 ? { must: mustConditions } : undefined,
			});

			results = hits.map((hit: Record<string, any>) => ({
				chunkId: hit.payload?.chunk_id ?? '',
				docId: hit.payload?.doc_id ?? '',
				docType: hit.payload?.doc_type ?? '',
				citation: hit.payload?.citation ?? '',
				jurisdiction: hit.payload?.jurisdiction ?? '',
				authorityLevel: hit.payload?.authority_level ?? '',
				content: hit.payload?.content ?? '',
				tokenCount: hit.payload?.token_count ?? 0,
				domains: hit.payload?.domains ?? [],
				keyTerms: hit.payload?.key_terms ?? [],
				score: hit.score ?? 0,
				source: 'qdrant' as const,
			}));
		} catch (qdrantErr) {
			console.warn('[canon/search] Qdrant unavailable, falling back to pgvector:', (qdrantErr as Error).message);
		}
		const searchMs = Date.now() - searchStart;

		// 4. Fallback: pgvector search on canonical_chunks table
		let fallbackMs = 0;
		if (results.length === 0) {
			const fbStart = Date.now();
			try {
				const vectorLiteral = `[${queryVector.join(',')}]`;
				const jurisdictionFilter = jurisdiction
					? sql` AND cd.jurisdiction = ${jurisdiction}`
					: sql``;
				const authorityFilter = authorityLevel
					? sql` AND cd.authority_level = ${authorityLevel}`
					: sql``;
				const docTypeFilter = docType
					? sql` AND cd.doc_type = ${docType}`
					: sql``;

				const pgResults = await db.execute(sql`
					SELECT
						cc.chunk_id,
						cc.document_id,
						cd.doc_type,
						cd.citation,
						cd.jurisdiction,
						cd.authority_level,
						cc.content,
						cc.token_count,
						cc.domains,
						cc.key_terms,
						1 - (cc.embedding::vector <=> ${sql.raw(`'${vectorLiteral}'`)}::vector) AS score
					FROM canonical_chunks cc
					JOIN canonical_documents cd ON cd.id = cc.document_id
					WHERE cc.embedding IS NOT NULL
						${jurisdictionFilter}
						${authorityFilter}
						${docTypeFilter}
					ORDER BY cc.embedding::vector <=> ${sql.raw(`'${vectorLiteral}'`)}::vector
					LIMIT ${topK}
				`);

				const rows = (pgResults as any).rows as Record<string, unknown>[];
				results = rows
					.filter((r) => Number(r.score) >= 0.3)
					.map((r) => ({
						chunkId: String(r.chunk_id ?? ''),
						docId: String(r.document_id ?? ''),
						docType: String(r.doc_type ?? ''),
						citation: String(r.citation ?? ''),
						jurisdiction: String(r.jurisdiction ?? ''),
						authorityLevel: String(r.authority_level ?? ''),
						content: String(r.content ?? ''),
						tokenCount: Number(r.token_count ?? 0),
						domains: Array.isArray(r.domains) ? (r.domains as string[]) : [],
						keyTerms: Array.isArray(r.key_terms) ? (r.key_terms as string[]) : [],
						score: Number(r.score ?? 0),
						source: 'pgvector' as const,
					}));
			} catch (pgErr) {
				console.warn('[canon/search] pgvector fallback failed:', (pgErr as Error).message);
			}
			fallbackMs = Date.now() - fbStart;
		}

		return json({
			success: true,
			query,
			results,
			count: results.length,
			timing: {
				embedMs,
				searchMs,
				...(fallbackMs > 0 ? { fallbackMs } : {}),
				totalMs: Date.now() - startTime,
			},
		});
	} catch (err) {
		console.error('[canon/search] error:', err);
		return json({ error: 'Search failed' }, { status: 500 });
	}
};
