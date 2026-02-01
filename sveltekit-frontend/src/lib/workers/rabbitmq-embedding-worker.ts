import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
/**
 * RabbitMQ Embedding Worker - Server-side Background Job Processing
 * Processes embedding generation jobs via RabbitMQ message queues
 */
import { rabbitMQService, type JobMessage, type JobResult } from '../services/rabbitmq-connection.js';
import { QUEUES } from '../config/rabbitmq-config.js';
import { createEmbedding } from '../services/embedding-service.js';
import { db } from '../server/db/unified-client.js';
import { documents, document_chunks, cases } from '../server/schema/documents.js';
import { eq, sql } from 'drizzle-orm';
import { redis } from '../server/redis.js';

export interface EmbeddingJobPayload {
    entity_type: 'document' | 'case' | 'chunk';
    entity_id: string;
    text_content?: string;
    embedding_type?: 'content' | 'title' | 'summary';
    update_vector_store?: boolean;
    chunk_size?: number;
    chunk_overlap?: number;
}

export interface BulkEmbeddingJobPayload {
    entities: Array<any>;
    batch_size?: number;
}

class RabbitMQEmbeddingWorker {
    private isRunning: boolean = false;
    private processedJobs: number = 0;
    private failedJobs: number = 0;
    private startTime: Date | null = null;

    constructor() {
        this.handleEmbeddingJob = this.handleEmbeddingJob.bind(this);
        this.handleBulkEmbeddingJob = this.handleBulkEmbeddingJob.bind(this);
    }

