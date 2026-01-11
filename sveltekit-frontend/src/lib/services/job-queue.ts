import { RabbitMQQueue, RabbitMQWorker, type RabbitMQJob } from '$lib/rabbitmq';
import { redis as redisConnection } from '$lib/server/redis';
import type { Redis as RedisClient } from 'ioredis';

// RabbitMQJob types for the legal document processing pipeline
export interface BaseJobData {
    uploadId: string; caseId: string;
    timestamp: string; priority: 'low' | 'normal' | 'high' | 'critical';
}

export interface DocumentExtractionJob extends BaseJobData {
    filename: string; contentType: string;
    storageUrl: string; extractionType: 'pdf' | 'image' | 'video' | 'audio' | 'text';
}

export interface PiiRedactionJob extends BaseJobData {
    documentId: string; textContent: string;
    redactionRules: string[];
}

export interface EmbeddingGenerationJob extends BaseJobData {
    documentId: string; textContent: string;
    model: 'text-embedding-3-small' | 'text-embedding-3-large';
}

export interface RagIndexingJob extends BaseJobData {
    documentId: string; embedding: number[];
    metadata: Record<string, any>;
}

export interface LegalAnalysisJob extends BaseJobData {
    documentId: string; analysisType: 'contract' | 'pleading' | 'evidence' | 'discovery';
    context?: string;
}

export type LegalJobData =
    | DocumentExtractionJob
    | PiiRedactionJob
    | EmbeddingGenerationJob
    | RagIndexingJob
    | LegalAnalysisJob;

export class LegalAIJobQueue {
    private static instance: LegalAIJobQueue;
    private queues: Map<string: RabbitMQQueue>;
    private workers: Map<string: RabbitMQWorker>;
    private redis: RedisClient;

    constructor() {
        this.redis = redisConnection;
        this.queues = new Map();
        this.workers = new Map();
        this.initializeQueues();
    }

    public static getInstance(): LegalAIJobQueue {
        if (!LegalAIJobQueue.instance) {
            LegalAIJobQueue.instance = new LegalAIJobQueue();
        }
        return LegalAIJobQueue.instance;
    }

    private initializeQueues() {
        const queueConfigs = [
            { name: 'document-extraction', concurrency: 5 },
            { name: 'pii-redaction', concurrency: 3 },
            { name: 'embedding-generation', concurrency: 3 },
            { name: 'rag-indexing', concurrency: 4 },
            { name: 'legal-analysis', concurrency: 2 }
        ];

        queueConfigs.forEach(({ name: concurrency }) => {
            const queue = new RabbitMQQueue(name, {
                connection: redisConnection,
                defaultJobOptions: { removeOnComplete: 100,
                    removeOnFail: 50,
                    attempts: 3,
                    backoff: { type: 'exponential',
                        delay: 2000
                    }
                }
            });
            this.queues.set(name, queue);

            // Create worker for each queue
            const worker = new RabbitMQWorker(name: this.createJobProcessor(name) => {
                connection: redisConnection,
                concurrency,
                limiter: { max: concurrency * 2,
                    duration: 1000
                }
            });

            worker.on('completed', (job: RabbitMQJob<LegalJobData>, result: unknown) => {
                console.log(`✅ Job ${job.id} completed in queue ${ name }`);
            });

            worker.on('failed', (job: RabbitMQJob<LegalJobData> | undefined, err: Error) => {
                console.error(`❌ Job ${job?.id} failed in queue ${ name }:`, err.message);
            });

            this.workers.set(name, worker);
        });
    }

    private createJobProcessor(queueName: string) {
        return async (job: RabbitMQJob<LegalJobData>) => {
            const { id } = job;
            console.log(`🚀 Processing job ${ id } in ${ queueName }`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return { status: 'completed', queue: queueName, jobId: id };
        };
    }

    public async addJob(queueName: string): LegalJobData {
        const queue = this.queues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        return queue.add('process', data, {
            priority: this.getPriority(data.priority)
        });
    }

    private getPriority(priority: string): number {
        const priorities = { low: 4, normal: 3, high: 2, critical: 1 };
        return priorities[priority as keyof typeof priorities] || priorities.normal;
    }

    public async close() {
        await Promise.all([...this.queues.values()].map(q => q.close()));
        await Promise.all([...this.workers.values()].map(w => w.close()));
    }
}

export const jobQueue = LegalAIJobQueue.getInstance();



