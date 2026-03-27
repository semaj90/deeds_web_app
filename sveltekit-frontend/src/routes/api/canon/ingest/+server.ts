/**
 * POST /api/canon/ingest — Ingest a canonical document: chunk → embed → store in PG + Qdrant
 *
 * Body: { documentId: UUID }
 *
 * Pipeline:
 *   1. Fetch document from canonical_documents
 *   2. Chunk by doc type (statutes: 200-500 tok, opinions: 600-1200 tok)
 *   3. Generate deterministic chunk IDs ({doc_id_short}:{index}:{sha16})
 *   4. Embed chunks via embeddinggemma (768-dim)
 *   5. Store chunks in canonical_chunks table (PG + pgvector)
 *   6. Upsert to Qdrant legal_canon_chunks collection
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { canonicalDocuments, canonicalChunks } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';

const ingestSchema = z.object({
	documentId: z.string().uuid(),
});

const QDRANT_COLLECTION = 'legal_canon_chunks';

// Chunk size targets by document type (in characters, ~4 chars per token)
const CHUNK_TARGETS: Record<string, { size: number; overlap: number }> = {
	statute: { size: 1400, overlap: 200 },      // ~350 tokens
	rule: { size: 1400, overlap: 200 },
	regulation: { size: 1400, overlap: 200 },
	jury_instruction: { size: 1600, overlap: 300 }, // ~400 tokens
	opinion: { size: 3600, overlap: 600 },       // ~900 tokens
	treatise: { size: 3600, overlap: 600 },
};

function chunkText(text: string, docType: string): string[] {
	const config = CHUNK_TARGETS[docType] ?? { size: 2000, overlap: 300 };
	const chunks: string[] = [];
	const sentences = text.split(/(?<=[.!?])\s+/);
	let current = '';

	for (const sentence of sentences) {
		if (current.length + sentence.length > config.size && current.length > 0) {
			chunks.push(current.trim());
			// Overlap: keep last portion
			const words = current.split(/\s+/);
			const overlapWords = Math.floor(config.overlap / 5);
			current = words.slice(-overlapWords).join(' ') + ' ' + sentence;
		} else {
			current += (current ? ' ' : '') + sentence;
		}
	}
	if (current.trim()) chunks.push(current.trim());

	return chunks;
}

function makeChunkId(docId: string, index: number, content: string): string {
	// Normalize: NFKC + lowercase + collapse whitespace
	const normalized = content.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
	const sha16 = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
	const docShort = docId.slice(0, 8);
	return `${docShort}:${index}:${sha16}`;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = ingestSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const { documentId } = parsed.data;

		// 1. Fetch document
		const [doc] = await db
			.select()
			.from(canonicalDocuments)
			.where(eq(canonicalDocuments.id, documentId))
			.limit(1);

		if (!doc) {
			return json({ error: 'Document not found' }, { status: 404 });
		}
		if (!doc.fullText || doc.fullText.trim().length === 0) {
			return json({ error: 'Document has no text content to ingest' }, { status: 400 });
		}

		// 2. Chunk
		const textChunks = chunkText(doc.fullText, doc.docType);
		if (textChunks.length === 0) {
			return json({ error: 'No chunks produced from document' }, { status: 400 });
		}

		// 3. Generate chunk IDs
		const chunkData = textChunks.map((content, idx) => ({
			chunkId: makeChunkId(documentId, idx, content),
			documentId,
			chunkIndex: idx,
			content,
			tokenCount: Math.ceil(content.length / 4),
		}));

		// 4. Embed all chunks
		let embeddings: number[][] = [];
		try {
			const result = await generateEmbeddings(chunkData.map(c => c.content));
			embeddings = result.vectors;
		} catch (embedErr) {
			console.warn('[canon/ingest] Embedding failed, storing without vectors:', (embedErr as Error).message);
			embeddings = chunkData.map(() => []);
		}

		// 5. Store in PostgreSQL (upsert by chunk_id)
		let storedCount = 0;
		for (let i = 0; i < chunkData.length; i++) {
			const chunk = chunkData[i];
			const embedding = embeddings[i] && embeddings[i].length === 768 ? embeddings[i] : null;

			const docMeta = (doc.metadata ?? {}) as Record<string, unknown>;
			await db.insert(canonicalChunks).values({
				chunkId: chunk.chunkId,
				documentId: chunk.documentId,
				chunkIndex: chunk.chunkIndex,
				content: chunk.content,
				tokenCount: chunk.tokenCount,
				embedding,
				domains: (docMeta.domains as string[]) ?? [],
				keyTerms: (docMeta.key_terms as string[]) ?? [],
				metadata: {
					citation: doc.citation,
					jurisdiction: doc.jurisdiction,
					authorityLevel: doc.authorityLevel,
					docType: doc.docType,
				},
			}).onConflictDoNothing();
			storedCount++;
		}

		// 6. Upsert to Qdrant (named dense 'content' + sparse 'bm25')
		let qdrantCount = 0;
		try {
			const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
			const { generateSparseVector } = await import('$lib/server/vector/bm42-sparse.js');

			// Ensure collection exists with named vectors + sparse
			try {
				await qdrant.client.getCollection(QDRANT_COLLECTION);
			} catch {
				await qdrant.client.createCollection(QDRANT_COLLECTION, {
					vectors: { content: { size: 768, distance: 'Cosine', on_disk: true } },
					sparse_vectors: { bm25: {} },
					hnsw_config: { m: 16, ef_construct: 128, on_disk: true },
				});
			}

			// Build points with dense + sparse vectors
			const points = chunkData
				.map((chunk, i) => {
					const emb = embeddings[i];
					if (!emb || emb.length !== 768) return null;
					const sparse = generateSparseVector(chunk.content);
					return {
						id: createHash('md5').update(chunk.chunkId).digest('hex').replace(/-/g, '').slice(0, 32),
						vector: {
							content: emb,
							...(sparse.indices.length > 0 ? { bm25: sparse } : {}),
						},
						payload: {
							chunk_id: chunk.chunkId,
							doc_id: documentId,
							doc_type: doc.docType,
							citation: doc.citation,
							jurisdiction: doc.jurisdiction,
							authority_level: doc.authorityLevel,
							content: chunk.content.slice(0, 500),
							token_count: chunk.tokenCount,
							domains: ((doc.metadata ?? {}) as Record<string, unknown>).domains as string[] ?? [],
							key_terms: ((doc.metadata ?? {}) as Record<string, unknown>).key_terms as string[] ?? [],
						},
					};
				})
				.filter((p): p is NonNullable<typeof p> => p !== null);

			if (points.length > 0) {
				await qdrant.client.upsert(QDRANT_COLLECTION, { points });
				qdrantCount = points.length;
			}
		} catch (qdrantErr) {
			console.warn('[canon/ingest] Qdrant upsert failed (non-fatal):', (qdrantErr as Error).message);
		}

		return json({
			success: true,
			documentId,
			title: doc.title,
			chunksProduced: chunkData.length,
			chunksStored: storedCount,
			qdrantUpserted: qdrantCount,
			embeddingsGenerated: embeddings.filter(e => e.length === 768).length,
		});
	} catch (err) {
		console.error('[canon/ingest] error:', err);
		return json({ error: 'Ingestion failed' }, { status: 500 });
	}
};