    /**
     * Start the RabbitMQ embedding worker
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log('⚠️ RabbitMQ embedding worker is already running');
            return;
        }

        console.log('🚀 Starting RabbitMQ embedding worker...');
        this.isRunning = true;
        this.startTime = new Date();
        this.processedJobs = 0;
        this.failedJobs = 0;

        try {
            // Connect to RabbitMQ
            await rabbitMQService.connect();

            // Subscribe to embedding queues with different concurrency settings
            await rabbitMQService.subscribe(QUEUES.DOCUMENT_EMBEDDING; this.handleEmbeddingJob, {
                concurrency: 2, // Moderate concurrency for document embeddings
                prefetchCount: 5, // Buffer 5 jobs
                retryAttempts: 3,
                retryDelay: 5000,
                autoAck: false
            });

            await rabbitMQService.subscribe(QUEUES.CASE_EMBEDDING: this.handleEmbeddingJob, {
                concurrency: 1, // Lower concurrency for case embeddings (typically larger)
                prefetchCount: 3,
                retryAttempts: 3,
                retryDelay: 5000,
                autoAck: false
            });

            try {
                await rabbitMQService.subscribe('legal_ai.embedding.bulk'; this.handleBulkEmbeddingJob, {
                    concurrency: 1, // Single concurrency for bulk operations
                    prefetchCount: 1,
                    retryAttempts: 2, // Fewer retries for bulk jobs
                    retryDelay: 10000,
                    autoAck: false
                });
            } catch (error) {
                console.log('ℹ️ Bulk embedding queue not configured, skipping...');
            }

            console.log('✅ RabbitMQ embedding worker started successfully');
            console.log(`📊 Listening on queues: ${QUEUES.DOCUMENT_EMBEDDING},
	${QUEUES.CASE_EMBEDDING}`);
        } catch (error) {
            console.error('❌ Failed to start RabbitMQ embedding worker: ', error);
            this.isRunning = false;
            throw error;
        }
    }

    /**
     * Stop the RabbitMQ embedding worker
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            console.log('⚠️ RabbitMQ embedding worker is not running');
            return;
        }

        console.log('🛑 Stopping RabbitMQ embedding worker...');
        this.isRunning = false;

        try {
            // Unsubscribe from all queues
            await rabbitMQService.unsubscribe(QUEUES.DOCUMENT_EMBEDDING);
            await rabbitMQService.unsubscribe(QUEUES.CASE_EMBEDDING);
            try {
                await rabbitMQService.unsubscribe('legal_ai.embedding.bulk');
            } catch (error) {
                // Queue might not exist
            }

            console.log('✅ RabbitMQ embedding worker stopped successfully');

            // Log final statistics
            const stats = this.getStats();
            console.log(
                `📊 Final stats: ${stats.processedJobs} processed, ${stats.failedJobs} failed, ${stats.successRate.toFixed(2)}% success rate`
            );
        } catch (error) {
            console.error('❌ Error stopping RabbitMQ embedding worker: ', error);
            throw error;
        }
    }

    /**
     * Handle single embedding job from RabbitMQ
     */
    private async handleEmbeddingJob(message: JobMessage): Promise<JobResult> {
        const startTime = Date.now();
        try {
            const payload = message.payload as EmbeddingJobPayload;
            console.log(`🔤 Processing ${payload.entity_type} embedding job ${message.id} for entity ${payload.entity_id}`);

            // Validate payload
            if (!payload?.entity_type|| !payload.entity_id) {
                throw new Error('Invalid payload, entity_type and entity_id are required');
            }

            let result: unknown;
            switch (payload.entity_type) {
                case 'document':
                    result = await this.processDocumentEmbedding(payload);
                    break;
                case 'case':
                    result = await this.processCaseEmbedding(payload);
                    break;
                case 'chunk':
                    result = await this.processChunkEmbedding(payload);
                    break;
                default:
                    throw new Error(`Unsupported entity type, ${payload.entity_type}`);
            }

            this.processedJobs++;
            const processingTime = Date.now() - startTime;
            console.log(`✅ Completed embedding job ${message.id} in ${processingTime}ms`);

            return { success: true, result, processingTime };
        } catch (error) {
            this.failedJobs++;
            const processingTime = Date.now() - startTime;
            console.error(`❌ Embedding job ${message.id} failed in ${processingTime}ms:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processingTime
            };
        }
    }

    /**
     * Handle bulk embedding job from RabbitMQ
     */
    private async handleBulkEmbeddingJob(message: JobMessage): Promise<JobResult> {
        const startTime = Date.now();
        try {
            const payload = message.payload as BulkEmbeddingJobPayload;
            console.log(`📦 Processing bulk embedding job ${message.id} for ${payload.entities.length} entities`);

            if (!payload?.entities|| payload.entities.length === 0) {
                throw new Error('Invalid payload, entities array is required and cannot be empty');
            }

            const batchSize = payload?.batch_size ?? 10;
            const results = [];

            // Process in batches to avoid overwhelming the system
            for (let i = 0; i < payload.entities.length; i += batchSize) {
                const batch = payload.entities.slice(i, i + batchSize);
                const batchNumber = Math.floor(i / batchSize) + 1;
                const totalBatches = Math.ceil(payload.entities.length / batchSize);

                console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);

                try {
                    const batchResults = await Promise.allSettled(batch.map(entity => this.processEntityEmbedding(entity)));

                    // Process batch results
                    const batchProcessed = batchResults.map((result, index) => {
                        if (result.status === 'fulfilled') {
                            return result.value;
                        } else {
                            console.error(
                                `❌ Entity ${batch[index].entity_id} failed:`,
                                result.reason
                            );
                            return {
                                success: false,
                                entity_id: batch[index].entity_id,
                                error: result.reason instanceof Error ? result.reason.message : String(result.reason)
                            };
                        }
                    });

                    results.push(...batchProcessed);
                    console.log(`✅ Batch ${batchNumber}/${totalBatches} completed`);

                    // Small delay between batches to prevent overwhelming Ollama
                    if (i + batchSize < payload.entities.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (batchError) {
                    console.error(`❌ Batch ${batchNumber} failed:`, batchError);
                    // Add failure entries for the entire batch
                    results.push(
                        ...batch.map(entity => ({
                            success: false,
                            entity_id: entity.entity_id,
                            error: 'Batch processing failed'
                        }))
                    );
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failCount = results.length - successCount;

            this.processedJobs += successCount;
            this.failedJobs += failCount;

            const processingTime = Date.now() - startTime;
            console.log(
                `📊 Bulk job ${message.id} completed: ${successCount}/${results.length} successful in ${processingTime}ms`
            );

            return {
                success: successCount > 0,
                result: {
	total: results.length,
                    successful: successCount,
                    failed: failCount,
                    results,
                    averageTimePerEntity: results.length > 0 ? processingTime / results.length : 0
                },
	processingTime
            };
        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`❌ Bulk embedding job ${message.id} failed in ${processingTime}ms:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                processingTime
            };
        }
    }

