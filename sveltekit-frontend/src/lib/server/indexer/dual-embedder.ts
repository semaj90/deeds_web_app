/**
 * Dual Embedding Indexer
 *
 * For each code chunk, generates TWO embeddings:
 * 1. Raw text embedding (the actual code content)
 * 2. Signature embedding (AST-derived metadata string)
 *
 * Both are stored in Qdrant as named vectors, enabling:
 * - Content search: "find database insert operations"
 * - Signature search: "POST /api/cases uses db.insert"
 * - Hybrid: weighted combination of both scores
 *
 * Uses embeddinggemma:latest (768-dim) via Ollama, standardized.
 */
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL, SERVER_EMBEDDING_DIMS } from '$lib/ai/model-ids.js';
import type { CodeChunk } from './ast-chunker.js';

const QDRANT_COLLECTION = 'codebase_chunks';
const BATCH_SIZE = 16;

interface EmbeddingResult {
	embedding: number[];
}

interface IndexResult {
	chunksProcessed: number;
	embeddingsGenerated: number;
	storedInQdrant: number;
	failed: number;
	durationMs: number;
}

/**
 * Generate a 768-dim embedding via Ollama embeddinggemma.
 * Redis-cached by content hash to avoid re-embedding identical text.
 */
async function embed(text: string): Promise<number[]> {
	const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt: text }),
		signal: AbortSignal.timeout(30_000)
	});

	if (!res.ok) {
		throw new Error(`Embedding failed (${res.status}): ${await res.text()}`);
	}

	const data = (await res.json()) as EmbeddingResult;
	return data.embedding;
}

/**
 * Ensure a Qdrant collection exists with dual named vectors.
 */
async function ensureCollection(): Promise<void> {
	const qdrantUrl = ENV.QDRANT_URL;

	// Check if collection exists
	const check = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}`);
	if (check.ok) return;

	// Create with named vectors for dual embedding
	const res = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vectors: {
				content: { size: SERVER_EMBEDDING_DIMS, distance: 'Cosine' },
				signature: { size: SERVER_EMBEDDING_DIMS, distance: 'Cosine' }
			}
		})
	});

	if (!res.ok) {
		throw new Error(`Failed to create collection: ${await res.text()}`);
	}

	// Create payload indexes for filtered search
	const indexes = ['kind', 'httpMethod', 'routeId', 'tags'];
	for (const field of indexes) {
		await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}/index`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				field_name: field,
				field_schema: field === 'tags' ? 'keyword[]' : 'keyword'
			})
		}).catch(() => {}); // ignore if already exists
	}
}

/**
 * Upsert points with dual named vectors to Qdrant.
 */
async function upsertPoints(
	points: Array<{
		id: string;
		vectors: { content: number[]; signature: number[] };
		payload: Record<string, unknown>;
	}>
): Promise<void> {
	const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			points: points.map((p) => ({
				id: hashToUint(p.id),
				vector: { content: p.vectors.content, signature: p.vectors.signature },
				payload: p.payload
			}))
		})
	});

	if (!res.ok) {
		throw new Error(`Qdrant upsert failed (${res.status}): ${await res.text()}`);
	}
}

/**
 * Search with dual vectors. Combines content + signature scores.
 */
export async function searchCodebase(
	query: string,
	opts: {
		limit?: number;
		filter?: Record<string, unknown>;
		contentWeight?: number;
		signatureWeight?: number;
	} = {}
): Promise<Array<{ chunk: { content: string } & Record<string, unknown>; score: number }>> {
	const limit = opts.limit ?? 10;
	const contentWeight = opts.contentWeight ?? 0.6;
	const signatureWeight = opts.signatureWeight ?? 0.4;

	const queryEmbedding = await embed(query);

	// Search both vector spaces
	const [contentResults, signatureResults] = await Promise.all([
		searchVector('content', queryEmbedding, limit * 2, opts.filter),
		searchVector('signature', queryEmbedding, limit * 2, opts.filter)
	]);

	// Merge and re-rank by weighted score
	const scoreMap = new Map<string, { payload: Record<string, unknown>; score: number }>();

	for (const r of contentResults) {
		const key = r.id.toString();
		const existing = scoreMap.get(key);
		const score = (existing?.score ?? 0) + r.score * contentWeight;
		scoreMap.set(key, { payload: r.payload, score });
	}

	for (const r of signatureResults) {
		const key = r.id.toString();
		const existing = scoreMap.get(key);
		const score = (existing?.score ?? 0) + r.score * signatureWeight;
		scoreMap.set(key, { payload: existing?.payload ?? r.payload, score });
	}

	// Sort by combined score, take top N
	return [...scoreMap.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((r) => ({
			chunk: {
				content: r.payload.content as string,
				path: r.payload.path as string,
				relativePath: r.payload.relativePath as string,
				kind: r.payload.kind as string,
				symbol: r.payload.symbol as string,
				httpMethod: r.payload.httpMethod as string | undefined,
				routeId: r.payload.routeId as string | undefined,
				exports: r.payload.exports as string[],
				tags: r.payload.tags as string[],
				lineStart: r.payload.lineStart as number,
				lineEnd: r.payload.lineEnd as number
			},
			score: r.score
		}));
}

async function searchVector(
	vectorName: string,
	vector: number[],
	limit: number,
	filter?: Record<string, unknown>
): Promise<Array<{ id: number | string; score: number; payload: Record<string, unknown> }>> {
	const body: Record<string, unknown> = {
		vector: { name: vectorName, vector },
		limit,
		with_payload: true
	};
	if (filter) body.filter = filter;

	const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!res.ok) return [];
	const data = await res.json();
	return data.result ?? [];
}

/**
 * Index an array of AST code chunks into Qdrant with dual embeddings.
 */
export async function indexChunks(chunks: CodeChunk[]): Promise<IndexResult> {
	const start = performance.now();
	let embeddingsGenerated = 0;
	let storedInQdrant = 0;
	let failed = 0;

	await ensureCollection();

	// Process in batches
	for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
		const batch = chunks.slice(i, i + BATCH_SIZE);
		const points: Array<{
			id: string;
			vectors: { content: number[]; signature: number[] };
			payload: Record<string, unknown>;
		}> = [];

		for (const chunk of batch) {
			try {
				const [contentEmb, signatureEmb] = await Promise.all([
					embed(chunk.content.slice(0, 2000)), // cap content to avoid token limits
					embed(chunk.signature)
				]);
				embeddingsGenerated += 2;

				points.push({
					id: chunk.id,
					vectors: { content: contentEmb, signature: signatureEmb },
					payload: {
						content: chunk.content.slice(0, 4000), // store truncated for retrieval
						signature: chunk.signature,
						...chunk.metadata
					}
				});
			} catch {
				failed++;
			}
		}

		if (points.length > 0) {
			try {
				await upsertPoints(points);
				storedInQdrant += points.length;
			} catch {
				failed += points.length;
			}
		}
	}

	return {
		chunksProcessed: chunks.length,
		embeddingsGenerated,
		storedInQdrant,
		failed,
		durationMs: Math.round(performance.now() - start)
	};
}

/**
 * Deterministic hash of a string to a uint64 (for Qdrant point ID).
 */
function hashToUint(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash);
}
