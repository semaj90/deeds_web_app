/**
 * GET /api/codebase-index/karpathy-tag/backfill
 *
 * Streaming SSE endpoint that iterates through ALL untagged chunks in
 * codebase_chunks_768, classifying each batch via Ollama, and writing
 * semantic tags back to Qdrant payloads. Progress is streamed as SSE events.
 *
 * Query params:
 *   batchSize  — chunks per Ollama batch (default 20, max 50)
 *   dryRun     — classify but don't write to Qdrant (default false)
 *   forceRetag — re-tag even already-tagged chunks (default false)
 *
 * SSE event types:
 *   batch    — { batch, tagged, skipped, elapsed, tagDist }
 *   done     — { totalProcessed, totalTagged, totalSkipped, elapsed, tagDist }
 *   error    — { message }
 *
 * Auth: requires locals.user
 * Cost: ZERO (Ollama local + Bifrost cache)
 */
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

const QDRANT_URL  = ENV.QDRANT_URL;
const OLLAMA_URL  = ENV.OLLAMA_BASE_URL;
const COLLECTION  = 'codebase_chunks_768';

const SEMANTIC_TAGS = [
	'api-route', 'page-component', 'server-module', 'ui-component',
	'state-machine', 'database', 'vector-search', 'graph-db',
	'cache', 'rag-pipeline', 'auth', 'types', 'config', 'test',
	'utility', 'worker', 'sse', 'embedding', 'analytics', 'ml-inference',
] as const;

// ── Qdrant helpers ────────────────────────────────────────────────────────────

interface ChunkPoint {
	id: string | number;
	payload?: {
		file_path?: string;
		content?:   string;
		kind?:      string;
		symbol?:    string;
		domain?:    string;
		extension?: string;
		tags?:      string | string[];
		[key: string]: unknown;
	};
}

function hasSemanticTags(pt: ChunkPoint): boolean {
	const raw = pt.payload?.tags;
	if (!raw) return false;
	const arr = Array.isArray(raw) ? raw : [raw];
	return arr.some(t => (SEMANTIC_TAGS as readonly string[]).includes(t));
}

async function scrollBatch(
	offset: string | number | null,
	limit: number,
): Promise<{ points: ChunkPoint[]; nextOffset: string | number | null }> {
	const body: Record<string, unknown> = {
		limit, with_payload: true, with_vector: false,
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

async function patchQdrantTags(
	id: string | number,
	existing: string[],
	newTags: string[],
): Promise<boolean> {
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

async function classifyOne(chunk: ChunkPoint, model: string): Promise<string[]> {
	const p   = chunk.payload ?? {};
	const code = ((p.content as string | undefined) ?? '').slice(0, 600);
	if (!code.trim()) return [];

	const ext    = (p.extension as string | undefined) ?? 'ts';
	const kind   = (p.kind as string | undefined) ?? '';
	const domain = (p.domain as string | undefined) ?? '';
	const symbol = (p.symbol as string | undefined) ?? '';

	const prompt = [
		`You are a code classifier. Given this ${ext} code chunk, reply ONLY with a comma-separated list of 1-4 tags from this vocabulary:`,
		`${SEMANTIC_TAGS.join(', ')}`,
		'',
		`Context: kind=${kind}, domain=${domain}, symbol=${symbol}`,
		'',
		'Code:',
		`\`\`\`${ext}`,
		code,
		`\`\`\``,
		'',
		'Tags (comma-separated, no explanation):',
	].join('\n');

	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({
				model,
				prompt,
				stream:  false,
				options: { temperature: 0, num_predict: 60 },
			}),
			signal: AbortSignal.timeout(30_000),
		}).catch(() => null);

		if (!res?.ok) return [];
		const data = await res.json() as { response?: string };
		const raw  = (data.response ?? '').replace(/\n/g, ' ').trim();

		return [...new Set(
			raw.split(/[,\s]+/)
				.map(t => t.toLowerCase().replace(/[^a-z-]/g, '').trim())
				.filter(t => (SEMANTIC_TAGS as readonly string[]).includes(t))
		)];
	} catch {
		return [];
	}
}

// ── SSE handler ───────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const batchSize  = Math.min(parseInt(url.searchParams.get('batchSize') ?? '20', 10) || 20, 50);
	const dryRun     = url.searchParams.get('dryRun') === 'true';
	const forceRetag = url.searchParams.get('forceRetag') === 'true';
	const model      = ENV.OLLAMA_CHAT_MODEL;

	const encoder = new TextEncoder();
	let cancelled = false;

	const stream = new ReadableStream({
		async start(controller) {
			function send(event: string, data: Record<string, unknown>) {
				if (cancelled) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch { cancelled = true; }
			}

			const t0 = performance.now();
			let totalProcessed = 0;
			let totalTagged    = 0;
			let totalSkipped   = 0;
			let batchNum       = 0;
			const globalDist: Record<string, number> = {};

			let offset: string | number | null = null;

			try {
				// Ensure keyword index on tags field
				if (!dryRun) {
					fetch(`${QDRANT_URL}/collections/${COLLECTION}/index`, {
						method:  'PUT',
						headers: { 'Content-Type': 'application/json' },
						body:    JSON.stringify({ field_name: 'tags', field_schema: { type: 'keyword', lookup: true } }),
					}).catch(() => {});
				}

				do {
					if (cancelled) break;

					const { points, nextOffset } = await scrollBatch(offset, batchSize * 3);
					offset = nextOffset;

					if (!points.length) break;

					const toTag  = forceRetag ? points : points.filter(pt => !hasSemanticTags(pt));
					const skip   = points.length - toTag.length;
					totalSkipped += skip;

					const batch = toTag.slice(0, batchSize);
					let batchTagged = 0;

					for (const chunk of batch) {
						if (cancelled) break;

						const newTags = await classifyOne(chunk, model);
						totalProcessed++;

						if (newTags.length > 0) {
							batchTagged++;
							totalTagged++;

							for (const t of newTags) {
								globalDist[t] = (globalDist[t] ?? 0) + 1;
							}

							if (!dryRun) {
								const existing = (() => {
									const raw = chunk.payload?.tags;
									if (!raw) return [];
									return (Array.isArray(raw) ? raw : [raw]) as string[];
								})();
								await patchQdrantTags(chunk.id, existing, newTags);
							}
						}
					}

					batchNum++;
					send('batch', {
						batch:     batchNum,
						processed: batch.length,
						tagged:    batchTagged,
						skipped:   skip,
						totalProcessed,
						totalTagged,
						totalSkipped,
						elapsed:   Math.round(performance.now() - t0),
						tagDist:   globalDist,
						hasMore:   offset !== null,
					});
				} while (offset !== null && !cancelled);

				send('done', {
					totalProcessed,
					totalTagged,
					totalSkipped,
					elapsed: Math.round(performance.now() - t0),
					tagDist: globalDist,
					dryRun,
				});
			} catch (err) {
				send('error', { message: err instanceof Error ? err.message : 'Unknown error' });
			} finally {
				try { controller.close(); } catch { /* already closed */ }
			}
		},
		cancel() { cancelled = true; },
	});

	return new Response(stream, {
		headers: {
			'Content-Type':  'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection':    'keep-alive',
		},
	});
};
