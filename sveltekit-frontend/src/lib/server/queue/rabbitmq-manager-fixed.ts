// amqplib: Named/namespace imports fail with moduleResolution: "bundler"
// Use local interfaces + dynamic import pattern per CLAUDE.md
import { EventEmitter } from 'events';

interface AmqpConnection {
    createChannel(): Promise<AmqpChannel>;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
}

interface AmqpChannel {
    assertExchange(exchange: string, type: string, options?: Record<string, unknown>): Promise<unknown>;
    assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown>;
    bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
    consume(queue: string, handler: (msg: AmqpMessage) => void, options?: Record<string, unknown>): Promise<unknown>;
    publish(exchange: string, routingKey: string, content: Buffer, options?: Record<string, unknown>): boolean;
    ack(message: { content: Buffer; fields: Record<string, unknown>; properties: Record<string, unknown> }): void;
    nack(message: { content: Buffer; fields: Record<string, unknown>; properties: Record<string, unknown> }, allUpTo?: boolean, requeue?: boolean): void;
    close(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): this;
}

interface AmqpMessageObj {
    content: Buffer;
    fields: Record<string, unknown>;
    properties: Record<string, unknown>;
}

type AmqpMessage = AmqpMessageObj | null;

export class RabbitMQManager extends EventEmitter {
    private connection: AmqpConnection | null = null;
    private channel: AmqpChannel | null = null;
    private isInitialized = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private url: string;

    // Services (loaded dynamically)
    private redisService: any = null;
    private lokiRedisCache: any = null;
    private enhancedRAGPipeline: any = null;
    private instantSearchEngine: any = null;
    private db: any = null;
    private sql: any = null;
    private schema: any = null;

    // Embeddings placeholder
    private embeddings: any = null;

    private readonly exchanges = {
        cache_invalidation: 'cache.invalidation',
        document_processing: 'document.processing',
        vector_updates: 'vector.updates',
        analytics: 'analytics.events',
        codebase_indexing: 'codebase.indexing'
    };

    private readonly queues = {
        cache_invalidate: 'cache.invalidate',
        document_embed: 'document.embed',
        evidence_process: 'evidence.process',
        vector_index: 'vector.index',
        chat_context: 'chat.context',
        analytics_track: 'analytics.track',
        codebase_index: 'codebase.index'
    };

    constructor() {
        super();
        this.url = process.env?.RABBITMQ_URL ?? 'amqp://localhost:5672';
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
            const amqp = await import('amqplib');
            const connect = (amqp as any).default?.connect ?? (amqp as any).connect;
            this.connection = await connect(this.url) as AmqpConnection;
            this.channel = await this.connection.createChannel();

            this.connection.on('error', (err: unknown) => {
                console.error('❌ RabbitMQ connection error:', (err as Error)?.message ?? err);
                this.emit('connection_lost');
            });
            this.connection.on('close', () => {
                this.emit('connection_lost');
            });
            this.channel.on('error', (err: unknown) => {
                console.error('❌ RabbitMQ channel error:', (err as Error)?.message ?? err);
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
        await this.bindQueue(this.queues.codebase_index, this.exchanges.codebase_indexing, 'codebase.index.*');

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
        await this.consume(this.queues.codebase_index, this.handleCodebaseIndex.bind(this));

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

    private async handleCodebaseIndex(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data) {
                this.channel.nack(msg, false, false);
                return;
            }
            console.log(`📦 Codebase index job received: scope=${data.scope}`);
            const { chunkFiles } = await import('../indexer/ast-chunker.js');
            const { indexChunks } = await import('../indexer/dual-embedder.js');
            const { resolve } = await import('path');
            const { readdir, stat } = await import('fs/promises');

            const ROOT = resolve(process.cwd());
            const SCOPE_GLOBS: Record<string, string[]> = {
                routes: ['src/routes'], lib: ['src/lib'], tests: ['tests'], all: ['src/routes', 'src/lib', 'tests']
            };
            const INDEXABLE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);
            const SKIP_DIRS = new Set(['node_modules', '.svelte-kit', 'archives', 'backups', 'phase104-backups']);

            const collectFiles = async (dir: string): Promise<string[]> => {
                const files: string[] = [];
                try {
                    const entries = await readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        if (SKIP_DIRS.has(entry.name)) continue;
                        const full = resolve(dir, entry.name);
                        if (entry.isDirectory()) {
                            files.push(...await collectFiles(full));
                        } else if (entry.isFile() && INDEXABLE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))) {
                            if (full.includes('lib/services/') && !full.includes('lib/server/services/')) continue;
                            files.push(full);
                        }
                    }
                } catch { /* directory missing */ }
                return files;
            };

            const dirs = SCOPE_GLOBS[data.scope] ?? SCOPE_GLOBS.all;
            const allFiles: string[] = [];
            for (const dir of dirs) {
                allFiles.push(...await collectFiles(resolve(ROOT, dir)));
            }

            const chunks = chunkFiles(allFiles, ROOT);
            const result = await indexChunks(chunks);
            console.log(`✅ Codebase index complete: ${allFiles.length} files, ${chunks.length} chunks indexed`);
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Codebase index error:', this.formatError(error));
            this.channel.nack(msg, false, true);
        }
    }

    // --- Publishers ---

    async publishCacheInvalidation(data: any): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.cache_invalidation, `${data.type}.invalidate`, data);
    }

    async publishCodebaseIndex(data: {
        scope: string;
        incremental?: boolean;
        requestedBy?: string;
    }): Promise<boolean> {
        if (!this.isReady()) return false;
        await this.publish(this.exchanges.codebase_indexing, `codebase.index.${data.scope}`, {
            ...data,
            enqueuedAt: new Date().toISOString()
        });
        return true;
    }

    async publishAnalyticsEvent(data: { eventType: string; payload: Record<string, unknown> }): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.analytics, `analytics.${data.eventType}`, data);
    }

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

