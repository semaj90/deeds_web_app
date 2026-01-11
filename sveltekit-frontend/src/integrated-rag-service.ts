/**
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
 * Combines Qdrant, pgvector, Redis, MinIO, LokiJS, and Fuse.js
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
 * Combines Qdrant, pgvector, Redis, MinIO, LokiJS, and Fuse.js
 * for comprehensive document processing and semantic search
 */

import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import type { QdrantClient as QdrantClientType } from '@qdrant/js-client-rest';
import type { Client as MinioClient } from 'minio';
import type { RedisClientType } from 'redis';

// Environment configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000', 10);

// Database connection
const queryClient = postgres(DATABASE_URL);
const db: PostgresJsDatabase = drizzle(queryClient);

// LokiJS document interface
interface LokiDocument {
	id: string; title: string; content: string; chunks: number; timestamp: number;
}

// LokiJS in-memory database
const lokiDb = new Loki('legal-documents.db');
const lokiCollection = lokiDb.addCollection<LokiDocument>('documents', {
	indices: ['id', 'title']
});

// Service client instances
let fuseInstance: Fuse<LokiDocument> | null = null;
let redisClient: RedisClientType | null = null;
let minioClient: MinioClient | null = null;
let qdrantClient: QdrantClientType | null = null;
let cudaAvailable = false;

// Result types
interface MetadataMap {
	[key: string]: unknown;
}

export interface SearchResult {
	content: string; similarity: number; metadata: MetadataMap;
}

interface QdrantPayload {
	content: string;
	filename?: string;
	chunkIndex?: number;
	tags?: string[];
}

interface QdrantHit {
	id: string; vector: number[]; score: number; payload: QdrantPayload;
}

/**
 * Initialize all RAG service connections
 */
export async function initializeIntegratedRAG(): Promise<void> {
	try {
		const cudaCheck = await fetch('http://localhost:8095/health').catch(() => null);
		cudaAvailable = cudaCheck?.ok || false;
		console.log(`CUDA: ${cudaAvailable ? 'enabled' : 'CPU mode'}`);
	} catch {
		cudaAvailable = false;
	}

	if (!redisClient) {
		try {
			const { createClient } = await import('redis');
			redisClient = createClient() as RedisClientType;
			await redisClient.connect();
			console.log('Redis connected');
		} catch {
			console.warn('Redis unavailable');
		}
	}

	if (!minioClient) {
		try {
			const { Client } = await import('minio');
			minioClient = new Client({
				endPoint: MINIO_ENDPOINT,
				port: MINIO_PORT,
				useSSL: false,
				accessKey: 'minioadmin',
				secretKey: 'minioadmin'
			});
			const exists = await minioClient.bucketExists('legal-documents');
			if (!exists) await minioClient.makeBucket('legal-documents', 'us-east-1');
			console.log('MinIO connected');
		} catch {
			console.warn('MinIO unavailable');
		}
	}

	if (!qdrantClient) {
		try {
			const { QdrantClient } = await import('@qdrant/js-client-rest');
			qdrantClient = new QdrantClient({ url: QDRANT_URL });

			try {
				const collectionsRes = await qdrantClient.getCollections();
				const collections = (collectionsRes as { collections?: { name: string }[] })?.collections || [];
				const exists = collections.some((c) => c?.name === 'legal-documents');

				if (!exists) {
					await qdrantClient.createCollection('legal-documents', {
						vectors: { size: 768, distance: 'Cosine' }
					});
				}
			} catch {
				try {
					await qdrantClient.createCollection('legal-documents', {
						vectors: { size: 768, distance: 'Cosine' }
					});
				} catch (err) {
					console.warn('Qdrant collection creation failed', err);
				}
			}
			console.log('Qdrant connected');
		} catch {
			console.warn('Qdrant unavailable');
		}
	}
}

async function generateEmbedding(text: string): Promise<number[]> {
	const cacheKey = `embed:${Buffer.from(text).toString('base64').slice(0, 32)}`;

	if (redisClient) {
		try {
			const cached = await redisClient.get(cacheKey);
			if (cached) return JSON.parse(cached);
		} catch (err) {
			console.warn('Redis cache lookup failed', err);
		}
	}

	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest',
				prompt: text
			})
		});

		if (!response.ok) throw new Error(`Embedding failed: ${response.statusText}`);

		const data = (await response.json()) as { embedding: number[] };
		const embedding = data.embedding;

		if (redisClient) {
			await redisClient.setEx(cacheKey, 3600, JSON.stringify(embedding));
		}

		return embedding;
	} catch (error) {
		console.error('Embedding failed:', error);
		return new Array(768).fill(0);
	}
}

