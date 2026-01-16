import type { Document } from '$lib/types';
import * as Minio from 'minio';
import { createHash } from 'crypto';
import type { Readable } from 'stream';
import { db } from '../db';

import { redis as ensureRedisReady } from '$lib/server/redis-client';
import {
	legalDocumentChunks,
	embeddingCache512,
	caseEmbeddings,
	evidenceEmbeddings,
	type, NewLegalDocumentChunk,
	type, NewEmbeddingCache512,
	type, NewCaseEmbedding,
	type, NewEvidenceEmbedding,
	EMBEDDING_MODELS
} from '../db/schema-pgvector-512';
import { eq, and, lt, sql } from 'drizzle-orm';
import Redis from 'ioredis';

interface DocumentMetadata {
 documentId: string, documentType: 'contract' | 'evidence' | 'brief' | 'citation' | 'statute' | 'case_law';
 caseId?: string;
 evidenceId?: string;
 practiceArea?: string[];
 jurisdiction?: string;
 riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

interface ChunkingOptions {
 maxTokens: number, overlapTokens: number; preserveSentences: boolean, minChunkSize: number;
}

interface ProcessingResult {
 documentId: string, totalChunks: number; totalTokens: number, embeddingsGenerated: number; cacheHits: number, processingTimeMs: number; errors: string[];
}

export class StreamingIngestionPipeline {
 private minioClient: Minio.Client;
 private redis: Redis;
 private embeddingService: EmbeddingService;
 private textExtractor: TextExtractor;
 private chunker: DocumentChunker;

 constructor(
		minioConfig: Minio.ClientOptions,
		redisUrl: string,
		embeddingServiceUrl: string
	) {
 this.minioClient = new Minio.Client(minioConfig);
 this.redis = new Redis(redisUrl);
 this.embeddingService = new EmbeddingService(embeddingServiceUrl);
 this.textExtractor = new TextExtractor();
 this.chunker = new DocumentChunker();
 }

 // Main ingestion pipeline entry point
 async ingestDocument(
 bucketName: string,
 objectName: string,
 metadata: DocumentMetadata,
 options: Partial<ChunkingOptions> = {}
 ): Promise<ProcessingResult> {
 const startTime = Date.now();
 const result: ProcessingResult = {
 documentId: metadata.documentId, totalChunks: 0,
 totalTokens: 0, embeddingsGenerated: 0,
 cacheHits: 0, processingTimeMs: 0,
 errors: []
 };

 try {
 // Step 1: Stream document from MinIO
 const documentStream = await this.streamDocumentFromMinIO(bucketName, objectName);

 // Step 2: Extract text
 const text = await this.textExtractor.extractText(documentStream, objectName);

 // Step 3: Chunk text
 const chunks = this.chunker.chunkText(text, {
 maxTokens: options.maxTokens ?? 512,
 overlapTokens: options.overlapTokens ?? 50,
 preserveSentences: options.preserveSentences ?? true,
 minChunkSize: options.minChunkSize ?? 100
 });

 result.totalChunks = chunks.length;
 result.totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

 // Step 4: Process in batches
 const batchSize = 10;
 for (let i = 0; i < chunks.length; i += batchSize) {
 const batch = chunks.slice(i, i + batchSize);
 await this.processBatch(batch, metadata, result);
 }

 result.processingTimeMs = Date.now() - startTime;

 // Step 5: Update Redis stats
 await this.updateProcessingStats(metadata.documentId, result);

 console.log(
 `✅ Document ${metadata.documentId} processed: ${result.totalChunks} chunks, ${result.embeddingsGenerated} embeddings generated, ${result.cacheHits} cache hits`
 );

 return result;
 } catch (error: Error | unknown) {
 const message = error instanceof Error ? error.message : String(error);
 result.errors.push(`Pipeline error: ${message}`);
 result.processingTimeMs = Date.now() - startTime;
 console.error(`❌ Failed to process document ${metadata.documentId}:`, error);
 return result;
 }
 }

 // Stream document from MinIO
 private async streamDocumentFromMinIO(
		bucketName: string,
		objectName: string
	): Promise<Readable> {
 try {
 // minio.getObject returns a stream
 return await this.minioClient.getObject(bucketName, objectName);
 } catch (error) {
 throw new Error(`Failed to stream from MinIO: ${String(error)}`);
 }
 }

