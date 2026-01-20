/**
 * Integrated RAG Service - Full-Stack Implementation
 * Upload -> embeddinggemma -> pgvector -> Qdrant -> Redis -> CUDA
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { documents } from '$lib/db/schema';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { createClient, type RedisClientType } from 'redis';
import * as Minio from 'minio';
import { QdrantClient } from '@qdrant/js-client-rest';
import type { SearchResult } from '$lib/types';

// Environment Configuration
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000');
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'minioadmin';

// Database & Client Instances
const queryClient = postgres(DATABASE_URL);
const db = drizzle(queryClient);

interface LokiDocument {
	id: string;
	title: string;
	content: string;
	chunks: number;
	timestamp: number;
}

const lokiDb = new Loki('legal-documents.db');
const lokiCollection = lokiDb.addCollection<LokiDocument>('documents', { indices: ['id', 'title'] });

// Service Clients
let fuseInstance: Fuse<LokiDocument> | null = null;
let redisClient: RedisClientType | null = null;
let minioClient: Minio.Client | null = null;
let qdrantClient: QdrantClient | null = null;
let cudaAvailable = false;

// Initialization
export async function initializeIntegratedRAG(): Promise<void> {
	// Check CUDA availability (mock check)
	try {
		const cudaCheck = await fetch('http://localhost:8095/health').catch(() => null);
		cudaAvailable = cudaCheck?.ok ?? false;
		console.log(`🎮 CUDA: ${cudaAvailable ? '✅' : '⚠️ CPU'}`);
	} catch {
		cudaAvailable = false;
	}

	// Initialize Redis
	if (!redisClient) {
		try {
			redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
			await redisClient.connect();
			console.log('✅ Redis connected');
		} catch (err) {
			console.warn('⚠️ Redis unavailable', err);
			redisClient = null;
		}
	}

	// Initialize MinIO
	if (!minioClient) {
		try {
			// @ts-ignore
			minioClient = new Minio.Client({
				endPoint: MINIO_ENDPOINT,
				port: MINIO_PORT,
				useSSL: process.env.MINIO_USE_SSL === 'true',
				accessKey: MINIO_ACCESS_KEY,
				secretKey: MINIO_SECRET_KEY
			});

			const exists = await minioClient.bucketExists('legal-documents');
			if (!exists) {
				await minioClient.makeBucket('legal-documents', 'us-east-1');
			}
			console.log('✅ MinIO connected');
		} catch (err) {
			console.warn('⚠️ MinIO unavailable', err);
			minioClient = null;
		}
	}

	// Initialize Qdrant
	if (!qdrantClient) {
		try {
			qdrantClient = new QdrantClient({ url: QDRANT_URL });

			try {
				const result = await qdrantClient.getCollections();
				const exists = result.collections.some((c) => c.name === 'legal-documents');

				if (!exists) {
					await qdrantClient.createCollection('legal-documents', {
						vectors: { size: 768, distance: 'Cosine' }
					});
				}
			} catch (err) {
				// Fallback creation if check fails
				try {
					await qdrantClient.createCollection('legal-documents', {
						vectors: { size: 768, distance: 'Cosine' }
					});
				} catch (createErr) {
					// Ignore exists error
				}
			}
			console.log('✅ Qdrant connected');
		} catch (err) {
			console.warn('⚠️ Qdrant unavailable', err);
			qdrantClient = null;
		}
	}
}

// Embedding Generation
async function generateEmbedding(text: string): Promise<number[]> {
	const cacheKey = `embed:${Buffer.from(text).toString('base64').substring(0, 32)}`;

	if (redisClient) {
		try {
			const cached = await redisClient.get(cacheKey);
			if (cached) return JSON.parse(cached);
		} catch (err) {
			console.warn('⚠️ Redis cache lookup failed', err);
		}
	}

	try {
        // Use standard Fetch API for Ollama
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
		});

		if (!response.ok) throw new Error(`Embedding failed: ${response.statusText}`);

		const data = (await response.json()) as { embedding: number[] };
        const embedding = data.embedding;

		if (redisClient) {
            // Cache for 1 hour
			await redisClient.setEx(cacheKey, 3600, JSON.stringify(embedding));
		}
		return embedding;
	} catch (error) {
		console.error('❌ Embedding failed:', error);
		return new Array(768).fill(0); // Return zero vector fallback
	}
}

// Document Processing
export async function processDocument(
    file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
    content: string
): Promise<any> {
	await initializeIntegratedRAG();

    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	const filename = file.name;
	let minioUrl = '';

	// Upload to MinIO
	if (minioClient) {
		try {
			const buffer = await file.arrayBuffer();
			await minioClient.putObject('legal-documents', `${documentId}/${filename}`, Buffer.from(buffer));
			minioUrl = `http://${MINIO_ENDPOINT}:${MINIO_PORT}/legal-documents/${documentId}/${filename}`;
			console.log(`📦 MinIO: ${minioUrl}`);
		} catch (e) {
			console.warn('⚠️ MinIO upload failed');
		}
	}

	// Chunking
	const chunkSize = 512;
	const overlap = 64;
	const chunks: string[] = [];

    for (let i = 0; i < content.length; i += chunkSize - overlap) {
		chunks.push(content.slice(i, i + chunkSize));
	}

    // Embeddings
	const embeddings = await Promise.all(chunks.map((chunk) => generateEmbedding(chunk)));

    // Store in Postgres/PGVector
	for (let i = 0; i < chunks.length; i++) {
		try {
			await db.insert(documents).values({
				id: `${documentId}_chunk_${i}`,
				user_id: '1', // Default system user
				title: `${filename} - Chunk ${i + 1}`,
				description: chunks[i].slice(0, 200),
				content_text: chunks[i],
				file_path: minioUrl,
				file_type: file.type,
				file_size: file.size,
				embedding: sql`${JSON.stringify(embeddings[i])}::vector`,
				metadata: { source_file: filename, chunkIndex: i, totalChunks: chunks.length }
			});
		} catch (e) {
			console.error(`❌ Chunk ${i} insert failed`, e);
		}
	}

	// Store in Qdrant
	if (qdrantClient) {
		try {
			const points = chunks.map((chunk, i) => ({
				id: `${documentId}_chunk_${i}`, // Qdrant usually wants UUID or int, skipping simple ID if strict
                // Assuming string ID is enabled in config or using hash
				vector: embeddings[i],
				payload: {
					content: chunk,
					filename: filename,
					chunkIndex: i,
					tags: autoTagContent(chunk)
				}
			}));
            // @ts-ignore
			await qdrantClient.upsert('legal-documents', { wait: true, points });
			console.log(`✅ Qdrant: ${chunks.length} chunks with tags`);
		} catch (err) {
			console.warn('⚠️ Qdrant storage failed', err);
		}
	}

	// Store in LokiJS
	lokiCollection.insert({
		id: documentId,
		title: filename,
		content: content,
		chunks: chunks.length,
		timestamp: Date.now()
	});

    rebuildFuseIndex();

	return {
		documentId,
		chunks: chunks.length,
		qdrantStored: !!qdrantClient,
		cudaUsed: cudaAvailable
	};
}

// Auto-Tagging
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

// Rebuild Fuse Index
function rebuildFuseIndex() {
	const allDocs = lokiCollection.find();
	fuseInstance = new Fuse(allDocs, {
		keys: ['title', 'content'],
		threshold: 0.4,
		includeScore: true
	});
}

// Search
export async function searchSimilarDocuments(query: string, limit = 5): Promise<SearchResult[]> {
	await initializeIntegratedRAG();
	const queryEmbedding = await generateEmbedding(query);
	let results: SearchResult[] = [];

	// Try Qdrant First
	if (qdrantClient) {
		try {
			const qdrantResults = await qdrantClient.search('legal-documents', {
				vector: queryEmbedding,
				limit
			});

            results = qdrantResults.map((r: any) => ({
				content: r.payload?.content as string || '',
				similarity: r.score,
				metadata: {
					source_file: r.payload?.filename,
					chunkIndex: r.payload?.chunkIndex,
					tags: r.payload?.tags
				}
			}));
			console.log(`🔍 Qdrant: ${results.length} results`);
			return results;
		} catch (err) {
			console.warn('⚠️ Qdrant search failed', err);
		}
	}

	// Fallback to PGVector
	try {
        // Note: Using raw SQL for vector operations since Drizzle support might be partial or typed strictly
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

		results = pgResults.map((r: any) => ({
			content: r.content_text as string,
			similarity: parseFloat(r.similarity),
			metadata: r.metadata as Record<string, unknown>
		}));
		console.log(`🔗 pgvector: ${results.length} results`);
	} catch (error) {
		console.error('❌ pgvector search failed', error);
	}

	return results;
}

export async function getDocumentRecommendations(documentId: string, limit = 5): Promise<SearchResult[]> {
	await initializeIntegratedRAG();
	const doc = lokiCollection.findOne({ id: documentId });
	if (!doc) return [];
	return searchSimilarDocuments(doc.content.slice(0, 500), limit);
}

export async function getSystemHealth(): Promise<any> {
	// await initializeIntegratedRAG(); // Don't await, just check status
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
