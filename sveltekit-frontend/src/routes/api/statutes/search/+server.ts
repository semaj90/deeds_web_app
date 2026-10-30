/**
 * POST /api/statutes/search
 *
 * Semantic search over legal_chunks using pgvector (768-dim).
 * Embeds the query via Ollama, then searches for similar legal chunks.
 * Joins parent legal_nodes and library_documents.
 *
 * Request body: { query: string, jurisdiction?: string, category?: string, limit?: number }
 * Response: { results: StatuteSearchResult[], timing: Timing }
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { embedOrChatFetch } from '$lib/server/ollama.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';
import { executeEmbeddingInputV1 } from '$lib/server/embedding/embedding-execution-adapter-v1.js';
import { searchStatuteChunks, searchStatuteChunksText, type StatuteHit } from '$lib/server/legal/statute-search-v1.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

const statuteSearchSchema = z.object({
	query: z.string().trim().min(1, 'Missing query').max(500),
	jurisdiction: z.string().max(200).optional(),
	category: z.string().max(200).optional(),
	limit: z.number().int().min(1).max(100).optional().default(20),
});

async function embedQuery(query: string): Promise<number[] | null> {
	try {
		const result = await executeEmbeddingInputV1({
			text: query,
			mode: 'unprompted_legacy',
			executor: async (prompt) => {
				const res = await embedOrChatFetch(`${OLLAMA_URL}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: EMBEDDING_MODEL, prompt }),
					signal: AbortSignal.timeout(8000)
				});
				if (!res.ok) throw new Error(`EMBEDDING_HTTP_${res.status}`);
				const data = await res.json() as { embedding?: unknown };
				if (!Array.isArray(data.embedding)) throw new Error('EMBEDDING_RESPONSE_INVALID');
				return data.embedding;
			},
		});
		return result.embedding;
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const start = performance.now();
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = statuteSearchSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}
	const { query, limit } = parsed.data;

	recordSearchQuery({ query, pipeline: 'kag', cacheHit: false, userId: locals.user.id });

	const timing: Record<string, number> = {};

	// 1. Embed the query
	const embedStart = performance.now();
	const embedding = await embedQuery(query);
	timing.embed_ms = Math.round(performance.now() - embedStart);

	if (!embedding) {
		return json({ error: 'Embedding service unavailable' }, { status: 503 });
	}

	// 2. Search legal_chunks (shared read-only owner: $lib/server/legal/statute-search-v1)
	const searchStart = performance.now();
	const toResult = (h: StatuteHit) => ({
		chunkId: h.chunkId,
		nodeId: h.nodeId,
		documentId: h.documentId ?? '',
		title: h.documentTitle ?? '',
		heading: h.heading ?? '',
		citationLabel: h.citationLabel,
		jurisdiction: h.jurisdiction ?? 'Other',
		category: h.sourceType === 'unregistered' ? null : h.sourceType,
		sourceType: h.sourceType,
		chunkIndex: h.chunkIndex,
		snippet: h.snippet,
		score: h.score,
		sourceConfidence: h.sourceConfidence ?? 'medium'
	});

	try {
		const found = await searchStatuteChunks(pool, embedding, limit);
		if (found.status !== 'OK') {
			return json({ error: 'Embedding incompatible with the legal_chunks space', reason: found.reason, results: [], count: 0, timing }, { status: 422 });
		}
		timing.search_ms = Math.round(performance.now() - searchStart);
		timing.total_ms = Math.round(performance.now() - start);
		return json({ results: found.hits.map(toResult), count: found.hits.length, timing, model: EMBEDDING_MODEL });
	} catch (err) {
		console.error('[Statutes Search] Vector query failed:', err);

		// Fallback: OR-style full-text search
		try {
			const found = await searchStatuteChunksText(pool, query, limit);
			timing.search_ms = Math.round(performance.now() - searchStart);
			timing.total_ms = Math.round(performance.now() - start);
			timing.fallback = 1;
			return json({ results: found.hits.map(toResult), count: found.hits.length, timing, model: 'text-search-fallback' });
		} catch (fallbackErr) {
			console.error('[Statutes Search] Fallback failed:', fallbackErr);
			return json({ error: 'Search unavailable', results: [], timing }, { status: 503 });
		}
	}
};
