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

    private static readonly MAX_RETRIES = 3;

    private readonly exchanges = {
        cache_invalidation: 'cache.invalidation',
        document_processing: 'document.processing',
        vector_updates: 'vector.updates',
        analytics: 'analytics.events',
        codebase_indexing: 'codebase.indexing',
        dlx: 'dlx.dead-letter'
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
                const { getRedis } = await import('../redis.js');
                this.redisService = getRedis();
            } catch (e) { console.warn('⚠️ Redis failed:', this.formatError(e)); }

            try {
                const lokiModule = await import('../../../lib/cache/loki-redis-integration.js');
                this.lokiRedisCache = lokiModule.lokiRedisCache;
            } catch (e) { console.warn('⚠️ LokiRedis failed:', this.formatError(e)); }

             try {
                const dbModule = await import('../db/client.js');
                this.db = dbModule.db;
            } catch (e) { console.warn('⚠️ DB failed:', this.formatError(e)); }

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

        // Declare exchanges (including dead-letter exchange)
        for (const [, exchange] of Object.entries(this.exchanges)) {
            await this.channel.assertExchange(exchange, 'topic', { durable: true });
        }

        // Declare DLQ queues (one per main queue)
        for (const [, queue] of Object.entries(this.queues)) {
            const dlqName = `${queue}.dlq`;
            await this.channel.assertQueue(dlqName, { durable: true });
            await this.channel.bindQueue(dlqName, this.exchanges.dlx, queue);
        }

        // Declare main queues with dead-letter routing
        for (const [, queue] of Object.entries(this.queues)) {
            await this.channel.assertQueue(queue, {
                durable: true,
                arguments: {
                    'x-message-ttl': 300000, // 5 minutes
                    'x-dead-letter-exchange': this.exchanges.dlx,
                    'x-dead-letter-routing-key': queue
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

        console.log('✅ Queue bindings configured (with DLQ)');
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
        await this.consume(this.queues.evidence_process, this.handleEvidenceProcess.bind(this));
        await this.consume(this.queues.vector_index, this.handleVectorIndex.bind(this));
        await this.consume(this.queues.chat_context, this.handleChatContext.bind(this));
        await this.consume(this.queues.analytics_track, this.handleAnalyticsTrack.bind(this));
        await this.consume(this.queues.codebase_index, this.handleCodebaseIndex.bind(this));

        console.log('👂 All 7 RabbitMQ consumers started');
    }

    async consume(queue: string, handler: (msg: AmqpMessage) => Promise<void>) {
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
            console.log('🗑️ Cache invalidation:', data.type, data.key ?? '');
            if (this.redisService) {
                if (data.key) {
                    await this.redisService.del(data.key);
                } else if (data.pattern) {
                    // Pattern-based invalidation (e.g. "evidence:*")
                    const keys = await this.redisService.keys(data.pattern);
                    if (keys?.length) {
                        await Promise.all(keys.map((k: string) => this.redisService.del(k)));
                    }
                }
            }
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Cache invalidation error:', this.formatError(error));
            this.retryOrDLQ(msg, error);
        }
    }

    private async handleDocumentEmbedding(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data?.text) {
                this.channel.nack(msg, false, false);
                return;
            }
            console.log('📐 Embedding document:', data.documentId ?? 'unknown');
            const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');
            const embedding = await generateSingleEmbedding(data.text.slice(0, 2048));
            // Publish vector for indexing
            if (embedding?.length && data.documentId) {
                await this.publish(this.exchanges.vector_updates, 'vector.index.document', {
                    documentId: data.documentId,
                    embedding,
                    collection: data.collection ?? 'legal_documents',
                    metadata: data.metadata ?? {}
                });
            }
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Document embedding error:', this.formatError(error));
            this.retryOrDLQ(msg, error);
        }
    }

    private async handleEvidenceProcess(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data?.evidenceId) {
                this.channel.nack(msg, false, false);
                return;
            }
            console.log('🔬 Processing evidence:', data.evidenceId);
            const { extractEntities } = await import('../analysis/entity-extraction.js');
            const { detectForensicPatterns } = await import('../analysis/forensics.js');

            const text = data.text ?? data.content ?? '';
            const [entities, forensics] = await Promise.all([
                extractEntities(text).catch(() => []),
                Promise.resolve(detectForensicPatterns(text))
            ]);

            console.log(`✅ Evidence ${data.evidenceId}: ${entities.length} entities, ${forensics.length} forensic flags`);

            // Publish for embedding if text is available
            if (text.length > 0) {
                await this.publish(this.exchanges.document_processing, 'document.embed', {
                    documentId: data.evidenceId,
                    text,
                    collection: 'evidence_items',
                    metadata: { entities: entities.length, forensicFlags: forensics.length }
                });
            }
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Evidence process error:', this.formatError(error));
            this.retryOrDLQ(msg, error);
        }
    }

    private async handleVectorIndex(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data?.embedding || !data?.documentId) {
                this.channel.nack(msg, false, false);
                return;
            }
            const collection = data.collection ?? 'documents';
            console.log('📌 Indexing vector:', data.documentId, '→', collection);
            const { qdrant } = await import('../vector/qdrant-manager.js');

            await qdrant.batchUpsert({
                collection: collection as any,
                points: [{
                    id: data.documentId,
                    vector: data.embedding,
                    payload: {
                        documentId: data.documentId,
                        ...(data.metadata ?? {})
                    }
                }]
            });

            console.log(`✅ Vector indexed: ${data.documentId} → ${collection}`);
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Vector index error:', this.formatError(error));
            this.retryOrDLQ(msg, error);
        }
    }

    private async handleChatContext(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data?.sessionId) {
                this.channel.nack(msg, false, false);
                return;
            }
            console.log('💬 Chat context update:', data.sessionId);
            // Generate embedding if not provided
            let embedding = data.embedding;
            if (!embedding && data.message) {
                try {
                    const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');
                    embedding = await generateSingleEmbedding(data.message.slice(0, 2048));
                } catch {
                    // Embedding generation failed — non-fatal
                }
            }
            // Store chat message embedding for context retrieval
            if (data.message && embedding?.length) {
                const { qdrant } = await import('../vector/qdrant-manager.js');
                await qdrant.batchUpsert({
                    collection: 'chat_messages' as any,
                    points: [{
                        id: `chat-${data.sessionId}-${Date.now()}`,
                        vector: embedding,
                        payload: {
                            sessionId: data.sessionId,
                            role: data.role ?? 'user',
                            content: data.message.slice(0, 500),
                            timestamp: Date.now()
                        }
                    }]
                });
            }
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Chat context error:', this.formatError(error));
            this.retryOrDLQ(msg, error);
        }
    }

    private async handleAnalyticsTrack(msg: AmqpMessage): Promise<void> {
        if (!msg || !this.channel) return;
        try {
            const data = this.parseMessage(msg);
            if (!data?.eventType) {
                this.channel.nack(msg, false, false);
                return;
            }
            console.log('📊 Analytics:', data.eventType);
            const ts = data.timestamp ?? Date.now();
            // Store analytics event in Redis sorted set for time-series queries
            if (this.redisService) {
                const key = `analytics:${data.eventType}`;
                const entry = JSON.stringify({ ...data.payload, timestamp: ts });
                await this.redisService.zadd(key, Date.now(), entry);
                // Trim to last 10000 events per type
                await this.redisService.zremrangebyrank(key, 0, -10001);
            }
            // Persist to PostgreSQL for durable analytics
            if (this.db) {
                try {
                    const { analyticsEvents } = await import('../db/schema-postgres.js');
                    await this.db.insert(analyticsEvents).values({
                        eventType: data.eventType,
                        userId: data.userId ?? null,
                        sessionId: data.sessionId ?? null,
                        payload: data.payload ?? {},
                        createdAt: new Date(ts),
                    }).onConflictDoNothing();
                } catch (dbErr) {
                    console.warn('⚠️ Analytics DB persist failed (non-fatal):', this.formatError(dbErr));
                }
            }
            this.channel.ack(msg);
        } catch (error) {
            console.error('❌ Analytics track error:', this.formatError(error));
            this.retryOrDLQ(msg, error);
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
            this.retryOrDLQ(msg, error);
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

    async publishVectorIndex(data: { id: string; vector: number[]; collection: string; payload?: Record<string, unknown> }): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.vector_updates, 'vector.index.document', data);
    }

    async publishDocumentEmbed(data: { documentId: string; text: string; collection?: string; metadata?: Record<string, unknown> }): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.document_processing, 'document.embed', data);
    }

    async publishChatContext(data: { sessionId: string; message: string; role: 'user' | 'assistant'; metadata?: Record<string, unknown> }): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.vector_updates, 'chat.context.message', data);
    }

    async publishEvidenceProcess(data: { evidenceId: string; text: string; caseId?: string; fileName?: string; metadata?: Record<string, unknown> }): Promise<void> {
        if (!this.isReady()) return;
        await this.publish(this.exchanges.document_processing, 'evidence.process', {
            ...data,
            enqueuedAt: new Date().toISOString()
        });
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

    /**
     * Retry-aware nack: checks x-death header count.
     * If retries exhausted, sends to DLQ (nack without requeue).
     * Otherwise, requeues for retry.
     */
    private retryOrDLQ(msg: AmqpMessageObj, error: unknown): void {
        if (!this.channel) return;
        const deaths = (msg.properties?.headers as any)?.['x-death'] as Array<{ count?: number }> | undefined;
        const retryCount = deaths?.[0]?.count ?? 0;
        if (retryCount >= RabbitMQManager.MAX_RETRIES) {
            console.warn(`☠️ DLQ: message exhausted ${RabbitMQManager.MAX_RETRIES} retries — routing to dead letter`);
            this.channel.nack(msg, false, false); // goes to DLQ via x-dead-letter-exchange
        } else {
            console.warn(`🔄 Retry ${retryCount + 1}/${RabbitMQManager.MAX_RETRIES}: ${this.formatError(error)}`);
            this.channel.nack(msg, false, true); // requeue
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

    /** Get DLQ message counts for monitoring */
    async getDLQStatus(): Promise<Record<string, number>> {
        if (!this.channel) return {};
        const counts: Record<string, number> = {};
        for (const [, queue] of Object.entries(this.queues)) {
            try {
                const info = await this.channel.assertQueue(`${queue}.dlq`, { durable: true }) as { messageCount?: number };
                counts[`${queue}.dlq`] = info.messageCount ?? 0;
            } catch {
                counts[`${queue}.dlq`] = -1;
            }
        }
        return counts;
    }

    async close() {
        if(this.channel) await this.channel.close();
        if(this.connection) await this.connection.close();
    }
}

// Singleton
export const rabbitmq = new RabbitMQManager();


