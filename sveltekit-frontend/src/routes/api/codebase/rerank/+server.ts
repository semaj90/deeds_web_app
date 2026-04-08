/**
 * POST /api/codebase/rerank
 *
 * Stage B of the 2-stage retrieval pipeline.
 * Semantic re-rank: embed query → Qdrant dual-vector search → path boosting.
 * Returns top 5–20 ranked chunks with full content.
 *
 * Uses dual named vectors (content + signature) with configurable weights.
 * Path-based boosting: +server.ts files, schema files, tests get priority.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { logCodebaseSearch } from '$lib/server/analytics/event-logger.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

// Zod schema validates query, candidatePaths, weights, pathBoosts
const rerankSchema = z.object({
	query: z.string().min(1, 'Missing query string').max(5000),
	candidatePaths: z.array(z.string().max(1000)).max(200).optional(),
	limit: z.number().int().min(1).max(50).optional().default(10),
	contentWeight: z.number().min(0).max(1).optional().default(0.6),
	signatureWeight: z.number().min(0).max(1).optional().default(0.4),
	pathBoosts: z.record(z.string(), z.number()).optional(),
});

interface RerankRequest {
	query: string;
	candidatePaths?: string[];
	limit?: number;
	contentWeight?: number;
	signatureWeight?: number;
	pathBoosts?: Record<string, number>;
}

interface QdrantSearchResult {
	id: number | string;
	score: number;
	payload: Record<string, unknown>;
}

async function embedQuery(text: string): Promise<number[]> {
	const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt: text }),
		signal: AbortSignal.timeout(15_000)
	});

	if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
	const data = await res.json();
	return data.embedding;
}

async function searchQdrant(
	vectorName: string,
	vector: number[],
	limit: number,
	filter?: Record<string, unknown>
): Promise<QdrantSearchResult[]> {
	const body: Record<string, unknown> = {
		vector: { name: vectorName, vector },
		limit,
		with_payload: true
	};
	if (filter) body.filter = filter;

	const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});

	if (!res.ok) return [];
	const data = await res.json();
	return data.result ?? [];
}

function applyPathBoosts(
	results: Array<{ payload: Record<string, unknown>; score: number }>,
	boosts: Record<string, number>
): void {
	for (const r of results) {
		const path = (r.payload.relativePath as string) ?? '';
		for (const [pattern, multiplier] of Object.entries(boosts)) {
			if (path.includes(pattern)) {
				r.score *= multiplier;
			}
		}
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = rerankSchema.safeParse(await request.json());
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request');
	}
	const body = parsed.data;

	const limit = body.limit;
	const contentWeight = body.contentWeight;
	const signatureWeight = body.signatureWeight;
	const pathBoosts = body.pathBoosts ?? {
		'+server.ts': 1.3,
		'+page.server.ts': 1.2,
		'schema-postgres.ts': 1.2,
		'tests/': 1.1,
		'lib/server/': 1.15
	};

	const start = performance.now();

	// Build Qdrant filter from candidate paths (if provided by Stage A)
	let filter: Record<string, unknown> | undefined;
	if (body.candidatePaths && body.candidatePaths.length > 0) {
		filter = {
			should: body.candidatePaths.slice(0, 200).map((p) => ({
				key: 'path',
				match: { value: p }
			}))
		};
	}

	// Embed the query once, search both vector spaces in parallel
	const queryVector = await embedQuery(body.query);
	const embedMs = performance.now() - start;

	const searchStart = performance.now();
	const [contentResults, signatureResults] = await Promise.all([
		searchQdrant('content', queryVector, limit * 3, filter),
		searchQdrant('signature', queryVector, limit * 3, filter)
	]);
	const searchMs = performance.now() - searchStart;

	// Merge scores from both vector spaces
	const scoreMap = new Map<
		string,
		{ payload: Record<string, unknown>; score: number }
	>();

	for (const r of contentResults) {
		const key = String(r.id);
		scoreMap.set(key, {
			payload: r.payload,
			score: r.score * contentWeight
		});
	}

	for (const r of signatureResults) {
		const key = String(r.id);
		const existing = scoreMap.get(key);
		if (existing) {
			existing.score += r.score * signatureWeight;
		} else {
			scoreMap.set(key, {
				payload: r.payload,
				score: r.score * signatureWeight
			});
		}
	}

	// Apply path-based boosting
	const merged = [...scoreMap.values()];
	applyPathBoosts(merged, pathBoosts);

	// Sort and take top N
	merged.sort((a, b) => b.score - a.score);
	const topResults = merged.slice(0, limit);

	const totalMs = performance.now() - start;

	const results = topResults.map((r) => ({
		path: r.payload.path as string,
		relativePath: r.payload.relativePath as string,
		symbol: r.payload.symbol as string,
		kind: r.payload.kind as string,
		content: r.payload.content as string,
		signature: r.payload.signature as string,
		httpMethod: r.payload.httpMethod as string | undefined,
		routeId: r.payload.routeId as string | undefined,
		tags: (r.payload.tags as string[]) ?? [],
		score: Math.round(r.score * 1000) / 1000,
		lineStart: r.payload.lineStart as number,
		lineEnd: r.payload.lineEnd as number
	}));

	// Fire-and-forget analytics
	logCodebaseSearch({
		userId: locals.user?.id,
		query: body.query,
		recallCount: body.candidatePaths?.length ?? 0,
		rerankCount: results.length,
		recallMs: 0, // recall was in Stage A
		rerankMs: Math.round(searchMs),
		totalMs: Math.round(totalMs),
		topHits: results.map((r) => r.relativePath)
	});

	return json({
		results,
		timing: {
			embedMs: Math.round(embedMs),
			searchMs: Math.round(searchMs),
			totalMs: Math.round(totalMs)
		},
		meta: {
			contentResults: contentResults.length,
			signatureResults: signatureResults.length,
			merged: scoreMap.size,
			returned: results.length
		}
	});
};