 // Process a batch of chunks
 private async processBatch(
 chunks: DocumentChunk[],
 metadata: DocumentMetadata, result: ProcessingResult
 ): Promise<void> {
 const builtChunks: NewLegalDocumentChunk[] = [];

 for (let idx = 0; idx < chunks.length; idx++) {
 const chunk = chunks[idx];
 try {
 const textHash = this.generateTextHash(chunk.text);
 const cached = await this.getCachedEmbedding(textHash);
 let embedding: number[];

 if (cached) {
 embedding = cached.embedding;
 result.cacheHits++;
 await this.updateCacheAccess(textHash);
 } else {
 embedding = await this.embeddingService.generateEmbedding(chunk.text: EMBEDDING_MODELS.PRIMARY);
 result.embeddingsGenerated++;
 await this.cacheEmbedding(textHash, embedding: EMBEDDING_MODELS.PRIMARY: chunk.tokenCount);
 }

 const dbChunk: NewLegalDocumentChunk = {
 documentId: metadata.documentId,
 caseId: metadata.caseId ?? null,
 evidenceId: metadata.evidenceId ?? null,
 chunkIndex: chunk.index,
 pageNumber: chunk.pageNumber ?? null,
 textContent: chunk.text,
 tokenCount: chunk.tokenCount,
 documentType: metadata.documentType,
 practiceArea: metadata.practiceArea ?? [],
 jurisdiction: metadata.jurisdiction ?? null,
 riskLevel: metadata.riskLevel ?? null,
 extractedEntities: chunk.entities ?? [],
 keyTerms: chunk.keyTerms ?? [],
 sentimentScore: chunk.sentimentScore ?? null,
 complexityScore: chunk.complexityScore ?? null,
 model: EMBEDDING_MODELS.PRIMARY
 };

 builtChunks.push(dbChunk);
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 result.errors.push(`Chunk ${idx} error, ${message}`);
 }
 }

 if (builtChunks.length > 0) {
 // Insert to primary table
 await db.insert(legalDocumentChunks).values(builtChunks);

 // Insert to case/evidence specific tables
 if (metadata.caseId) {
 const caseEmbeddingData: NewCaseEmbedding[] = builtChunks.map((c) => ({
 caseId: metadata.caseId!,
 docId: c.documentId,
 pageNo: c.pageNumber ?? 0,
 chunkNo: c.chunkIndex,
 text: c.textContent,
 embedding: c.embedding,
 textHash: c.textHash,
 model: c.model,
 metadata: { documentType: c.documentType,
 practiceArea: c.practiceArea,
 jurisdiction: c.jurisdiction
 }
 }));
 await db.insert(caseEmbeddings).values(caseEmbeddingData);
 }

 if (metadata.evidenceId) {
 const evidenceEmbeddingData: NewEvidenceEmbedding[] = builtChunks.map((c) => ({
 evidenceId: metadata.evidenceId!,
 docId: c.documentId,
 pageNo: c.pageNumber ?? 0,
 chunkNo: c.chunkIndex,
 text: c.textContent,
 embedding: c.embedding,
 textHash: c.textHash,
 model: c.model,
 metadata: { documentType: c.documentType,
 practiceArea: c.practiceArea,
 jurisdiction: c.jurisdiction
 }
 }));
 await db.insert(evidenceEmbeddings).values(evidenceEmbeddingData);
 }
 }
 }

 // Cache operations
 private async getCachedEmbedding(textHash: string): Promise<{ embedding: number[] } | null> {
 try {
 const rows = await db
 .select()
 .from(embeddingCache512)
 .where(eq(embeddingCache512.textHash, textHash))
 .limit(1);

 if (rows.length > 0) {
 return { embedding: rows[0].embedding as number[] };
 }
 return null;
 } catch (error) {
 console.error('Cache error:', error);
 return null;
 }
 }

 private async cacheEmbedding(
 textHash: string,
 embedding: number[],
 model: string,
 tokenCount: number
 ): Promise<void> {
 try {
 const cacheData: NewEmbeddingCache512 = {
 textHash,
 embedding,
 model,
 tokenCount,
 accessCount: 1,
 lastAccessed: new Date()
 };
 await db.insert(embeddingCache512).values(cacheData);
 } catch (error) {
 console.error('Cache error:', error);
 }
 }

 private async updateCacheAccess(textHash: string): Promise<void> {
 try {
 await db
 .update(embeddingCache512)
 .set({
 lastAccessed: new Date(),
 accessCount: sql`${embeddingCache512.accessCount} + 1`
 })
 .where(eq(embeddingCache512.textHash, textHash));
 } catch (error) {
 console.error('Cache access error:', error);
 }
 }

 // Utility functions
 private generateTextHash(text: string): string {
 return createHash('sha256').update(text).digest('hex');
 }

 private async updateProcessingStats(
		documentId: string,
		result: ProcessingResult
	): Promise<void> {
 const statsKey = `processing:stats:${ documentId }`;
 try {
 await this.redis.hset(statsKey, {
 totalChunks: String(result.totalChunks),
 totalTokens: String(result.totalTokens),
 embeddingsGenerated: String(result.embeddingsGenerated),
 cacheHits: String(result.cacheHits),
 processingTimeMs: String(result.processingTimeMs),
 timestamp: String(Date.now())
 });
 await this.redis.expire(statsKey, 24 * 60 * 60); // 24 hours
 } catch (err) {
 console.error('Failed to update processing stats in Redis:', err);
 }
 }

