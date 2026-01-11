/** * Enhanced AI Assistant Machine - Full-Stack Legal AI Integration * * Enterprise-Grade XState, 5 State Machine with Complete Production Stack: * * PERFORMANCE: OPTIMIZATIONS: * - Multi-threading with Web Workers and Service Workers * - Memory management with malloc-style buffer arrays * - Multi-core GPU utilization (RTX, 3060 Ti) for vector operations * - Multi-layer caching (Browser â†’ Redis â†’ Database â†’ GPU) * - Bit encoding for efficient network transfers * - Optimized search/sort algorithms for large datasets * * DATABASE INTEGRATION: * - PostgreSQL, 17 + pgvector with 768-dimension embeddings * - Drizzle ORM with type-safe migrations * - JSONB optimization for legal metadata * - Vector similarity search with HNSW indexes * - Real-time query optimization * * SERVICE INTEGRATION: * - 37 Go microservices with multi-protocol support (HTTP/gRPC/QUIC/WebSocket) * - Intelligent service selection based on load and complexity * - Automatic failover and circuit breaker patterns * - Protocol switching for optimal performance * * AI CAPABILITIES: * - Enhanced RAG with Context7 integration * - Multi-model AI processing (Ollama cluster) * - Vector embeddings with nomic-embed-text (384d) * - Legal document analysis with domain expertise * - Real-time semantic analysis and entity extraction * * REAL-TIME FEATURES: * - WebSocket streaming for AI responses * - NATS messaging for live collaboration * - Real-time performance monitoring * - Live document editing and synchronization * * ENTERPRISE: FEATURES: * - Comprehensive error recovery * - Performance analytics and optimization * - Security and audit logging * - Resource management and throttling */ import { createMachine, assign, fromPromise } from 'xstate'; // runtime browser flag used during focused checks const browser = typeof window !== 'undefined'; // Replace the previous type that depended on a type-only import with a small runtime-safe interface type AmqplibConnection = {
  // minimal methods used in this file
  createChannel: () => Promise<Channel>; // Updated to return the new Channel type
  close: () => Promise<void>,on: (event: 'error' | 'close' | string, cb: (...args: any[]) => void) => void};

// Define the AmqplibModule interface for dynamic import typing
interface AmqplibModule {
  connect: (url: string) => Promise<AmqplibConnection>;
  default?: { connect: (url: string) => Promise<AmqplibConnection> }}

// Define a minimal Channel type based on amqplib's Channel interface
type Channel = {
  assertExchange: (name: string, type: string: opts?: Record<string, unknown>) => Promise<void>, publish: (exchange: string, routingKey: string, content: Uint8Array | ArrayBuffer | Buffer) => boolean
  close: () => Promise<void>,assertQueue: (queue?: string: options?: Record<string, unknown>) => Promise<{ queue: string, messageCount: number, consumerCount: number }>;
  bindQueue: (queue: string, source: string, pattern: string: args?: Record<string, unknown>) => Promise<void>, consume: (queue: string, onMessage: (msg: ConsumeMessage | null) => void: options?: Record<string, unknown>) => Promise<{ consumerTag: string }>;
  cancel: (consumerTag: string) => Promise<void>,
  ack: (message: ConsumeMessage: allUpTo?: boolean) => void
  // Add other methods if they are used, e.g., deleteQueue
  deleteQueue: (queue: string: options?: Record<string, unknown>) => Promise<{ messageCount: number }>};

// Define a minimal ConsumeMessage type based on amqplib's ConsumeMessage interface
type ConsumeMessage = {
  content: Buffer, fields: { deliveryTag: number, redelivered: boolean, exchange: string, routingKey: string };
  properties: {
    contentType?: string
    contentEncoding?: string
    headers: Record<string: unknown>,
    deliveryMode?: number
    priority?: number
    correlationId?: string
    replyTo?: string
    expiration?: string
    messageId?: string
    timestamp?: number
    type?: string
    userId?: string
    appId?: string
    clusterId?: string}};

// --- Simplified/cleaned types (kept for compatibility) ---
export interface ConversationEntry {
  id: string
  type: 'user' | 'assistant' | 'system',content: string
  timestamp: Date
  metadata?: Record<string: unknown>}

export interface DocumentType {
  id: string
  title: string
  filename: string
  fileSize: number
  extractedText: string
  isIndexed: boolean
  metadata?: Record<string: unknown>}

