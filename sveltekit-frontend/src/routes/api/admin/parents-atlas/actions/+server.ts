import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { getRedis } from '$lib/server/redis.js';

const LLM_WIKI_COLLECTION = 'llm_wiki_chunks';

// ── Inline RRF fusion ─────────────────────────────────────────────────────────
function rrfFuse(
	resultSets: Array<Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }>>,
	k = 60
) {
	const map = new Map<string, { rrf: number; hits: number; payload: Record<string, unknown> | null }>();
	for (const results of resultSets) {
		for (const [rank, r] of results.entries()) {
			const key = String(r.id);
			const rrf = 1 / (k + rank + 1);
			const existing = map.get(key);
			if (existing) {
				existing.rrf += rrf;
				existing.hits++;
			} else {
				map.set(key, { rrf, hits: 1, payload: r.payload ?? null });
			}
		}
	}
	return Array.from(map.entries())
		.sort((a, b) => b[1].rrf - a[1].rrf)
		.map(([id, { rrf, hits, payload }]) => ({ id, rrf, hits, payload }));
}

// ── Topic key → canonical label ───────────────────────────────────────────────
const TOPIC_LABELS: Record<string, string> = {
	'backpropagation': 'Backpropagation & Gradient Descent',
	'tokenization': 'Tokenization in LLMs',
	'attention-mechanism': 'Self-Attention & Transformer Architecture',
	'embedding-vectors': 'Embedding Vectors & Semantic Search',
	'retrieval-augmented-generation': 'Retrieval-Augmented Generation (RAG)',
	'quantization': 'Model Quantization (GGUF/GGML)',
	'fine-tuning': 'Fine-Tuning & RLHF',
	'kv-cache': 'KV Cache & Inference Optimization',
	'som-clustering': 'Self-Organizing Maps & Neural Clustering',
	'graph-rag': 'Graph-Enhanced Retrieval (GraphRAG)',
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action, query } = body;

		if (!action) {
			return json({ success: false, error: 'Missing action parameter' }, { status: 400 });
		}

		// ─── 1. HyperRAG Multi-Query Expansion (real Qdrant llm_wiki_chunks) ────
		if (action === 'hyperrag-expand') {
			const queryText = (query as string) || 'how does backpropagation work in deep learning';
			const t0 = performance.now();

			// Check collection exists first
			let collectionExists = false;
			try {
				await qdrant.client.getCollection(LLM_WIKI_COLLECTION);
				collectionExists = true;
			} catch { /* not yet ingested */ }

			if (!collectionExists) {
				return json({
					success: false,
					error: `Collection "${LLM_WIKI_COLLECTION}" not found. Run: npm run atlas:llm-wiki:ingest`,
					_hint: 'Run the ingest pipeline first'
				});
			}

			// Embed primary query
			const primaryEmbed = await generateSingleEmbedding(queryText);

			// Generate 3 heuristic query variants
			const variants = [
				queryText,
				`${queryText} explained simply`,
				`${queryText} technical implementation`,
				`${queryText} neural network architecture`
			];

			// Parallel search all 4 variants (embed 2-4 on-the-fly)
			const searchPromises = variants.map(async (v, i) => {
				const vec = i === 0 ? primaryEmbed : await generateSingleEmbedding(v);
				const results = await qdrant.client.search(LLM_WIKI_COLLECTION, {
					vector: vec,
					limit: 5,
					with_payload: true,
					score_threshold: 0.25
				});
				return { variant: v, results };
			});

			const settled = await Promise.allSettled(searchPromises);
			const successful = settled.filter((s): s is PromiseFulfilledResult<typeof searchPromises extends Promise<infer T>[] ? T : never> => s.status === 'fulfilled');

			// RRF fusion across all variant result sets
			const resultSets = successful.map(s => s.value.results);
			const fused = rrfFuse(resultSets);

			const merged = fused.slice(0, 6).map(({ id, rrf, hits, payload }) => ({
				path: (payload?.source_path as string) ?? (payload?.url as string) ?? String(id),
				finalScore: parseFloat(rrf.toFixed(4)),
				matches: hits,
				snippet: ((payload?.text as string) ?? '').slice(0, 120),
				topic: (payload?.tags as string[])?.find(t => t in TOPIC_LABELS) ?? null
			}));

			const retrievals = successful.map(s => ({
				source: `Qdrant (${LLM_WIKI_COLLECTION})`,
				query: s.value.variant,
				hits: s.value.results.slice(0, 3).map(r => ({
					path: (r.payload?.source_path as string) ?? (r.payload?.url as string) ?? String(r.id),
					score: parseFloat(r.score.toFixed(3)),
					text: ((r.payload?.text as string) ?? '').slice(0, 100)
				}))
			}));

			// Check Redis ACE feature cache for topic hits
			let aceHits: string[] = [];
			try {
				const redis = getRedis();
				const topicKeys = Object.keys(TOPIC_LABELS);
				const values = await redis.mget(...topicKeys.map(k => `ace:feature:${k}`));
				aceHits = topicKeys.filter((_, i) => values[i] !== null);
			} catch { /* Redis offline */ }

			return json({
				success: true,
				query: queryText,
				variants,
				retrievals,
				merged,
				aceHits,
				latencyMs: Math.round(performance.now() - t0)
			});
		}

		// ─── 2. 4D Topology Projection & Reranking (real chunks) ─────────────────
		if (action === 'topology-rerank') {
			const queryText = (query as string) || 'attention mechanism transformer';
			const t0 = performance.now();

			let embedding: number[];
			try {
				embedding = await generateSingleEmbedding(queryText);
			} catch (e: any) {
				return json({ success: false, error: `Embed failed: ${e.message}` }, { status: 502 });
			}

			let results: Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }> = [];
			try {
				results = await qdrant.client.search(LLM_WIKI_COLLECTION, {
					vector: embedding,
					limit: 8,
					with_payload: true,
					score_threshold: 0.2
				});
			} catch { /* collection not ready */ }

			// Assign 4D topology coordinates based on chunk metadata
			// x = semantic focus (cosine score proxy)
			// y = technical complexity (text length normalized to [0,1])
			// z = graph linkage (tag count as density proxy)
			// w = topic authority (ace:feature cache presence)
			let acePresence: Record<string, boolean> = {};
			try {
				const redis = getRedis();
				const topicKeys = Object.keys(TOPIC_LABELS);
				const values = await redis.mget(...topicKeys.map(k => `ace:feature:${k}`));
				topicKeys.forEach((k, i) => { acePresence[k] = values[i] !== null; });
			} catch { /* Redis offline */ }

			const chunks = results.map(r => {
				const payload = r.payload ?? {};
				const text = (payload.text as string) ?? '';
				const tags = (payload.tags as string[]) ?? [];
				const topic = tags.find(t => t in TOPIC_LABELS) ?? '';

				const x = parseFloat(r.score.toFixed(3));
				const y = parseFloat(Math.min(text.length / 800, 1).toFixed(3));
				const z = parseFloat(Math.min(tags.length / 8, 1).toFixed(3));
				const w = topic && acePresence[topic] ? 1.0 : 0.4;

				// Weighted Euclidean topology score (wx=0.5, wy=0.2, wz=0.2, ww=0.1)
				const topologyScore = parseFloat(
					(0.5 * x + 0.2 * y + 0.2 * z + 0.1 * w).toFixed(4)
				);

				return {
					path: (payload.source_path as string) ?? (payload.url as string) ?? String(r.id),
					snippet: text.slice(0, 100),
					topic: TOPIC_LABELS[topic] ?? topic,
					cosineScore: x,
					topology: { x, y, z, w },
					topologyScore
				};
			}).sort((a, b) => b.topologyScore - a.topologyScore);

			return json({
				success: true,
				query: queryText,
				chunks,
				latencyMs: Math.round(performance.now() - t0)
			});
		}

		// ─── 3. GraphRAG Path Compression (ACE feature cards + topic graph) ───────
		if (action === 'compress-paths') {
			const queryText = (query as string) || 'backpropagation gradient descent';
			const t0 = performance.now();

			// Embed and search for source topic
			let embedding: number[] = [];
			try { embedding = await generateSingleEmbedding(queryText); } catch { /* offline */ }

			let pathResults: Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }> = [];
			if (embedding.length) {
				try {
					pathResults = await qdrant.client.search(LLM_WIKI_COLLECTION, {
						vector: embedding,
						limit: 4,
						with_payload: true,
						score_threshold: 0.3
					});
				} catch { /* not ready */ }
			}

			// Build path steps from chunk lineage
			const pathSteps = pathResults.map((r, i) => {
				const payload = r.payload ?? {};
				const tags = (payload.tags as string[]) ?? [];
				const topic = tags.find(t => t in TOPIC_LABELS) ?? 'unknown';
				return {
					node: (payload.source_path as string) ?? `chunk-${r.id}`,
					type: 'llm_wiki',
					topic: TOPIC_LABELS[topic] ?? topic,
					desc: ((payload.text as string) ?? '').slice(0, 80),
					score: parseFloat(r.score.toFixed(3))
				};
			});

			// Read ACE narrative from Redis if available
			let narrative = `Query "${queryText}" resolved through LLM wiki knowledge layer.`;
			try {
				const redis = getRedis();
				const topicMatch = pathResults[0]?.payload?.tags as string[] | undefined;
				const topic = topicMatch?.find(t => t in TOPIC_LABELS);
				if (topic) {
					const card = await redis.get(`ace:feature:${topic}`);
					if (card) {
						const parsed = JSON.parse(card);
						narrative = parsed.summary ?? parsed.title ?? narrative;
					}
				}
			} catch { /* Redis offline */ }

			return json({
				success: true,
				query: queryText,
				pathSteps,
				narrative,
				latencyMs: Math.round(performance.now() - t0)
			});
		}

		// ─── 4. Karpathy LLM Wiki Compilation (real Redis ACE + Qdrant stats) ────
		if (action === 'compile-wiki') {
			const topicQuery = (query as string) || '';
			const t0 = performance.now();

			// Load all ACE feature cards from Redis
			const redis = getRedis();
			const topicKeys = Object.keys(TOPIC_LABELS);
			let aceCards: Array<{ key: string; label: string; card: Record<string, unknown> | null }> = [];
			try {
				const values = await redis.mget(...topicKeys.map(k => `ace:feature:${k}`));
				aceCards = topicKeys.map((k, i) => ({
					key: k,
					label: TOPIC_LABELS[k],
					card: values[i] ? JSON.parse(values[i]!) : null
				}));
			} catch { /* Redis offline — return empty */ }

			const loaded = aceCards.filter(c => c.card !== null);

			// Obsidian-style links from loaded cards
			const obsidianLinks = loaded.map(c => `[[LLM Wiki/${c.label}]]`);

			// Check Qdrant point count
			let qdrantPoints = 0;
			try {
				const info = await qdrant.client.getCollection(LLM_WIKI_COLLECTION);
				qdrantPoints = (info as any).points_count ?? (info as any).result?.points_count ?? 0;
			} catch { /* not ingested */ }

			const indexUpdated = {
				file: 'docs/knowledge/llm-wiki/wiki/index.md',
				topics: loaded.length,
				qdrantPoints,
				summary: loaded.length > 0
					? `${loaded.length}/${topicKeys.length} topics loaded from Redis ACE cache`
					: 'No ACE cards in Redis — run: npm run atlas:llm-wiki:ingest'
			};

			const logEntry = `## [${new Date().toISOString().slice(0, 10)}] wiki-compile | ${loaded.length} topics | ${qdrantPoints} qdrant-pts`;

			// Filter to queried topic if provided
			const filteredCards = topicQuery
				? aceCards.filter(c =>
					c.key.includes(topicQuery.toLowerCase()) ||
					c.label.toLowerCase().includes(topicQuery.toLowerCase())
				)
				: aceCards;

			return json({
				success: true,
				topicQuery,
				topicsAvailable: aceCards.length,
				topicsLoaded: loaded.length,
				cards: filteredCards.map(c => ({
					key: c.key,
					label: c.label,
					loaded: c.card !== null,
					summary: (c.card as any)?.summary ?? (c.card as any)?.title ?? null
				})),
				obsidianLinks,
				indexUpdated,
				logEntry,
				latencyMs: Math.round(performance.now() - t0)
			});
		}

		return json({ success: false, error: `Unsupported action: ${action}` }, { status: 400 });

	} catch (error: any) {
		console.error('[parents-atlas-actions] POST error:', error);
		return json({ success: false, error: error.message ?? 'Internal server error' }, { status: 500 });
	}
};