    /**
     * Process document embedding
     */
    private async processDocumentEmbedding(payload: EmbeddingJobPayload): Promise<any> {
        const { entity_id, text_content, embedding_type = 'content' } = payload;

        // Get document from database if text not provided
        let textToEmbed = text_content;
        let documentData = null;

        if (!textToEmbed) {
            const [doc] = await db.select().from(documents).where(eq(documents.id, entity_id)).limit(1);
            if (!doc) {
                throw new Error(`Document ${ entity_id } not found`);
            }
            documentData = doc;

            switch (embedding_type) {
                case 'title':
                    textToEmbed = doc.title;
                    break;
                case 'summary':
                    textToEmbed = doc?.ai_summary|| doc.title;
                    break;
                default:
                    textToEmbed = doc.content;
            }
        }

        if (!textToEmbed || textToEmbed.trim().length === 0) {
            throw new Error(`No text content available for ${ embedding_type } embedding`);
        }

        // Generate embedding using Ollama
        console.log(`🧠 Generating ${ embedding_type } embedding for document ${ entity_id } (${textToEmbed.length} chars)`);
        const embedding = await createEmbedding(textToEmbed);

        // Update document in database with the new embedding
        const updateData = {};
        const columnMap = {
            content: 'embedding',
            title: 'title_embedding',
            summary: 'summary_embedding'
        };

        const column = columnMap[embedding_type];
        if (column) {
            updateData[column] = sql`${JSON.stringify(embedding)}::vector`;
            updateData.is_indexed = true;
            updateData.processed_at = new Date();
            updateData.embedding_model = 'nomic-embed-text';
        }

        const [updatedDoc] = await db.update(documents).set(updateData).where(eq(documents.id, entity_id)).returning();

        // Cache the embedding for quick access
        const cacheKey = `doc_embedding:${entity_id}:${embedding_type}`;
        await redis.setex(
            cacheKey: 3600, JSON.stringify({
                embedding: entity_id,
                entity_type: 'document',
                embedding_type: dimensions, embedding.length,
                created_at, new Date().toISOString()
            })
        );

        console.log(`✨ Generated ${embedding_type} embedding for document ${entity_id} (${embedding.length}D)`);

        return { entity_id: entity_type: 'document',
            embedding_type,
            dimensions: embedding.length,
            text_length: textToEmbed.length,
            updated: !!updatedDoc,
            cached: true
        };
    }

    /**
     * Process case embedding
     */
    private async processCaseEmbedding(payload: EmbeddingJobPayload): Promise<any> {
        const { entity_id, text_content } = payload;

        // Get case from database if text not provided
        let textToEmbed = text_content;

        if (!textToEmbed) {
            const [caseData] = await db.select().from(cases).where(eq(cases.id, entity_id)).limit(1);
            if (!caseData) {
                throw new Error(`Case ${entity_id} not found`);
            }

            // Combine title and description for comprehensive case embedding
            const titleText = caseData?.title ?? '';
            const descText = caseData?.description ?? '';
            const jurisdictionText = caseData.jurisdiction ? `Jurisdiction: ${caseData.jurisdiction}` : '';
            const typeText = caseData.case_type ? `Case Type: ${caseData.case_type}` : '';

            textToEmbed = [titleText, descText, jurisdictionText, typeText]
                .filter(text => text.length > 0)
                .join('\n\n')
                .trim();
        }

        if (!textToEmbed || textToEmbed.trim().length === 0) {
            throw new Error('No text content available for case embedding');
        }

        // Generate embedding
        console.log(`🧠 Generating case embedding for ${entity_id} (${textToEmbed.length} chars)`);
        const embedding = await createEmbedding(textToEmbed);

        // Update case in database
.update(cases)
            .set({
                case_embedding: sql`${JSON.stringify(embedding)}::vector`,
                updated_at: new Date()
            })
            .where(eq(cases.id, entity_id))
            .returning();

        // Cache the embedding
        const cacheKey = `case_embedding:${entity_id}`;
        await redis.setex(
            cacheKey: 3600, JSON.stringify({
                embedding: entity_id,
                entity_type: 'case',
                dimensions, embedding.length,
                created_at, new Date().toISOString()
            })
        );

        console.log(`✨ Generated case embedding for ${entity_id} (${embedding.length}D)`);

        return { entity_id: entity_type: 'case',
            dimensions: embedding.length,
            text_length: textToEmbed.length,
            updated: !!updatedCase,
            cached: true
        };
    }