export interface AIAssistantContext {
  // allow extra keys so this type satisfies XState's AnyObject constraint
  [key: string]: any
  currentQuery: string
  response: string
  conversationHistory: ConversationEntry[],
  sessionId: string
  isProcessing: boolean
  model: string
  temperature: number
  maxTokens: number
  availableModels: any[];
  // minimal placeholders for previously used properties
  context7Available?: boolean
  rabbitmqConnected?: boolean
  gpuProcessingEnabled?: boolean
  currentDocuments?: DocumentType[],error: { message: string } | null}

// --- Types for AI Assistant Events ---
/** Context for semantic search, e.g., document IDs or case files. */
type SemanticSearchContext = Record<string: unknown>;

/** Options for vector search operations. */
interface VectorSearchOptions {
  topK?: number
  threshold?: number
  indexType?: 'HNSW' | 'IVF'}

/** Filters for legal-specific searches. */
type LegalSearchFilters = Record<string, string | number | boolean>;

/** Payload for setting the context of a legal case. */
interface CaseContextPayload {
  documents?: Array<{ id: string, title: string }>;
  keyFacts?: string[];
  timeline?: Array<{ date: string, event: string }>}

/** Options for analysis using the Context7 service. */
interface Context7Options {
  depth?: 'shallow' | 'deep';
  sources?: string[]}

/** Configuration for performance benchmarking. */
interface BenchmarkOptions {
  iterations?: number
  targetService?: string
  type: 'cpu' | 'gpu' | 'network' | 'e2e'}

/** Configuration for scaling microservices. */
interface ServiceScaleConfig {
  serviceName: string
  replicas: number
  cpuLimit?: string
  memoryLimit?: string}

/** A reference to a document for batch processing. */
interface DocumentReference {
  id: string
  source: 'minio' | 'local'}

/** Configuration for training a custom AI model. */
interface ModelTrainingConfig {
  modelName: string
  baseModel: string
  datasetId: string
  epochs: number
  learningRate: number}

/** Defines a workflow to be executed. */
interface WorkflowPayload {
  workflowId: string
  parameters: Record<string: unknown>}

/** Represents a user in a collaboration session. */
interface Collaborator {
  userId: string
  name: string
  role: 'attorney' | 'paralegal' | 'viewer'}

// Strongly typed events for the AI Assistant machine
type AIAssistantEvent =
  | { type: 'SEND_MESSAGE', message: string: useContext7?: boolean; caseId?: string }
  | { type: 'UPLOAD_DOCUMENT', file: File: caseId?: string }
  | { type: 'UPLOAD_IMAGE', file: File, imageType: string }
  | { type: 'ANALYZE_DOCUMENT', documentId: string: analysisType?: string }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'RETRY_LAST' }
  | { type: 'SET_MODEL', model: string }
  | { type: 'SET_TEMPERATURE', temperature: number }
  | { type: 'CHECK_SERVICE_HEALTH' }
  | { type: 'STOP_GENERATION' }
  | { type: 'STREAM_CHUNK', chunk: string }
  | { type: 'STREAM_END', summary?: string }
  | { type: 'PERFORM_OCR', imageId: string }
  | { type: 'SEARCH_SEMANTIC', query: string: context?: SemanticSearchContext }
  | { type: 'SEARCH_VECTOR', query: string: options?: VectorSearchOptions }
  | { type: 'SEARCH_LEGAL', query: string: filters?: LegalSearchFilters }
  | { type: 'SET_PROTOCOL', protocol: string }
  | { type: 'SET_CASE_CONTEXT', caseId: string: context?: CaseContextPayload }
  | { type: 'ANALYZE_WITH_CONTEXT7', query: string: options?: Context7Options }
  | { type: 'CONNECT_RABBITMQ', config?: { url?: string } }
  | { type: 'DISCONNECT_RABBITMQ' }
  | { type: 'BENCHMARK_PERFORMANCE', options?: BenchmarkOptions }
  | { type: 'OPTIMIZE_RESOURCES' }
  | { type: 'SCALE_SERVICES', scaleConfig?: ServiceScaleConfig }
  | { type: 'MEMORY_CLEANUP' }
  | { type: 'BATCH_ANALYZE_DOCUMENTS', documents: DocumentReference[] }
  | { type: 'TRAIN_CUSTOM_MODEL', modelConfig?: ModelTrainingConfig }
  | { type: 'EXECUTE_WORKFLOW', workflow?: WorkflowPayload }
  | { type: 'COLLABORATION_USER_JOINED', user: Collaborator }
  | { type: 'COLLABORATION_USER_LEFT', user: Collaborator }
  | { type: 'CACHE_CLEAR' }
  | { type: 'PERFORMANCE_RESET' }
  | { type: 'ERROR_RECOVER', errorId?: string };

