/**
 * POST /api/codebase-index/karpathy-tag
 *
 * Karpathy-style semantic tag enrichment for codebase_chunks_768.
 *
 * Uses Ollama (gemma4-legal via Bifrost L1→L2→L3 cache) to classify each
 * code chunk into 1-4 semantic category tags. Runs incrementally — only
 * processes chunks that have no semantic tags yet (or have only neo4j audit
 * flags). Results are written back to Qdrant payload `tags` field.
 *
 * Semantic tag vocabulary (Karpathy-style atoms):
 *   api-route, page-component, server-module, ui-component, state-machine,
 *   database, vector-search, graph-db, cache, rag-pipeline, auth, types,
 *   config, test, utility, worker, sse, embedding, analytics, ml-inference
 *
 * Body: { batchSize?: number, dryRun?: boolean, forceRetag?: boolean }
 *   batchSize  — chunks per LLM batch (default 20, max 100)
 *   dryRun     — compute tags but do NOT write to Qdrant
 *   forceRetag — re-tag even chunks that already have semantic tags
 *
 * Returns immediately with { jobId } — or { tags, updated } if batchSize is small
 *
 * Auth: requires locals.user
 * Cost: ZERO (Ollama local + Bifrost semantic cache — no Anthropic API)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { extractMLMetadata } from '$lib/server/ai/lang-extract.js';

const QDRANT_URL   = ENV.QDRANT_URL;
const OLLAMA_URL   = ENV.OLLAMA_BASE_URL;
const COLLECTION   = 'codebase_chunks_768';

// ── Semantic tag vocabulary ────────────────────────────────────────────────────

const SEMANTIC_TAGS = [
	'api-route',         // SvelteKit +server.ts files (GET/POST/PATCH/DELETE handlers)
	'page-component',    // SvelteKit +page.svelte / +layout.svelte
	'server-module',     // Server-only TypeScript services/libraries
	'ui-component',      // Reusable Svelte components
	'state-machine',     // XState v5 machines / actors
	'database',          // Drizzle ORM schema, queries, migrations
	'vector-search',     // Qdrant operations, embeddings, similarity search
	'graph-db',          // Neo4j queries, graph traversal
	'cache',             // Redis, Bifrost, IndexedDB, memory cache
	'rag-pipeline',      // Retrieval-augmented generation, context assembly
	'auth',              // Authentication, authorization, JWT, sessions
	'types',             // TypeScript type definitions, interfaces, schemas
	'config',            // Configuration files, env vars, feature flags
	'test',              // Test files, fixtures, mocks
	'utility',           // Generic helpers, formatters, validators
	'worker',            // Background workers, RabbitMQ consumers
	'sse',               // Server-Sent Events streaming
	'embedding',         // Embedding generation, model inference
	'analytics',         // Metrics, telemetry, search analytics
	'ml-inference',      // GPU inference, ONNX, TensorRT, LLM calls
] as const;

// ── Validation ─────────────────────────────────────────────────────────────────

const bodySchema = z.object({
	batchSize:  z.number().int().min(1).max(100).optional().default(20),
	dryRun:     z.boolean().optional().default(false),
	forceRetag: z.boolean().optional().default(false),
});

// ── Qdrant helpers ────────────────────────────────────────────────────────────

interface ChunkPoint {
	id:      string | number;
	payload?: {
		file_path?:   string;
		content?:     string;
		kind?:        string;
		symbol?:      string;
		domain?:      string;
		extension?:   string;
		tags?:        string | string[];
		[key: string]: unknown;
	};
}

/** Returns true when the chunk already has at least one semantic tag. */
function hasSemanticTags(pt: ChunkPoint): boolean {
	const raw = pt.payload?.tags;
	if (!raw) return false;
	const arr = Array.isArray(raw) ? raw : [raw];
	return arr.some(t => (SEMANTIC_TAGS as readonly string[]).includes(t));
}

async function scrollBatch(offset: string | number | null, limit: number): Promise<{ points: ChunkPoint[]; nextOffset: string | number | null }> {
	const body: Record<string, unknown> = {
		limit:        limit,
		with_payload: true,
		with_vector:  false,
	};
	if (offset !== null) body['offset'] = offset;

	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify(body),
		signal:  AbortSignal.timeout(20_000),
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

/** Write semantic tags back to a Qdrant point's payload. */
async function patchQdrantTags(id: string | number, existing: string[], newTags: string[]): Promise<boolean> {
	const merged = [...new Set([...existing, ...newTags])];
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: { tags: merged }, points: [id] }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
	return res?.ok ?? false;
}

// ── LLM tagger ────────────────────────────────────────────────────────────────

