import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { turbovecPrefilter } from '$lib/server/retrieval/turbovec-prefilter.js';
import { ENV } from '$lib/server/env.server.js';

const schema = z.object({
	query:       z.string().min(1).max(2000),
	topClusters: z.number().int().min(1).max(20).default(5),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Bad request');

	const { query, topClusters } = parsed.data;

	// Embed the query via Ollama
	const embedUrl = `${ENV.OLLAMA_BASE_URL}/api/embed`;
	let embedding: number[];
	try {
		const embedRes = await fetch(embedUrl, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ model: 'embeddinggemma:latest', input: query }),
			signal:  AbortSignal.timeout(5_000),
		});
		if (!embedRes.ok) throw new Error(`Ollama embed HTTP ${embedRes.status}`);
		const embedData = await embedRes.json() as { embeddings?: number[][] };
		embedding = embedData.embeddings?.[0] ?? [];
		if (!embedding.length) throw new Error('Empty embedding');
	} catch (err) {
		throw error(502, `Embedding failed: ${(err as Error).message}`);
	}

	// Call TurboVec sidecar
	const tvResult = await turbovecPrefilter(embedding, { topClusters, timeoutMs: 500 });

	const qdrantFilter = tvResult.clusterIds.length > 0
		? { must: [{ key: 'neo4j_gpuCluster', match: { any: tvResult.clusterIds.map(String) } }] }
		: null;

	return json({
		clusterIds:     tvResult.clusterIds,
		centroidScores: tvResult.centroidScores,
		backend:        tvResult.backend,
		durationMs:     tvResult.durationMs,
		qdrantFilter,
	});
};