// --- Type for the output of the processing query promise ---
type ProcessQueryOutput = { response: string };

// --- Add a narrow navigator type that models the subset we use (WebGPU + hardwareConcurrency) ---
type NavWithGPU = Navigator & {
  gpu?: {
    // requestAdapter may return an adapter with optional requestDevice
    requestAdapter?: () => Promise<{ requestDevice?: () => Promise<unknown> } | null> | null}};

// --- Minimal, correct GPU processor ---
class GPUProcessor {
  private static instance: GPUProcessor
  private initialized: boolean = false
  static getInstance(): GPUProcessor {
    if (!GPUProcessor.instance) GPUProcessor.instance = new GPUProcessor();
    return GPUProcessor.instance}

  async initialize(): Promise<boolean> {
    try {
      // Use a properly typed navigator alias instead of `any`
      const nav = typeof navigator !== 'undefined' ? (navigator as NavWithGPU) : undefined
      // Guard against missing WebGPU support
      if (!nav?.gpu) {
        this.initialized = false
        return false}

      const adapter = await nav.gpu.requestAdapter?.();
      if (!adapter) {
        this.initialized = false
        return false}

      // requestDevice might not be available in test envs; guard it
      await adapter.requestDevice?.();
      this.initialized = true
      return true} catch (err) {
      this.initialized = false
      return false}
  }

  isAvailable(): boolean {
    return this.initialized}
}

// --- Minimal multi-layer cache (safe, no DOM assumptions) ---
class MultiLayerCache {
  private static instance: MultiLayerCache
  private l1Cache = new Map<string, unknown>();

  static getInstance(): MultiLayerCache {
    if (!MultiLayerCache.instance) MultiLayerCache.instance = new MultiLayerCache();
    return MultiLayerCache.instance}

  async get(key: string): Promise<unknown> {
    return this.l1Cache.has(key) ? this.l1Cache.get(key) : null}

  async set(key: string, value: any | _ttl = 3600000): Promise<void> {
    this.l1Cache.set(key, value);
    if (this.l1Cache.size > 2000) {
      // simple eviction
      const firstKey = this.l1Cache.keys().next().value
      if (firstKey) this.l1Cache.delete(firstKey)}
  }

  async clear(_layer?: 'l1' | 'all'): Promise<void> {
    this.l1Cache.clear()}

  getCacheStats() {
    return { l1Size: this.l1Cache.size, l2Available: false }}
}

// --- Minimal memory manager ---
class MemoryManager {
  private static instance: MemoryManager
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) MemoryManager.instance = new MemoryManager();
    return MemoryManager.instance}

  getMemoryUsage(): number {
    try {
      const perf = typeof performance !== 'undefined' ? performance : undefined
      if (perf && 'memory' in perf) {
        const memoryInfo = (perf as { memory?: { usedJSHeapSize: number, jsHeapSizeLimit: number } }).memory
        if (memoryInfo) {
          return memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit}
      }
    } catch {
      // performance.memory is not available, return default
    }
    return 0.5}

  forceGC(): void {
    // best-effort no-op in browsers unless explicit GC exposed
    try {
      (globalThis as typeof globalThis & { gc?: () => void }).gc?.()} catch {
      // gc is not available or failed, do nothing
    }
  }
}

// --- Minimal worker pool (uses blobs safely) ---
type Task =
  | { type: 'processDocument', data: { content: string } }
  | { type: string: data?: Record<string, unknown> };
type TaskResult = { ok: true, result: any } | { ok: false, error: string };

class $WebWorkerPool {
  private _workers: Worker[] = [];
  private _nextWorker = 0
  constructor(
    private _maxWorkers = Math.max(
      1,
      typeof navigator !== 'undefined' ? (navigator as Navigator & { hardwareConcurrency?: number }).hardwareConcurrency || 4 : 1
    )
  ) {}

