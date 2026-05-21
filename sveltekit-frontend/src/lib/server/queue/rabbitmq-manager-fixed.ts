// amqplib: Named/namespace imports fail with moduleResolution: "bundler"
// Use local interfaces + dynamic import pattern per CLAUDE.md
import { EventEmitter } from 'events';
import { traceQueue, traceLLM } from '$lib/server/observability/langfuse.js';
import { ENV } from '$lib/server/env.server.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

interface AmqpConnection {
  createChannel(): Promise<AmqpChannel>;
  close(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

interface AmqpChannel {
  assertExchange(
    exchange: string,
    type: string,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  consume(
    queue: string,
    handler: (msg: AmqpMessage) => void,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Record<string, unknown>
  ): boolean;
  ack(message: {
    content: Buffer;
    fields: Record<string, unknown>;
    properties: Record<string, unknown>;
  }): void;
  nack(
    message: {
      content: Buffer;
      fields: Record<string, unknown>;
      properties: Record<string, unknown>;
    },
    allUpTo?: boolean,
    requeue?: boolean
  ): void;
  prefetch(count: number): Promise<void>;
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
    audio_processing: 'audio.processing',
    media_processing: 'media.processing',
    legal_media: 'legal.media',
    dlx: 'dlx.dead-letter',
  };

  private readonly queues = {
    cache_invalidate: 'cache.invalidate',
    document_embed: 'document.embed',
    chat_document_embed: 'chat.document.embed',
    evidence_process: 'evidence.process',
    vector_index: 'vector.index',
    chat_context: 'chat.context',
    analytics_track: 'analytics.track',
    codebase_index: 'codebase.index',
    ace_evaluate: 'ace.evaluate',
    error_embed: 'error.embed',
    synthesis_generate: 'synthesis.generate',
    knowledge_backfill: 'knowledge.backfill',
    audio_process: 'audio.process',
    glyph_tile_rebuild: 'glyph.tile.rebuild',
    qlora_distill: 'qlora.distill',
    media_download: 'media.download',
    media_transcribe: 'media.transcribe',
  };

  private mediaProcessing: any = null;
  private isShuttingDown = false;

  constructor() {
    super();
    this.url = ENV.RABBITMQ_URL;
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
      this.isShuttingDown = false;
      await this.loadServices();
      await this.connect();
      await this.setupInfrastructure();
      await this.startConsumers();
      this.isInitialized = true;
      this.reconnectAttempts = 0; // Reset on successful connect
      this.emit('initialized');
      console.log('🚀 RabbitMQ Manager initialized successfully');
      return true;
    } catch (error) {
      const message = this.formatError(error);
      if (this.shouldSilenceError(message)) {
        console.warn('[RabbitMQ] Initialization aborted during dev reload');
        return false;
      }
      console.error('❌ RabbitMQ initialization failed:', message);
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
      } catch (e) {
        this.logServiceLoadIssue('Redis', e);
      }

      try {
        const dbModule = await import('../db/client.js');
        this.db = dbModule.db;
      } catch (e) {
        this.logServiceLoadIssue('DB', e);
      }

      // Initialize embeddings if needed (mock or load)
      // this.embeddings = ...

      try {
        const mediaModule = await import('../analysis/media-processing.js');
        this.mediaProcessing = mediaModule;
      } catch (e) {
        this.logServiceLoadIssue('Media processing', e);
      }

      console.log('✅ Services loaded (partial/full)');
    } catch (error) {
      const message = this.formatError(error);
      if (this.shouldSilenceError(message)) {
        console.warn('[RabbitMQ] Service loading aborted during dev reload');
        return;
      }
      console.warn('⚠️ Some services failed to load:', message);
    }
  }

  private logServiceLoadIssue(serviceName: string, error: unknown): void {
    const message = this.formatError(error);
    if (this.shouldSilenceError(message)) {
      console.warn(`[RabbitMQ] ${serviceName} load aborted during dev reload`);
      return;
    }
    console.warn(`⚠️ ${serviceName} failed:`, message);
  }

  private attachChannelListeners(channel: AmqpChannel): void {
    channel.on('error', (err: unknown) => {
      const message = this.formatError(err);
      if (this.shouldSilenceError(message)) return;
      console.error('❌ RabbitMQ channel error:', message);
      if (this.channel === channel) {
        this.channel = null;
      }
    });
  }