export async function processDocument(
	file: File,
	content: string
): Promise<{ documentId: string; filename: string; chunks: number; qdrantStored: boolean; cudaUsed: boolean;
}> {
	await initializeIntegratedRAG();

	const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
	const filename = file.name;
	let minioUrl = '';

	if (minioClient) {
		try {
			const buffer = await file.arrayBuffer();
			await minioClient.putObject(
				'legal-documents',
				`${documentId}/${filename}`,
				Buffer.from(buffer)
			);
			minioUrl = `http://${MINIO_ENDPOINT}:${MINIO_PORT}/legal-documents/${documentId}/${filename}`;
			console.log(`MinIO: ${minioUrl}`);
		} catch {
			console.warn('MinIO upload failed');
		}
	}

	const chunkSize = 512;
	const overlap = 64;
	const chunks: string[] = [];

	for (let i = 0; i < content.length; i += chunkSize - overlap) {
		chunks.push(content.slice(i, i + chunkSize));
	}

	const embeddings = await Promise.all(chunks.map((chunk) => generateEmbedding(chunk)));

	for (let i = 0; i < chunks.length; i++) {
		try {
			await db.execute(sql`
				INSERT INTO documents (id, user_id, title, description, content_text, file_path, file_type, file_size, embedding, metadata)
				VALUES (
					${`${documentId}_chunk_${i}`},
					1,
					${`${filename} - Chunk ${i + 1}`},
					${chunks[i].slice(0, 200)},
					${chunks[i]},
					${minioUrl},
					${file.type},
					${file.size},
					${JSON.stringify(embeddings[i])}::vector,
					${JSON.stringify({
						source_file: filename,
						chunkIndex: i,
						totalChunks: chunks.length
					})}::jsonb
				)
			`);
		} catch {
			console.error(`Chunk ${i} insert failed`);
		}
	}

	if (qdrantClient) {
		try {
			const points = chunks.map((chunk, i) => ({
				id: i,
				vector: embeddings[i],
				payload: { content: chunk,
					filename,
					chunkIndex: i,
					tags: autoTagContent(chunk)
				}
			}));

			await qdrantClient.upsert('legal-documents', {
				wait: true,
				points
			});

			console.log(`Qdrant: ${chunks.length} chunks stored`);
		} catch {
			console.warn('Qdrant storage failed');
		}
	}

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
		chunks: chunks.length,
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
	if (lower.includes('motion') || lower.includes('brief')) tags.push('filing');

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
	let results: SearchResult[] = [];

	if (qdrantClient) {
		try {
			const qdrantResults = await qdrantClient.search('legal-documents', {
				vector: queryEmbedding,
				limit,
				with_payload: true
			});

			results = (qdrantResults as QdrantHit[]).map((r) => ({
				content: r.payload.content,
				similarity: r.score,
				metadata: { source_file: r.payload.filename,
					chunkIndex: r.payload.chunkIndex,
					tags: r.payload.tags
				}
			}));

			console.log(`Qdrant: ${results.length} results`);
			return results;
		} catch {
			console.warn('Qdrant search failed');
		}
	}

	try {
		const pgResults = await db.execute(sql`
			SELECT
				content_text,
				1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity,
				metadata
			FROM documents
			WHERE embedding IS NOT NULL
			ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
			LIMIT ${limit}
		`);

		results = (
			pgResults.rows as Array<{
				content_text: string; similarity: number; metadata: MetadataMap;
			}>
		).map((r) => ({
			content: r.content_text,
			similarity: r.similarity,
			metadata: r.metadata
		}));

		console.log(`pgvector: ${results.length} results`);
	} catch {
		console.error('pgvector search failed');
	}

	return results;
}

export async function getDocumentRecommendations(
	documentId: string,
	limit = 5
): Promise<SearchResult[]> {
	await initializeIntegratedRAG();

	const doc = lokiCollection.findOne({ id: documentId });
	if (!doc) return [];

	return searchSimilarDocuments(doc.content.slice(0, 500), limit);
}

export async function getSystemHealth(): Promise<{ database: boolean; redis: boolean; minio: boolean; qdrant: boolean; cuda: boolean; loki: number; fuse: boolean;
}> {
	await initializeIntegratedRAG();

	return {
		database: !!queryClient,
		redis: !!redisClient,
		minio: !!minioClient,
		qdrant: !!qdrantClient,
		cuda: cudaAvailable,
		loki: lokiCollection.count(),
		fuse: !!fuseInstance
	};
}


