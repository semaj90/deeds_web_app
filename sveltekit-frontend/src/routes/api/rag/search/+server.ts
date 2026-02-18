import { json } from '@sveltejs/kit';
import { getOllamaUrl, getQdrantUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';
import type {
	RetrieveCandidatesRequest,
	RetrieveCandidatesResponse,
	RetrievedChunk,
	ConfidenceLevel
} from '$lib/types/rag-source-validation';

const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = getOllamaUrl();

function toConfidence(score: number): ConfidenceLevel {
	if (score >= 0.85) return 'high';
	if (score >= 0.70) return 'medium';
	if (score >= 0.50) return 'low';
	return 'marginal';
}

/**
 * POST /api/rag/search
 * Step 1: Search knowledge base for relevant chunks via Qdrant + Ollama embeddings
 */
export const POST: RequestHandler = async ({ request }) => {
	const startTime = performance.now();

	try {
		const body: RetrieveCandidatesRequest = await request.json();
		const {
			query,
			top_k = 10,
			min_score = 0.3,
			use_hybrid = false,
			use_rerank = false
		} = body;

		if (!query?.trim()) {
			return json({ error: 'query is required' }, { status: 400 });
		}

		// 1. Generate embedding via Ollama
		const embedStart = performance.now();
		const embedResp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
			signal: AbortSignal.timeout(10000)
		});

		if (!embedResp.ok) {
			return json({ error: 'Embedding generation failed' }, { status: 502 });
		}

		const embedData = await embedResp.json();
		const embedding = embedData.embedding;
		const embeddingTime = performance.now() - embedStart;

		if (!embedding || !Array.isArray(embedding)) {
			return json({ error: 'Invalid embedding response' }, { status: 502 });
		}

		// 2. Search across Qdrant collections
		const collections = ['fastmcp_file_profiles', 'phase90_error_cards', 'legal_documents'];
		const allChunks: RetrievedChunk[] = [];

		for (const collection of collections) {
			try {
				const searchResp = await fetch(
					`${QDRANT_URL}/collections/${collection}/points/search`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							vector: embedding,
							limit: top_k,
							with_payload: true,
							score_threshold: min_score
						}),
						signal: AbortSignal.timeout(5000)
					}
				);

				if (!searchResp.ok) continue;

				const searchData = await searchResp.json();
				const results = searchData?.result ?? [];

				for (const r of results) {
					const payload = r.payload ?? {};
					allChunks.push({
						chunk_id: `${collection}:${r.id}`,
						text: payload.content ?? payload.text ?? payload.summary ?? '',
						snippet: (payload.content ?? payload.text ?? '').slice(0, 300),
						score: r.score,
						dense_score: r.score,
						confidence: toConfidence(r.score),
						source_type: payload.source_type ?? 'document',
						source_id: String(r.id),
						source_title: payload.title ?? payload.file_path ?? payload.name ?? 'Unknown',
						source_url: payload.url ?? undefined,
						page_num: payload.page_num ?? undefined,
						section: payload.section ?? undefined,
						has_image: !!payload.has_image,
						has_table: !!payload.has_table,
						related_entities: payload.entities ?? [],
						graph_neighbors: []
					});
				}
			} catch {
				// Skip unavailable collections
			}
		}

		// Sort by score descending and limit
		allChunks.sort((a, b) => b.score - a.score);
		const topChunks = allChunks.slice(0, top_k);

		const response: RetrieveCandidatesResponse = {
			query_id: crypto.randomUUID(),
			query,
			case_id: body.case_id,
			chunks: topChunks,
			total_found: allChunks.length,
			search_time_ms: Math.round(performance.now() - startTime),
			embedding_time_ms: Math.round(embeddingTime),
			rerank_time_ms: use_rerank ? 0 : undefined,
			embedding_model: 'embeddinggemma:latest',
			rerank_model: use_rerank ? 'none' : undefined,
			timestamp: new Date().toISOString()
		};

		return json(response);
	} catch (err) {
		console.error('[rag/search] Error:', err);
		return json({ error: 'Search failed' }, { status: 500 });
	}
};
