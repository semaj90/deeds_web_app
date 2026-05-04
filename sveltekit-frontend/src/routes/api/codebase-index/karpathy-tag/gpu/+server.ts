/**
 * POST /api/codebase-index/karpathy-tag/gpu
 *
 * GPU-accelerated Karpathy semantic tagging via LibTorch batch cosine similarity.
 * 100x+ faster than Ollama LLM classification — uses pre-embedded tag descriptions
 * and existing chunk content vectors from Qdrant.
 *
 * SSE streaming progress: embed_tags → classify → write → complete
 *
 * Body (JSON):
 *   batchSize   — chunks per scroll page (default 100, max 500)
 *   threshold   — min cosine similarity to assign tag (default 0.35)
 *   maxTags     — max tags per chunk (default 4)
 *   dryRun      — classify but don't write to Qdrant (default false)
 *   forceRetag  — re-tag already-tagged chunks (default false)
 *   limit       — max total chunks to process (default 2000, max 10000)
 *
 * GET — status: tag embedding cache, CUDA availability, coverage stats
 *
 * Auth: requires locals.user
 * Cost: ZERO (local GPU/CPU cosine similarity, no LLM inference)
 */
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const gpuTagSchema = z.object({
	batchSize: z.number().int().min(10).max(500).default(100),
	threshold: z.number().min(0.1).max(0.9).default(0.35),
	maxTags: z.number().int().min(1).max(10).default(4),
	dryRun: z.boolean().default(false),
	forceRetag: z.boolean().default(false),
	limit: z.number().int().min(10).max(10_000).default(2000),
});
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import { isCudaAvailable } from '$lib/server/gpu/libtorch-bridge.js';
import {
	SEMANTIC_TAGS,
	getTagEmbeddings,
	classifyChunksGpu,
	type GpuTagResult,
} from '$lib/server/indexer/gpu-karpathy-tagger.js';

const QDRANT_URL  = ENV.QDRANT_URL;
const COLLECTION  = 'codebase_chunks_768';

// ── Qdrant scroll with vectors ──────────────────────────────────────────────

interface ChunkPoint {
	id: string | number;
	payload?: {
		tags?: string | string[];
		[key: string]: unknown;
	};
	vector?: Record<string, number[]> | number[];
}

function hasSemanticTags(pt: ChunkPoint): boolean {
	const raw = pt.payload?.tags;
	if (!raw) return false;
	const arr = Array.isArray(raw) ? raw : [raw];
	return arr.some(t => (SEMANTIC_TAGS as readonly string[]).includes(t));
}

function extractContentVector(pt: ChunkPoint): number[] | null {
	if (!pt.vector) return null;
	// Named vectors: { content: [...], signature: [...] }
	if (typeof pt.vector === 'object' && !Array.isArray(pt.vector)) {
		return (pt.vector as Record<string, number[]>)['content'] ?? null;
	}
	// Single unnamed vector
	if (Array.isArray(pt.vector)) return pt.vector;
	return null;
}

async function scrollWithVectors(
	offset: string | number | null,
	limit: number,
): Promise<{ points: ChunkPoint[]; nextOffset: string | number | null }> {
	const body: Record<string, unknown> = {
		limit,
		with_payload: true,
		with_vector:  ['content'], // Only fetch content vector (not signature/summary)
	};
	if (offset !== null) body['offset'] = offset;

	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify(body),
		signal:  AbortSignal.timeout(30_000),
	}).catch(() => null);

	if (!res?.ok) return { points: [], nextOffset: null };

	const data = await res.json() as {
		result?: { points?: ChunkPoint[]; next_page_offset?: string | number | null };
	};

	return {
		points:     data?.result?.points ?? [],
		nextOffset: data?.result?.next_page_offset ?? null,
	};
}

async function patchQdrantTags(id: string | number, merged: string[]): Promise<boolean> {
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { tags: merged }, points: [id] }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
	return res?.ok ?? false;
}

