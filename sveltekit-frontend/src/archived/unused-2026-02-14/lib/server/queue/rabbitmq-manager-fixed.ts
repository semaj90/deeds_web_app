import amqp, { type Connection, type Channel, type ConsumeMessage } from 'amqplib';
import { EventEmitter } from 'events';
import { env } from '$lib/env'; // Use standard env
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Import types dynamically or use any to avoid circular deps for now
// import type { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';

type AmqpMessage = ConsumeMessage | null;

export class RabbitMQManager extends EventEmitter {
    private connection: Connection | null = null;
    private channel: Channel | null = null;
    private isInitialized = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private url: string;

    // Services (loaded dynamically)
    private redisService: any = null;
    private lokiRedisCache: any = null;
    private enhancedRAGPipeline: any = null;
    private instantSearchEngine: any = null;
    private db: DrizzleTypes.DatabaseConfig = null;
    private sql: any = null;
    private schema: any = null;

    // Embeddings placeholder
    private embeddings: any = null;

    private readonly exchanges = {
        cache_invalidation: 'cache.invalidation',
        document_processing: 'document.processing',
        vector_updates: 'vector.updates',
        analytics: 'analytics.events'
    };

    private readonly queues = {
        cache_invalidate: 'cache.invalidate',
        document_embed: 'document.embed',
        evidence_process: 'evidence.process',
        vector_index: 'vector.index',
        chat_context: 'chat.context',
        analytics_track: 'analytics.track'
    };

    constructor() {
        super();
        this.url = env?.RABBITMQ_URL ?? 'amqp://localhost:5672';
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.on('connection_lost', () => {
            console.warn('🔄 RabbitMQ connection lost, attempting to reconnect...');
            this.attemptReconnect();
        });
    }

    async initialize(): Promise<boolean> {
        try {
            await this.loadServices();
            await this.connect();
            await this.setupInfrastructure();
            await this.startConsumers();
            this.isInitialized = true;
            this.emit('initialized');
            console.log('🚀 RabbitMQ Manager initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ RabbitMQ initialization failed:', this.formatError(error));
            return false;
        }
    }

    private async loadServices(): Promise<void> {
        try {
            console.log('📦 Loading services...');
            // Dynamic imports to avoid circular dependencies
            // Note: Adjust paths as necessary based on project structure
            try {
                const redisModule = await import('../redis-service.js');
                this.redisService = redisModule.redisService;
            } catch (e) { /* ignore */ }

            try {
                const lokiModule = await import('../../../lib/cache/loki-redis-integration.js'); // check path
                this.lokiRedisCache = lokiModule.lokiRedisCache;
            } catch (e) { /* ignore */ }

             try {
                const dbModule = await import('../db/client.js'); // Assuming client.ts exports db
                this.db = dbModule.db;
            } catch (e) { /* ignore */ }

             // Initialize embeddings if needed (mock or load)
             // this.embeddings = ...

            console.log('✅ Services loaded (partial/full)');
        } catch (error) {
            console.warn('⚠️ Some services failed to load:', this.formatError(error));
        }
    }

    private async connect(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.url);
            this.channel = await this.connection.createChannel();

            this.connection.on('error', (err) => {
                console.error('❌ RabbitMQ connection error:', err.message);
                this.emit('connection_lost');
            });
            this.connection.on('close', () => {
                this.emit('connection_lost');
            });
            this.channel.on('error', (err) => {
                console.error('❌ RabbitMQ channel error:', err.message);
                this.channel = null;
            });

            console.log('✅ RabbitMQ connected');
        } catch (error) {
            throw new Error(`RabbitMQ connection failed: ${this.formatError(error)}`);
        }
    }

    private async setupInfrastructure(): Promise<void> {
        if (!this.channel) throw new Error('Channel not available');

        // Declare exchanges
        for (const [name, exchange] of Object.entries(this.exchanges)) {
            await this.channel.assertExchange(exchange, 'topic', { durable: true });
        }

        // Declare queues
        for (const [name, queue] of Object.entries(this.queues)) {
            await this.channel.assertQueue(queue, {
                durable: true,
                arguments: {
                    'x-message-ttl': 300000, // 5 minutes
                    'x-max-retries': 3
                }
            });
        }

        // Bindings
        await this.bindQueue(this.queues.cache_invalidate, this.exchanges.cache_invalidation, '*.invalidate');
        await this.bindQueue(this.queues.document_embed, this.exchanges.document_processing, 'document.embed');
        await this.bindQueue(this.queues.evidence_process, this.exchanges.document_processing, 'evidence.*');
        await this.bindQueue(this.queues.vector_index, this.exchanges.vector_updates, 'vector.index.*');
        await this.bindQueue(this.queues.chat_context, this.exchanges.vector_updates, 'chat.context.*');
        await this.bindQueue(this.queues.analytics_track, this.exchanges.analytics, 'analytics.*');

        console.log('✅ Queue bindings configured');
    }

    private async bindQueue(queue: string, exchange: string, routingKey: string) {
        if (this.channel) {
            await this.channel.bindQueue(queue, exchange, routingKey);
        }
    }

    private async startConsumers(): Promise<void> {
        if (!this.channel) return;

        await this.consume(this.queues.cache_invalidate, this.handleCacheInvalidation.bind(this));
        await this.consume(this.queues.document_embed, this.handleDocumentEmbedding.bind(this));
        // Add other consumers...

        console.log('👂 All RabbitMQ consumers started');
    }

    private async consume(queue: string, handler: (msg: AmqpMessage) => Promise<void>) {
        if (this.channel) {
            await this.channel.consume(queue, (msg) => handler(msg), { noAck: false });
        }
    }

    // --- Handlers ---

    private async handleCacheInvalidation(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data) {
                 this.channel.nack(msg, false, false);
                 return;
            }
            console.log('🗑️ Cache invalidation received', data);
            // Logic to invalidate cache
            if (this.redisService) {
                // await this.redisService...
            }
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Cache invalidation error:', this.formatError(error));
            this.channel.nack(msg, false, true); // Requeue
        }
    }

    private async handleDocumentEmbedding(msg: AmqpMessage): Promise<void> {
         if (!msg || !this.channel) return;
        try {
             // Mock processing
             this.channel.ack(msg);
        } catch (e) {
             this.channel.nack(msg, false, true);
        }
    }

    // --- Publishers ---

    async publishCacheInvalidation(data: any): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.cache_invalidation, `${data.type}.invalidate`, data);
    }

    // ... other publishers

    private async publish(exchange: string, routingKey: string, data: any): Promise<void> {
        if (!this.channel) return;
        try {
            const message = Buffer.from(JSON.stringify(data));
            this.channel.publish(exchange, routingKey, message, { persistent: true });
        } catch (error) {
            console.error('❌ Publish failed:', this.formatError(error));
        }
    }

    // --- Helpers ---

    private parseMessage(msg: AmqpMessage): any {
        if (!msg) return null;
        try {
            return JSON.parse(msg.content.toString());
        } catch {
            return null;
        }
    }

    private formatError(err: any): string {
        if (err instanceof Error) return err.message;
        return String(err);
    }

    private isReady(): boolean {
        return this?.isInitialized&& !!this.channel;
    }

    private async attemptReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
        this.reconnectAttempts++;
        setTimeout(() => this.initialize(), 5000);
    }

    async close() {
        if(this.channel) await this.channel.close();
        if(this.connection) await this.connection.close();
    }
}

// Singleton
export const rabbitmq = new RabbitMQManager();

if (typeof window === 'undefined') {
    // Auto-init only in server
    // rabbitmq.initialize().catch(console.error);
}

