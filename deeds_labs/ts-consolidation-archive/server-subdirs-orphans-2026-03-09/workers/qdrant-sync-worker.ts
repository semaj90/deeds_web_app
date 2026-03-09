/**
 * Phase 90: Qdrant Sync Worker
 *
 * Two-stage pipeline:
 * Stage 1: Postgres → pgvector (embedding generation)
 * Stage 2: pgvector → Qdrant (vector index sync)
 *
 * This worker handles Stage 2 - keeping Qdrant in sync with pgvector
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
    getChunksPendingQdrantSync,
    markChunkQdrantError,
    markChunkQdrantSynced,
} from './phase90-helpers.js';
import type { DocumentChunk } from './schema-phase90-hardened.js';
import * as schema from './schema-phase90-hardened.js';

interface QdrantSyncConfig {
	qdrantUrl: string;
	batchSize: number;
	pollIntervalMs: number;
	retryAttempts: number;
}

const DEFAULT_CONFIG: QdrantSyncConfig = {
	qdrantUrl: process.env?.QDRANT_URL ?? 'http://localhost:6333',
	batchSize: 50,
	pollIntervalMs: 5000, // 5 seconds
	retryAttempts: 3,
};

/**
 * Qdrant Sync Worker
 *
 * Continuously syncs pgvector → Qdrant
 */
export class QdrantSyncWorker {
	private qdrant: QdrantClient;
	private db: PostgresJsDatabase<typeof schema>;
	private config: QdrantSyncConfig;
	private running = false;
	private stats = {
		synced: 0,
		errors: 0,
		lastSyncTime: 0,
	};

	constructor(config: Partial<QdrantSyncConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		this.qdrant = new QdrantClient({
			url: this.config.qdrantUrl,
		});

		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error('DATABASE_URL not configured');
		}

		const sql = postgres(connectionString);
		this.db = drizzle(sql, { schema });

