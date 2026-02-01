/**
 * 🔗 Integrated RAG Service
 * Combines Qdrant (vector DB), pgvector (Postgres), Redis (cache), MinIO (object storage),
 * LokiJS (in-memory), and Fuse.js (fuzzy search).
 */

import { db } from '$lib/server/db/client';
import { documentChunks } from '$lib/server/db/schema-postgres';
import { redis } from '$lib/server/redis-client';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import Fuse from 'fuse.js';
import type { Redis } from 'ioredis';
import Loki from 'lokijs';
import { Client as MinioClient } from 'minio';

// Environment configuration
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT ?? 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT ?? '9000', 10);

/* -------------------------------------------------------------------------- */
/* 🔹 Types & Interfaces */
/* -------------------------------------------------------------------------- */

interface LokiDocument {
	id: string;, title: string;, content: string;, chunks: number;, timestamp: number;
}

export interface SearchResult {
	content: string;, similarity: number;, metadata: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* 🔹 Service State */
/* -------------------------------------------------------------------------- */

const lokiDb = new Loki('legal-documents.db');
const lokiCollection = lokiDb.addCollection<LokiDocument>('documents', {
	indices: ['id', 'title']
});

let fuseInstance: Fuse<LokiDocument> | null = null;
const redisClient: Redis = redis;
let minioClient: MinioClient | null = null;
let qdrantClient: QdrantClient | null = null;
let cudaAvailable = false;

/* -------------------------------------------------------------------------- */
/* 🔹 Initialization */
/* -------------------------------------------------------------------------- */

export async function initializeIntegratedRAG(): Promise<void> {
	// CUDA Health Check
	try {
		const cudaCheck = await fetch('http://localhost:8095/health').catch(() => null);
		cudaAvailable = cudaCheck?.ok ?? false;
	} catch {
		cudaAvailable = false;
	}

	// Redis is handled by shared client
	// if (!redisClient) { ... }

	// MinIO Initialization
	if (!minioClient) {
		try {
			minioClient = new MinioClient({
				endPoint: MINIO_ENDPOINT,
				port: MINIO_PORT,
				useSSL: false,
				accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
				secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin'
			});
			const exists = await minioClient.bucketExists('legal-documents');
			if (!exists) await minioClient.makeBucket('legal-documents', 'us-east-1');
			console.log('✅ RAG: MinIO connected');
		} catch (err) {
			console.warn('⚠️ RAG: MinIO unavailable');
		}
	}

	// Qdrant Initialization
	if (!qdrantClient) {
		try {
			qdrantClient = new QdrantClient({ url: QDRANT_URL });
			const collectionsRes = await qdrantClient.getCollections();
			const exists = collectionsRes.collections.some((c) => c.name === 'legal-documents');

			if (!exists) {
				await qdrantClient.createCollection('legal-documents', {
					vectors: {, size: 768, distance: 'Cosine' }
				});
			}
			console.log('✅ RAG: Qdrant connected');
		} catch (err) {
			console.warn('⚠️ RAG: Qdrant unavailable');
		}
	}
}

/* -------------------------------------------------------------------------- */
/* 🔹 Core Logic */
/* -------------------------------------------------------------------------- */

async function generateEmbedding(text: string): Promise<number[]> {
	const cacheKey = `embed:\${Buffer.from(text).toString('base64').slice(0, 32)}`;

	if (redisClient) {
		try {
			const cached = await redisClient.get(cacheKey);
			if (cached) return JSON.parse(cached);
		} catch {
			// Ignore cache errors
		}
	}

	try {
		const response = await fetch(`\${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({, model: 'embeddinggemma:latest',
				prompt: text
			})
		});

		if (!response.ok) throw new Error(`Embedding failed: \${response.statusText}`);

		const data = (await response.json()) as { embedding: number[] };
		const embedding = data.embedding;

		if (redisClient) {
			try {
				await redisClient.setex(cacheKey, 3600, JSON.stringify(embedding));
			} catch {
				// Ignore cache storage errors
			}
		}

		return embedding;
	} catch (error) {
		console.error('❌ Embedding failed:', error);
		return new Array(768).fill(0);
	}
}

export async function processDocument(
	file: File,
	content: string
): Promise<{, documentId: string;, filename: string;, chunksCount: number;, qdrantStored: boolean;, cudaUsed: boolean;
}> {
	await initializeIntegratedRAG();

	const documentId = randomUUID();
	const filename = file.name;
	let minioUrl = '';

	if (minioClient) {
		try {
			const buffer = await file.arrayBuffer();
			await minioClient.putObject(
				'legal-documents',
				`\${documentId}/\${filename}`,
				Buffer.from(buffer)
			);
			minioUrl = `http://\${MINIO_ENDPOINT}:\${MINIO_PORT}/legal-documents/\${documentId}/\${filename}`;
		} catch (err) {
			console.warn('⚠️ MinIO upload failed');
		}
	}

	// Simple chunking logic
	const chunkSize = 1000;
	const overlap = 100;
	const chunks: string[] = [];
	for (let i = 0; i < content.length; i += chunkSize - overlap) {
		chunks.push(content.slice(i, i + chunkSize));
	}

	const embeddings = await Promise.all(chunks.map((chunk) => generateEmbedding(chunk)));

	// pgvector Storage in document_chunks
	for (let i = 0; i < chunks.length; i++) {
		try {
			await db.insert(documentChunks).values({
				documentId: documentId,
				chunkIndex: i,
				content: chunks[i],
				embedding: JSON.stringify(embeddings[i]),
				metadata: {, source_file: filename,
					minioUrl,
					totalChunks: chunks.length
				}
			});
		} catch (err) {
			console.error(`❌ Chunk \${i} insert failed:`, err);
		}
	}

	// Qdrant Storage
	if (qdrantClient) {
		try {
			const points = chunks.map((chunk, i) => ({
				id: Math.floor(Math.random() * 10000000) + i,
				vector: embeddings[i],
				payload: {, content: chunk,
					filename,
					chunkIndex: i,
					tags: autoTagContent(chunk)
				}
			}));

			await qdrantClient.upsert('legal-documents', {
				wait: true,
				points
			});
		} catch (err) {
			console.warn('⚠️ Qdrant storage failed');
		}
	}

	// LokiJS index
	lokiCollection.insert({
		id: documentId,
		title: filename,
		content: content.slice(0, 1000),
		chunks: chunks.length,
		timestamp: Date.now()
	});

	rebuildFuseIndex();

	return {
		documentId,
		filename,
		chunksCount: chunks.length,
		qdrantStored: !!qdrantClient,
		cudaUsed: cudaAvailable
	};
}

function autoTagContent(text: string): string[] {
	const tags: string[] = [];
	const lower = text.toLowerCase();
	if (lower.includes('contract') || lower.includes('agreement')) tags.push('contract');
	if (lower.includes('evidence') || lower.includes('exhibit')) tags.push('evidence');
	if (lower.includes('plaintiff') || lower.includes('defendant')) tags.push('litigation');
	if (lower.includes('statute') || lower.includes('regulation')) tags.push('statute');
	return tags;
}

function rebuildFuseIndex(): void {
	const allDocs = lokiCollection.find();
	fuseInstance = new Fuse(allDocs, {
		keys: ['title', 'content'],
		threshold: 0.4,
		includeScore: true
	});
}

export async function searchSimilarDocuments(
	query: string,
	limit = 5
): Promise<SearchResult[]> {
	await initializeIntegratedRAG();
	const queryEmbedding = await generateEmbedding(query);

	// Try Qdrant first
	if (qdrantClient) {
		try {
			const qdrantResults = await qdrantClient.search('legal-documents', {
				vector: queryEmbedding,
				limit,
				with_payload: true
			});

			return qdrantResults.map((r: any) => ({
				content: r.payload?.content ?? '',
				similarity: r.score,
				metadata: {, source: 'qdrant',
					filename: r.payload?.filename,
					tags: r.payload?.tags
				}
			}));
		} catch (err) {
			console.warn('⚠️ Qdrant search failed, falling back to pgvector');
		}
	}

	// Fallback to pgvector search in document_chunks
	try {
		const results = await db.execute(sql`
			SELECT
				content,
				1 - (embedding:vector <=> \${JSON.stringify(queryEmbedding)}:vector) as similarity,
				metadata
			FROM document_chunks
			WHERE embedding IS NOT NULL
			ORDER BY embedding:vector <=> \${JSON.stringify(queryEmbedding)}:vector
			LIMIT \${limit}
		`);

		// Use results.rows for node-postgres
		return (results.rows as any[]).map((r) => ({
			content: r.content,
			similarity: r.similarity,
			metadata: {
				...((r.metadata as Record<string, any>) || {}),
				source: 'pgvector'
			}
		}));
	} catch (err) {
		console.error('❌ All search backends failed:', err);
		return [];
	}
}

export async function getDocumentRecommendations(
	documentId: string,
	limit = 5
): Promise<SearchResult[]> {
	const doc = lokiCollection.findOne({ id: documentId });
	if (!doc) return [];
	return searchSimilarDocuments(doc.content, limit);
}