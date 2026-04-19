/**
 * Diagnosis Similarity Search — Qdrant + pgvector dual retrieval
 *
 * POST /api/error-brain/diagnosis-history/similar
 *   → Find past diagnoses semantically similar to a query
 *   → Uses Qdrant diagnosis_embeddings + pgvector fallback
 *   → Returns ranked past diagnoses with scores for ACE contextual reuse
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { diagnosisEvents } from '$lib/server/db/schema-postgres.js';
import { desc, sql } from 'drizzle-orm';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';
import { cognitiveCache, setCache } from '$lib/server/cache.js';
import { createHash } from 'crypto';

const DIAG_COLLECTION = VECTOR_CONFIG.COLLECTIONS.diagnosis_embeddings;
const SIMILARITY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

const similarSchema = z.object({
	query: z.string().min(3).max(2000),
	routePath: z.string().max(255).optional(),
	limit: z.number().int().min(1).max(20).default(5),
	scoreThreshold: z.number().min(0).max(1).default(0.3),
	strategy: z.enum(['qdrant', 'pgvector', 'hybrid']).default('hybrid'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = similarSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, routePath, limit, scoreThreshold, strategy } = parsed.data;
	const startMs = Date.now();

	// Cache key based on query + filters
	const cacheInput = `similar:${query.slice(0, 100)}:${routePath || ''}:${limit}:${strategy}`;
	const cacheKey = `ast:diagnosis:similar:${createHash('sha256').update(cacheInput).digest('hex').slice(0, 16)}`;
	const cached = await cognitiveCache.getJsonbDocument<Record<string, unknown>>(cacheKey);
	if (cached) return json({ ...cached, cached: true });

	try {
		const queryEmbedding = await generateSingleEmbedding(query.slice(0, 512));

		const qdrantResults: Array<{
			diagnosisId: string;
			score: number;
			diagnosis: string;
			rootCauseType: string;
			routePath: string;
			likelyFiles: string[];
			source: 'qdrant';
		}> = [];

		const pgResults: Array<{
			diagnosisId: string;
			score: number;
			diagnosis: string;
			rootCauseType: string;
			routePath: string;
			likelyFiles: unknown;
			source: 'pgvector';
		}> = [];

		// ── Qdrant search (primary — fast, GPU-accelerated) ──
		if (strategy === 'qdrant' || strategy === 'hybrid') {
			try {
				const filter = routePath
					? { must: [{ key: 'routePath', match: { value: routePath } }] }
					: undefined;

				const results = await qdrant.client.search(DIAG_COLLECTION, {
					vector: { name: 'diagnosis', vector: queryEmbedding },
					limit,
					score_threshold: scoreThreshold,
					with_payload: true,
					filter,
				});

				for (const hit of results) {
					const p = (hit.payload ?? {}) as Record<string, unknown>;
					qdrantResults.push({
						diagnosisId: String(hit.id),
						score: hit.score,
						diagnosis: (p.diagnosis as string) || '',
						rootCauseType: (p.rootCauseType as string) || 'unknown',
						routePath: (p.routePath as string) || '',
						likelyFiles: (p.likelyFiles as string[]) || [],
						source: 'qdrant',
					});
				}
			} catch {
				// Qdrant collection may not exist yet — fall through to pgvector
			}
		}

		// ── pgvector search (fallback — SQL-native, always available) ──
		if (strategy === 'pgvector' || (strategy === 'hybrid' && qdrantResults.length < limit)) {
			try {
				const embeddingStr = `[${queryEmbedding.join(',')}]`;
				const pgLimit = strategy === 'hybrid' ? limit - qdrantResults.length : limit;

				const pgRows = await db.execute(sql`
					SELECT
						id,
						diagnosis,
						probable_root_cause_type AS root_cause_type,
						route_path,
						likely_files,
						1 - (query_embedding <=> ${embeddingStr}::vector) AS score
					FROM diagnosis_events
					WHERE query_embedding IS NOT NULL
					${routePath ? sql`AND route_path = ${routePath}` : sql``}
					ORDER BY query_embedding <=> ${embeddingStr}::vector
					LIMIT ${pgLimit}
				`);

				for (const row of pgRows.rows as Record<string, unknown>[]) {
					const score = Number(row.score ?? 0);
					if (score >= scoreThreshold) {
						pgResults.push({
							diagnosisId: String(row.id),
							score,
							diagnosis: (row.diagnosis as string) || '',
							rootCauseType: (row.root_cause_type as string) || 'unknown',
							routePath: (row.route_path as string) || '',
							likelyFiles: row.likely_files,
							source: 'pgvector',
						});
					}
				}
			} catch (e) {
				console.warn('[diagnosis-similar] pgvector search failed:', (e as Error).message);
			}
		}

		// ── Merge + deduplicate (Qdrant takes priority on score ties) ──
		const seen = new Set<string>();
		const merged = [...qdrantResults, ...pgResults]
			.sort((a, b) => b.score - a.score)
			.filter((r) => {
				if (seen.has(r.diagnosisId)) return false;
				seen.add(r.diagnosisId);
				return true;
			})
			.slice(0, limit);

		const result = {
			similar: merged,
			meta: {
				query: query.slice(0, 100),
				strategy,
				qdrantHits: qdrantResults.length,
				pgvectorHits: pgResults.length,
				totalMs: Date.now() - startMs,
			},
		};

		setCache(cacheKey, result, SIMILARITY_CACHE_TTL_MS).catch(() => {});

		return json(result);
	} catch (e) {
		console.error('[diagnosis-similar] Error:', e);
		return json({ similar: [], meta: { error: 'Search failed', totalMs: Date.now() - startMs } }, { status: 503 });
	}
};