		console.log('✅ QdrantSyncWorker initialized');
		console.log(`   Qdrant: ${this.config.qdrantUrl}`);
		console.log(`   Batch size: ${this.config.batchSize}`);
	}

	/**
	 * Ensure Qdrant collections exist with correct dimensions
	 */
	async ensureCollections(): Promise<void> {
		const collections = [
			{ name: 'legal_documents', dimension: 384 },
	{ name: 'legal_evidence', dimension: 384 },
	{ name: 'phase72_errors', dimension: 768 },
	];

		for (const { name, dimension } of collections) {
			try {
				await this.qdrant.getCollection(name);
				console.log(`✅ Collection "${name}" exists`);
			} catch (error) {
				console.log(`📦 Creating collection "${name}" (${dimension}d)`);
				await this.qdrant.createCollection(name, {
					vectors: {
	size: dimension,
						distance: 'Cosine',
					},
	optimizers_config: {
	default_segment_number: 2,
					},
	});
			}
		}
	}

	/**
	 * Sync a single chunk to Qdrant
	 */
	private async syncChunk(chunk: DocumentChunk): Promise<void> {
		if (!chunk.embedding) {
			throw new Error(`Chunk ${chunk.id} has no embedding`);
		}

		const collection = chunk.qdrantCollection ?? 'legal_documents';
		const pointId = chunk.qdrantPointId || chunk.id;

		// Prepare Qdrant point
		const point = {
			id: pointId,
			vector: chunk.embedding as number[],
			payload: {
				// Metadata for search filtering
				chunkId: chunk.id,
				documentId: chunk.documentId,
				caseId: chunk.caseId,
				chunkIndex: chunk.chunkIndex,
				content: chunk.content.substring(0, 1000), // Truncate for payload
				version: chunk.version,
				contentHash: chunk.contentHash,
				isActive: chunk.isActive,
				createdAt: chunk.createdAt?.toISOString(),
				updatedAt: chunk.updatedAt?.toISOString(),
				embeddingModel: chunk.embeddingModel,
			},
	};

		// Upsert to Qdrant
		await this.qdrant.upsert(collection, {
			wait: true,
			points: [point],
		});

		await markChunkQdrantSynced(this.db, chunk.id, pointId, collection);
	}

	/**
	 * Process a batch of pending chunks
	 */
	private async processBatch(): Promise<{
	synced: number, errors: number }> {
		const startTime = Date.now();

		// Get chunks pending sync
		const chunks = await getChunksPendingQdrantSync(this.db, this.config.batchSize);

		if (chunks.length === 0) {
			return { synced: 0, errors: 0 };
		}

		console.log(`📤 Syncing ${chunks.length} chunks to Qdrant...`);

		let synced = 0;
		let errors = 0;

		// Process chunks with retry logic
		for (const chunk of chunks) {
			let attempts = 0;
			let success = false;

			while (attempts < this.config.retryAttempts && !success) {
				try {
					await this.syncChunk(chunk);
					synced++;
					success = true;
				} catch (error) {
					attempts++;
					const errorMessage = error instanceof Error ? error.message : String(error);

					if (attempts >= this.config.retryAttempts) {
						console.error(
							`❌ Failed to sync chunk ${chunk.id} after ${attempts} attempts:`,
							errorMessage
						);
						await markChunkQdrantError(this.db, chunk.id, errorMessage);
						errors++;
					} else {
						console.warn(`⚠️ Retry ${attempts}/${this.config.retryAttempts} for chunk ${chunk.id}`);
						await new Promise((resolve) => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
					}
				}
			}
		}

		const duration = Date.now() - startTime;
		this.stats.synced += synced;
		this.stats.errors += errors;
		this.stats.lastSyncTime = duration;

		console.log(`✅ Batch complete: ${synced} synced, ${errors} errors (${duration}ms)`);

		return { synced, errors };
	}

	/**
	 * Start the sync worker
	 */
	async start(): Promise<void> {
		if (this.running) {
			console.warn('⚠️ Worker already running');
			return;
		}

		console.log('🚀 Starting Qdrant sync worker...');

		// Ensure collections exist
		await this.ensureCollections();

		this.running = true;

		// Main sync loop
		while (this.running) {
			try {
				await this.processBatch();
			} catch (error) {
				console.error('❌ Batch processing error:', error);
			}

			// Wait before next poll
			await new Promise((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
		}
	}

	/**
	 * Stop the worker
	 */
	stop(): void {
		console.log('🛑 Stopping Qdrant sync worker...');
		this.running = false;
	}

	/**
	 * Get worker stats
	 */
	getStats() {
		return {
			...this.stats,
			running: this.running,
		};
	}

	/**
	 * Force sync all pending chunks (one-time operation)
	 */
	async syncAll(): Promise<{
	synced: number, errors: number }> {
		console.log('🔄 Force syncing all pending chunks...');

		let totalSynced = 0;
		let totalErrors = 0;

		while (true) {
			const { synced, errors } = await this.processBatch();

			totalSynced += synced;
			totalErrors += errors;

			if (synced === 0) {
				break; // No more chunks to sync
			}
		}

		console.log(`✅ Force sync complete: ${totalSynced} synced, ${totalErrors} errors`);

		return { synced: totalSynced, errors: totalErrors };
	}
}

/**
 * CLI usage
 */
if (import.meta.url === `file://${process.argv[1]}`) {
 const worker = new QdrantSyncWorker();

 const command = process.argv[2];

 if (command === 'once') {
 // Run once and exit
 worker
 .syncAll()
 .then(({ synced, errors }) => {
 console.log(`\n📊 Final stats: ${synced} synced, ${errors} errors`);
 process.exit(errors > 0 ? 1 : 0);
 })
 .catch((error) => {
 console.error('❌ Fatal error:', error);
 process.exit(1);
 });
 } else {
 // Continuous mode
 worker.start().catch((error) => {
 console.error('❌ Fatal error:', error);
 process.exit(1);
 });

 process.on('SIGINT', () => {
 console.log('\n📊 Final stats:', worker.getStats());
 worker.stop();
 process.exit(0);
 });
 }
}

export default QdrantSyncWorker;





