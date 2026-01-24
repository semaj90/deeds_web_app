import { browser } from '$app/environment';
import { env } from '$lib/env';
import amqplib, { type Channel, type Connection, type ConsumeMessage } from 'amqplib';

// --- TYPES ---
export interface DocumentProcessingJob {
    documentId: string;
    s3Key: string;
    s3Bucket: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    processingType: 'ocr' | 'embedding' | 'summarization' | 'full_analysis';
    caseId?: string;
    userId?: string;
    priority?: number;
    timestamp?: string;
}

export interface DLQMessage extends DocumentProcessingJob {
    error: string;
    retries: number;
    timestamp: string;
}

export interface RabbitMQConfig {
    url: string;
    queues: {
        documentProcessing: string;
        ocrProcessing: string;
        embeddingProcessing: string;
        summarization: string;
        deadLetter: string;
    };
    exchanges: {
        documents: string;
        deadLetter: string;
    };
}

export interface IRabbitMQService {
    initialize(retries?: number, delay?: number): Promise<void>;
    publishDocumentProcessingJob(job: DocumentProcessingJob): Promise<boolean>;
    publishBatchJobs(jobs: DocumentProcessingJob[]): Promise<{ success: number; failed: number }>;
    purgeQueue(queueType: keyof RabbitMQConfig['queues']): Promise<boolean>;
    close(): Promise<void>;
    healthCheck(): Promise<any>;
    consume(
        queueType: keyof RabbitMQConfig['queues'],
        onMessage: (msg: ConsumeMessage | null, ack: () => void, nack: (requeue?: boolean) => void) => Promise<void>
    ): Promise<void>;
}

// --- BROWSER STUB ---
class BrowserStub implements IRabbitMQService {
    private makeError(): never {
        throw new Error('RabbitMQService is server-only and cannot be used in the browser');
    }
    async initialize() { return; }
    async publishDocumentProcessingJob() { this.makeError(); }
    async publishBatchJobs() { this.makeError(); }
    async purgeQueue() { this.makeError(); }
    async close() { return; }
    async healthCheck() { return { healthy: false, error: 'Client: RabbitMQService not available' }; }
    async consume() { this.makeError(); }
}

// --- RABBITMQ SERVICE (SINGLETON) ---
class RabbitMQService implements IRabbitMQService {
    private static instance: RabbitMQService;
    private connection: Connection | null = null;
    private channel: Channel | null = null;
    private config: RabbitMQConfig;
    private isConnected = false;
    private isInitializing = false;

    private constructor() {
        // @ts-ignore
        const rabbitUrl = env?.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        this.config = {
            url: rabbitUrl,
            queues: {
                documentProcessing: 'doc_processing_queue',
                ocrProcessing: 'ocr_processing_queue',
                embeddingProcessing: 'embedding_processing_queue',
                summarization: 'summarization_queue',
                deadLetter: 'dead_letter_queue'
            },
            exchanges: {
                documents: 'documents_exchange',
                deadLetter: 'dead_letter_exchange'
            }
        };
    }

    public static getInstance(): RabbitMQService {
        if (!RabbitMQService.instance) {
            RabbitMQService.instance = new RabbitMQService();
        }
        return RabbitMQService.instance;
    }