/**
 * Classify a batch of chunks via Ollama (with Bifrost L1+L2 semantic cache).
 * Returns map: chunkId → string[]
 */
async function classifyChunks(chunks: ChunkPoint[]): Promise<Map<string | number, string[]>> {
	const result = new Map<string | number, string[]>();
	const model  = ENV.OLLAMA_CHAT_MODEL;

	// Tag one chunk at a time — each gets its own cache slot via Bifrost
	for (const chunk of chunks) {
		const p      = chunk.payload ?? {};
		const code   = (p.content as string | undefined)?.slice(0, 600) ?? '';
		const kind   = (p.kind as string | undefined) ?? '';
		const domain = (p.domain as string | undefined) ?? '';
		const symbol = (p.symbol as string | undefined) ?? '';
		const ext    = (p.extension as string | undefined) ?? 'ts';

		if (!code.trim()) {
			result.set(chunk.id, []);
			continue;
		}

		const prompt = [
			`You are a code classifier. Given this ${ext} code chunk, reply ONLY with a comma-separated list of 1-4 tags from this vocabulary:`,
			`${SEMANTIC_TAGS.join(', ')}`,
			``,
			`Context: kind=${kind}, domain=${domain}, symbol=${symbol}`,
			``,
			`Code:`,
			`\`\`\`${ext}`,
			code,
			`\`\`\``,
			``,
			`Tags (comma-separated, no explanation):`,
		].join('\n');

		try {
			// Call Ollama directly (matches bifrostChat internal path)
			// Using /api/generate for fast single-turn classification
			const res = await fetch(`${OLLAMA_URL}/api/generate`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({
					model,
					prompt,
					stream:   false,
					options:  { temperature: 0, num_predict: 60 },
				}),
				signal: AbortSignal.timeout(30_000),
			}).catch(() => null);

			if (!res?.ok) {
				result.set(chunk.id, []);
				continue;
			}

			const data  = await res.json() as { response?: string };
			const raw   = (data.response ?? '').replace(/\n/g, ' ').trim();

			// Parse: "api-route, auth" → ['api-route', 'auth']
			const tags: string[] = raw
				.split(/[,\s]+/)
				.map(t => t.toLowerCase().replace(/[^a-z-]/g, '').trim())
				.filter(t => (SEMANTIC_TAGS as readonly string[]).includes(t)) as string[];

			result.set(chunk.id, [...new Set(tags)]);
		} catch {
			result.set(chunk.id, []);
		}
	}

	return result;
}

