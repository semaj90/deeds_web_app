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
import { json, type RequestHandler } from '@sveltejs/kit';
import { pool } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

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
		const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query }),
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) return null;
		const data = await res.json();
		return Array.isArray(data.embedding) ? data.embedding : null;
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ request }) => {
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

	const timing: Record<string, number> = {};

	// 1. Embed the query
	const embedStart = performance.now();
	const embedding = await embedQuery(query);
	timing.embed_ms = Math.round(performance.now() - embedStart);

	if (!embedding) {
		return json({ error: 'Embedding service unavailable' }, { status: 503 });
	}

	// 2. Build pgvector cosine similarity query
	const searchStart = performance.now();
	const vectorString = `[${embedding.join(',')}]`;

	try {
		const res = await pool.query(
			`SELECT
				lc.id AS chunk_id,
				ln.id AS node_id,
				ld.id AS doc_id,
				ld.title AS doc_title,
				ln.heading AS node_heading,
				ln.citation_label AS citation,
				j.code AS jurisdiction,
				ld.corpus_type AS category,
				ld.source_confidence AS source_confidence,
				lc.chunk_index,
				lc.chunk_text AS content,
				1 - (lc.embedding <=> $1::vector) AS similarity
			 FROM legal_chunks lc
			 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			 JOIN library_documents ld ON ld.id = ln.document_id
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE lc.embedding IS NOT NULL
			 ORDER BY lc.embedding <=> $1::vector
			 LIMIT $2`,
			[vectorString, limit]
		);

		timing.search_ms = Math.round(performance.now() - searchStart);
		timing.total_ms = Math.round(performance.now() - start);

		return json({
			results: res.rows.map(r => ({
				chunkId: String(r.chunk_id),
				nodeId: String(r.node_id),
				documentId: String(r.doc_id),
				title: String(r.doc_title ?? ''),
				heading: String(r.node_heading ?? ''),
				citationLabel: r.citation ? String(r.citation) : null,
				jurisdiction: String(r.jurisdiction ?? 'Other'),
				category: r.category ? String(r.category) : null,
				chunkIndex: Number(r.chunk_index),
				snippet: String(r.content ?? ''),
				score: Number(r.similarity ?? 0),
				sourceConfidence: String(r.source_confidence ?? 'medium')
			})),
			count: res.rows.length,
			timing,
			model: EMBEDDING_MODEL
		});
	} catch (err) {
		console.error('[Statutes Search] Vector query failed:', err);

		// Fallback: full-text search
		try {
			const textRes = await pool.query(
				`SELECT
					lc.id AS chunk_id,
					ln.id AS node_id,
					ld.id AS doc_id,
					ld.title AS doc_title,
					ln.heading AS node_heading,
					ln.citation_label AS citation,
					j.code AS jurisdiction,
					ld.corpus_type AS category,
					ld.source_confidence AS source_confidence,
					lc.chunk_index,
					lc.chunk_text AS content,
					ts_rank(lc.tsv, plainto_tsquery('english', $1)) AS similarity
				 FROM legal_chunks lc
				 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
				 JOIN library_documents ld ON ld.id = ln.document_id
				 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
				 WHERE lc.tsv @@ plainto_tsquery('english', $1)
				 ORDER BY similarity DESC
				 LIMIT $2`,
				[query, limit]
			);

			timing.search_ms = Math.round(performance.now() - searchStart);
			timing.total_ms = Math.round(performance.now() - start);
			timing.fallback = 1;

			return json({
				results: textRes.rows.map(r => ({
					chunkId: String(r.chunk_id),
					nodeId: String(r.node_id),
					documentId: String(r.doc_id),
					title: String(r.doc_title ?? ''),
					heading: String(r.node_heading ?? ''),
					citationLabel: r.citation ? String(r.citation) : null,
					jurisdiction: String(r.jurisdiction ?? 'Other'),
					category: r.category ? String(r.category) : null,
					chunkIndex: Number(r.chunk_index),
					snippet: String(r.content ?? ''),
					score: Number(r.similarity ?? 0),
					sourceConfidence: String(r.source_confidence ?? 'medium')
				})),
				count: textRes.rows.length,
				timing,
				model: 'text-search-fallback'
			});
		} catch (fallbackErr) {
			console.error('[Statutes Search] Fallback failed:', fallbackErr);
			return json({ error: 'Search unavailable', results: [], timing }, { status: 503 });
		}
	}
};