// ── POST — SSE streaming GPU classification ─────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const parsed = gpuTagSchema.safeParse(await request.json().catch(() => ({})));
	const body = parsed.success ? parsed.data : gpuTagSchema.parse({});

	const batchSize  = body.batchSize;
	const threshold  = body.threshold;
	const maxTags    = body.maxTags;
	const dryRun     = body.dryRun;
	const forceRetag = body.forceRetag;
	const maxTotal   = body.limit;

	const enc = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const emit = (event: string, data: unknown) => {
				controller.enqueue(enc.encode(sseFormat(event, data)));
			};

			const t0 = performance.now();

			try {
				// ── Stage 1: Embed tag descriptions ─────────────────────────────
				const tEmbed = performance.now();
				const tagEmbeddings = await getTagEmbeddings();
				emit('embed_tags', {
					stage: 1,
					tags: SEMANTIC_TAGS.length,
					dims: 768,
					cuda: isCudaAvailable(),
					durationMs: Math.round(performance.now() - tEmbed),
				});

				// ── Stage 2: Scroll + classify in batches ───────────────────────
				let offset: string | number | null = null;
				let totalProcessed = 0;
				let totalTagged    = 0;
				let totalSkipped   = 0;
				let totalNoVector  = 0;
				let batchNum       = 0;
				const globalDist: Record<string, number> = {};

				do {
					const { points, nextOffset } = await scrollWithVectors(offset, batchSize);
					offset = nextOffset;

					if (!points.length) break;
					const remainingBudget = Math.max(0, maxTotal - totalProcessed);
					if (remainingBudget === 0) break;

					// Filter to untagged (or all if forceRetag)
					const tagCandidates = forceRetag ? points : points.filter(pt => !hasSemanticTags(pt));
					const toTag = tagCandidates.slice(0, remainingBudget);
					const skipCount = points.length - tagCandidates.length;
					totalSkipped += skipCount;

					// Extract content vectors
					const withVectors: { id: string | number; vector: number[]; existing: string[] }[] = [];
					for (const pt of toTag) {
						const vec = extractContentVector(pt);
						const existing = (() => {
							const raw = pt.payload?.tags;
							if (!raw) return [];
							return (Array.isArray(raw) ? raw : [raw]) as string[];
						})();

						if (vec && vec.length === 768) {
							withVectors.push({ id: pt.id, vector: vec, existing });
						} else {
							totalNoVector++;
						}
					}

					// Classify batch via GPU cosine similarity
					if (withVectors.length > 0) {
						const results = await classifyChunksGpu(
							withVectors.map(c => ({ id: c.id, vector: c.vector })),
							tagEmbeddings,
							threshold,
							maxTags,
						);

						// Write tags to Qdrant
						let batchTagged = 0;
						for (const r of results) {
							if (r.tags.length === 0) continue;
							batchTagged++;
							totalTagged++;

							for (const t of r.tags) {
								globalDist[t] = (globalDist[t] ?? 0) + 1;
							}

							if (!dryRun) {
								const chunk = withVectors.find(c => c.id === r.id);
								const merged = [...new Set([...(chunk?.existing ?? []), ...r.tags])];
								await patchQdrantTags(r.id, merged);
							}
						}

						totalProcessed += withVectors.length;
					}

					batchNum++;
					emit('classify', {
						stage: 2,
						batch: batchNum,
						processed: withVectors.length,
						tagged: totalTagged,
						skipped: skipCount,
						noVector: totalNoVector,
						totalProcessed,
						totalTagged,
						hasMore: offset !== null && totalProcessed < maxTotal,
						durationMs: Math.round(performance.now() - t0),
						tagDist: globalDist,
					});

				} while (offset !== null && totalProcessed < maxTotal);

				// ── Ensure keyword index on tags ────────────────────────────────
				if (!dryRun && totalTagged > 0) {
					fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
						method:  'PUT',
						headers: { 'Content-Type': 'application/json' },
						body:    JSON.stringify({ field_name: 'tags', field_schema: { type: 'keyword', lookup: true } }),
					}).catch(() => {});
				}

				// ── Stage 3: Complete ───────────────────────────────────────────
				emit('complete', {
					stage: 3,
					totalProcessed,
					totalTagged,
					totalSkipped,
					totalNoVector,
					batches: batchNum,
					dryRun,
					forceRetag,
					threshold,
					maxTags,
					cuda: isCudaAvailable(),
					tagDist: globalDist,
					totalMs: Math.round(performance.now() - t0),
					msPerChunk: totalProcessed > 0
						? Math.round(((performance.now() - t0) / totalProcessed) * 100) / 100
						: 0,
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

// ── GET — status + coverage ─────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Quick coverage scan
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ limit: 2_000, with_payload: true, with_vector: false }),
		signal:  AbortSignal.timeout(15_000),
	}).catch(() => null);

	let total = 0, tagged = 0;
	const dist: Record<string, number> = {};

	if (res?.ok) {
		const data = await res.json() as { result?: { points?: ChunkPoint[] } };
		const pts = data?.result?.points ?? [];
		total = pts.length;
		tagged = pts.filter(hasSemanticTags).length;

		for (const pt of pts) {
			const raw = pt.payload?.tags;
			const arr = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
			for (const t of arr) {
				if ((SEMANTIC_TAGS as readonly string[]).includes(t)) {
					dist[t] = (dist[t] ?? 0) + 1;
				}
			}
		}
	}

	return new Response(JSON.stringify({
		endpoint: '/api/codebase-index/karpathy-tag/gpu',
		method: 'GPU batch cosine similarity (LibTorch CUDA)',
		cuda: isCudaAvailable(),
		vocabulary: SEMANTIC_TAGS,
		total,
		tagged,
		pct: total > 0 ? Math.round((tagged / total) * 100) : 0,
		semanticTagDist: dist,
		note: 'GPU: 100x+ faster than Ollama LLM classification. Uses pre-embedded tag descriptions + chunk content vectors.',
		params: {
			batchSize: 'number (10-500, default 100)',
			threshold: 'number (0.1-0.9, default 0.35)',
			maxTags: 'number (1-10, default 4)',
			dryRun: 'boolean (default false)',
			forceRetag: 'boolean (default false)',
			limit: 'number (10-10000, default 2000)',
		},
	}), { headers: { 'Content-Type': 'application/json' } });
};