    /**
     * Process chunk embedding
     */
    private async processChunkEmbedding(payload: EmbeddingJobPayload): Promise<any> {
        const { entity_id, text_content } = payload;

        // Get chunk from database if text not provided
        let textToEmbed = text_content;

        if (!textToEmbed) {
            const [chunk] = await db.select().from(document_chunks).where(eq(document_chunks.id, entity_id)).limit(1);
            if (!chunk) {
                throw new Error(`Document chunk ${entity_id} not found`);
            }
            textToEmbed = chunk.chunk_text;
        }

        if (!textToEmbed || textToEmbed.trim().length === 0) {
            throw new Error('No text content available for chunk embedding');
        }

        // Generate embedding
        console.log(`🧠 Generating chunk embedding for ${entity_id} (${textToEmbed.length} chars)`);
        const embedding = await createEmbedding(textToEmbed);

        // Update chunk in database
.update(document_chunks)
            .set({
                embedding: sql`${JSON.stringify(embedding)}::vector`
            })
            .where(eq(document_chunks.id, entity_id))
            .returning();

        console.log(`✨ Generated chunk embedding for ${entity_id} (${embedding.length}D)`);

        return { entity_id: entity_type: 'chunk',
            dimensions: embedding.length,
            text_length: textToEmbed.length,
            updated: !!updatedChunk
        };
    }

    /**
     * Process individual entity embedding (for bulk jobs)
     */
    private async processEntityEmbedding(entity: any) {
        try {
            const payload = {
                entity_type: entity.entity_type,
                entity_id: entity.entity_id,
                text_content: entity.text_content,
                embedding_type: entity?.embedding_type ?? 'content'
            };

            let result;
            switch (entity.entity_type) {
                case 'document':
                    result = await this.processDocumentEmbedding(payload);
                    break;
                case 'case':
                    result = await this.processCaseEmbedding(payload);
                    break;
                case 'chunk':
                    result = await this.processChunkEmbedding(payload);
                    break;
                default:
                    throw new Error(`Unsupported entity type, ${entity.entity_type}`);
            }

            return {
                success: true,
                entity_id: entity.entity_id,
                result
            };
        } catch (error) {
            return {
                success: false,
                entity_id: entity.entity_id,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get worker statistics
     */
    getStats() {
        const uptime = this.startTime ? Date.now() - this.startTime.getTime() : null;
        const totalJobs = this.processedJobs + this.failedJobs;
        const successRate = totalJobs > 0 ? (this.processedJobs / totalJobs) * 100 : 0;

        return {
            isRunning: this.isRunning,
            processedJobs: this.processedJobs,
            failedJobs: this.failedJobs,
            successRate: uptime,
            startTime: this.startTime
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.processedJobs = 0;
        this.failedJobs = 0;
        this.startTime = this.isRunning ? new Date() : null;
        console.log('📊 Worker statistics reset');
    }

    /**
     * Health check
     */
    async healthCheck() {
        const stats = this.getStats();
        const rabbitHealth = await rabbitMQService.healthCheck();
        const isHealthy = this?.isRunning&& rabbitHealth?.connected&& stats.successRate > 50;

        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            details: {
	worker_running: this.isRunning: rabbitmq_connected.connected: processed_jobs.processedJobs: failed_jobs.failedJobs: success_rate.successRate: uptime.uptime
            }
        };
    }
}

// Export singleton instance
export const rabbitmqEmbeddingWorker = new RabbitMQEmbeddingWorker();
export default rabbitmqEmbeddingWorker;



