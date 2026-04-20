/**
 * POST /api/codebase-index/index-stream
 *
 * GPU codebase indexing pipeline with SSE streaming progress.
 *
 * Stages (each emits an SSE event):
 *   1. scroll    — Scroll Qdrant for chunks by cluster or tag filter
 *   2. summarize — Generate cluster summary via Gemma4 (bifrostChat)
 *   3. autoencode— Embed the summary text → Qdrant `summary` named vector
 *   4. qdrant_upsert — Write summary vector to all cluster chunks
 *   5. mirror    — Upsert to PostgreSQL codebase_chunk_index (content, JSONB, halfvec)
 *   6. gpu_tag   — GPU-accelerated Karpathy semantic tagging (optional)
 *   7. complete  — Final stats
 *
 * Query params:
 *   cluster  — GPU/SOM cluster ID to index (required unless tags provided)
 *   tags     — comma-separated Qdrant tags to filter
 *   limit    — max chunks per batch (default 50, max 200)
 *   force    — bypass summary Redis cache (default false)
 *   dryRun   — skip writes, stream stages only (default false)
 *   gpuTag   — run GPU Karpathy semantic tagging (default false)
 *
 * Auth: requires locals.user
 */
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import { generateClusterSummary, type ClusterSummary } from '$lib/server/indexer/cluster-summary.js';
import { getTagEmbeddings, classifyChunksGpu, SEMANTIC_TAGS } from '$lib/server/indexer/gpu-karpathy-tagger.js';
import { isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';
import { pool } from '$lib/server/db/client';

const QDRANT_URL  = ENV.QDRANT_URL;
const COLLECTION  = 'codebase_chunks_768';

// ── Qdrant scroll helper ─────────────────────────────────────────────────────

interface QdrantChunk {
	id: string | number;
	payload: Record<string, unknown>;
	vector?: Record<string, number[]>;
}

async function scrollQdrant(
	filter: Record<string, unknown>,
	limit: number,
	withVectors: boolean,
): Promise<QdrantChunk[]> {
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ limit, with_payload: true, with_vector: withVectors, filter }),
		signal: AbortSignal.timeout(30_000),
	});
	if (!res.ok) return [];
	const data = await res.json() as { result?: { points?: QdrantChunk[] } };
	return data.result?.points ?? [];
}

// ── Embed text via Ollama ────────────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
	const results: (number[] | null)[] = [];
	for (const text of texts) {
		try {
			const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'embeddinggemma:latest', input: text }),
				signal: AbortSignal.timeout(30_000),
			});
			if (!res.ok) { results.push(null); continue; }
			const data = await res.json() as { embeddings?: number[][] };
			results.push(data.embeddings?.[0] ?? null);
		} catch {
			results.push(null);
		}
	}
	return results;
}

// ── Qdrant upsert named vector ───────────────────────────────────────────────