    async initialize(maxRetries = 5, retryDelay = 5000): Promise<void> {
        if (this.isConnected || this.isInitializing) return;
        this.isInitializing = true;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Connecting to RabbitMQ (Attempt ${attempt}/${maxRetries})...`);
                this.connection = await amqplib.connect(this.config.url);

                this.connection.on('error', (err) => {
                    console.error('RabbitMQ Connection Error:', err);
                    this.isConnected = false;
                });

                this.connection.on('close', () => {
                    console.warn('RabbitMQ Connection Closed');
                    this.isConnected = false;
                });

                this.channel = await this.connection.createChannel();

                // Setup Exchanges
                await this.channel.assertExchange(this.config.exchanges.documents, 'direct', { durable: true });
                await this.channel.assertExchange(this.config.exchanges.deadLetter, 'direct', { durable: true });

                const queues = Object.values(this.config.queues);
                for (const queue of queues) {
                    await this.channel.assertQueue(queue, {
                        durable: true,
                        deadLetterExchange: this.config.exchanges.deadLetter,
                        deadLetterRoutingKey: 'dead_letter'
                    });
                }

                // Bind Queues
                await this.channel.bindQueue(this.config.queues.documentProcessing, this.config.exchanges.documents, 'process_document');
                await this.channel.bindQueue(this.config.queues.deadLetter, this.config.exchanges.deadLetter, 'dead_letter');

                this.isConnected = true;
                this.isInitializing = false;
                console.log('✅ RabbitMQ Connected Successfully');
                return;
            } catch (error) {
                console.error(`RabbitMQ Connection Failed (Attempt ${attempt}):`, error);
                if (attempt === maxRetries) {
                    this.isInitializing = false;
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    async publishDocumentProcessingJob(job: DocumentProcessingJob): Promise<boolean> {
        if (!this.isConnected || !this.channel) {
            await this.initialize();
        }

        try {
            if (!this.channel) throw new Error('Channel not available');

            const result = this.channel.publish(
                this.config.exchanges.documents,
                'process_document',
                Buffer.from(JSON.stringify(job)),
                { persistent: true, timestamp: Date.now() }
            );

            return result;
        } catch (error) {
            console.error('Failed to publish job:', error);
            return false;
        }
    }

    async publishBatchJobs(jobs: DocumentProcessingJob[]): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const job of jobs) {
            if (await this.publishDocumentProcessingJob(job)) {
                success++;
            } else {
                failed++;
            }
        }

        return { success, failed };
    }

    async purgeQueue(queueType: keyof RabbitMQConfig['queues']): Promise<boolean> {
        if (!this.isConnected || !this.channel) return false;
        try {
            await this.channel.purgeQueue(this.config.queues[queueType]);
            return true;
        } catch (error) {
            console.error('Failed to purge queue:', error);
            return false;
        }
    }

    async close(): Promise<void> {
        try {
            if (this.channel) await this.channel.close();
            if (this.connection) await this.connection.close();
            this.isConnected = false;
        } catch (error) {
            console.error('Error closing RabbitMQ connection:', error);
        }
    }

    async healthCheck(): Promise<any> {
        return {
            healthy: this.isConnected,
            connection: this.connection ? 'Active' : 'Inactive',
            channel: this.channel ? 'Active' : 'Inactive'
        };
    }

    async consume(
        queueType: keyof RabbitMQConfig['queues'],
        onMessage: (msg: ConsumeMessage | null, ack: () => void, nack: (requeue?: boolean) => void) => Promise<void>
    ): Promise<void> {
        if (!this.isConnected || !this.channel) await this.initialize();
        if (!this.channel) throw new Error('Channel not available');

        const queueName = this.config.queues[queueType];
        await this.channel.consume(queueName, async (msg) => {
            const ack = () => this.channel?.ack(msg!);
            const nack = (requeue = false) => this.channel?.nack(msg!, false, requeue);
            await onMessage(msg, ack, nack);
        });
    }
}

export const rabbitmqService = browser ? new BrowserStub() : RabbitMQService.getInstance();

export function createDocumentProcessingJob(
    documentId: string,
    s3Key: string,
    s3Bucket: string,
    originalName: string,
    mimeType: string,
    fileSize: number,
    options: {
        caseId?: string,
        userId?: string,
        processingType?: DocumentProcessingJob['processingType'];
        priority?: number;
    } = {}
): DocumentProcessingJob {
    return {
        documentId,
        s3Key,
        s3Bucket,
        originalName,
        mimeType,
        fileSize,
        caseId: options.caseId,
        userId: options.userId,
        processingType: options.processingType ?? 'full_analysis',
        priority: options.priority ?? 1,
        timestamp: new Date().toISOString()
    };
}