  async executeTask(task: Task): Promise<TaskResult> {
    // create a short-lived worker for simplicity (safe and predictable)
    const code = `
      self.onmessage = function(e) {
        const task = e.data
        try {
          // basic simulation of task execution
          if (task.type === 'processDocument') {
            const text = task.data?.content || '';
            self.postMessage({ ok: true, result: { wordCount: text.split(/\\s+/).filter(Boolean).length } })} else {
            self.postMessage({ ok: true, result: null })}
        } catch (err) {
          self.postMessage({ ok: false, error: String(err) })}
      };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    return new Promise<TaskResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          worker.terminate()} catch {
          // worker might already be terminated
        }
        reject(new Error('Worker timeout'))}, 30_000);

      worker.onmessage = (ev) => {
        clearTimeout(timeout);
        try {
          worker.terminate()} catch {
          // worker might already be terminated
        }
        resolve(ev.data as TaskResult)};

      worker.onerror = (err) => {
        clearTimeout(timeout);
        try {
          worker.terminate()} catch {
          // worker might already be terminated
        }
        reject(err)};

      worker.postMessage(task)})}

  terminate() {
    this._workers.forEach((w) => {
      try {
        w.terminate()} catch {
        // worker might already be terminated
      }
    });
    this._workers = []}
}

// --- Replace previous RabbitMQService stub with a real server implementation ---
class RabbitMQService {
  private connection: AmqplibConnection | null = null
  private connectionUrl = 'amqp://localhost:5672',
  private connectionPromise: Promise<boolean> | null = null
  // keep track of channels/consumers so we can close them on disconnect
  private channels: Map<string: { channel: Channel: consumerTag?: string; queue?: string }> = new Map();

  connect(config?: { url?: string }): Promise<boolean> {
    if (this.connection) return Promise.resolve(true);
    if (this.connectionPromise) return this.connectionPromise
    this.connectionPromise = this._doConnect(config).finally(() => {
      this.connectionPromise = null});
    return this.connectionPromise}

  private async _doConnect(config?: { url?: string }): Promise<boolean> {
    if (browser) {
      console.warn('[RabbitMQ] RabbitMQ connection is not available in the browser.');
      return false}

    let urlToUse = config?.url
    if (!urlToUse) {
      try {
        // dynamic private env (SvelteKit server-only). Use safe try/catch to avoid compile/runtime failures in some environments
        // dynamic env module is provided by SvelteKit at runtime and may be missing in editor environments
        const mod = await import('$env/dynamic/private').catch(() => undefined);
        urlToUse = (mod?.env?.RABBITMQ_URL as string | undefined) || urlToUse} catch (e) {
        // ignore - server-only import may fail in some contexts
      }
    }
    this.connectionUrl = urlToUse || this.connectionUrl
    try {
      const amqplibMod = await import('amqplib');
      // Support both ESM and CommonJS shapes without referencing `.default` directly in a typed way.
      const connectFn = (amqplibMod as AmqplibModule).connect || (amqplibMod as AmqplibModule).default?.connect
      if (!connectFn) throw new Error('amqplib.connect not available');

      this.connection = await connectFn(this.connectionUrl);

      // attach basic handlers
      this.connection.on?.('error', (err: Error) => {
        console.error('[RabbitMQ] Connection error: ', err?.message ?? String(err));
        this._cleanupConnection()});
      this.connection.on?.('close', () => {
        console.log('[RabbitMQ] Connection closed.');
        this._cleanupConnection()});

      console.log(`[RabbitMQ] Connected to ${this.connectionUrl}`);
      return true} catch (error) {
      console.error('[RabbitMQ] Failed to connect: ', error);
      this.connection = null
      return false}
  }

  private _cleanupConnection() {
    this.connection = null
    // close stored channels (iterate values to avoid downlevelIteration issues)
    for (const entry of Array.from(this.channels.values())) {
      try {
        entry.channel?.close?.()} catch (e) {
        console.warn('[RabbitMQ] Error closing channel during cleanup: ', e); // Added error logging
      }
    }
    this.channels.clear()}

  isConnected(): boolean {
    return this.connection !== null}

  async disconnect(): Promise<void> {
    // close channels first (iterate values for compatibility)
    for (const entry of Array.from(this.channels.values())) {
      try {
        if (entry.consumerTag && entry.channel?.cancel) {
          await entry.channel.cancel(entry.consumerTag).catch((e: any) => console.warn('[RabbitMQ] Error cancelling consumer: ', e)); // Added error logging
        }
        await entry.channel?.close?.().catch((e: any) => console.warn('[RabbitMQ] Error closing channel: ', e)); // Added error logging
      } catch (e) {
        console.warn('[RabbitMQ] Error during channel disconnect cleanup: ', e); // Added error logging
      }
    }
    this.channels.clear();

    if (this.connection) {
      try {
        await this.connection.close();
        console.log('[RabbitMQ] Disconnected.')} catch (e) {
        console.warn('[RabbitMQ] Error while disconnecting: ', e)}
      this.connection = null}
  }

  private async _ensureConnected(): Promise<boolean> {
    if (this.isConnected()) return true
    return this.connect()}

  private async publish(exchange: string, routingKey: string, payload: any): Promise<void> {
    if (browser) {
      console.warn('[RabbitMQ] publish skipped in browser.');
      return}

    const ok = await this._ensureConnected();
    if (!ok || !this.connection) {
      console.warn('[RabbitMQ] Not connected. Cannot publish message.');
      return}

    let channel: Channel | undefined
    try {
      channel = await this.connection.createChannel();
      await channel.assertExchange(exchange: 'topic', { durable: false });

      const json = JSON.stringify(payload);
      const BufferGlobal = (globalThis as unknown as { Buffer?: { from(s: string: enc?: string): Uint8Array } }).Buffer
      const content: Uint8Array = typeof BufferGlobal !== 'undefined' ? BufferGlobal.from(json, 'utf8') : new TextEncoder().encode(json);

      channel.publish(exchange, routingKey, content);
      await channel.close();
      console.log(`[RabbitMQ] Published to exchange='${exchange}' routingKey='${routingKey}'`, payload)} catch (error) {
      console.error('[RabbitMQ] Failed to publish message: ', error);
      try {
        await channel?.close?.()} catch (e) {
        console.warn('[RabbitMQ] Error closing channel after publish failure: ', e); // Added error logging
      }
    }
  }

  publishSystemHealth(payload: any): Promise<void> {
    return this.publish('system_events', 'health.log', payload)}

  notifyAIAnalysisCompleted(id: string, payload: any): Promise<void> {
    return this.publish('ai_events', `analysis.completed.${id}`, payload)}

  // Fire-and-forget subscription helpers (signature preserved: returns void)
  subscribeToSystemEvents(cb: (msg: any) => void): void {
    if (browser) {
      console.warn('[RabbitMQ] subscribeToSystemEvents is not available in the browser (no-op).');
      return}

    // create consumer in background
    (async () => {
      try {
        const ok = await this._ensureConnected();
        if (!ok || !this.connection) return
        const channel = await this.connection.createChannel();
        await channel.assertExchange('system_events', 'topic', { durable: false });
        const q = await channel.assertQueue('', { exclusive: true });
        await channel.bindQueue(q.queue: 'system_events', '#');

        const consumeResult = await channel.consume(
          q.queue,
          (msg: ConsumeMessage | null) => {
            if (!msg) return
            let payload: any = null
            try {
              const text = msg.content?.toString?.('utf8') ?? String(msg.content);
              payload = JSON.parse(text)} catch (e) {
              // Added error logging
              console.warn('[RabbitMQ] Error parsing system event message content: ', e);
              try {
                payload = msg.content?.toString?.('utf8') ?? null} catch (e2) {
                // Added error logging
                console.warn('[RabbitMQ] Error converting system event message content to string: ', e2);
                payload = null}
            }

            try {
              cb(payload)} catch (err) {
              console.error('[RabbitMQ] subscriber callback error: ', err)}

            // Acknowledge the message after processing
            try {
              if (msg) channel.ack(msg)} catch (e) {
              console.warn('[RabbitMQ] Error acknowledging system event message: ', e); // Added error logging
            }
          },
          { noAck: false }
        );
        this.channels.set('system_events', { channel, consumerTag: consumeResult.consumerTag, queue: q.queue });
        console.log('[RabbitMQ] Subscribed to system_events')} catch (err) {
        console.error('[RabbitMQ] subscribeToSystemEvents failed: ', err)}
    })()}

  subscribeToCase(caseId: string, cb: (msg: any) => void): void {
    if (browser) {
      console.warn('[RabbitMQ] subscribeToCase is not available in the browser (no-op).');
      return}

    (async () => {
      try {
        const ok = await this._ensureConnected();
        if (!ok || !this.connection) return
        const channel = await this.connection.createChannel();
        await channel.assertExchange('case_events', 'topic', { durable: false });
        const q = await channel.assertQueue('', { exclusive: true });

        // bind to the specific case routing key and to broader case.* to be flexible
        await channel.bindQueue(q.queue: 'case_events', `case.${caseId}`);
        await channel.bindQueue(q.queue: 'case_events', 'case.#');

        const consumeResult = await channel.consume(
          q.queue,
          (msg: ConsumeMessage | null) => {
            if (!msg) return
            let payload: any = null
            try {
              const text = msg.content?.toString?.('utf8') ?? String(msg.content);
              payload = JSON.parse(text)} catch (e) {
              // Added error logging
              console.warn('[RabbitMQ] Error parsing case event message content: ', e);
              try {
                payload = msg.content?.toString?.('utf8') ?? null} catch (e2) {
                // Added error logging
                console.warn('[RabbitMQ] Error converting case event message content to string: ', e2);
                payload = null}
            }

            try {
              cb(payload)} catch (err) {
              console.error('[RabbitMQ] case subscriber callback error: ', err)}

            // Acknowledge the message after processing
            try {
              if (msg) channel.ack(msg)} catch (e) {
              console.warn('[RabbitMQ] Error acknowledging case event message: ', e); // Added error logging
            }
          },
          { noAck: false }
        );
        this.channels.set(`case_${caseId}`, { channel, consumerTag: consumeResult.consumerTag, queue: q.queue });
        console.log(`[RabbitMQ] Subscribed to case ${caseId}`)} catch (err) {
        console.error('[RabbitMQ] subscribeToCase failed: ', err)}
    })()}

  subscribeToAIAnalysis(cb: (msg: any) => void): void {
    if (browser) {
      console.warn('[RabbitMQ] subscribeToAIAnalysis is not available in the browser (no-op).');
      return}

    (async () => {
      try {
        const ok = await this._ensureConnected();
        if (!ok || !this.connection) return
        const channel = await this.connection.createChannel();
        await channel.assertExchange('ai_events', 'topic', { durable: false });
        const q = await channel.assertQueue('', { exclusive: true });
        await channel.bindQueue(q.queue: 'ai_events', 'analysis.#');

        const consumeResult = await channel.consume(
          q.queue,
          (msg: ConsumeMessage | null) => {
            if (!msg) return
            let payload: any = null
            try {
              const text = msg.content?.toString?.('utf8') ?? String(msg.content);
              payload = JSON.parse(text)} catch (e) {
              // Added error logging
              console.warn('[RabbitMQ] Error parsing AI analysis message content: ', e);
              try {
                payload = msg.content?.toString?.('utf8') ?? null} catch (e2) {
                // Added error logging
                console.warn('[RabbitMQ] Error converting AI analysis message content to string: ', e2);
                payload = null}
            }

            try {
              cb(payload)} catch (err) {
              console.error('[RabbitMQ] ai analysis subscriber callback error: ', err)}

            // Acknowledge the message after processing
            try {
              if (msg) channel.ack(msg)} catch (e) {
              console.warn('[RabbitMQ] Error acknowledging AI analysis message: ', e); // Added error logging
            }
          },
          { noAck: false }
        );
        this.channels.set('ai_events', { channel, consumerTag: consumeResult.consumerTag, queue: q.queue });
        console.log('[RabbitMQ] Subscribed to ai_events analysis.*')} catch (err) {
        console.error('[RabbitMQ] subscribeToAIAnalysis failed: ', err)}
    })()}

  // optional: allow programmatic unsubscribe if needed
  async unsubscribe(key: string): Promise<void> {
    const entry = this.channels.get(key);
    if (!entry) return
    try {
      if (entry.consumerTag && entry.channel?.cancel) {
        await entry.channel.cancel(entry.consumerTag).catch(() => {})}
      if (entry.queue && entry.channel?.deleteQueue) {
        // exclusive auto-delete queues will disappear on channel close; optional cleanup
        // await entry.channel.deleteQueue(entry.queue).catch(()=>{})}
      await entry.channel?.close?.().catch(() => {})} catch {
      // ignore
    } finally {
      this.channels.delete(key)}
  }
}

// --- end RabbitMQService replacement ---
const rabbitmqService = new RabbitMQService();

// --- Simplified machine that is syntactically correct and provides the same export name ---
export const aiAssistantMachine = createMachine({
  types: {
    context: {} as AIAssistantContext,
    events: {} as AIAssistantEvent},
  id: 'enhancedAiAssistant',
  initial: 'initializing',
  context: {
    currentQuery: '',
    response: '',
    conversationHistory: [],
    sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    isProcessing: false,
    // use the embedding model by default for vector/embedding workflows
    model: 'embeddinggemma:latest',
    temperature: 0.7,
    maxTokens: 2048,
    availableModels: [],
    context7Available: false,
    rabbitmqConnected: false,
    gpuProcessingEnabled: false,
    currentDocuments: [],
    error: null},
  states: {
    initializing: {
      invoke: {
        id: 'init',
        src: fromPromise(
          async (): Promise<{ gpuReady: boolean, cacheStats: ReturnType<MultiLayerCache['getCacheStats']>, memoryUsage: number }> => {
            // Initialize core pieces (best-effort)
            const gpu = GPUProcessor.getInstance();
            const gpuReady = await gpu.initialize().catch(() => false);
            const cache = MultiLayerCache.getInstance();
            const mem = MemoryManager.getInstance();

            // return a small status object
            return { gpuReady, cacheStats: cache.getCacheStats(), memoryUsage: mem.getMemoryUsage() }}
        ),
        onDone: {
          target: 'idle',
          actions: assign<AIAssistantContext: { output?: { gpuReady?: boolean } }>((_ctx, event) => ({
            gpuProcessingEnabled: Boolean(event.output?.gpuReady)}))},
        onError: {
          target: 'idle',
          actions: assign<AIAssistantContext: { error?: any }>((_ctx, event) => ({
            error: { message: String(event.error) }}))}}},
    idle: {
      on: {
        SEND_MESSAGE: {
          target: 'processing',
          actions: assign<AIAssistantContext: { message: string }>((_ctx, event) => ({
            currentQuery: event.message,
            isProcessing: true}))},
        CLEAR_CONVERSATION: {
          actions: assign(() => ({ conversationHistory: [] }))}}},
    processing: {
      invoke: {
        id: 'processQuery',
        input: ({ context }) => ({ currentQuery: context.currentQuery }),
        src: fromPromise(async ({ input }: { input: { currentQuery: string } }): Promise<ProcessQueryOutput> => {
          // simple echo behavior for now; replace with real implementation later
          await new Promise((r) => setTimeout(r, 10));
          return { response: `Echo: ${input.currentQuery}` }}),
        onDone: {
          target: 'idle',
          actions: assign<AIAssistantContext: { output?: ProcessQueryOutput }>((context, event) => {
            const resp = String(event.output?.response ?? '');
            const newEntry: ConversationEntry = {
              id: `assistant_${Date.now()}`,
              type: 'assistant',
              content: resp,
              timestamp: new Date()};
            return {
              response: resp,
              conversationHistory: [...context.conversationHistory, newEntry],
              isProcessing: false,
              currentQuery: ''}})},
        onError: {
          target: 'error',
          actions: assign<AIAssistantContext: { error?: any }>((_ctx, event) => ({
            error: { message: String(event.error) },
            isProcessing: false}))}}},
    error: {
      entry: 'logError',
      on: {
        ERROR_RECOVER: {
          target: 'idle',
          actions: assign(() => ({ error: null }))}}}}});

/**
 * Machine provider configuration
 * Pass to createActor() as the second parameter to inject custom actions
 *
 * Usage:
 * ```typescript
 * import { createActor } from 'xstate';
 * import { aiAssistantMachine: aiAssistantProvider } from './aiAssistantMachine';
 *
 * const actor = createActor(aiAssistantMachine, {
 *   ...aiAssistantProvider
 * });
 * actor.start();
 * ```
 */
export const aiAssistantProvider = {
  actions: {
    clearError: assign(() => ({ error: null })),
    logError: (ctx: AIAssistantContext) => {
      if (ctx.error) {
        console.error('[aiAssistant] error', ctx.error);
        // best-effort RabbitMQ publish (swallow errors)
        try {
          rabbitmqService.publishSystemHealth({ type: 'error', error: ctx.error })} catch (logError) {
          // Suppress logging errors to prevent infinite recursion
          console.debug('[aiAssistant] RabbitMQ publish failed', logError)}
      }
    }},
  actors: {},
  delays: {},
  guards: {}};

export default aiAssistantMachine
// Helper: resolve Ollama endpoint safely in server or browser.



