/**
 * Vector Operations Service
 * Provides embedding generation and vector similarity search using Ollama and pgvector
 */

import { getOllamaEndpoint } from '$lib/server/utils/endpoints';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { documentEmbeddings } from '$lib/server/db/schema-postgres';
import { createHash } from 'crypto';

// Hash utility for caching
function hashText(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

export interface EmbeddingResult {
	embedding: number[];
	success: boolean;
	model?: string;
	error?: string;
}

export interface VectorSearchResult {
	id: string;
	content: string;
	score: number;
	metadata?: Record<string, any>;
}

export interface VectorSearchOptions {
	limit?: number;
	threshold?: number;
	documentType?: string;
}

export class VectorOperationsService {
	/**
	 * Generate embedding using Ollama
	 */
	static async generateEmbedding(text: string): Promise<EmbeddingResult> {
		const model = process.env.EMBEDDING_MODEL ?? 'embeddinggemma:latest';
		const ollamaUrl = getOllamaEndpoint();

		if (!text || text.trim().length === 0) {
			return { embedding: [], success: false, error: 'Input text cannot be empty' };
		}

		try {
			const response = await fetch(`${ollamaUrl}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, prompt: text })
			});

			if (!response.ok) {
				throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			if (!data.embedding || !Array.isArray(data.embedding)) {
				throw new Error('Invalid embedding response from Ollama');
			}

			return {
				embedding: data.embedding,
				success: true,
				model
			};
		} catch (error) {
			console.error('Embedding failed:', error);
			return {
				embedding: [],
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	/**
	 * Search for similar content using vector similarity
	 */
	static async searchSimilar(
		query: string,
		options: VectorSearchOptions = {}
	): Promise<VectorSearchResult[]> {
		try {
			const { limit = 10, threshold = 0.7 } = options;

			const queryEmbeddingResult = await this.generateEmbedding(query);
			if (!queryEmbeddingResult.success || !queryEmbeddingResult.embedding.length) {
				throw new Error(queryEmbeddingResult.error ?? 'Failed to generate query embedding');
			}

			const queryEmbedding = queryEmbeddingResult.embedding;
			const vectorStr = `'[${queryEmbedding.join(',')}]'::vector`;

			const results = await db
				.select({
					id: documentEmbeddings.id,
					content: documentEmbeddings.chunkText,
					score: sql<number>`1 - (${documentEmbeddings.embedding} <=> ${sql.raw(vectorStr)})`.as('score'),
					metadata: documentEmbeddings.metadata
				})
				.from(documentEmbeddings)
				.where(
					sql<boolean>`1 - (${documentEmbeddings.embedding} <=> ${sql.raw(vectorStr)}) > ${threshold}`
				)
				.orderBy(sql`score DESC`)
				.limit(limit);

			return results.map((row) => ({
				id: row.id,
				content: row.content ?? '',
				score: row.score,
				metadata: row.metadata ?? {}
			}));
		} catch (error) {
			console.error('Vector search error:', error);
			return [];
		}
	}

	/**
	 * Store document embedding in PostgreSQL
	 */
	static async storeDocumentEmbedding(
		documentId: string,
		content: string,
		embedding: number[],
		metadata?: Record<string, any>
	): Promise<boolean> {
		try {
			if (!embedding || embedding.length === 0) {
				throw new Error('Embedding vector cannot be empty');
			}

			const vectorStr = `'[${embedding.join(',')}]'::vector`;

			await db.insert(documentEmbeddings).values({
				documentId,
				documentType: metadata?.documentType ?? 'general',
				chunkText: content,
				embedding: sql`${sql.raw(vectorStr)}`,
				metadata: metadata ? JSON.stringify(metadata) : null,
				createdAt: new Date(),
				updatedAt: new Date()
			});

			return true;
		} catch (error) {
			console.error('Store error:', error);
			return false;
		}
	}

	/**
	 * Semantic search (alias for searchSimilar)
	 */
	static async semanticSearch(
		query: string,
		options: VectorSearchOptions = {}
	): Promise<VectorSearchResult[]> {
		return this.searchSimilar(query, options);
	}

	/**
	 * Store document and generate embedding
	 */
	static async storeDocument(
		documentId: string,
		content: string,
		documentType?: string,
		metadata: Record<string, any> = {}
	): Promise<string> {
		const embeddingResult = await this.generateEmbedding(content);
		if (embeddingResult.success && embeddingResult.embedding.length) {
			await this.storeDocumentEmbedding(documentId, content, embeddingResult.embedding, {
				...metadata,
				documentType
			});
		}
		return documentId;
	}

	/**
	 * Analyze document (stub)
	 */
	static async analyzeDocument(
		documentId: string,
		analysisType: string
	): Promise<{ documentId: string; analysisType: string; result: string }> {
		console.warn('analyzeDocument is a stub');
		return { documentId, analysisType, result: 'mock_analysis_result' };
	}

	/**
	 * Find similar documents (stub)
	 */
	static async findSimilarDocuments(
		documentId: string,
		options: VectorSearchOptions = {}
	): Promise<VectorSearchResult[]> {
		console.warn('findSimilarDocuments is a stub');
		return [];
	}
}

export default VectorOperationsService;