  private shouldSilenceError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('module runner has been closed') ||
      normalized.includes('vite module runner has been closed') ||
      normalized.includes('module has been disposed') ||
      normalized.includes('channel not available') ||
      normalized.includes('rabbitmq channel not ready') ||
      normalized.includes('rabbitmq connection not available')
    );
  }

  private async ensureChannel(): Promise<AmqpChannel> {
    if (this.channel) return this.channel;
    if (!this.connection) {
      throw new Error('RabbitMQ connection not available');
    }
    return this.recreateChannel();
  }

  private async recreateChannel(): Promise<AmqpChannel> {
    if (!this.connection) {
      throw new Error('RabbitMQ connection not available');
    }

    const channel = await this.connection.createChannel();
    this.attachChannelListeners(channel);
    this.channel = channel;
    return channel;
  }

  private async assertMainQueue(queue: string): Promise<void> {
    const isMediaQueue =
      queue === this.queues.media_download || queue === this.queues.media_transcribe;
    const options = {
      durable: true,
      arguments: {
        'x-message-ttl': isMediaQueue ? 3_600_000 : 300000,
        'x-dead-letter-exchange': this.exchanges.dlx,
        'x-dead-letter-routing-key': queue,
      },
    };

    const channel = await this.ensureChannel();

    try {
      await channel.assertQueue(queue, options);
    } catch (error) {
      const message = this.formatError(error);
      if (!/PRECONDITION_FAILED/i.test(message)) {
        throw error;
      }

      console.warn(`⚠️ Recreating RabbitMQ queue with updated DLQ args: ${queue}`);
      const channel = await this.recreateChannel();
      await (channel as unknown as { deleteQueue(q: string): Promise<unknown> }).deleteQueue(queue);
      await channel.assertQueue(queue, options);
    }
  }

  private async connect(): Promise<void> {
    try {
      const amqp = await import('amqplib');
      const connect =
        (
          amqp as {
            default?: { connect(...a: unknown[]): Promise<unknown> };
            connect?(...a: unknown[]): Promise<unknown>;
          }
        ).default?.connect ?? (amqp as { connect?(...a: unknown[]): Promise<unknown> }).connect;
      this.connection = (await connect(this.url)) as AmqpConnection;
      this.channel = await this.connection.createChannel();
      this.attachChannelListeners(this.channel);

      this.connection.on('error', (err: unknown) => {
        const message = this.formatError(err);
        // Silence "Vite module runner has been closed" during reloads
        if (this.shouldSilenceError(message)) return;

        console.error('❌ RabbitMQ connection error:', message);
        this.emit('connection_lost');
      });
      this.connection.on('close', () => {
        if (this.isShuttingDown) return;
        this.emit('connection_lost');
      });

      console.log('✅ RabbitMQ connected');
    } catch (error) {
      const message = this.formatError(error);
      if (this.shouldSilenceError(message)) return;
      throw new Error(`RabbitMQ connection failed: ${message}`);
    }
  }

  private async setupInfrastructure(): Promise<void> {
    const channel = await this.ensureChannel();

    // Declare exchanges (including dead-letter exchange)
    for (const [, exchange] of Object.entries(this.exchanges)) {
      await channel.assertExchange(exchange, 'topic', { durable: true });
    }

    // Declare DLQ queues (one per main queue)
    for (const [, queue] of Object.entries(this.queues)) {
      const dlqName = `${queue}.dlq`;
      await channel.assertQueue(dlqName, { durable: true });
      await channel.bindQueue(dlqName, this.exchanges.dlx, queue);
    }

    // Declare main queues with dead-letter routing
    for (const [, queue] of Object.entries(this.queues)) {
      await this.assertMainQueue(queue);
    }

    // Bindings
    await this.bindQueue(
      this.queues.cache_invalidate,
      this.exchanges.cache_invalidation,
      '*.invalidate'
    );
    await this.bindQueue(
      this.queues.document_embed,
      this.exchanges.document_processing,
      'document.embed'
    );
    await this.bindQueue(
      this.queues.chat_document_embed,
      this.exchanges.document_processing,
      'document.chat.embed'
    );
    await this.bindQueue(
      this.queues.evidence_process,
      this.exchanges.document_processing,
      'evidence.*'
    );
    await this.bindQueue(this.queues.vector_index, this.exchanges.vector_updates, 'vector.index.*');
    await this.bindQueue(this.queues.chat_context, this.exchanges.vector_updates, 'chat.context.*');
    await this.bindQueue(this.queues.analytics_track, this.exchanges.analytics, 'analytics.*');
    await this.bindQueue(
      this.queues.codebase_index,
      this.exchanges.codebase_indexing,
      'codebase.index.*'
    );
    await this.bindQueue(this.queues.media_download, this.exchanges.legal_media, 'media.*');
    await this.bindQueue(this.queues.media_transcribe, this.exchanges.legal_media, 'media.*');
    await this.bindQueue(
      this.queues.ace_evaluate,
      this.exchanges.document_processing,
      'ace.evaluate'
    );
    await this.bindQueue(
      this.queues.error_embed,
      this.exchanges.document_processing,
      'error.embed'
    );
    await this.bindQueue(
      this.queues.synthesis_generate,
      this.exchanges.document_processing,
      'synthesis.generate'
    );
    await this.bindQueue(
      this.queues.knowledge_backfill,
      this.exchanges.document_processing,
      'knowledge.backfill'
    );
    await this.bindQueue(
      this.queues.audio_process,
      this.exchanges.audio_processing,
      'audio.process'
    );
    await this.bindQueue(
      this.queues.glyph_tile_rebuild,
      this.exchanges.document_processing,
      'glyph.tile.rebuild'
    );

    console.log('✅ Queue bindings configured (with DLQ)');
  }

  private async bindQueue(queue: string, exchange: string, routingKey: string) {
    const channel = await this.ensureChannel();
    await channel.bindQueue(queue, exchange, routingKey);
  }

  private async startConsumers(): Promise<void> {
    const channel = await this.ensureChannel();

    // Set prefetch per processing speed:
    // Fast (Redis/analytics): 50, Medium (embedding/evidence): 10, Slow (LLM/ACE): 2
    await channel.prefetch(10); // Default for most queues

    await this.consume(this.queues.cache_invalidate, this.handleCacheInvalidation.bind(this)); // fast
    await this.consume(this.queues.document_embed, this.handleDocumentEmbedding.bind(this)); // medium
    await this.consume(this.queues.evidence_process, this.handleEvidenceProcess.bind(this)); // medium
    await this.consume(this.queues.vector_index, this.handleVectorIndex.bind(this)); // medium
    await this.consume(this.queues.chat_context, this.handleChatContext.bind(this)); // medium
    await this.consume(this.queues.analytics_track, this.handleAnalyticsTrack.bind(this)); // fast
    await this.consume(this.queues.codebase_index, this.handleCodebaseIndex.bind(this)); // slow
    await this.consume(this.queues.ace_evaluate, this.handleACEEvaluate.bind(this)); // slow (LLM call)
    await this.consume(this.queues.error_embed, this.handleErrorEmbed.bind(this)); // medium (embedding)
    await this.consume(this.queues.synthesis_generate, this.handleSynthesisGenerate.bind(this)); // slow (LLM call)
    await this.consume(this.queues.knowledge_backfill, this.handleKnowledgeBackfill.bind(this)); // medium (web search + embed)
    await this.consume(this.queues.glyph_tile_rebuild, this.handleGlyphTileRebuild.bind(this)); // slow (GPU kMeans)
    await this.consume(this.queues.qlora_distill, this.handleQLoRADistill.bind(this)); // slow (DB + CouchDB)
    await this.consume(this.queues.media_download, this.handleMediaDownload.bind(this)); // slow (yt-dlp sidecar)
    await this.consume(this.queues.media_transcribe, this.handleMediaTranscribe.bind(this)); // slow (Whisper GPU)

    console.log('👂 All 15 RabbitMQ consumers started (prefetch: 10)');

    // Start DLQ consumers — drain dead-lettered messages for logging/monitoring
    await this.startDLQConsumers();
  }

  async consume(queue: string, handler: (msg: AmqpMessage) => Promise<void>, noAck = false) {
    if (this.channel) {
      await this.channel.consume(
        queue,
        async (msg) => {
          try {
            await handler(msg);
          } catch (err) {
            const message = this.formatError(err);
            // If the environment is closing, don't log as fatal
            if (this.shouldSilenceError(message)) {
              console.warn(`[RabbitMQ] Environment closed during processing (queue: ${queue})`);
              return;
            }
            console.error(`[RabbitMQ] Handler error (queue: ${queue}):`, message);
            // Manager handlers usually have their own try/catch/ack/nack
            // but we catch here to prevent unhandled promise rejections
          }
        },
        { noAck }
      );
    } else {
      throw new Error(`RabbitMQ channel not ready (queue: ${queue})`);
    }
  }

  // --- Handlers ---

  private async handleCacheInvalidation(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data) {
        channel.nack(msg, false, false);
        return;
      }

      await traceQueue(
        'consume',
        'cache.invalidate',
        { type: data.type, key: data.key ?? data.pattern ?? 'unknown' },
        async () => {
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
        }
      );

      if (this.channel !== channel) return;
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Cache invalidation error:', this.formatError(error));
      if (this.channel !== channel) return;
      this.retryOrDLQ(msg, error, channel);
    }
  }

  private async handleDocumentEmbedding(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.text) {
        channel.nack(msg, false, false);
        return;
      }

      await traceQueue(
        'consume',
        'document.embed',
        {
          documentId: data.documentId ?? 'unknown',
          textLength: data.text.length,
          collection: data.collection ?? 'legal_documents',
        },
        async () => {
          console.log('📐 Embedding document:', data.documentId ?? 'unknown');
          const { generateSingleEmbedding } = await import('../grpc/embedding-client.js');
          const embedding = await generateSingleEmbedding(data.text.slice(0, 2048));
          // Publish vector for indexing
          if (embedding?.length && data.documentId) {
            await this.publish(this.exchanges.vector_updates, 'vector.index.document', {
              documentId: data.documentId,
              embedding,
              collection: data.collection ?? 'legal_documents',
              metadata: data.metadata ?? {},
            });
          }
        }
      );

      if (this.channel !== channel) return;
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Document embedding error:', this.formatError(error));
      if (this.channel !== channel) return;
      this.retryOrDLQ(msg, error, channel);
    }
  }

  private async handleEvidenceProcess(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.evidenceId) {
        channel.nack(msg, false, false);
        return;
      }
      console.log('🔬 Processing evidence:', data.evidenceId);
      const { extractEntities } = await import('../analysis/entity-extraction.js');
      const { detectForensicPatterns } = await import('../analysis/forensics.js');

      const text = data.text ?? data.content ?? '';
      const [entities, forensics] = await Promise.all([
        extractEntities(text).catch(() => []),
        Promise.resolve(detectForensicPatterns(text)),
      ]);

      console.log(
        `✅ Evidence ${data.evidenceId}: ${entities.length} entities, ${forensics.length} forensic flags`
      );

      // Run YOLO + LLM analysis pipeline for image evidence (Redis-cached, graph connections)
      if (
        data.fileName &&
        /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(data.fileName) &&
        data.buffer
      ) {
        try {
          const { runEvidenceAnalysisPipeline } = await import(
            '../analysis/evidence-analysis-pipeline.js'
          );
          const pipelineResult = await runEvidenceAnalysisPipeline({
            evidenceId: data.evidenceId,
            caseId: data.caseId,
            fileName: data.fileName,
            buffer: Buffer.from(data.buffer, 'base64'),
            existingText: text,
          });
          console.log(
            `🎯 Analysis pipeline: ${pipelineResult.yolo?.objects.length ?? 0} objects, LLM=${pipelineResult.llmEscalated}, graph=${pipelineResult.graphConnectionsCreated}`
          );
        } catch (pipelineErr) {
          console.warn('⚠️ Analysis pipeline failed (non-fatal):', pipelineErr);
        }
      }

      // Publish for embedding if text is available
      if (text.length > 0) {
        await this.publish(this.exchanges.document_processing, 'document.embed', {
          documentId: data.evidenceId,
          text,
          collection: 'evidence_items',
          metadata: { entities: entities.length, forensicFlags: forensics.length },
        });
      }

      // Auto-sync case to Neo4j graph (fire-and-forget)
      if (data.caseId) {
        import('../graph/pg-neo4j-sync.js')
          .then(({ syncCaseToGraph }) => syncCaseToGraph(data.caseId))
          .then((r) => {
            if (r.errors.length === 0) {
              console.log(
                `🔗 Neo4j sync: case ${data.caseId} (${r.relationships} rels, ${r.durationMs}ms)`
              );
            }
          })
          .catch(() => {}); // Non-fatal — PG data is sufficient
      }

      if (this.channel !== channel) {
        console.warn('⚠️ Evidence process: channel recycled during processing, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Evidence process error:', this.formatError(error));
      if (this.channel !== channel) {
        console.warn('⚠️ Evidence process: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg, error, channel);
    }
  }

  private async handleVectorIndex(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.embedding || !data?.documentId) {
        channel.nack(msg, false, false);
        return;
      }
      const collection = data.collection ?? 'documents';

      await traceQueue(
        'consume',
        'vector.index',
        { documentId: data.documentId, collection, vectorDim: data.embedding?.length ?? 0 },
        async () => {
          console.log('📌 Indexing vector:', data.documentId, '→', collection);
          const { qdrant } = await import('../vector/qdrant-manager.js');

          await qdrant.batchUpsert({
            collection: collection as keyof typeof qdrant.collections,
            points: [
              {
                id: data.documentId,
                vector: data.embedding,
                payload: {
                  documentId: data.documentId,
                  ...(data.metadata ?? {}),
                },
              },
            ],
          });

          console.log(`✅ Vector indexed: ${data.documentId} → ${collection}`);
        }
      );

      if (this.channel !== channel) return;
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Vector index error:', this.formatError(error));
      if (this.channel !== channel) return;
      this.retryOrDLQ(msg, error, channel);
    }
  }

  private async handleChatContext(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.sessionId) {
        channel.nack(msg, false, false);
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
        const { deterministicPointId, qdrant } = await import('../vector/qdrant-manager.js');
        const timestamp = Date.now();
        await qdrant.batchUpsert({
          collection: 'chat_history',
          points: [
            {
              id: deterministicPointId(
                `chat:${data.sessionId}:${data.role ?? 'user'}:${timestamp}:${data.message.slice(0, 128)}`
              ),
              vector: {
                message: embedding,
              },
              payload: {
                sessionId: data.sessionId,
                role: data.role ?? 'user',
                content: data.message.slice(0, 500),
                timestamp,
              },
            },
          ],
        });
      }
      if (this.channel !== channel) return;
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Chat context error:', this.formatError(error));
      if (this.channel !== channel) return;
      this.retryOrDLQ(msg, error, channel);
    }
  }

  private async handleAnalyticsTrack(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.eventType) {
        channel.nack(msg, false, false);
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
          await this.db
            .insert(analyticsEvents)
            .values({
              eventType: data.eventType,
              userId: data.userId ?? null,
              sessionId: data.sessionId ?? null,
              payload: data.payload ?? {},
              createdAt: new Date(ts),
            })
            .onConflictDoNothing();
        } catch (dbErr) {
          console.warn('⚠️ Analytics DB persist failed (non-fatal):', this.formatError(dbErr));
        }
      }
      // Sync user interaction to Neo4j graph + embed search queries to Qdrant (fire-and-forget)
      import('../graph/user-interaction-sync.js')
        .then(({ syncUserInteractionToGraph }) => syncUserInteractionToGraph(data))
        .catch(() => {});
      if (this.channel !== channel) return;
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Analytics track error:', this.formatError(error));
      if (this.channel !== channel) return;
      this.retryOrDLQ(msg, error, channel);
    }
  }

  private async handleCodebaseIndex(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data) {
        channel.nack(msg, false, false);
        return;
      }
      console.log(`📦 Codebase index job received: scope=${data.scope}`);

      // Redis progress helper — updates status for GET polling
      const updateRedisProgress = async (update: Record<string, unknown>) => {
        try {
          if (!this.redisService) return;
          // Find latest job for this scope
          const jobId = await this.redisService.get(`codebase:index:latest:${data.scope}`);
          if (!jobId) return;
          const key = `codebase:index:${jobId}`;
          const existing = await this.redisService.get(key);
          if (!existing) return;
          const job = JSON.parse(existing);
          Object.assign(job, update);
          await this.redisService.set(key, JSON.stringify(job), 'EX', 3600);
        } catch {
          /* non-fatal */
        }
      };

      await updateRedisProgress({ status: 'scanning', progress: 5 });

      const { chunkFiles } = await import('../indexer/ast-chunker.js');
      const { indexChunksIncremental } = await import('../indexer/dual-embedder.js');
      const { resolve } = await import('path');
      const { readdir } = await import('fs/promises');

      const ROOT = resolve(process.cwd());
      const SCOPE_GLOBS: Record<string, string[]> = {
        routes: ['src/routes'],
        lib: ['src/lib'],
        tests: ['tests'],
        all: ['src/routes', 'src/lib', 'tests'],
      };
      const INDEXABLE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs', '.svelte']);
      const SKIP_DIRS = new Set([
        'node_modules',
        '.svelte-kit',
        'archives',
        'backups',
        'phase104-backups',
      ]);

      const collectFiles = async (dir: string): Promise<string[]> => {
        const files: string[] = [];
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue;
            const full = resolve(dir, entry.name);
            if (entry.isDirectory()) {
              files.push(...(await collectFiles(full)));
            } else if (
              entry.isFile() &&
              INDEXABLE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf('.')))
            ) {
              if (full.includes('lib/services/') && !full.includes('lib/server/services/'))
                continue;
              files.push(full);
            }
          }
        } catch {
          /* directory missing */
        }
        return files;
      };

      const dirs = SCOPE_GLOBS[data.scope] ?? SCOPE_GLOBS.all;
      const allFiles: string[] = [];
      for (const dir of dirs) {
        allFiles.push(...(await collectFiles(resolve(ROOT, dir))));
      }

      await updateRedisProgress({
        status: 'chunking',
        progress: 20,
        filesProcessed: allFiles.length,
      });

      const chunks = await chunkFiles(allFiles, ROOT);

      await updateRedisProgress({
        status: 'embedding',
        progress: 40,
        chunksTotal: chunks.length,
      });

      const result = await indexChunksIncremental(chunks);

      await updateRedisProgress({
        status: 'completed',
        progress: 100,
        chunksProcessed: chunks.length,
        skippedExisting: result.skippedExisting,
        embeddingsGenerated: result.embeddingsGenerated,
        completedAt: new Date().toISOString(),
      });

      console.log(
        `✅ Codebase index complete: ${allFiles.length} files, ${chunks.length} chunks` +
          ` (${result.skippedExisting} cached, ${result.embeddingsGenerated} new embeddings)`
      );
      // Guard: channel may have recycled during long embedding operation
      if (this.channel !== channel) {
        console.warn('⚠️ Codebase index: channel recycled during processing, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Codebase index error:', this.formatError(error));

      // Update Redis with error status
      try {
        if (this.redisService) {
          const data = this.parseMessage(msg);
          const jobId = data?.scope
            ? await this.redisService.get(`codebase:index:latest:${data.scope}`)
            : null;
          if (jobId) {
            const key = `codebase:index:${jobId}`;
            const existing = await this.redisService.get(key);
            if (existing) {
              const job = JSON.parse(existing);
              job.status = 'failed';
              job.error = this.formatError(error);
              job.failedAt = new Date().toISOString();
              await this.redisService.set(key, JSON.stringify(job), 'EX', 3600);
            }
          }
        }
      } catch {
        /* non-fatal */
      }

      // Only retry/DLQ if the original channel is still valid
      if (this.channel === channel) {
        this.retryOrDLQ(msg, error, channel);
      } else {
        console.warn('⚠️ Codebase index: channel recycled, cannot nack/requeue');
      }
    }
  }

  private async handleACEEvaluate(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.responseId || !data?.query || !data?.response) {
        channel.nack(msg, false, false);
        return;
      }

      await traceQueue(
        'consume',
        'ace.evaluate',
        {
          responseId: data.responseId,
          queryLength: data.query.length,
          responseLength: data.response.length,
        },
        async () => {
          console.log('🧠 ACE evaluation:', data.responseId);
          const { evaluateResponse } = await import('../ace/self-prompt.js');
          const evaluation = await evaluateResponse({
            query: data.query,
            response: data.response,
            context: data.context ?? { ragChunks: [], kagNeighbors: [], persona: 'neutral' },
            backend: 'ollama',
          });
          // Store result in Redis for async retrieval
          if (this.redisService) {
            const key = `ace:result:${data.responseId}`;
            await this.redisService.set(
              key,
              JSON.stringify({
                responseId: data.responseId,
                ...evaluation,
                evaluatedAt: new Date().toISOString(),
              }),
              'EX',
              3600
            ); // 1 hour TTL
          }
          console.log(
            `✅ ACE eval complete: ${data.responseId} (quality: ${evaluation.quality.toFixed(2)})`
          );
        }
      );

      if (this.channel !== channel) {
        console.warn('⚠️ ACE evaluate: channel recycled during evaluation, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('❌ ACE evaluate error:', this.formatError(error));
      if (this.channel !== channel) {
        console.warn('⚠️ ACE evaluate: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg, error, channel);
    }
  }

  // --- Publishers ---

  /**
   * Publish a message, waiting up to `timeoutMs` for RabbitMQ to be fully
   * initialized (exchanges + queues + bindings declared) before publishing.
   * Use this instead of the typed publish methods when the caller may run
   * before RabbitMQ initialization completes (e.g., early HTTP request handlers).
   */
  async publishWhenReady(
    exchange: string,
    routingKey: string,
    data: unknown,
    timeoutMs = 15000
  ): Promise<void> {
    if (this.isInitialized && this.channel) {
      await this.publish(exchange, routingKey, data);
      return;
    }
    // Wait for 'initialized' event (fired after exchanges + queues + bindings are declared)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `[RabbitMQ] publishWhenReady timeout after ${timeoutMs}ms (${exchange}/${routingKey})`
          )
        );
      }, timeoutMs);
      this.once('initialized', async () => {
        clearTimeout(timer);
        try {
          await this.publish(exchange, routingKey, data);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async publishCacheInvalidation(data: any): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.cache_invalidation, `${data.type}.invalidate`, data);
  }

  async publishCodebaseIndex(data: {
    scope: string;
    incremental?: boolean;
    requestedBy?: string;
  }): Promise<boolean> {
    if (!this.isReady()) {
      const initialized = await this.initialize();
      if (!initialized || !this.isReady()) return false;
    }
    await this.publish(this.exchanges.codebase_indexing, `codebase.index.${data.scope}`, {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
    return true;
  }

  async publishAnalyticsEvent(data: {
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.analytics, `analytics.${data.eventType}`, data);
  }

  async publishVectorIndex(data: {
    id: string;
    vector: number[];
    collection: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.vector_updates, 'vector.index.document', data);
  }

  async publishDocumentEmbed(data: {
    documentId: string;
    text: string;
    collection?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.document_processing, 'document.embed', data);
  }

  async publishChatContext(data: {
    sessionId: string;
    message: string;
    role: 'user' | 'assistant';
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.vector_updates, 'chat.context.message', data);
  }

  async publishEvidenceProcess(data: {
    evidenceId: string;
    text: string;
    caseId?: string;
    fileName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.document_processing, 'evidence.process', {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
  }

  async publishACEEvaluation(data: {
    responseId: string;
    query: string;
    response: string;
    context?: { ragChunks: unknown[]; kagNeighbors: unknown[]; persona: string };
  }): Promise<void> {
    if (!this.isReady()) return;
    await this.publish(this.exchanges.document_processing, 'ace.evaluate', {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
  }

  // --- Error Embedding Handler ---

  private async handleErrorEmbed(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.errorMessage) {
        channel.ack(msg);
        return;
      }

      const { embedErrorEvent } = await import('../pipeline/error-embedding-pipeline.js');
      const result = await embedErrorEvent({
        errorMessage: data.errorMessage,
        filePath: data.filePath,
        routePath: data.routePath,
        stackTrace: data.stackTrace,
        severity: data.severity,
        tsCode: data.tsCode,
        clusterId: data.clusterId,
      });

      console.log(
        `[error.embed] Embedded error → point ${result.pointId}, cluster: ${result.matchedCluster ?? 'new'}, ${result.totalMs}ms`
      );

      if (this.channel !== channel) {
        console.warn('⚠️ Error embed: channel recycled during embedding, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('[error.embed] Handler error:', this.formatError(error));
      if (this.channel !== channel) {
        console.warn('⚠️ Error embed: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg as AmqpMessageObj, error, channel);
    }
  }

  // --- Error Embed Publisher ---

  async publishErrorEmbed(data: {
    errorMessage: string;
    filePath?: string;
    routePath?: string;
    stackTrace?: string;
    severity?: string;
    tsCode?: string;
  }): Promise<boolean> {
    if (!this.isReady()) return false;
    await this.publish(this.exchanges.document_processing, 'error.embed', {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
    return true;
  }

  // --- Synthesis Generate Handler ---

  private async handleSynthesisGenerate(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.synthesisId || !data?.query) {
        channel.nack(msg, false, false);
        return;
      }

      await traceQueue(
        'consume',
        'synthesis.generate',
        {
          synthesisId: data.synthesisId,
          queryLength: data.query.length,
          caseId: data.caseId,
          persona: data.persona ?? 'neutral',
        },
        async () => {
          console.log('🧪 Synthesis generate:', data.synthesisId);

          // Update status → generating
          if (this.redisService) {
            await this.redisService.set(
              `synthesis:status:${data.synthesisId}`,
              JSON.stringify({ status: 'generating', startedAt: new Date().toISOString() }),
              'EX',
              3600
            );
          }

          const t0 = performance.now();

          // Stage 1: ACE context assembly
          const { assembleACEContext, buildACEPromptCached } = await import(
            '../ace/context-assembler.js'
          );
          const { orderByDependency, extractCitationRefs } = await import(
            '../retrieval/document-dag.js'
          );
          const context = await assembleACEContext({
            query: data.query,
            userId: data.userId,
            caseId: data.caseId,
            conversationId: data.conversationId,
            persona: data.persona,
            sectionTypes: data.sectionTypes,
            enableCodebaseContext: data.enableCodebaseContext,
          });

          // DAG-order RAG chunks
          if (context.ragChunks.length > 1) {
            type URR = import('$lib/server/types/retrieval.js').UnifiedRetrievalResult;
            const knownIds = new Set(context.ragChunks.map((_: URR, i: number) => `chunk-${i}`));
            const dagDocs = context.ragChunks.map((c: URR, i: number) => ({
              id: `chunk-${i}`,
              title: c.sourceId ?? c.id,
              score: c.score,
              citations: extractCitationRefs(c.content, knownIds),
              content: c.content,
            }));
            const { ordered } = orderByDependency(dagDocs);
            const chunkMap = new Map<string, URR>(
              context.ragChunks.map((c: URR, i: number) => [`chunk-${i}`, c])
            );
            context.ragChunks = ordered
              .map((d: { id: string }) => chunkMap.get(d.id))
              .filter((c): c is URR => c !== undefined);
          }

          const acePrompt = await buildACEPromptCached(context, data.query);
          const contextMs = performance.now() - t0;

          // Stage 2: Direct Ollama LLM call (no Bifrost — single Ollama request)
          const { ollamaFetch } = await import('../ollama.js');
          const { ENV } = await import('../env.server.js');
          const MODEL = ENV.OLLAMA_CHAT_MODEL;
          const maxTokens = data.maxTokens ?? 2048;
          const temperature = data.temperature ?? 0.3;

          const userPrompt = `${acePrompt.contextWindow}\n\nQuestion: ${data.query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.`;

          // Stage 2 LLM call with Langfuse tracing
          const { answer, tokensUsed, generateMs } = await traceLLM(
            'synthesis-worker',
            {
              model: MODEL,
              backend: 'ollama',
              synthesisId: data.synthesisId,
              caseId: data.caseId,
              ragChunks: context.ragChunks.length,
              kagNeighbors: context.kagNeighbors?.length ?? 0,
            },
            async (gen) => {
              const llmStart = performance.now();
              const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: MODEL,
                  messages: [
                    { role: 'system', content: acePrompt.systemPrompt },
                    { role: 'user', content: userPrompt },
                  ],
                  stream: false,
                  options: { num_predict: maxTokens, temperature },
                }),
                signal: AbortSignal.timeout(300_000), // 5 minutes — worker has no user-facing timeout
              });

              if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);

              const llmData = await res.json();
              const answerText = (llmData.message?.content ?? '').trim();
              const tokens = llmData.eval_count ?? Math.ceil(answerText.length / 4);
              const durationMs = performance.now() - llmStart;

              gen.end({
                output: answerText.slice(0, 1000),
                usage: { promptTokens: llmData.prompt_eval_count, completionTokens: tokens },
              });
              return { answer: answerText, tokensUsed: tokens, generateMs: durationMs };
            }
          );

          // Stage 3: Extract citations
          const citations: Array<{ id: string; sourceTitle: string; quote: string }> = [];
          const refs = answer.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];
          const seen = new Set<string>();
          for (const ref of refs) {
            const match = ref.match(/\[Source\s+(\d+)/);
            if (match && !seen.has(match[1])) {
              seen.add(match[1]);
              const idx = parseInt(match[1], 10) - 1;
              const chunk = context.ragChunks[idx];
              citations.push({
                id: crypto.randomUUID(),
                sourceTitle: chunk?.source ?? `Source ${match[1]}`,
                quote: ref,
              });
            }
          }

          // Stage 4: Compute confidence
          let confidence = 0.4;
          if (answer.length > 100) confidence += 0.15;
          if (answer.length > 300) confidence += 0.1;
          if (citations.length > 0) confidence += 0.15;
          if (citations.length >= 3) confidence += 0.1;
          confidence = Math.min(0.95, confidence);

          const totalMs = performance.now() - t0;

          // Store full result in Redis
          const result = {
            synthesisId: data.synthesisId,
            query: data.query,
            answer,
            citations,
            evaluation: null, // ACE eval will be separate
            confidence,
            model: MODEL,
            tokensUsed,
            timing: {
              contextMs: Math.round(contextMs),
              generateMs: Math.round(generateMs),
              evalMs: 0,
              totalMs: Math.round(totalMs),
            },
            cached: false,
            timestamp: new Date().toISOString(),
            evaluationUrl:
              data.enableACE !== false ? `/api/synthesis/evaluation/${data.synthesisId}` : null,
            contextSources: {
              ragChunks: context.ragChunks.length,
              kagNeighbors: context.kagNeighbors.length,
              codebaseChunks: context.codebaseContext?.length ?? 0,
              hasEvidence: !!context.evidenceMetadata?.length,
              hasGlossary: !!context.glossaryMatches?.length,
              hasCaseContext: !!context.caseContext,
              hasWebSearch: !!context.webSearchContext,
            },
          };

          if (this.redisService) {
            await this.redisService.set(
              `synthesis:result:${data.synthesisId}`,
              JSON.stringify(result),
              'EX',
              3600
            );
            await this.redisService.set(
              `synthesis:status:${data.synthesisId}`,
              JSON.stringify({
                status: 'complete',
                completedAt: new Date().toISOString(),
                totalMs: Math.round(totalMs),
              }),
              'EX',
              3600
            );
          }

          // Fire ACE evaluation asynchronously
          if (data.enableACE !== false) {
            await this.publish(this.exchanges.document_processing, 'ace.evaluate', {
              responseId: data.synthesisId,
              query: data.query,
              response: answer,
              context: {
                ragChunks: context.ragChunks,
                kagNeighbors: context.kagNeighbors,
                persona: context.persona,
              },
              enqueuedAt: new Date().toISOString(),
            });
          }

          // Log inference to CouchDB (fire-and-forget)
          import('../observability/inference-log.js')
            .then(({ logLLMInference }) =>
              logLLMInference({
                model: MODEL,
                backend: 'ollama',
                latencyMs: Math.round(generateMs),
                tokenCount: tokensUsed,
                cacheHit: false,
              })
            )
            .catch(() => {});

          console.log(
            `✅ Synthesis complete: ${data.synthesisId} (${Math.round(totalMs)}ms, ${tokensUsed} tokens)`
          );
        }
      ); // End traceQueue

      // Guard: channel may have recycled during the long LLM inference
      if (this.channel !== channel) {
        console.warn('⚠️ Synthesis generate: channel recycled during processing, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Synthesis generate error:', this.formatError(error));

      // Store failure status
      if (this.redisService) {
        const data = this.parseMessage(msg);
        if (data?.synthesisId) {
          await this.redisService
            .set(
              `synthesis:status:${data.synthesisId}`,
              JSON.stringify({
                status: 'failed',
                error: this.formatError(error),
                failedAt: new Date().toISOString(),
              }),
              'EX',
              3600
            )
            .catch(() => {});
        }
      }

      if (this.channel !== channel) {
        console.warn('⚠️ Synthesis generate: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg as AmqpMessageObj, error, channel);
    }
  }

  // --- Synthesis Generate Publisher ---

  async publishSynthesisGenerate(data: {
    synthesisId: string;
    query: string;
    userId: string;
    caseId?: string;
    conversationId?: string;
    persona?: string;
    maxTokens?: number;
    temperature?: number;
    enableACE?: boolean;
    enableCodebaseContext?: boolean;
    sectionTypes?: string[];
  }): Promise<boolean> {
    if (!this.isReady()) return false;
    // Set initial status
    if (this.redisService) {
      await this.redisService.set(
        `synthesis:status:${data.synthesisId}`,
        JSON.stringify({ status: 'pending', enqueuedAt: new Date().toISOString() }),
        'EX',
        3600
      );
    }
    await this.publish(this.exchanges.document_processing, 'synthesis.generate', {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
    return true;
  }

  // --- Knowledge Backfill Handler ---

  private async handleKnowledgeBackfill(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.query) {
        channel.nack(msg, false, false);
        return;
      }

      console.log(`📚 Knowledge backfill: "${data.query}"`);

      const { executeBackfill } = await import('../retrieval/auto-backfill.js');
      const result = await executeBackfill({
        query: data.query,
        conversationId: data.conversationId,
        caseId: data.caseId,
        maxWebResults: data.maxWebResults ?? 5,
        wikiLimit: data.wikiLimit ?? 3,
      });

      if (result.skipped) {
        console.log(`📚 Knowledge backfill skipped: ${result.reason}`);
      } else {
        console.log(
          `📚 Knowledge backfill complete: ${result.documentsCollected} docs → ${result.chunksIndexed} chunks (${result.durationMs}ms)`
        );
      }

      if (this.channel !== channel) {
        console.warn('⚠️ Knowledge backfill: channel recycled during backfill, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('❌ Knowledge backfill error:', this.formatError(error));
      if (this.channel !== channel) {
        console.warn('⚠️ Knowledge backfill: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg as AmqpMessageObj, error, channel);
    }
  }

  // --- Knowledge Backfill Publisher ---

  async publishKnowledgeBackfill(data: {
    query: string;
    conversationId?: string;
    caseId?: string;
    maxWebResults?: number;
    wikiLimit?: number;
  }): Promise<boolean> {
    if (!this.isReady()) return false;
    await this.publish(this.exchanges.document_processing, 'knowledge.backfill', {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
    return true;
  }

  // --- Glyph Tile Rebuild Consumer ---

  private async handleGlyphTileRebuild(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.caseId) {
        channel.nack(msg, false, false);
        return;
      }
      console.log(`[glyph.tile.rebuild] caseId=${data.caseId} reason=${data.reason ?? 'n/a'}`);
      // Dynamically import to avoid circular dependency at startup
      const { buildGlyphTileAtlas } = await import('../cartridge/glyph-tile-engine.js');
      // Fetch current KAG neighbors as seed points when available
      let points: { embedding: number[]; entities?: string[] }[] = [];
      try {
        const { assembleACEContext } = await import('../ace/context-assembler.js');
        const ctx = await assembleACEContext({
          query: data.reason ?? `glyph rebuild for case ${data.caseId}`,
          caseId: data.caseId,
          userId: 'system',
          enableWebSearch: false,
        });
        points = ctx.ragChunks
          .filter(
            (c) =>
              Array.isArray(c.metadata?.['embedding']) &&
              (c.metadata!['embedding'] as number[]).length > 0
          )
          .map((c) => ({
            embedding: c.metadata!['embedding'] as number[],
            entities: c.metadata?.['entities'] as string[] | undefined,
          }));
      } catch {
        // No context available — rebuild from cache with skipCache=false just refreshes Redis TTL
      }
      await buildGlyphTileAtlas(data.caseId, points, 16, 16, /* skipCache */ true);
      if (this.channel !== channel) {
        console.warn('⚠️ Glyph tile rebuild: channel recycled during rebuild, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('[glyph.tile.rebuild] handler error:', this.formatError(error));
      if (this.channel !== channel) {
        console.warn('⚠️ Glyph tile rebuild: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg as AmqpMessageObj, error, channel);
    }
  }

  // --- QLoRA Distillation Publisher (P1-B) ---

  async publishQLoRADistill(
    opts: {
      minRerankScore?: number;
      minResponseScore?: number;
      limit?: number;
    } = {}
  ): Promise<boolean> {
    if (!this.isReady()) return false;
    await this.publish(this.exchanges.document_processing, 'qlora.distill', {
      minRerankScore: opts.minRerankScore ?? 0.8,
      minResponseScore: opts.minResponseScore ?? 0.8,
      limit: opts.limit ?? 50,
      ts: Date.now(),
    });
    return true;
  }

  // --- Glyph Tile Rebuild Publisher ---

  async publishGlyphTileRebuild(caseId: string, reason: string): Promise<boolean> {
    if (!this.isReady()) return false;
    await this.publish(this.exchanges.document_processing, 'glyph.tile.rebuild', {
      caseId,
      reason,
      ts: Date.now(),
    });
    return true;
  }

  // --- Generic queue publish (used by glyph-tile-engine and other callers) ---

  async publishToQueue(queue: string, data: unknown): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] publishToQueue skipped — no channel (${queue})`);
      return;
    }
    const message = Buffer.from(JSON.stringify(data));
    this.channel.publish('', queue, message, { persistent: true });
  }

  private async publish(exchange: string, routingKey: string, data: any): Promise<void> {
    if (!this.channel) {
      console.warn(`[RabbitMQ] Publish skipped — no channel (${exchange}/${routingKey})`);
      return;
    }
    return traceQueue('publish', routingKey, { exchange }, async () => {
      try {
        const message = Buffer.from(JSON.stringify(data));
        this.channel!.publish(exchange, routingKey, message, { persistent: true });
      } catch (error) {
        console.error(
          `[RabbitMQ] Publish failed (${exchange}/${routingKey}):`,
          this.formatError(error)
        );
        throw error; // Propagate so callers can handle
      }
    });
  }

  // --- Helpers ---

  private parseMessage(msg: AmqpMessage): any {
    if (!msg) return null;
    try {
      return fastJsonParse(msg.content.toString());
    } catch {
      return null;
    }
  }

  /**
   * Retry-aware nack: checks x-death header count.
   * If retries exhausted, sends to DLQ (nack without requeue).
   * Otherwise, requeues for retry.
   */
  private retryOrDLQ(
    msg: AmqpMessageObj,
    error: unknown,
    channel: AmqpChannel | null = this.channel
  ): void {
    if (!channel) return;
    const deaths = (msg.properties?.headers as Record<string, unknown>)?.['x-death'] as
      | Array<{ count?: number }>
      | undefined;
    const retryCount = deaths?.[0]?.count ?? 0;
    if (retryCount >= RabbitMQManager.MAX_RETRIES) {
      console.warn(
        `☠️ DLQ: message exhausted ${RabbitMQManager.MAX_RETRIES} retries — routing to dead letter`
      );
      channel.nack(msg, false, false); // goes to DLQ via x-dead-letter-exchange
    } else {
      console.warn(
        `🔄 Retry ${retryCount + 1}/${RabbitMQManager.MAX_RETRIES}: ${this.formatError(error)}`
      );
      channel.nack(msg, false, true); // requeue
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  isReady(): boolean {
    return this?.isInitialized && !!this.channel;
  }

  async close(): Promise<void> {
    try {
      this.isShuttingDown = true;
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
      this.channel = null;
      this.connection = null;
      this.isInitialized = false;
      console.log('🔌 RabbitMQ connection closed');
    } catch (err) {
      const message = this.formatError(err);
      if (this.shouldSilenceError(message)) return;
      console.error('❌ RabbitMQ close error:', message);
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        `☠️ RabbitMQ: exhausted ${this.maxReconnectAttempts} reconnect attempts — giving up. ` +
          'Restart process or call initialize() manually to retry.'
      );
      this.emit('connection_failed', {
        attempts: this.reconnectAttempts,
        lastAttempt: Date.now(),
      });
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 60_000);
    console.warn(
      `🔄 RabbitMQ: reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay / 1000)}s`
    );
    setTimeout(() => this.initialize(), delay);
  }

  /**
   * QLoRA Distillation Consumer (P1-B)
   *
   * Triggered by messages on `qlora.distill`. Selects qualifying rows from
   * rag_query_log (rerank_score >= threshold), pulls chunk_hit_log hits,
   * fetches LLM responses from CouchDB inference_log, and inserts into
   * qlora_examples for downstream fine-tuning.
   *
   * Message payload: { minRerankScore?: number, minResponseScore?: number, limit?: number }
   */
  private async handleQLoRADistill(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg) ?? {};
      const minRerankScore = Number(data.minRerankScore ?? 0.8);
      const minResponseScore = Number(data.minResponseScore ?? 0.8);
      const limit = Math.min(Number(data.limit ?? 50), 200);

      console.log(
        `[qlora.distill] Starting distillation: minRerank=${minRerankScore} limit=${limit}`
      );

      if (!this.db) {
        console.warn('[qlora.distill] No DB available — skipping');
        channel.ack(msg);
        return;
      }

      // 1. Find qualifying query_log rows not yet in qlora_examples
      const { pgRows } = await import('../db/client.js');
      const { sql: drizzleSql } = await import('drizzle-orm');
      type CandidateRow = {
        query: string;
        query_hash: string;
        top_rerank_score: number | null;
        entity_statutes: unknown;
        entity_cases: unknown;
      };
      const candidates: CandidateRow[] = await this.db
        .execute(
          drizzleSql`
        SELECT ql.query, ql.query_hash, ql.top_rerank_score,
               ql.entity_statutes, ql.entity_cases
        FROM   rag_query_log ql
        WHERE  ql.top_rerank_score >= ${minRerankScore}
          AND  NOT EXISTS (
            SELECT 1 FROM qlora_examples qe WHERE qe.query_hash = ql.query_hash
          )
        ORDER  BY ql.top_rerank_score DESC
        LIMIT  ${limit}
      `
        )
        .then((r: unknown) => pgRows<CandidateRow>(r))
        .catch(() => []);

      let inserted = 0;
      const couchUrl = ENV.COUCHDB_URL;

      for (const row of candidates) {
        try {
          // 2. Pull top chunk hits
          type HitRow = {
            chunk_id: string;
            relative_path: string;
            gpu_cluster: number | null;
            pipeline: string;
            score: number;
            rerank_score: number | null;
          };
          const hits: HitRow[] = await this.db
            .execute(
              drizzleSql`
            SELECT chunk_id, relative_path, gpu_cluster, pipeline, score, rerank_score
            FROM   chunk_hit_log
            WHERE  query_hash = ${row.query_hash}
            ORDER  BY COALESCE(rerank_score, score) DESC
            LIMIT  10
          `
            )
            .then((r: unknown) => pgRows<HitRow>(r))
            .catch(() => []);

          if (!hits.length) continue;

          // 3. Cluster narrative from Redis
          const topCluster = hits.find((h) => h.gpu_cluster != null)?.gpu_cluster;
          let graphSummary: string | null = null;
          if (topCluster != null && this.redisService) {
            const { clusterSummaryKey } = await import('$lib/server/cache-keys.js');
            const cached = await this.redisService
              .get(clusterSummaryKey.cached(topCluster))
              .catch(() => null);
            if (cached) {
              try {
                const p = JSON.parse(cached) as { summary?: string; purpose?: string };
                graphSummary = p.summary ?? p.purpose ?? null;
              } catch {
                /* ignore */
              }
            }
          }

          // 4. Fetch LLM response from CouchDB inference_log
          let llmResponse = '';
          try {
            const res = await fetch(`${couchUrl}/inference_log/_find`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                selector: { query_hash: row.query_hash },
                sort: [{ created_at: 'desc' }],
                limit: 1,
                fields: ['response', 'self_eval_score'],
              }),
              signal: AbortSignal.timeout(5_000),
            });
            if (res.ok) {
              const d = (await res.json()) as {
                docs?: Array<{ response?: string; self_eval_score?: number }>;
              };
              const doc = d.docs?.[0];
              if (doc?.response && (doc.self_eval_score ?? 0) >= minResponseScore) {
                llmResponse = doc.response;
              }
            }
          } catch {
            /* CouchDB unavailable — skip */
          }

          if (!llmResponse) continue;

          // 5. Quality tier + metadata
          const avgRerank = hits.reduce((s, h) => s + (h.rerank_score ?? h.score), 0) / hits.length;
          const tier = avgRerank >= 0.9 ? 'gold' : avgRerank >= 0.8 ? 'silver' : 'bronze';
          const clusterIds = [
            ...new Set(hits.map((h) => h.gpu_cluster).filter((c): c is number => c != null)),
          ];
          const pipelineHits = hits.reduce<Record<string, number>>((acc, h) => {
            acc[h.pipeline] = (acc[h.pipeline] ?? 0) + 1;
            return acc;
          }, {});
          const contextChunks = hits.map((h) => ({
            id: h.chunk_id,
            filePath: h.relative_path,
            pipeline: h.pipeline,
            score: h.score,
            rerankScore: h.rerank_score,
          }));

          // 6. Insert
          const entityTags = JSON.stringify([
            ...((row.entity_statutes as string[]) ?? []),
            ...((row.entity_cases as string[]) ?? []),
          ]);
          const modelVersion = process.env.OLLAMA_MODEL ?? 'gemma4-legal';
          await this.db.execute(drizzleSql`
            INSERT INTO qlora_examples
              (query, query_hash, instruction, context_chunks, graph_summary,
               response, response_score, pipeline_hits, gpu_clusters, avg_rerank_score,
               entity_tags, quality_tier, model_version)
            VALUES (
              ${row.query}, ${row.query_hash}, ${row.query.trim()},
              ${JSON.stringify(contextChunks)}::jsonb, ${graphSummary},
              ${llmResponse}, ${avgRerank},
              ${JSON.stringify(pipelineHits)}::jsonb,
              ${JSON.stringify(clusterIds)}::jsonb,
              ${avgRerank}, ${entityTags}::jsonb, ${tier}, ${modelVersion}
            )
            ON CONFLICT DO NOTHING
          `);
          inserted++;
        } catch {
          /* non-fatal per-row error */
        }
      }

      console.log(
        `[qlora.distill] Distillation complete: ${inserted}/${candidates.length} examples inserted`
      );
      if (this.channel !== channel) {
        console.warn('⚠️ QLoRA distill: channel recycled during distillation, skipping ack');
        return;
      }
      channel.ack(msg);
    } catch (error) {
      console.error('❌ QLoRA distill error:', this.formatError(error));
      if (this.channel !== channel) {
        console.warn('⚠️ QLoRA distill: channel recycled, cannot nack/requeue');
        return;
      }
      this.retryOrDLQ(msg, error, channel);
    }
  }

  /**
   * Start consumers on all .dlq queues.
   * Drains dead-lettered messages: logs them, persists to failed_jobs table,
   * and stores bounded history in Redis.
   */
  private async startDLQConsumers(): Promise<void> {
    const channel = this.channel;
    if (!channel) return;

    for (const [, queue] of Object.entries(this.queues)) {
      const dlqName = `${queue}.dlq`;
      await channel.consume(
        dlqName,
        async (msg) => {
          if (!msg) return;
          // If channel has been recycled, skip — the new channel will get its own consumers
          if (this.channel !== channel) return;
          try {
            const payload = fastJsonParse(msg.content.toString());
            const deaths = (msg.properties as { headers?: Record<string, unknown> })?.headers?.[
              'x-death'
            ] as
              | Array<{
                  queue?: string;
                  reason?: string;
                  count?: number;
                  time?: number;
                }>
              | undefined;
            const originalQueue = deaths?.[0]?.queue ?? queue;
            const reason = deaths?.[0]?.reason ?? 'unknown';
            const retryCount = deaths?.[0]?.count ?? 0;

            const entry = {
              originalQueue,
              dlqQueue: dlqName,
              reason,
              retryCount,
              payload,
              deadLetteredAt: new Date().toISOString(),
            };

            console.warn(
              `☠️ DLQ consumed [${dlqName}]: reason=${reason}, retries=${retryCount}`,
              JSON.stringify(payload).slice(0, 200)
            );

            // Persist to PostgreSQL failed_jobs table
            if (this.db) {
              try {
                const { failedJobs } = await import('../db/schema-postgres.js');
                await this.db.insert(failedJobs).values({
                  queue: originalQueue,
                  dlqQueue: dlqName,
                  reason,
                  retryCount,
                  payload,
                });
              } catch (dbErr) {
                console.warn('⚠️ DLQ DB persist failed (non-fatal):', this.formatError(dbErr));
              }
            }

            // Store in Redis list (bounded to last 500 entries)
            if (this.redisService) {
              const key = 'dlq:history';
              await this.redisService.lpush(key, JSON.stringify(entry));
              await this.redisService.ltrim(key, 0, 499);
            }

            if (this.channel !== channel) return;
            channel.ack(msg);
          } catch (err) {
            console.error(`❌ DLQ consumer error [${dlqName}]:`, this.formatError(err));
            // Ack anyway — don't let DLQ messages re-dead-letter infinitely
            if (this.channel !== channel) return;
            channel.ack(msg);
          }
        },
        { noAck: false }
      );
    }
    console.log('☠️ DLQ consumers started for all 9 dead-letter queues');
  }

  /** Get DLQ message counts for monitoring */
  async getDLQStatus(): Promise<Record<string, number>> {
    if (!this.channel) return {};
    const counts: Record<string, number> = {};
    for (const [, queue] of Object.entries(this.queues)) {
      try {
        const info = (await this.channel.assertQueue(`${queue}.dlq`, { durable: true })) as {
          messageCount?: number;
        };
        counts[`${queue}.dlq`] = info.messageCount ?? 0;
      } catch {
        counts[`${queue}.dlq`] = -1;
      }
    }
    return counts;
  }

  /** Get recent DLQ history from Redis (last N entries) */
  async getDLQHistory(limit = 50): Promise<unknown[]> {
    if (!this.redisService) return [];
    try {
      const entries = await this.redisService.lrange('dlq:history', 0, limit - 1);
      return entries.map((e: string) => {
        try {
          return JSON.parse(e);
        } catch {
          return e;
        }
      });
    } catch {
      return [];
    }
  }

  // ── Media pipeline handlers (yt-dlp → Whisper → embed → Qdrant) ──────────────

  private async handleMediaDownload(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg) ?? {};
      const { jobId, url, caseId } = data as { jobId?: string; url?: string; caseId?: string };
      if (!jobId || !url) {
        console.warn('[media.download] Missing jobId or url — nacking');
        channel.nack(msg, false, false);
        return;
      }
      console.log(`[media.download] Received job ${jobId}: ${String(url).slice(0, 80)}`);

      // Update job status in Redis so the MCP tool poller can see progress
      const { getRedis } = await import('../redis.js');
      const redis = getRedis();
      await redis.setex(
        `hermes:job:${jobId}`,
        3600,
        JSON.stringify({ status: 'downloading', url, caseId, receivedAt: new Date().toISOString() })
      );

      // Invoke yt-dlp via MediaProcessing service
      if (this.mediaProcessing) {
        try {
          const result = await this.mediaProcessing.downloadMedia(url, jobId);
          console.log(`[media.download] Job ${jobId} download complete: ${result.audioPath}`);

          await redis.setex(
            `hermes:job:${jobId}`,
            3600,
            JSON.stringify({
              status: 'downloaded',
              audioPath: result.audioPath,
              metadata: result.metadata,
              caseId,
              updatedAt: new Date().toISOString(),
            })
          );

          // Chain to transcription
          await this.publish(this.exchanges.media_processing, 'media.transcribe', {
            jobId,
            audioPath: result.audioPath,
            caseId,
          });
        } catch (downloadErr) {
          console.error(`[media.download] Download failed for job ${jobId}:`, downloadErr);
          await redis.setex(
            `hermes:job:${jobId}`,
            3600,
            JSON.stringify({
              status: 'failed',
              error: String(downloadErr),
              updatedAt: new Date().toISOString(),
            })
          );
        }
      } else {
        console.warn(`[media.download] MediaProcessing service not available for job ${jobId}`);
      }

      channel.ack(msg);
    } catch (err) {
      console.error('[media.download] Handler error:', err);
      channel.nack(msg, false, false);
    }
  }

  private async handleMediaTranscribe(msg: AmqpMessage): Promise<void> {
    const channel = this.channel;
    if (!msg || !channel) return;
    try {
      const data = this.parseMessage(msg) ?? {};
      const { jobId, audioPath, caseId, timestampChunking } = data as {
        jobId?: string;
        audioPath?: string;
        caseId?: string;
        timestampChunking?: boolean;
      };
      if (!jobId || !audioPath) {
        console.warn('[media.transcribe] Missing jobId or audioPath — nacking');
        channel.nack(msg, false, false);
        return;
      }
      console.log(`[media.transcribe] Received job ${jobId}: ${String(audioPath).slice(0, 80)}`);

      const { getRedis } = await import('../redis.js');
      const redis = getRedis();
      await redis.setex(
        `hermes:job:${jobId}`,
        3600,
        JSON.stringify({
          status: 'transcribing',
          audioPath,
          caseId,
          timestampChunking: timestampChunking ?? false,
          receivedAt: new Date().toISOString(),
        })
      );

      // Invoke faster-whisper via MediaProcessing service
      if (this.mediaProcessing) {
        try {
          const result = await this.mediaProcessing.transcribeAudio(audioPath, jobId);
          console.log(
            `[media.transcribe] Job ${jobId} transcription complete: ${result.text.slice(0, 50)}...`
          );

          await redis.setex(
            `hermes:job:${jobId}`,
            3600,
            JSON.stringify({
              status: 'completed',
              text: result.text,
              chunks: result.chunks,
              language: result.language,
              caseId,
              updatedAt: new Date().toISOString(),
            })
          );

          // Publish to document embedding queue for search indexing
          await this.publish(this.exchanges.document_processing, 'document.embed', {
            documentId: jobId, // Use jobId as temp doc ID
            text: result.text,
            collection: 'evidence_items',
            metadata: {
              jobId,
              caseId,
              source: 'media_transcription',
              language: result.language,
            },
          });
        } catch (transcribeErr) {
          console.error(`[media.transcribe] Transcription failed for job ${jobId}:`, transcribeErr);
          await redis.setex(
            `hermes:job:${jobId}`,
            3600,
            JSON.stringify({
              status: 'failed',
              error: String(transcribeErr),
              updatedAt: new Date().toISOString(),
            })
          );
        }
      } else {
        console.warn(`[media.transcribe] MediaProcessing service not available for job ${jobId}`);
      }

      channel.ack(msg);
    } catch (err) {
      console.error('[media.transcribe] Handler error:', err);
      channel.nack(msg, false, false);
    }
  }
}

// ── Singleton Export ─────────────────────────────────────────────────────────

declare global {
	// eslint-disable-next-line no-var
	var __RABBITMQ_MANAGER__: RabbitMQManager | undefined;
}

/**
 * Canonical RabbitMQ manager instance.
 * In development, persists across hot reloads using globalThis to prevent
 * duplicate consumers and "module runner closed" artifacts.
 */
export const rabbitmq = (function () {
	if (typeof globalThis !== 'undefined') {
		if (!globalThis.__RABBITMQ_MANAGER__) {
			globalThis.__RABBITMQ_MANAGER__ = new RabbitMQManager();
		}
		return globalThis.__RABBITMQ_MANAGER__;
	}
	return new RabbitMQManager();
})();