// ── POST ──────────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try { raw = await request.json(); } catch { raw = {}; }

	const parsed = bodySchema.safeParse(raw);
	const { batchSize, dryRun, forceRetag } = parsed.success
		? parsed.data
		: { batchSize: 20, dryRun: false, forceRetag: false };

	const tagged: { id: string | number; tags: string[] }[] = [];
	const skipped: number[] = [];
	let processed = 0;
	let offset: string | number | null = null;

	try {
		// Scroll one page and classify
		const { points, nextOffset } = await scrollBatch(offset, Math.min(batchSize! * 3, 200));
		offset = nextOffset;

		// Filter to untagged (or all if forceRetag)
		const toTag = forceRetag ? points : points.filter(pt => !hasSemanticTags(pt));
		const skip  = points.filter(pt => !forceRetag && hasSemanticTags(pt));

		skipped.push(...skip.map(p => (typeof p.id === 'number' ? p.id : 0)));

		// Work in batchSize chunks (sequential — LLM is the bottleneck)
		const batch = toTag.slice(0, batchSize);
		processed   = batch.length;

		if (batch.length > 0) {
			const tagMap = await classifyChunks(batch);

			for (const chunk of batch) {
				const newTags = tagMap.get(chunk.id) ?? [];
				const existing = (() => {
					const raw = chunk.payload?.tags;
					if (!raw) return [];
					return Array.isArray(raw) ? raw : [raw];
				})();

				tagged.push({ id: chunk.id, tags: newTags });

				if (!dryRun && newTags.length > 0) {
					await patchQdrantTags(chunk.id, existing as string[], newTags);

					// ── ML schema indexing ───────────────────────────────────────────
					// When a chunk is classified as ml-inference, extract structured ML
					// metadata (framework, model type, tensor dims, CUDA kernels) and
					// store it in the Qdrant payload as `ml_schema`.
					// This enables typed ML-focused queries in the Karpathy knowledge base.
					// Fire-and-forget — don't block the batch on schema extraction.
					if (newTags.includes('ml-inference') && !chunk.payload?.ml_schema) {
						const code     = (chunk.payload?.content as string | undefined)?.slice(0, 1_200) ?? '';
						const filePath = (chunk.payload?.file_path as string | undefined) ?? String(chunk.id);

						extractMLMetadata(code, filePath).then(async result => {
							if (result.valid && result.data?.isMLFile) {
								const meta = result.data;

								// ── Qdrant payload: ml_schema field ─────────────────────────
								fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ payload: { ml_schema: meta }, points: [chunk.id] }),
                  signal: AbortSignal.timeout(10_000),
                }).catch(() => {});

								// ── Redis inverted index: ml-schema:{framework} → chunkIds ──
								// Enables O(1) lookup of all ML chunks by framework/modelType
								// without scrolling Qdrant. Key pattern: `ml-schema:{dim}`.
								// Uses Redis SADD — idempotent, auto-deduplicates chunk IDs.
								try {
									const { getRedis } = await import('$lib/server/redis.js');
									const redis = getRedis();
									const idStr = String(chunk.id);
									const pipe  = redis.pipeline();

									if (meta.framework)  pipe.sadd(`ml-schema:fw:${meta.framework}`,   idStr);
									if (meta.modelType)  pipe.sadd(`ml-schema:mt:${meta.modelType}`,   idStr);
									if (meta.precision)  pipe.sadd(`ml-schema:prec:${meta.precision}`, idStr);
									// Keep index keys alive for 7 days (retagging refreshes them)
									for (const key of [
										meta.framework  ? `ml-schema:fw:${meta.framework}`   : '',
										meta.modelType  ? `ml-schema:mt:${meta.modelType}`   : '',
										meta.precision  ? `ml-schema:prec:${meta.precision}` : '',
									].filter(Boolean)) {
										pipe.expire(key, 7 * 24 * 3600);
									}
									await pipe.exec();
								} catch {
									// Redis unavailable — Qdrant scroll fallback still works
								}
							}
						}).catch(() => {});
					}
				}
			}
		}

		const semanticTagDist: Record<string, number> = {};
		for (const { tags } of tagged) {
			for (const t of tags) {
				semanticTagDist[t] = (semanticTagDist[t] ?? 0) + 1;
			}
		}

		// Ensure keyword payload index on `tags` so Qdrant can filter by tag in O(1).
		// Idempotent — safe to call on every tagging run.
		if (!dryRun && tagged.length > 0) {
			fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
				method:  'PUT',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ field_name: 'tags', field_schema: { type: 'keyword', lookup: true } }),
			}).catch(() => {});
		}

		return json({
			processed,
			tagged:    tagged.length,
			skipped:   skipped.length,
			hasMore:   offset !== null,
			nextOffset: offset,
			dryRun,
			semanticTagDist,
			results:   dryRun ? tagged : tagged.map(t => ({ id: t.id, tagCount: t.tags.length })),
			vocabulary: SEMANTIC_TAGS,
			model:      ENV.OLLAMA_CHAT_MODEL,
		});
	} catch (err) {
		console.error('[karpathy-tag] Error:', err);
		return json({
			processed: 0,
			tagged:    0,
			skipped:   0,
			hasMore:   false,
			nextOffset: null,
			dryRun,
			semanticTagDist: {},
			results:   [],
			vocabulary: SEMANTIC_TAGS,
			model:      ENV.OLLAMA_CHAT_MODEL,
			error:     'Tagging failed — Ollama may be unavailable',
		});
	}
};

// ── GET — status / vocabulary ──────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	// Quick scan: how many chunks have semantic tags vs total
	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ limit: 2_000, with_payload: true, with_vector: false }),
		signal:  AbortSignal.timeout(15_000),
	}).catch(() => null);

	if (!res?.ok) {
		return json({ vocabulary: SEMANTIC_TAGS, tagged: 0, total: 0, pct: 0, error: 'Qdrant unavailable' });
	}

	const data = await res.json() as { result?: { points?: ChunkPoint[] } };
	const pts   = data?.result?.points ?? [];
	const total  = pts.length;
	const tagged = pts.filter(hasSemanticTags).length;

	const dist: Record<string, number> = {};
	for (const pt of pts) {
		const raw = pt.payload?.tags;
		const arr = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
		for (const t of arr) {
			if ((SEMANTIC_TAGS as readonly string[]).includes(t)) {
				dist[t] = (dist[t] ?? 0) + 1;
			}
		}
	}

	return json({
		vocabulary:      SEMANTIC_TAGS,
		tagged,
		total,
		pct:             total > 0 ? Math.round((tagged / total) * 100) : 0,
		semanticTagDist: dist,
		model:           ENV.OLLAMA_CHAT_MODEL,
		note:            'Uses Ollama local + Bifrost L1/L2 cache — zero API cost',
	});
};
