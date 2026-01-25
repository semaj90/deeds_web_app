/**
 * Embedding & Indexing Service
 * Generates embeddings and indexes documents in Qdrant + Elasticsearch
 */

import { getDualQdrantStrategy, type DualEmbedding } from '../qdrant/dual-collection-strategy.js';
import { getRedisJSONStore } from '../persistence/redis-json-schema.js';
import type { ProcessedDocument } from './document-processor.js';
// Removed DocumentChunk type alias if it was causing issues or not exported correctly

export interface IndexingResult {
	documentId: string;
	chunksIndexed: number;
	embeddingsGenerated: number;
	qdrantIndexed: number;
	elasticsearchIndexed: number;
	executionTimeMs: number;
}

export class EmbeddingIndexer {
	private qdrant = getDualQdrantStrategy();
	private redis = getRedisJSONStore();

	/**
	 * Generate embedding for text (using Ollama Gemma3)
	 */
	async generateEmbedding(text: string): Promise<number[]> {
		try {
			const response = await fetch(
				`${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/api/embeddings`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: process.env.OLLAMA_EMBEDDING_MODEL ?? 'embeddinggemma:latest',
						prompt: text
					})
				}
			);

			if (!response.ok) {
				throw new Error(`Ollama error: ${response.statusText}`);
			}

			const data = (await response.json()) as { embedding: number[] };
			return data.embedding;
		} catch (error) {
			console.error('Error generating embedding:', error);
			throw error;
		}
	}

	/**
	 * Index document chunks in Qdrant
	 */
	async indexInQdrant(document: ProcessedDocument): Promise<number> {
		const qdrant = await this.qdrant;
		let indexed = 0;

		for (const chunk of document.chunks) {
			try {
				// Generate embedding
				const embedding768 = await this.generateEmbedding(chunk.text);

				// Create dual embedding
				const dualEmbedding: DualEmbedding = {
					full768: embedding768,
					small256: embedding768.slice(0, 256)
				};

				// Prepare payload
				const payload = {
					statute_id: chunk.id,
					document_id: document.id,
					title: document.title,
					text: chunk.text,
					holding: chunk.holding,
					chunk_index: chunk.chunkIndex,
					token_count: chunk.tokenCount,
					source: document.source,
					year: document.metadata?.year,
					court: document.metadata?.court,
					keywords: document.metadata?.keywords || [],
					citations: document.citations.map((c) => c.text),
					som_cluster_id: -1,
					kmeans_label: 'Unclustered',
					cluster_confidence: 0.0,
					flagged_for_review: false,
					echo_hits: 0,
					cluster_version: 0
				};

				// Upsert to Qdrant
				await qdrant.upsertPoint(chunk.id, dualEmbedding, payload);
				indexed++;
			} catch (error) {
				console.error(`Error indexing chunk ${chunk.id}:`, error);
			}
		}

		return indexed;
	}

	/**
	 * Index document in Elasticsearch
	 */
	async indexInElasticsearch(document: ProcessedDocument): Promise<number> {
		try {
			const esUrl = process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200';

			for (const chunk of document.chunks) {
				const response = await fetch(`${esUrl}/legal_documents/_doc/${chunk.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						document_id: document.id,
						title: document.title,
						text: chunk.text,
						holding: chunk.holding,
						chunk_index: chunk.chunkIndex,
						source: document.source,
						year: document.metadata?.year,
						court: document.metadata?.court,
						keywords: document.metadata?.keywords,
						citations: document.citations.map((c) => c.text),
						indexed_at: new Date().toISOString()
					})
				});

				if (!response.ok) {
					console.warn(`Failed to index in Elasticsearch: ${response.statusText}`);
				}
			}

			return document.chunks.length;
		} catch (error) {
			console.error('Error indexing in Elasticsearch:', error);
			return 0;
		}
	}

	/**
	 * Index document in PostgreSQL (via API)
	 */
	async indexInPostgreSQL(document: ProcessedDocument): Promise<number> {
		try {
			const response = await fetch('/api/ingestion/store-document', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ document })
			});

			if (!response.ok) {
				console.warn(`Failed to index in PostgreSQL: ${response.statusText}`);
				return 0;
			}

			return document.chunks.length;
		} catch (error) {
			console.error('Error indexing in PostgreSQL:', error);
			return 0;
		}
	}

	/**
	 * Index complete document
	 */
	async indexDocument(document: ProcessedDocument): Promise<IndexingResult> {
		const startTime = Date.now();

		try {
			// Index in all systems
			const [qdrantCount, esCount, _pgCount] = await Promise.all([
				this.indexInQdrant(document),
				this.indexInElasticsearch(document),
				this.indexInPostgreSQL(document)
			]);

			const executionTimeMs = Date.now() - startTime;

			// Store metadata in Redis
			const redis = await this.redis;
			await redis.storeStatuteMetadata(document.id, {
				titleNumber: 0,
				section: document.id,
				fullCitation: document.title,
				heading: document.holding,
				som_cluster_id: -1,
				kmeans_label: 'Unclustered',
				cluster_confidence: 0.0,
				flagged_for_review: false,
				echo_hits: 0,
				cluster_version: 0
			});

			return {
				documentId: document.id,
				chunksIndexed: document.chunks.length,
				embeddingsGenerated: document.chunks.length,
				qdrantIndexed: qdrantCount,
				elasticsearchIndexed: esCount,
				executionTimeMs
			};
		} catch (error) {
			console.error(`Error indexing document ${document.id}:`, error);
			throw error;
		}
	}

	/**
	 * Batch index documents
	 */
	async batchIndexDocuments(documents: ProcessedDocument[]): Promise<IndexingResult[]> {
		const results: IndexingResult[] = [];

		for (const doc of documents) {
			try {
				const result = await this.indexDocument(doc);
				results.push(result);
			} catch (error) {
				console.error(`Error indexing document ${doc.id}:`, error);
			}
		}

		return results;
	}

	/**
	 * Get indexing statistics
	 */
	getIndexingStats(results: IndexingResult[]): {
		totalDocuments: number;
		totalChunks: number;
		totalEmbeddings: number;
		avgTimePerDocument: number;
		totalTimeMs: number;
	} {
		const totalChunks = results.reduce((sum, r) => sum + r.chunksIndexed, 0);
		const totalEmbeddings = results.reduce((sum, r) => sum + r.embeddingsGenerated, 0);
		const totalTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0);

		return {
			totalDocuments: results.length,
			totalChunks,
			totalEmbeddings,
			avgTimePerDocument: results.length > 0 ? totalTime / results.length : 0,
			totalTimeMs: totalTime
		};
	}
}

/**
 * Create embedding indexer instance
 */
export async function createEmbeddingIndexer(): Promise<EmbeddingIndexer> {
	return new EmbeddingIndexer();
}
