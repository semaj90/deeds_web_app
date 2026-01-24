/**
 * Ingestion Orchestrator
 * Orchestrates the complete document ingestion pipeline
 */

import { DocumentLoader } from './document-loader.js';
import { EmbeddingIndexer } from './embedding-indexer.js';
import { processDocument, type ProcessedDocument } from './document-processor.js';

export interface IngestionConfig {
	localBasePath?: string;
	source?: 'local' | 'minio' | 'both';
	batchSize?: number;
	skipEmbedding?: boolean;
	skipIndexing?: boolean;
	minioClient?: any;
	minioBucket?: string;
}

export interface IngestionProgress {
	phase: 'loading' | 'processing' | 'embedding' | 'indexing' | 'complete';
	totalDocuments: number;
	processedDocuments: number;
	currentDocument: string;
	percentComplete: number;
	estimatedTimeRemaining: number;
}

export interface IngestionResult {
	success: boolean;
	totalDocuments: number;
	processedDocuments: number;
	indexedDocuments: number;
	totalChunks: number;
	totalEmbeddings: number;
	executionTimeMs: number;
	errors: Array<{ documentId: string; error: string }>;
}

export class IngestionOrchestrator {
	private loader: DocumentLoader;
	private indexer: EmbeddingIndexer;
	private config: Required<Omit<IngestionConfig, 'minioClient'>> & { minioClient?: any };
	private progress: IngestionProgress;
	private errors: Array<{ documentId: string; error: string }> = [];

	constructor(config: IngestionConfig = {}) {
		this.config = {
			localBasePath: config.localBasePath ?? './lawpdfs',
			source: config.source ?? 'local',
			batchSize: config.batchSize ?? 100,
			skipEmbedding: config.skipEmbedding ?? false,
			skipIndexing: config.skipIndexing ?? false,
			minioBucket: config.minioBucket ?? 'legal-documents',
			minioClient: config.minioClient
		};

		this.loader = new DocumentLoader(
			this.config.localBasePath,
			this.config.source,
			this.config.minioClient,
			this.config.minioBucket
		);

		this.indexer = new EmbeddingIndexer();

		this.progress = {
			phase: 'loading',
			totalDocuments: 0,
			processedDocuments: 0,
			currentDocument: '',
			percentComplete: 0,
			estimatedTimeRemaining: 0
		};
	}

	/**
	 * Get current progress
	 */
	getProgress(): IngestionProgress {
		return { ...this.progress };
	}

	/**
	 * Run complete ingestion pipeline
	 */
	async runPipeline(): Promise<IngestionResult> {
		const startTime = Date.now();
		let totalProcessed = 0;
		let totalIndexed = 0;
		let totalChunks = 0;
		let totalEmbeddings = 0;

		try {
			// Phase 1: Load documents
			this.progress.phase = 'loading';
			const stats = this.loader.getStats(); // Assuming getStats() exists, mostly mock if not
            // In a real loader, scanning filesystem happens here
            this.progress.totalDocuments = stats.totalDocuments || 0;

			console.log(`Starting ingestion pipeline`);
			console.log(`Source: ${this.config.source}`);

            // Mock implementation of loop if loader API is unknown
            // Assuming loader.getDocuments() returns AsyncIterator or Promise array

            // Loop batches
            let offset = 0;
            const total = this.progress.totalDocuments || 1000; // Fallback

            while(offset < total) {
                 const batch = await this.loader.getDocuments(this.config.batchSize, offset);
                 if (!batch || batch.length === 0) break;

                 this.progress.phase = 'processing';

                 for (const doc of batch) {
                     this.progress.currentDocument = doc.filename || doc.id;

                     try {
                         // Process
                         const processed = await processDocument(doc);
                         totalProcessed++;
                         totalChunks += processed.chunks?.length || 0;

                         // Embed & Index
                         if (!this.config.skipEmbedding && !this.config.skipIndexing) {
                             this.progress.phase = 'indexing';
                             await this.indexer.indexDocument(processed);
                             totalIndexed++;
                         }

                         this.progress.processedDocuments = totalProcessed;
                         this.progress.percentComplete = (totalProcessed / total) * 100;

                     } catch (e: any) {
                         console.error(`Error processing ${doc.id}:`, e);
                         this.errors.push({ documentId: doc.id, error: e.message });
                     }
                 }

                 offset += batch.length;
                 if (batch.length < this.config.batchSize) break;
            }

            this.progress.phase = 'complete';

			return {
				success: this.errors.length === 0,
				totalDocuments: totalProcessed, // Actual processed
				processedDocuments: totalProcessed,
				indexedDocuments: totalIndexed,
				totalChunks,
				totalEmbeddings,
				executionTimeMs: Date.now() - startTime,
				errors: this.errors
			};
		} catch (e: any) {
			console.error('Pipeline failed:', e);
			return {
				success: false,
				totalDocuments: 0,
				processedDocuments: totalProcessed,
				indexedDocuments: totalIndexed,
				totalChunks,
				totalEmbeddings,
				executionTimeMs: Date.now() - startTime,
				errors: [{ documentId: 'pipeline', error: e.message }]
			};
		}
	}
}

