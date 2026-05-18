import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

const schema = z.object({
	query:      z.string().min(1).max(2000),
	tags:       z.array(z.string()).max(10).default([]),
	clusters:   z.array(z.number().int()).max(20).default([]),
	multiQuery: z.boolean().default(false),
	limit:      z.number().int().min(1).max(50).default(20),
});

const QDRANT_URL    = ENV.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION    = 'codebase_chunks_768';
const EMBED_URL     = `${ENV.OLLAMA_BASE_URL}/api/embed`;
const EMBED_MODEL   = 'embeddinggemma:latest';

async function embed(text: string): Promise<number[]> {
	const res = await fetch(EMBED_URL, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ model: EMBED_MODEL, input: text }),
		signal:  AbortSignal.timeout(6_000),
	});
	if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
	const data = await res.json() as { embeddings?: number[][] };
	const vec = data.embeddings?.[0] ?? [];
	if (!vec.length) throw new Error('empty embedding');
	return vec;
}

async function qdrantSearch(
	vector: number[],
	filter: Record<string, unknown> | null,
	limit:  number,
): Promise<Array<{ id: string | number; score: number; payload: Record<string, unknown> }>> {
	const body: Record<string, unknown> = {
		vector:      { name: 'content', vector },
		limit,
		with_payload: true,
		with_vector:  false,
	};
	if (filter) body.filter = filter;

	const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify(body),
		signal:  AbortSignal.timeout(8_000),
	});
	if (!res.ok) return [];
	const data = await res.json() as { result?: Array<{ id: string | number; score: number; payload: Record<string, unknown> }> };
	return data.result ?? [];
}

function buildFilter(tags: string[], clusters: number[]): Record<string, unknown> | null {
	const must: unknown[] = [];
	if (tags.length > 0) {
		must.push({ key: 'tags', match: { any: tags } });
	}
	if (clusters.length > 0) {
		must.push({ key: 'neo4j_gpuCluster', match: { any: clusters.map(String) } });
	}
	return must.length > 0 ? { must } : null;
}

async function rewriteQueries(query: string): Promise<string[]> {
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({
				model:  'gemma3-legal:latest',
				prompt: `Rewrite this code search query into 3 distinct variants for better retrieval. Return ONLY a JSON array of strings, no explanation.\n\nQuery: "${query}"`,
				stream: false,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return [query];
		const data = await res.json() as { response?: string };
		const match = data.response?.match(/\[[\s\S]*?\]/);
		if (match) {
			const variants = JSON.parse(match[0]) as string[];
			return [query, ...variants.slice(0, 3)];
		}
	} catch { /* fallback */ }
	return [query];
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Bad request');

	const { query, tags, clusters, multiQuery, limit } = parsed.data;
	const filter = buildFilter(tags, clusters);

	const queries = multiQuery ? await rewriteQueries(query) : [query];

	// Embed all query variants, search, merge by point ID (keep best score)
	const scoreMap = new Map<string, { score: number; payload: Record<string, unknown> }>();
	for (const q of queries) {
		let vec: number[];
		try { vec = await embed(q); } catch { continue; }
		const hits = await qdrantSearch(vec, filter, limit);
		for (const h of hits) {
			const key = String(h.id);
			const existing = scoreMap.get(key);
			if (!existing || h.score > existing.score) {
				scoreMap.set(key, { score: h.score, payload: h.payload });
			}
		}
	}

	const results = [...scoreMap.entries()]
		.sort((a, b) => b[1].score - a[1].score)
		.slice(0, limit)
		.map(([id, { score, payload }]) => ({
			id,
			score,
			filePath:   payload.filePath   ?? payload.file_path  ?? '',
			tags:       payload.tags        ?? [],
			cluster:    payload.neo4j_gpuCluster ?? payload.gpuCluster ?? null,
			somCluster: payload.som_cluster ?? null,
			snippet:    typeof payload.chunkText === 'string'
				? payload.chunkText.slice(0, 200)
				: '',
		}));

	return json({ results, queriesUsed: queries.length, totalHits: results.length });
};