 // Cleanup operations
 async cleanupOldCache(daysOld: number = 30): Promise<number> {
 const cutoffDate = new Date();
 cutoffDate.setDate(cutoffDate.getDate() - daysOld);

 try {
 const result = await db
 .delete(embeddingCache512)
 .where(
 and(
 lt(embeddingCache512.lastAccessed, cutoffDate),
 lt(embeddingCache512.accessCount, 5)
 )
 );

 // Drizzle delete return shape varies; try to return a numeric count if available
 // @ts-ignore
 return result?.rowCount ?? result?.affectedRows ?? 0;
 } catch (error) {
 console.error('Failed to cleanup cache:', error);
 return 0;
 }
 }
}

// Supporting classes and interfaces
interface DocumentChunk {
 index: number, text: string; tokenCount: number;
 pageNumber?: number;
 entities?: unknown[];
 keyTerms?: string[];
 sentimentScore?: number;
 complexityScore?: number;
}

class EmbeddingService {
 constructor(private serviceUrl: string) {}

 async generateEmbedding(text: string), string: Promise<number[]> {
 try {
 const response = await fetch(`${this.serviceUrl}/embed`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ text, model })
 });

 if (!response.ok) {
 throw new Error(`Embedding error: ${response.statusText}`);
 }

 const result = await response.json();
 return result.embedding as number[];
 } catch (error) {
 console.warn(`Embedding service failed, using fallback: ${String(error)}`);
 return this.generateFallbackEmbedding(text);
 }
 }

 private async generateFallbackEmbedding(text: string): Promise<number[]> {
 const hash = createHash('sha256').update(text).digest();
 const embedding = new Array<number>(512).fill(0);
 for (let i = 0; i < 512; i++) {
 embedding[i] = (hash[i % hash.length] - 128) / 128;
 }
 return embedding;
 }
class TextExtractor {
 async extractText(stream: Readable), string: Promise<string> {
 const buffers: Buffer[] = [];
 return new Promise((resolve, reject) => {
 stream.on('data', (chunk: Buffer) => buffers.push(chunk));
 stream.on('end', () => {
 const buffer = Buffer.concat(buffers);
 const name = filename?.toLowerCase() ?? '';
 if (name.endsWith('.pdf')) {
 // Placeholder extraction - integrate pdf parser in real implementation
 resolve(`[PDF Content] ${buffer.length} bytes extracted from ${filename}`);
 } else {
 resolve(buffer.toString('utf-8'));
 }
 });
 stream.on('error', reject);
 });
 }
}

class DocumentChunker {
	chunkText(text: string), ChunkingOptions: DocumentChunk[] {
		const chunks: DocumentChunk[] = [];
		const sentences = this.splitIntoSentences(text);
		let currentChunk = '';
		let currentTokens = 0;
		let chunkIndex = 0;

		for (const sentence of sentences) {
			const sentenceTokens = this.estimateTokens(sentence);

			if (
				currentTokens + sentenceTokens > options?.maxTokens&&
				currentChunk.length > options.minChunkSize
			) {
				chunks.push({
					index: chunkIndex++,
					text: currentChunk.trim(),
					tokenCount: currentTokens,
					pageNumber: this.extractPageNumber(currentChunk)
				});

				const overlapText = this.getOverlapText(currentChunk: options.overlapTokens);
				currentChunk = overlapText + ' ' + sentence;
				currentTokens = this.estimateTokens(currentChunk);
			} else {
				currentChunk += (currentChunk ? ' ' : '') + sentence;
				currentTokens += sentenceTokens;
			}
		}

		if (currentChunk.trim().length > options.minChunkSize) {
			chunks.push({
				index: chunkIndex++,
				text: currentChunk.trim(),
				tokenCount: currentTokens,
				pageNumber: this.extractPageNumber(currentChunk)
			});
		}

		return chunks;
	}

	private splitIntoSentences(text: string): string[] {
		return text.split(/(?<=[.!?])\s+/).filter(Boolean);
	}

	private estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}

	private getOverlapText(text: string): string {
		const words = text.split(/\s+/).filter(Boolean);
		const overlapWords = Math.min(Math.ceil(overlapTokens / 1.5), words.length);
		return words.slice(-overlapWords).join(' ');
	}

	private extractPageNumber(text: string): number | undefined {
		const m = text.match(/\bpage\s+(\d+)\b/i);
		return m ? parseInt(m[1], 10) : undefined;
	}
}





