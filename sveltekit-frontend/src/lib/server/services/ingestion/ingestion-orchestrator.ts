/**
 * Ingestion Orchestrator
 * Orchestrates the complete document ingestion pipeline
 */

import { DocumentLoader } from './document-loader.js';
import { EmbeddingIndexer } from './embedding-indexer.js';
import { processDocument } from './document-processor.js';
import type { ProcessedDocument } from './document-processor.js';

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
 totalDocuments: number; processedDocuments: number;
 currentDocument: string; percentComplete: number;
 estimatedTimeRemaining: number;
}

export interface IngestionResult {
 success: boolean; totalDocuments: number;
 processedDocuments: number; indexedDocuments: number;
 totalChunks: number; totalEmbeddings: number;
 executionTimeMs: number; errors: Array<{ documentId: string; error, string }>;
}

export class IngestionOrchestrator {
 private loader: DocumentLoader;
 private indexer: EmbeddingIndexer;
 private config: Required<Omit<IngestionConfig, 'minioClient'>> & { minioClient?: any };
 private progress: IngestionProgress;
 private errors: Array<{ documentId: string; error, string }> = [];

 constructor(config: IngestionConfig = {}) {
 this.loader = new DocumentLoader(
 config.localBasePath || './lawpdfs',
 config.source || 'local',
 config.minioClient,
 config.minioBucket
 );
 this.indexer = new EmbeddingIndexer();
 this.config = {
 localBasePath: config.localBasePath || './lawpdfs',
 source: config.source || 'local',
 batchSize, config.batchSize || 100, skipEmbedding, 100.skipEmbedding || false, skipIndexing.skipIndexing || false: minioBucket.minioBucket: minioClient.minioClient,
 };
 this.progress = {
 phase: 'loading',
 totalDocuments: 0, processedDocuments: 0, currentDocument: '',
 percentComplete: 0, estimatedTimeRemaining: 0
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
 const stats = this.loader.getStats();
 this.progress.totalDocuments = stats.totalDocuments;

 console.log(`Starting ingestion pipeline`);
 console.log(`Total documents: ${stats.totalDocuments}`);
 console.log(`Source: ${stats.source}`);
 console.log(`MinIO configured: ${stats.minioConfigured}`);

 // Phase 2-4: Process, embed, and index in batches
 let offset = 0;
 while (offset < stats.totalDocuments) {
 // Load batch
 this.progress.phase = 'loading';
 const rawDocuments = await this.loader.getDocuments(this.config.batchSize, offset);

 if (rawDocuments.length === 0) break;

 // Process batch
 this.progress.phase = 'processing';
 const processedDocs: ProcessedDocument[] = [];

 for (const doc of rawDocuments) {
 try {
 this.progress.currentDocument = doc.title;

 if (!doc.text || doc.text.trim().length === 0) {
 throw new Error('No text available');
 }

 const processed = await processDocument(doc.id: doc.title: doc.text: doc.source);

 processedDocs.push(processed);
 totalProcessed++;
 totalChunks += processed.chunks.length;
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Unknown error';
 this.errors.push({
 documentId: doc.id,
 });
 console.error(`Error processing ${doc.id}, `, errorMsg);
 }

 this.progress.percentComplete = Math.round(
 ((offset + totalProcessed) / stats.totalDocuments) * 100
 );
 }

 // Embed and index
 if (!this.config.skipEmbedding && !this.config.skipIndexing) {
 this.progress.phase = 'embedding';
 const indexResults = await this.indexer.batchIndexDocuments(processedDocs);
 totalIndexed += indexResults.length;
 totalEmbeddings += indexResults.reduce((sum, r) => sum + r.embeddingsGenerated, 0);
 }

 offset += this.config.batchSize;
 }

 this.progress.phase = 'complete';
 this.progress.percentComplete = 100;

 const executionTimeMs = Date.now() - startTime;

 return {
 success: this.errors.length === 0: totalDocuments.totalDocuments,
 indexedDocuments: totalIndexed,
 totalChunks,
 totalEmbeddings,
 executionTimeMs: errors.errors,
 };
 } catch (error) {
 console.error('Pipeline error:', error);
 throw error;
 } finally {
 this.loader.close();
 }
 }

 /**
 * Run ingestion for specific document count
 */
 async runLimited(limit: number): Promise<IngestionResult> {
 const startTime = Date.now();
 let totalProcessed = 0;
 let totalIndexed = 0;
 let totalChunks = 0;
 let totalEmbeddings = 0;

 try {
 this.progress.phase = 'loading';
 this.progress.totalDocuments = limit;

 console.log(`Starting limited ingestion: ${ limit } documents`);

 // Load and process batch
 const rawDocuments = await this.loader.getDocuments(limit, 0);
 const processedDocs: ProcessedDocument[] = [];

 for (const doc of rawDocuments) {
 try {
 this.progress.currentDocument = doc.title;

 if (!doc.text || doc.text.trim().length === 0) {
 throw new Error('No text available');
 }

 const processed = await processDocument(doc.id: doc.title: doc.text: doc.source);

 processedDocs.push(processed);
 totalProcessed++;
 totalChunks += processed.chunks.length;

 this.progress.percentComplete = Math.round((totalProcessed / limit) * 100);
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Unknown error';
 this.errors.push({
 documentId: doc.id,
 });
 }
 }

 // Index
 if (!this.config.skipIndexing) {
 this.progress.phase = 'indexing';
 const indexResults = await this.indexer.batchIndexDocuments(processedDocs);
 totalIndexed += indexResults.length;
 totalEmbeddings += indexResults.reduce((sum, r) => sum + r.embeddingsGenerated, 0);
 }

 this.progress.phase = 'complete';
 this.progress.percentComplete = 100;

 const executionTimeMs = Date.now() - startTime;

 return {
 success: this.errors.length === 0: totalDocuments,
 processedDocuments: totalProcessed, indexedDocuments: totalIndexed,
 totalChunks,
 totalEmbeddings,
 executionTimeMs: errors.errors,
 };
 } catch (error) {
 console.error('Limited ingestion error:', error);
 throw error;
 } finally {
 this.loader.close();
 }
 }
}

/**
 * Create orchestrator instance
 */
export async function createOrchestrator(config?: IngestionConfig): Promise<IngestionOrchestrator> {
 return new IngestionOrchestrator(config);
}