async function upsertQdrantVector(
	pointId: string | number,
	vectorName: string,
	vector: number[],
): Promise<boolean> {
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/vectors`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			points: [{ id: pointId, vector: { [vectorName]: vector } }],
		}),
		signal: AbortSignal.timeout(10_000),
	});
	return res.ok;
}

// ── PostgreSQL mirror upsert ─────────────────────────────────────────────────

async function mirrorToPostgres(
	chunk: QdrantChunk,
	clusterSummary: ClusterSummary | null,
	summaryVec: number[] | null,
	contentVec: number[] | null,
	signatureVec: number[] | null,
): Promise<boolean> {
	const p = chunk.payload;
	try {
		await pool.query(
			`INSERT INTO codebase_chunk_index
			   (qdrant_id, relative_path, symbol, kind, line_start, line_end, content,
			    content_embedding, signature_embedding, summary_embedding,
			    gpu_cluster, som_cluster, page_rank_score, tags, cluster_summary, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, NOW())
			 ON CONFLICT (qdrant_id) DO UPDATE SET
			    content            = EXCLUDED.content,
			    content_embedding  = COALESCE(EXCLUDED.content_embedding, codebase_chunk_index.content_embedding),
			    signature_embedding= COALESCE(EXCLUDED.signature_embedding, codebase_chunk_index.signature_embedding),
			    summary_embedding  = COALESCE(EXCLUDED.summary_embedding, codebase_chunk_index.summary_embedding),
			    gpu_cluster        = EXCLUDED.gpu_cluster,
			    som_cluster        = EXCLUDED.som_cluster,
			    page_rank_score    = EXCLUDED.page_rank_score,
			    tags               = EXCLUDED.tags,
			    cluster_summary    = EXCLUDED.cluster_summary,
			    updated_at         = NOW()`,
			[
				String(chunk.id),
				String(p['relativePath'] ?? p['path'] ?? ''),
				(p['symbol'] as string) ?? null,
				(p['kind'] as string) ?? null,
				(p['lineStart'] as number) ?? null,
				(p['lineEnd'] as number) ?? null,
				(p['content'] as string) ?? null,
				contentVec ? JSON.stringify(contentVec) : null,
				signatureVec ? JSON.stringify(signatureVec) : null,
				summaryVec ? JSON.stringify(summaryVec) : null,
				(p['neo4j_gpuCluster'] as number) ?? (p['gpu_cluster'] as number) ?? null,
				(p['som_cluster'] as number) ?? null,
				(p['pagerank_score'] as number) ?? (p['pagerank_score_couchdb'] as number) ?? null,
				JSON.stringify(p['tags'] ?? []),
				JSON.stringify(clusterSummary ?? {}),
			],
		);
		return true;
	} catch (err) {
		console.warn('[index-stream] pgvector mirror failed:', (err as Error)?.message);
		return false;
	}
}

// ── SSE POST handler ─────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const clusterId = url.searchParams.get('cluster') ? Number(url.searchParams.get('cluster')) : null;
	const tags      = url.searchParams.get('tags')?.split(',').filter(Boolean) ?? [];
	const limit     = Math.min(Number(url.searchParams.get('limit') ?? '50'), 200);
	const force     = url.searchParams.get('force') === 'true';
	const dryRun    = url.searchParams.get('dryRun') === 'true';
	const gpuTag    = url.searchParams.get('gpuTag') === 'true';

	if (clusterId == null && tags.length === 0) {
		return new Response(JSON.stringify({ error: 'cluster or tags required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const enc = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const emit = (event: string, data: unknown) => {
				controller.enqueue(enc.encode(sseFormat(event, data)));
			};

			const t0 = performance.now();

			try {
				// ── Stage 1: Scroll Qdrant ──────────────────────────────────────
				const filter: Record<string, unknown> = {};
				if (clusterId != null) {
					filter.should = [
						{ key: 'neo4j_gpuCluster', match: { value: clusterId } },
						{ key: 'som_cluster',      match: { value: clusterId } },
					];
				} else if (tags.length) {
					filter.must = [{ key: 'tags', match: { any: tags } }];
				}

				const chunks = await scrollQdrant(filter, limit, true);
				emit('scroll', {
					stage: 1,
					chunksFound: chunks.length,
					clusterId,
					tags,
					durationMs: Math.round(performance.now() - t0),
				});

				if (chunks.length === 0) {
					emit('complete', { message: 'No chunks matched filter', totalMs: Math.round(performance.now() - t0) });
					controller.close();
					return;
				}

				// ── Stage 2: Cluster summary ────────────────────────────────────
				let summary: ClusterSummary | null = null;
				if (clusterId != null) {
					const t2 = performance.now();
					const summaryResult = await generateClusterSummary(clusterId, force);
					if (summaryResult.ok) {
						summary = summaryResult.summary;
					}
					emit('summarize', {
						stage: 2,
						clusterId,
						hasSummary: summaryResult.ok,
						reason: summaryResult.ok === false ? summaryResult.reason : null,
						purpose: summary?.purpose ?? null,
						patterns: summary?.patterns ?? [],
						keyFiles: summary?.keyFiles?.length ?? 0,
						warnings: summary?.warnings?.length ?? 0,
						durationMs: Math.round(performance.now() - t2),
					});
				}

				// ── Stage 3: Autoencode summary → embedding ─────────────────────
				let summaryVec: number[] | null = null;
				if (summary?.summary) {
					const t3 = performance.now();
					const [vec] = await embedTexts([summary.summary]);
					summaryVec = vec;
					emit('autoencode', {
						stage: 3,
						summaryLength: summary.summary.length,
						embeddingDims: summaryVec?.length ?? 0,
						durationMs: Math.round(performance.now() - t3),
					});
				}

				// ── Stage 4: Upsert summary vector to Qdrant ────────────────────
				if (summaryVec && !dryRun) {
					const t4 = performance.now();
					let upserted = 0;
					for (const chunk of chunks) {
						const ok = await upsertQdrantVector(chunk.id, 'summary', summaryVec);
						if (ok) upserted++;
					}
					emit('qdrant_upsert', {
						stage: 4,
						vectorName: 'summary',
						attempted: chunks.length,
						upserted,
						durationMs: Math.round(performance.now() - t4),
					});
				}

				// ── Stage 5: Mirror to PostgreSQL ───────────────────────────────
				if (!dryRun) {
					const t5 = performance.now();
					let mirrored = 0;
					for (const chunk of chunks) {
						// Extract existing vectors from Qdrant scroll response
						const contentVec = (chunk.vector as Record<string, number[]>)?.['content'] ?? null;
						const sigVec     = (chunk.vector as Record<string, number[]>)?.['signature'] ?? null;

						const ok = await mirrorToPostgres(chunk, summary, summaryVec, contentVec, sigVec);
						if (ok) mirrored++;

						// Emit per-chunk progress every 10 chunks
						if (mirrored % 10 === 0 && mirrored > 0) {
							emit('mirror_progress', { mirrored, total: chunks.length });
						}
					}
					emit('mirror', {
						stage: 5,
						mirrored,
						total: chunks.length,
						durationMs: Math.round(performance.now() - t5),
					});
				}

				// ── Stage 6: GPU Karpathy semantic tagging (optional) ───────────
				let gpuTagged = 0;
				if (gpuTag) {
					const t6 = performance.now();
					try {
						const tagEmbeddings = await getTagEmbeddings();

						// Build classification input from chunks with content vectors
						const classInput = chunks
							.map(c => ({
								id: c.id,
								vector: (c.vector as Record<string, number[]>)?.['content'] ?? null,
							}))
							.filter((c): c is { id: string | number; vector: number[] } =>
								c.vector !== null && c.vector.length === 768
							);

						if (classInput.length > 0) {
							const results = await classifyChunksGpu(classInput, tagEmbeddings, 0.35, 4);

							if (!dryRun) {
								const QDRANT = `${QDRANT_URL}/collections/${COLLECTION}/points/payload`;
								for (const r of results) {
									if (r.tags.length === 0) continue;
									const chunk = chunks.find(c => c.id === r.id);
									const existing = (chunk?.payload?.['tags'] as string[] | undefined) ?? [];
									const merged = [...new Set([...existing, ...r.tags])];
									await fetch(QDRANT, {
										method: 'PUT',
										headers: { 'Content-Type': 'application/json' },
										body: JSON.stringify({ payload: { tags: merged }, points: [r.id] }),
										signal: AbortSignal.timeout(10_000),
									}).catch(() => null);
									gpuTagged++;
								}
							} else {
								gpuTagged = results.filter(r => r.tags.length > 0).length;
							}
						}

						emit('gpu_tag', {
							stage: 6,
							cuda: isCudaAvailable(),
							chunksClassified: classInput.length,
							tagged: gpuTagged,
							vocabulary: SEMANTIC_TAGS.length,
							dryRun,
							durationMs: Math.round(performance.now() - t6),
						});
					} catch (err) {
						emit('gpu_tag_error', {
							stage: 6,
							error: (err as Error)?.message ?? String(err),
							durationMs: Math.round(performance.now() - t6),
						});
					}
				}

				// ── Stage 7: Complete ────────────────────────────────────────────
				emit('complete', {
					stage: 7,
					chunks: chunks.length,
					clusterId,
					hasSummary: !!summary,
					hasSummaryVector: !!summaryVec,
					mirrored: !dryRun,
					gpuTagged,
					dryRun,
					totalMs: Math.round(performance.now() - t0),
				});
			} catch (err) {
				emit('error', { message: (err as Error)?.message ?? String(err) });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { headers: sseHeaders() });
};

// ── GET: health + status ─────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Count mirrored chunks in PostgreSQL
	const pgCount = await pool
		.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM codebase_chunk_index')
		.then(r => r.rows[0]?.cnt ?? 0)
		.catch(() => 0);

	// Count chunks with summary embeddings
	const summaryCount = await pool
		.query<{ cnt: number }>('SELECT COUNT(*)::int AS cnt FROM codebase_chunk_index WHERE summary_embedding IS NOT NULL')
		.then(r => r.rows[0]?.cnt ?? 0)
		.catch(() => 0);

	return new Response(JSON.stringify({
		endpoint: '/api/codebase-index/index-stream',
		description: 'SSE streaming codebase indexer with GPU cluster summaries, Qdrant autoencoding, and pgvector mirroring',
		pgMirroredChunks: pgCount,
		pgSummaryEmbeddings: summaryCount,
		qdrantCollection: COLLECTION,
		stages: ['scroll', 'summarize', 'autoencode', 'qdrant_upsert', 'mirror', 'gpu_tag', 'complete'],
		params: { cluster: 'number', tags: 'string (comma-sep)', limit: 'number (max 200)', force: 'bool', dryRun: 'bool', gpuTag: 'bool' },
	}), { headers: { 'Content-Type': 'application/json' } });
};
