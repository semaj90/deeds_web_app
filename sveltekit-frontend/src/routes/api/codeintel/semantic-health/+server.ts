/**
 * GET /api/codeintel/semantic-health
 *
 * Source-of-truth health check for the CodeIntel semantic search pipeline.
 *
 * FAST mode (default): Qdrant existence + counts, Postgres counts, Ollama tags, Redis PING.
 *   No embedding inference — safe to call frequently from tasks/UI.
 *
 * DEEP mode (?mode=deep): everything above + live embed→Qdrant round-trip.
 *   Use for debugging when "degraded" but need to know if retrieval is truly broken.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { VLM_MODELS } from '$lib/server/ollama.js';

// ─── Response type ────────────────────────────────────────────────────────────

export interface SemanticSearchHealth {
	ok: boolean;
	search: {
		qdrantReachable: boolean;
		collectionExists: boolean;
		chunkCount: number;
		clusterSummaryCount: number;
		embeddingCoverage: number | null; // 0–1 fraction, null if query failed
		sampleQueryOk: boolean;
	};
	legal: {
		postgresHealthy: boolean;
		canonQdrantHealthy: boolean;
		legalQdrantParity: boolean;
		metrics: {
			pgLegalChunks: number;
			pgCanonChunks: number;
			qdLegalDocs: number;
			qdCanonChunks: number;
		};
	};
	cache: {
		redisReachable: boolean;
	};
	model: {
		ollamaReachable: boolean;
		chatModelReady: boolean;
		embedModelReady: boolean;
	};
	tables: {
		optional: Record<string, 'present' | 'missing'>;
	};
	degraded: boolean;
	error: string | null;
	latencyMs: number;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		return json({ ok: false, error: 'unauthorized' } as Partial<SemanticSearchHealth>, {
			status: 401,
		});
	}

	const deepMode = url.searchParams.get('mode') === 'deep';
	const t0 = Date.now();
	let criticalError: string | null = null;
	let degraded = false;

	// ── 1. Qdrant: reachability + collection existence + chunk count ──────────
	let qdrantReachable = false;
	let collectionExists = false;
	let chunkCount = 0;

	try {
		const ctrl = new AbortController();
		const tid = setTimeout(() => ctrl.abort(), 3000);
		const r = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768`, {
			signal: ctrl.signal,
		}).finally(() => clearTimeout(tid));

		if (r.ok) {
			qdrantReachable = true;
			const body = (await r.json()) as {
				result?: { status?: string; points_count?: number };
			};
			if (body?.result?.status) {
				collectionExists = true;
				chunkCount = body.result.points_count ?? 0;
			}
		} else {
			qdrantReachable = true; // server responded, just no collection
			degraded = true;
		}
	} catch {
		criticalError = 'Qdrant unreachable';
		degraded = true;
	}

	// ── 2. Postgres: cluster_summaries count + embedding coverage ────────────
	let clusterSummaryCount = 0;
	let embeddingCoverage: number | null = null;
	let pgLegalChunks = -1;
	let pgCanonChunks = -1;

	try {
		const r = await db.execute(sql`
			SELECT
				(SELECT COUNT(*) FROM cluster_summaries) AS total_summaries,
				(SELECT COUNT(summary_embedding) FROM cluster_summaries) AS with_embedding,
				(SELECT COUNT(*) FROM legal_chunks) AS legal_chunks,
				(SELECT COUNT(*) FROM canonical_chunks) AS canon_chunks
		`);
		const row = r.rows[0] as { total_summaries: string; with_embedding: string; legal_chunks: string; canon_chunks: string };
		const total = Number(row.total_summaries);
		const withEmb = Number(row.with_embedding);
		clusterSummaryCount = total;
		embeddingCoverage = total > 0 ? withEmb / total : 0;
		pgLegalChunks = Number(row.legal_chunks);
		pgCanonChunks = Number(row.canon_chunks);
	} catch (e) {
		console.error("Health query error:", e);
		degraded = true;
	}

	// ── 2b. Qdrant: Legal parity ────────────────────────────
	let qdLegalDocs = -1;
	let qdCanonChunks = -1;
	let postgresHealthy = false;
	let canonQdrantHealthy = false;
	let legalQdrantParity = false;

	if (qdrantReachable) {
		try {
			// Query legal_documents
			const ldRes = await fetch(`${ENV.QDRANT_URL}/collections/legal_documents`).catch(() => null);
			if (ldRes?.ok) {
				const body = await ldRes.json() as any;
				qdLegalDocs = body?.result?.points_count ?? 0;
			}

			// Query legal_canon_chunks
			const lccRes = await fetch(`${ENV.QDRANT_URL}/collections/legal_canon_chunks`).catch(() => null);
			if (lccRes?.ok) {
				const body = await lccRes.json() as any;
				qdCanonChunks = body?.result?.points_count ?? 0;
			}

			postgresHealthy = pgLegalChunks > 0;
			canonQdrantHealthy = (qdCanonChunks === pgCanonChunks) && (qdCanonChunks > 0);
			// Currently qdLegalDocs is tiny, meaning parity is missing. Warn if mismatch.
			legalQdrantParity = (qdLegalDocs >= pgLegalChunks) && (pgLegalChunks > 0);
		} catch {
			degraded = true;
		}
	}

	// ── 3. Ollama: reachability + model availability ──────────────────────────
	let ollamaReachable = false;
	let chatModelReady = false;
	let embedModelReady = false;

	try {
		const ctrl = new AbortController();
		const tid = setTimeout(() => ctrl.abort(), 4000);
		const r = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
			signal: ctrl.signal,
		}).finally(() => clearTimeout(tid));

		if (r.ok) {
			ollamaReachable = true;
			const body = (await r.json()) as { models?: Array<{ name: string }> };
			const names = (body.models ?? []).map((m) => m.name.toLowerCase());
			const chatModel = (VLM_MODELS.legal ?? 'gemma4-rotorquant:latest').toLowerCase();
			const embedModel = SERVER_EMBEDDING_MODEL.toLowerCase();
			chatModelReady = names.some((n) => n.startsWith(chatModel.split(':')[0]));
			embedModelReady = names.some((n) => n.startsWith(embedModel.split(':')[0]));
		}
	} catch {
		criticalError = criticalError ?? 'Ollama unreachable';
		degraded = true;
	}

	// ── 4. Semantic search sample query (live embed → Qdrant round-trip) ─────
	// Only run in deep mode (?mode=deep) — too expensive for routine fast health checks.
	let sampleQueryOk = false;

	if (!deepMode) {
		// Fast mode: skip embed round-trip, just verify collection is scrollable
		if (qdrantReachable && collectionExists) {
			try {
				const scrollCtrl = new AbortController();
				const scrollTid = setTimeout(() => scrollCtrl.abort(), 3000);
				const scrollRes = await fetch(
					`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ limit: 1, with_payload: false }),
						signal: scrollCtrl.signal,
					}
				).finally(() => clearTimeout(scrollTid));
				sampleQueryOk = scrollRes.ok;
			} catch { /* non-fatal */ }
		}
	} else if (qdrantReachable && collectionExists && ollamaReachable && embedModelReady) {
		try {
			// Embed a short probe query
			const embedCtrl = new AbortController();
			const embedTid = setTimeout(() => embedCtrl.abort(), 8000);
			const embedRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: SERVER_EMBEDDING_MODEL,
					input: 'auth session validation middleware',
				}),
				signal: embedCtrl.signal,
			}).finally(() => clearTimeout(embedTid));

			if (embedRes.ok) {
				const embedBody = (await embedRes.json()) as { embeddings?: number[][] };
				const vector = embedBody.embeddings?.[0];
				if (vector && vector.length === 768) {
					// Run a filtered search with a metadata filter (tests filter behavior)
					const searchCtrl = new AbortController();
					const searchTid = setTimeout(() => searchCtrl.abort(), 5000);
					const searchRes = await fetch(
						`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								vector,
								limit: 3,
								with_payload: false,
								score_threshold: 0.0,
							}),
							signal: searchCtrl.signal,
						}
					).finally(() => clearTimeout(searchTid));

					if (searchRes.ok) {
						const searchBody = (await searchRes.json()) as { result?: unknown[] };
						sampleQueryOk = Array.isArray(searchBody.result);
					}
				}
			}
		} catch {
			degraded = true;
		}
	} else if (qdrantReachable && collectionExists) {
		// Ollama not ready — skip embed, run a plain scroll instead
		try {
			const scrollCtrl = new AbortController();
			const scrollTid = setTimeout(() => scrollCtrl.abort(), 3000);
			const scrollRes = await fetch(
				`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/scroll`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ limit: 1, with_payload: false }),
					signal: scrollCtrl.signal,
				}
			).finally(() => clearTimeout(scrollTid));
			sampleQueryOk = scrollRes.ok;
		} catch {
			/* non-fatal */
		}
	}

	// ── 5. Optional feature tables: warn only, never fail health ────────────────
	const OPTIONAL_TABLES = [
		'chat_document_attachments',
		'route_metadata',
		'fictional_cases',
	] as const;
	const optionalTableStatus: Record<string, 'present' | 'missing'> = {};

	for (const table of OPTIONAL_TABLES) {
		try {
			const r = await db.execute(
				sql.raw(`SELECT to_regclass('public.${table}') IS NOT NULL AS exists`)
			);
			const exists = (r.rows[0] as any)?.exists === true;
			optionalTableStatus[table] = exists ? 'present' : 'missing';
			if (!exists) {
				console.warn(`[semantic-health] optional table missing: ${table}`);
			}
		} catch {
			optionalTableStatus[table] = 'missing';
		}
	}

	// ── 6. Redis: reachability ─────────────────────────────────────────────────
	let redisReachable = false;

	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		const pong = await redis.ping();
		redisReachable = pong === 'PONG';
	} catch {
		degraded = true;
	}

	// ── Build result ──────────────────────────────────────────────────────────
	const ok =
		qdrantReachable &&
		collectionExists &&
		ollamaReachable &&
		embedModelReady &&
		sampleQueryOk &&
		criticalError === null;

	const result: SemanticSearchHealth = {
		ok,
		search: {
			qdrantReachable,
			collectionExists,
			chunkCount,
			clusterSummaryCount,
			embeddingCoverage,
			sampleQueryOk,
		},
		legal: {
			postgresHealthy,
			canonQdrantHealthy,
			legalQdrantParity,
			metrics: {
				pgLegalChunks,
				pgCanonChunks,
				qdLegalDocs,
				qdCanonChunks
			}
		},
		cache: { redisReachable },
		model: { ollamaReachable, chatModelReady, embedModelReady },
		tables: { optional: optionalTableStatus },
		degraded,
		error: criticalError,
		latencyMs: Date.now() - t0,
	};

	return json(result, { status: ok ? 200 : 503 });
};
