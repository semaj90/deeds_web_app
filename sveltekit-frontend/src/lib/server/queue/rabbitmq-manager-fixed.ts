// amqplib: Named/namespace imports fail with moduleResolution: "bundler"
// Use local interfaces + dynamic import pattern per CLAUDE.md
import { EventEmitter } from 'events';
import { traceQueue } from '$lib/server/observability/langfuse.js';

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
    dlx: 'dlx.dead-letter',
  };

  private readonly queues = {
    cache_invalidate: 'cache.invalidate',
    document_embed: 'document.embed',
    evidence_process: 'evidence.process',
    vector_index: 'vector.index',
    chat_context: 'chat.context',
    analytics_track: 'analytics.track',
    codebase_index: 'codebase.index',
    ace_evaluate: 'ace.evaluate',
    error_embed: 'error.embed',
    synthesis_generate: 'synthesis.generate',
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
      this.reconnectAttempts = 0; // Reset on successful connect
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
      } catch (e) {
        console.warn('⚠️ Redis failed:', this.formatError(e));
      }

      try {
        const dbModule = await import('../db/client.js');
        this.db = dbModule.db;
      } catch (e) {
        console.warn('⚠️ DB failed:', this.formatError(e));
      }

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
      this.connection = (await connect(this.url)) as AmqpConnection;
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

    // Migrate queues created without DLX (pre-existing mismatch fix).
    // AMQP assertQueue fails with PRECONDITION_FAILED if queue exists with
    // different arguments, and that closes the channel. Force delete before
    // re-creating so stale queue args from earlier boot paths do not survive.
    const queuesToMigrate = [
      'cache.invalidate',
      'document.embed',
      'evidence.process',
      'vector.index',
      'chat.context',
      'analytics.track',
      'codebase.index',
      'ace.evaluate',
      'error.embed',
      'synthesis.generate',
    ];
    for (const queue of queuesToMigrate) {
      try {
        await (this.channel as any).deleteQueue(queue);
      } catch {
        // Queue doesn't exist yet — it will be created below
      }
    }

    // Declare main queues with dead-letter routing
    for (const [, queue] of Object.entries(this.queues)) {
      await this.channel.assertQueue(queue, {
        durable: true,
        arguments: {
          'x-message-ttl': 300000, // 5 minutes
          'x-dead-letter-exchange': this.exchanges.dlx,
          'x-dead-letter-routing-key': queue,
        },
      });
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

    console.log('✅ Queue bindings configured (with DLQ)');
  }

  private async bindQueue(queue: string, exchange: string, routingKey: string) {
    if (this.channel) {
      await this.channel.bindQueue(queue, exchange, routingKey);
    }
  }

  private async startConsumers(): Promise<void> {
    if (!this.channel) return;

    // Set prefetch per processing speed:
    // Fast (Redis/analytics): 50, Medium (embedding/evidence): 10, Slow (LLM/ACE): 2
    await this.channel.prefetch(10); // Default for most queues

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

    console.log('👂 All 10 RabbitMQ consumers started (prefetch: 10)');

    // Start DLQ consumers — drain dead-lettered messages for logging/monitoring
    await this.startDLQConsumers();
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
          metadata: data.metadata ?? {},
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
        routes: ['src/routes'],
        lib: ['src/lib'],
        tests: ['tests'],
        all: ['src/routes', 'src/lib', 'tests'],
      };
      const INDEXABLE_EXTENSIONS = new Set(['.ts', '.js', '.mts', '.mjs']);
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

      const chunks = chunkFiles(allFiles, ROOT);
      const result = await indexChunks(chunks);
      console.log(
        `✅ Codebase index complete: ${allFiles.length} files, ${chunks.length} chunks indexed`
      );
      this.channel.ack(msg);
    } catch (error) {
      console.error('❌ Codebase index error:', this.formatError(error));
      this.retryOrDLQ(msg, error);
    }
  }

  private async handleACEEvaluate(msg: AmqpMessage): Promise<void> {
    if (!msg || !this.channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.responseId || !data?.query || !data?.response) {
        this.channel.nack(msg, false, false);
        return;
      }
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
      this.channel.ack(msg);
    } catch (error) {
      console.error('❌ ACE evaluate error:', this.formatError(error));
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
    if (!msg || !this.channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.errorMessage) {
        this.channel.ack(msg);
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

      this.channel.ack(msg);
    } catch (error) {
      console.error('[error.embed] Handler error:', this.formatError(error));
      this.retryOrDLQ(msg as AmqpMessageObj, error);
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
    if (!msg || !this.channel) return;
    try {
      const data = this.parseMessage(msg);
      if (!data?.synthesisId || !data?.query) {
        this.channel.nack(msg, false, false);
        return;
      }
      console.log('🧪 Synthesis generate:', data.synthesisId);

      // Update status → generating
      if (this.redisService) {
        await this.redisService.set(
          `synthesis:status:${data.synthesisId}`,
          JSON.stringify({ status: 'generating', startedAt: new Date().toISOString() }),
          'EX', 3600
        );
      }

      const t0 = performance.now();

      // Stage 1: ACE context assembly
      const { assembleACEContext, buildACEPromptCached } = await import('../ace/context-assembler.js');
      const { orderByDependency, extractCitationRefs } = await import('../retrieval/document-dag.js');
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
        type RAGChunk = { content: string; score: number; source: string };
        const knownIds = new Set(context.ragChunks.map((_: RAGChunk, i: number) => `chunk-${i}`));
        const dagDocs = context.ragChunks.map((c: RAGChunk, i: number) => ({
          id: `chunk-${i}`, title: c.source, score: c.score,
          citations: extractCitationRefs(c.content, knownIds), content: c.content,
        }));
        const { ordered } = orderByDependency(dagDocs);
        const chunkMap = new Map<string, RAGChunk>(context.ragChunks.map((c: RAGChunk, i: number) => [`chunk-${i}`, c]));
        context.ragChunks = ordered
          .map((d: { id: string }) => chunkMap.get(d.id))
          .filter((c): c is RAGChunk => c !== undefined);
      }

      const acePrompt = await buildACEPromptCached(context, data.query);
      const contextMs = performance.now() - t0;

      // Stage 2: Direct Ollama LLM call (no Bifrost — single Ollama request)
      const { ollamaFetch } = await import('../ollama.js');
      const { ENV } = await import('../env.server.js');
      const MODEL = 'gemma3-legal:latest';
      const maxTokens = data.maxTokens ?? 2048;
      const temperature = data.temperature ?? 0.3;

      const userPrompt = `${acePrompt.contextWindow}\n\nQuestion: ${data.query}\n\nProvide a comprehensive legal analysis. Include [Source N] citations where applicable.`;

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
      const answer = (llmData.message?.content ?? '').trim();
      const tokensUsed = llmData.eval_count ?? Math.ceil(answer.length / 4);
      const generateMs = performance.now() - llmStart;

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
        evaluationUrl: data.enableACE !== false ? `/api/synthesis/evaluation/${data.synthesisId}` : null,
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
          'EX', 3600
        );
        await this.redisService.set(
          `synthesis:status:${data.synthesisId}`,
          JSON.stringify({ status: 'complete', completedAt: new Date().toISOString(), totalMs: Math.round(totalMs) }),
          'EX', 3600
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
        .then(({ logLLMInference }) => logLLMInference({
          model: MODEL, backend: 'ollama', latencyMs: Math.round(generateMs),
          tokenCount: tokensUsed, cacheHit: false,
        }))
        .catch(() => {});

      console.log(`✅ Synthesis complete: ${data.synthesisId} (${Math.round(totalMs)}ms, ${tokensUsed} tokens)`);
      this.channel.ack(msg);
    } catch (error) {
      console.error('❌ Synthesis generate error:', this.formatError(error));

      // Store failure status
      if (this.redisService) {
        const data = this.parseMessage(msg);
        if (data?.synthesisId) {
          await this.redisService.set(
            `synthesis:status:${data.synthesisId}`,
            JSON.stringify({ status: 'failed', error: this.formatError(error), failedAt: new Date().toISOString() }),
            'EX', 3600
          ).catch(() => {});
        }
      }

      this.retryOrDLQ(msg as AmqpMessageObj, error);
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
        'EX', 3600
      );
    }
    await this.publish(this.exchanges.document_processing, 'synthesis.generate', {
      ...data,
      enqueuedAt: new Date().toISOString(),
    });
    return true;
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
        console.error(`[RabbitMQ] Publish failed (${exchange}/${routingKey}):`, this.formatError(error));
        throw error; // Propagate so callers can handle
      }
    });
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
    const deaths = (msg.properties?.headers as any)?.['x-death'] as
      | Array<{ count?: number }>
      | undefined;
    const retryCount = deaths?.[0]?.count ?? 0;
    if (retryCount >= RabbitMQManager.MAX_RETRIES) {
      console.warn(
        `☠️ DLQ: message exhausted ${RabbitMQManager.MAX_RETRIES} retries — routing to dead letter`
      );
      this.channel.nack(msg, false, false); // goes to DLQ via x-dead-letter-exchange
    } else {
      console.warn(
        `🔄 Retry ${retryCount + 1}/${RabbitMQManager.MAX_RETRIES}: ${this.formatError(error)}`
      );
      this.channel.nack(msg, false, true); // requeue
    }
  }

  private formatError(err: any): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private isReady(): boolean {
    return this?.isInitialized && !!this.channel;
  }

  private async attemptReconnect(): Promise<void> {
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
   * Start consumers on all .dlq queues.
   * Drains dead-lettered messages: logs them, persists to failed_jobs table,
   * and stores bounded history in Redis.
   */
  private async startDLQConsumers(): Promise<void> {
    if (!this.channel) return;

    for (const [, queue] of Object.entries(this.queues)) {
      const dlqName = `${queue}.dlq`;
      await this.channel.consume(
        dlqName,
        async (msg) => {
          if (!msg || !this.channel) return;
          try {
            const payload = JSON.parse(msg.content.toString());
            const deaths = (msg.properties as any)?.headers?.['x-death'] as
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

            this.channel.ack(msg);
          } catch (err) {
            console.error(`❌ DLQ consumer error [${dlqName}]:`, this.formatError(err));
            // Ack anyway — don't let DLQ messages re-dead-letter infinitely
            this.channel.ack(msg);
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

  async close() {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
  }
}

// Singleton
export const rabbitmq = new RabbitMQManager();


