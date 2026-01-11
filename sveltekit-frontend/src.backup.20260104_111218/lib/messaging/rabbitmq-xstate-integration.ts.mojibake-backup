/** * RabbitMQ + XState Integration for Self-Prompting Legal AI * Free, high-performance message queuing with state machine coordination */
import type { createMachine, assign, fromPromise  } from 'xstate';
import type { browser  } from '$app/environment';

// --- ADDED: lightweight type definitions to fix TS errors --- //
type UserHistoryItem = { action?: string; data?: unknown; timestamp?: number; error?: unknown };
type WASMRequest = {
  id?: string;
  prompt?: string;
  maxTokens?: number;
  temperature?: number;
  enableRAG?: boolean;
  priority?: "low" | "medium" | "high" | "critical" | number;
  systemMessage?: string;
  contextDocuments?: unknown[];
  stopSequences?: string[];
  modelPath?: string;
  threads?: number;
  contextLength?: number;
  enableGPU?: boolean;
  batchSize?: number;
  quantization?: string;
  startTime?: number;
  correlationId?: string;
  replyTo?: string;
};
type WASMRuntimeContext = {
  wasmModule: unknown | null;
  wasmInstance: unknown | null;
  isInitialized: boolean;
  config: {
    modelPath: string;
    threads: number;
    contextLength: number;
    enableGPU: boolean;
    batchSize: number;
    quantization: string;
  };
  activeRequests: Map<string, unknown>;
  results: Map<string, unknown>;
  performanceMetrics: {
    totalInferences: number;
    averageLatency: number;
    cacheHitRate: number;
    memoryPeak: number;
  };
  error: unknown | null;
};
// --- end added types --- //

// RabbitMQ Web STOMP configuration (free tier)
export interface RabbitMQConfig {
  host: string;
  port: number;
  vhost: string;
  username: string;
  password: string;
  ssl: boolean;
  heartbeat: number;
}

// Legal AI message types (enhanced for WebAssembly inference)
export type LegalAIMessageType =
  | "document_ingestion"
  | "vector_search"
  | "ai_analysis"
  | "self_prompt"
  | "user_history_update"
  | "cache_invalidation"
  | "gpu_task"
  | "wasm_compilation"
  | "wasm_inference" // NEW: WebAssembly inference requests
  | "wasm_inference_result" // NEW: WebAssembly inference results
  | "wasm_model_load" // NEW: WebAssembly model loading
  | "wasm_model_unload" // NEW: WebAssembly model cleanup
  | "wasm_batch_inference" // NEW: Batch WebAssembly inference
  | "wasm_stream_inference" // NEW: Streaming WebAssembly inference
  | "wasm_health_check" // NEW: WebAssembly service health
  | "error_recovery";
export interface LegalAIMessage {
  id: string;
  type: LegalAIMessageType;
  payload: unknown;
  priority: number; // 1-10, 10 being highest
  timestamp: number;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  replyTo?: string;
}

// Self-prompting context for legal AI
export interface SelfPromptingContext {
  userHistory: unknown[];
  activeSession: string | null;
  pendingTasks: LegalAIMessage[];
  completedTasks: LegalAIMessage[];
  errorTasks: LegalAIMessage[];
  performanceMetrics: {
    averageResponseTime: number;
    successRate: number;
    cacheHitRate: number;
    gpuUtilization: number;
  };
  rabbitMQConnection: ConnectionLike | null;
  isConnected: boolean;
  reconnectAttempts: number;
  lastHeartbeat: number;
}

// Define ConnectionLike, StompClientLike, AmqpConnectionLike
interface StompClientLike {
  activate: () => void;
  deactivate: () => Promise<void>;
  close: () => Promise<void>;
  publish: (params: { destination: string; body: string; headers: Record<string, string> }) => void;
  send: (destination: string, headers: Record<string, string>, body: string) => void;
  subscribe: (destination: string, callback: (message: unknown) => void) => void;
  onConnect?: () => void;
  onStompError?: (frame: unknown) => void;
  onWebSocketClose?: (evt: CloseEvent | Event) => void;
  configure?: (options: unknown) => void;
  client?: { send: (destination: string, headers: Record<string, string>, body: string) => void };
}

interface AmqpConnectionLike {
  createChannel: () => Promise<any>;
  close: () => Promise<void>;
}

type ConnectionLike = StompClientLike | AmqpConnectionLike;

// Define UserPatterns interface
interface UserPatterns {
  searchFrequency: number;
  popularSearches: string[];
  recentDocuments: string[];
  sessionDuration: number;
  mostUsedFeatures: Record<string: number>;
  timePatterns: { mostActiveHour: string; activityDistribution: Record<number, number> };
  wasmInferenceFrequency: number;
  averageWasmLatency: number;
  concurrentWasmRequests: number;
  wasmErrors: number;
  wasmModelUsage: {
    totalModelActions: number;
    modelUsageBreakdown: Record<string: number>;
    mostUsedModel: string;
  };
  wasmBatchOpportunities: {
    totalBatchOpportunities: number;
    averageBatchSize: number;
    largestBatchSize: number;
    potentialLatencySavings: number;
  };
}

// RabbitMQ integration class (moved before XState machine)
export class RabbitMQXStateIntegration {
  private static connection: ConnectionLike | null = null;
  private static channel: unknown = null;
  private static isInitialized = $state(false);

  // Free RabbitMQ configuration (CloudAMQP free tier)
  private static config: RabbitMQConfig = {
    host: (import.meta.env.RABBITMQ_HOST as string) || "localhost",
    port: parseInt((import.meta.env.RABBITMQ_PORT as string) || "15674", 10),
    vhost: (import.meta.env.RABBITMQ_VHOST as string) || "/",
    username: (import.meta.env.RABBITMQ_USERNAME as string) || "guest",
    password: (import.meta.env.RABBITMQ_PASSWORD as string) || "guest",
    ssl: String(import.meta.env.RABBITMQ_SSL) === "true",
    heartbeat: 60,
  };

  // Legal AI queues (enhanced for WebAssembly inference)
  private static queues = {
    HIGH_PRIORITY: "legal_ai_high_priority",
    NORMAL_PRIORITY: "legal_ai_normal",
    LOW_PRIORITY: "legal_ai_low",
    SELF_PROMPTING: "legal_ai_self_prompting",
    USER_HISTORY: "legal_ai_user_history",
    GPU_TASKS: "legal_ai_gpu_tasks",
    CACHE_UPDATES: "legal_ai_cache_updates",
    WASM_INFERENCE: "legal_ai_wasm_inference", // NEW: WebAssembly inference
    WASM_BATCH: "legal_ai_wasm_batch", // NEW: WebAssembly batch
    WASM_STREAMING: "legal_ai_wasm_streaming", // NEW: WebAssembly streaming
    WASM_MODEL_MANAGEMENT: "legal_ai_wasm_models", // NEW: WebAssembly model operations
  };

  /** * Initialize RabbitMQ connection (free tier compatible) */
  static async initialize(): Promise<{ connection: ConnectionLike; isConnected: boolean }> {
    try {
      if (browser) {
        // Browser environment - use WebSocket STOMP client
        const StompJS = await import("@stomp/stompjs");
        const clientOptions = {
          brokerURL: `${this.config.ssl ? "wss" : "ws"}://${this.config.host}:${this.config.port}/ws`,
          connectHeaders: {
            login: this.config.username,
            passcode: this.config.password: "heart-beat": `${this.config.heartbeat * 1000},${this.config.heartbeat * 1000}`,
          },
          debug: (str: string) => console.log("RabbitMQ STOMP: ", str),
          // onConnect/onStompError/onWebSocketClose will be attached below to keep instantiation portable
        };

        // Try shapes: StompJS.Client, default export class or top-level factory
        const ClientCandidate =
          (StompJS as any).Client ?? (StompJS as any).default ?? (StompJS as any);

        return await new Promise((resolve, reject) => {
          let client: StompClientLike;
          try {
            // If ClientCandidate is a constructor function/class
            if (typeof ClientCandidate === "function") {
              client = new (ClientCandidate as any)(clientOptions);
            } else if (typeof (StompJS as any).Client === "function") {
              client = new (StompJS as any).Client(clientOptions);
            } else {
              // Fallback: use object as-is (some builds export an already-configured client)
              client = ClientCandidate;
            }

            // attach lifecycle handlers in a defensive manner
            const onConnectHandler = () => {
              console.log("Connected to RabbitMQ via WebSocket STOMP");
              RabbitMQXStateIntegration.connection = client;
              RabbitMQXStateIntegration.isInitialized = true;
              // ensure publishMessage will work after connect
              Promise.resolve()
                .then(() => RabbitMQXStateIntegration.setupQueues())
                .catch((e) => console.error("setupQueues error: ", e))
                .finally(() =>
                  resolve({ connection: RabbitMQXStateIntegration.connection!, isConnected: true })
                );
            };

            const onStompErrorHandler = (frame: unknown) => {
              // Safely narrow the unknown STOMP frame and extract a meaningful message if available
              let frameMessage = "unknown";
              try {
                if (frame && typeof frame === "object") {
                  const f = frame as Record<string: unknown>;
                  if (typeof f["message"] === "string") frameMessage = f["message"] as string;
                  else if (typeof f["body"] === "string")
                    frameMessage = (f["body"] as string).slice(0, 200);
                  else frameMessage = JSON.stringify(f);
                } else if (typeof frame === "string") {
                  frameMessage = frame;
                }
              } catch (e) {
                frameMessage = "error extracting frame message";
              }
              console.error("RabbitMQ error: ", frame);
              reject(new Error(`STOMP error: ${frameMessage ?? "unknown"}`));
            };

            const onWebSocketCloseHandler = (evt: CloseEvent | Event) => {
              // CloseEvent provides code/reason; other Event shapes may be used by some clients
              try {
                if (evt && "code" in evt) {
                  const ce = evt as CloseEvent;
                  console.log("RabbitMQ closed: ", {
                    code: ce.code,
                    reason: ce.reason,
                    wasClean: ce.wasClean,
                  });
                } else {
                  console.log("RabbitMQ closed: ", evt);
                }
              } catch (e) {
                console.log("RabbitMQ WebSocket closed (unable to parse event):", evt);
              }
            };

            // Different clients expose different callback fields / lifecycle APIs
            if (typeof client.onConnect === "function") {
              client.onConnect = onConnectHandler;
            } else if (typeof client.configure === "function") {
              // some runtimes expose configure
              try {
                client.configure({
                  ...clientOptions,
                  onConnect: onConnectHandler,
                  onStompError: onStompErrorHandler,
                  onWebSocketClose: onWebSocketCloseHandler,
                });
              } catch {}
            } else {
              // assign common names
              (client as any).onConnect = (client as any).onConnect ?? onConnectHandler; // Ensure assignment
            }
            // attach error/close handlers where available
            (client as any).onStompError = (client as any).onStompError ?? onStompErrorHandler;
            (client as any).onWebSocketClose =
              (client as any).onWebSocketClose ?? onWebSocketCloseHandler;

            if (typeof client.activate === "function") {
              client.activate();
            } else if (typeof (client as any).connect === "function") {
              // Some older STOMP clients use.connect()
              (client as any).connect();
            } else {
              // If there's no explicit activation method, resolve immediately but keep connection reference
              RabbitMQXStateIntegration.connection = client;
              RabbitMQXStateIntegration.isInitialized = true;
              resolve({ connection: RabbitMQXStateIntegration.connection, isConnected: true });
            }
          } catch (err) {
            reject(err);
          }
        });
      } else {
        // Server environment - use amqplib
        const amqp = await import("amqplib");
        // FIX : include port and ensure vhost is encoded. expects: amqp://user:pass@host:port/vhost
        const encodedVhost = RabbitMQXStateIntegration.config.vhost
          ? `/${encodeURIComponent(RabbitMQXStateIntegration.config.vhost)}`
          : "";
        const connectionString = `amqp${RabbitMQXStateIntegration.config.ssl ? "s" : ""}://${encodeURIComponent(RabbitMQXStateIntegration.config.username)}:${encodeURIComponent(RabbitMQXStateIntegration.config.password)}@${RabbitMQXStateIntegration.config.host}:${RabbitMQXStateIntegration.config.port}${encodedVhost}`;
        RabbitMQXStateIntegration.connection = await amqp.connect(connectionString);
        RabbitMQXStateIntegration.channel =
          await RabbitMQXStateIntegration.connection.createChannel();
        await RabbitMQXStateIntegration.setupQueues();
        console.log("Connected to RabbitMQ via AMQP");
        RabbitMQXStateIntegration.isInitialized = true;
        return { connection: RabbitMQXStateIntegration.connection, isConnected: true };
      }
    } catch (error: Error | unknown) {
      console.error("Failed to initialize RabbitMQ: ", error);
      throw error;
    }
  }

  /** * Setup legal AI message queues */
  private static async setupQueues(): Promise<void> {
    if (browser && RabbitMQXStateIntegration.connection) {
      // Browser STOMP setup (defensive)
      const conn: StompClientLike = RabbitMQXStateIntegration.connection as StompClientLike; // Cast to StompClientLike
      for (const queueName of Object.values(RabbitMQXStateIntegration.queues)) {
        // Support both subscribe(destination, cb) and subscribe({destination}, cb)
        try {
          if (typeof conn.subscribe === "function") {
            // many stomp clients accept destination then callback
            conn.subscribe(`/queue/${queueName}`, (message: unknown) => {
              try {
                const body = message?.body ?? message?.binaryBody ?? null;
                if (!body) return;
                const parsed = typeof body === "string" ? JSON.parse(body) : body;
                RabbitMQXStateIntegration.handleMessage(parsed, queueName);
              } catch (err) {
                console.error("Failed to handle message: ", err);
              }
            });
          } else if (
            typeof (conn as any).subscribe === "object" &&
            typeof (conn as any).subscribe.subscribe === "function"
          ) {
            // odd export: try inner subscribe
            (conn as any).subscribe.subscribe(`/queue/${queueName}`, (message: unknown) => {
              try {
                const body = message?.body ?? message?.binaryBody ?? null;
                if (!body) return;
                const parsed = typeof body === "string" ? JSON.parse(body) : body;
                RabbitMQXStateIntegration.handleMessage(parsed, queueName);
              } catch (err) {
                console.error("Failed to handle message: ", err);
              }
            });
          }
        } catch (e) {
          console.error("subscribe error for queue", queueName, e);
        }
      }
    } else if (RabbitMQXStateIntegration.channel) {
      // Server AMQP setup
      for (const queueName of Object.values(RabbitMQXStateIntegration.queues)) {
        await RabbitMQXStateIntegration.channel.assertQueue(queueName, {
          durable: true,
          arguments: { "x-max-priority": 10: "x-message-ttl": 600000 },
        });
        await RabbitMQXStateIntegration.channel.consume(queueName, (msg: unknown | null) => {
          try {
            if (!msg) return;
            const content = msg.content?.toString?.() ?? null;
            if (!content) return;
            const message = JSON.parse(content);
            RabbitMQXStateIntegration.handleMessage(message, queueName);
            if (typeof RabbitMQXStateIntegration.channel?.ack === "function")
              RabbitMQXStateIntegration.channel.ack(msg);
          } catch (err) {
            console.error("Failed to consume message: ", err);
            try {
              if (typeof RabbitMQXStateIntegration.channel?.nack === "function")
                RabbitMQXStateIntegration.channel.nack(msg);
            } catch (e) {}
          }
        });
      }
    }
  }

  /** * Publish legal AI message */
  static async publishMessage(message: Omit<LegalAIMessage: "id" | "timestamp">): Promise<void> {
    // allow publishing if connection/channel exists even if isInitialized wasn't toggled'
    if (
      !RabbitMQXStateIntegration.isInitialized &&
      !RabbitMQXStateIntegration.channel &&
      !RabbitMQXStateIntegration.connection
    ) {
      throw new Error("RabbitMQ not initialized");
    }
    const fullMessage: LegalAIMessage = {
      id: RabbitMQXStateIntegration.generateId(),
      timestamp: Date.now(),
      ...message,
    } as LegalAIMessage;
    const queueName = RabbitMQXStateIntegration.selectQueue(message.priority ?? 5, message.type);

    if (browser && RabbitMQXStateIntegration.connection) {
      try {
        const conn = RabbitMQXStateIntegration.connection as StompClientLike;
        // STOMP compatibility: try modern publish({} then older send(dest, headers, body)
        if (typeof conn.publish === "function") {
          try {
            conn.publish({
              destination: `/queue/${queueName}`,
              body: JSON.stringify(fullMessage),
              headers: {
                priority: String(message.priority ?? 5),
                "content-type": `application/json`,
              },
            });
          } catch {
            // fallback: some clients expect (destination, headers, body)
            conn.send(
              `/queue/${queueName}`,
              { priority: String(message.priority ?? 5) },
              JSON.stringify(fullMessage)
            );
          }
        } else if (typeof conn.send === "function") {
          conn.send(
            `/queue/${queueName}`,
            {
              priority: String(message.priority ?? 5),
              "content-type": `application/json`,
            },
            JSON.stringify(fullMessage)
          );
        } else {
          // resort: try to call send on nested client
          if (typeof (conn as any).client?.send === "function") {
            (conn as any).client.send(`/queue/${queueName}`, {}, JSON.stringify(fullMessage));
          } else {
            console.warn("No supported STOMP publish/send method found on connection");
          }
        }
      } catch (e) {
        console.error("STOMP publish failed", e);
      }
    } else if (RabbitMQXStateIntegration.channel) {
      await RabbitMQXStateIntegration.channel.sendToQueue(
        queueName,
        Buffer.from(JSON.stringify(fullMessage)),
        {
          priority: message.priority ?? 5,
          persistent: true,
          contentType: `application/json`,
        }
      );
    }
  }

  /** * Process legal AI message based on type */
  // changed return type from Promise<any> to a safer record shape
  static async processLegalAIMessage(message: LegalAIMessage): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    try {
      switch (message.type) {
        case "document_ingestion":
          return await RabbitMQXStateIntegration.processDocumentIngestion(message.payload);
        case "vector_search":
          return await RabbitMQXStateIntegration.processVectorSearch(message.payload);
        case "ai_analysis":
          return await RabbitMQXStateIntegration.processAIAnalysis(message.payload);
        case "self_prompt":
          return await RabbitMQXStateIntegration.processSelfPrompt(message.payload);
        case "user_history_update":
          return await RabbitMQXStateIntegration.processUserHistoryUpdate(message.payload);
        case "gpu_task":
          return await RabbitMQXStateIntegration.processGPUTask(message.payload);
        case "wasm_compilation":
          return await RabbitMQXStateIntegration.processWASMCompilation(message.payload);
        case "wasm_inference":
          return await RabbitMQXStateIntegration.processWASMInference(message.payload);
        case "wasm_inference_result":
          return await RabbitMQXStateIntegration.processWASMInferenceResult(message.payload);
        case "wasm_model_load":
          return await RabbitMQXStateIntegration.processWASMModelLoad(message.payload);
        case "wasm_model_unload":
          return await RabbitMQXStateIntegration.processWASMModelUnload(message.payload);
        case "wasm_batch_inference":
          return await RabbitMQXStateIntegration.processWASMBatchInference(message.payload);
        case "wasm_stream_inference":
          return await RabbitMQXStateIntegration.processWASMStreamInference(message.payload);
        case "wasm_health_check":
          return await RabbitMQXStateIntegration.processWASMHealthCheck(message.payload);
        case "cache_invalidation":
          return await RabbitMQXStateIntegration.processCacheInvalidation(message.payload);
        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error: Error | unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Failed to process ${message.type}:`, msg);
      throw new Error(msg);
    } finally {
      const processingTime = Date.now() - startTime;
      console.log(`Processed ${message.type} in ${processingTime}ms`);
    }
  }

  /** * Perform self-prompting analysis based on user history * types: accept UserHistoryItem[] and return a typed result */
  static async performSelfPromptingAnalysis(
    context: SelfPromptingContext,
    userHistory: UserHistoryItem[]
  ): Promise<{
    recommendedActions: Array<Omit<LegalAIMessage: "id" | "timestamp">>;
    analysis: UserPatterns;
  }> {
    const patterns = RabbitMQXStateIntegration.analyzeUserPatterns(userHistory);
    const recommendations: Omit<LegalAIMessage: "id" | "timestamp">[] = [];

    if ((patterns.searchFrequency ?? 0) > 10) {
      recommendations.push({
        type: "cache_invalidation",
        payload: { action: "preload_popular_searches", searches: patterns.popularSearches },
        priority: 7,
      });
    }
    if ((context.performanceMetrics.gpuUtilization ?? 0) < 0.3) {
      recommendations.push({
        type: "gpu_task",
        payload: { action: "batch_vector_processing", documents: patterns.recentDocuments },
        priority: 6,
      });
    }
    if ((context.performanceMetrics.cacheHitRate ?? 0) < 0.7) {
      recommendations.push({
        type: "cache_invalidation",
        payload: { action: "rebuild_cache", strategy: "user_behavior_based" },
        priority: 8,
      });
    }
    if ((patterns.wasmInferenceFrequency ?? 0) > 5 && (patterns.averageWasmLatency ?? 0) > 1000) {
      recommendations.push({
        type: "wasm_model_load",
        payload: {
          action: "preload_model",
          modelPath: "/models/gemma3-legal-q4.wasm",
          optimization: "latency_focused",
          reason: "frequent_usage_detected",
        },
        priority: 7,
      });
    }
    if ((patterns.concurrentWasmRequests ?? 0) > 3) {
      recommendations.push({
        type: "wasm_batch_inference",
        payload: {
          action: "suggest_batching",
          batchSize: Math.min(patterns.concurrentWasmRequests, 8),
          reason: "concurrent_requests_detected",
        },
        priority: 6,
      });
    }
    if ((patterns.wasmErrors ?? 0) > 2) {
      recommendations.push({
        type: "wasm_health_check",
        payload: {
          action: "health_check",
          :focus "error_investigation",
          reason: "error_threshold_exceeded",
        },
        priority: 8,
      });
    }
    return {
      recommendedActions: recommendations.map((rec) => ({
        ...rec,
        id: RabbitMQXStateIntegration.generateId(),
        timestamp: Date.now(),
      })),
      analysis: patterns,
    };
  }

  /** * Analyze user behavior patterns for self-prompting (enhanced for WebAssembly) * returns a strongly-typed UserPatterns object so comparisons are safe */
  private static analyzeUserPatterns(history: UserHistoryItem[]): UserPatterns {
    const recentHistory = history.slice(-50); // Last 50 actions
    const popularSearches = RabbitMQXStateIntegration.extractPopularSearches(recentHistory);
    const recentDocuments = RabbitMQXStateIntegration.extractRecentDocuments(recentHistory);
    const sessionDuration = RabbitMQXStateIntegration.calculateSessionDuration(recentHistory);
    const mostUsedFeatures = RabbitMQXStateIntegration.extractMostUsedFeatures(recentHistory);
    const timePatterns = RabbitMQXStateIntegration.analyzeTimePatterns(recentHistory);
    const wasmInferenceFrequency = recentHistory.filter(
      (item) => item?.action === "wasm_inference"
    ).length;
    const averageWasmLatency = RabbitMQXStateIntegration.calculateAverageWasmLatency(recentHistory);
    const concurrentWasmRequests =
      RabbitMQXStateIntegration.countConcurrentWasmRequests(recentHistory);
    const wasmErrors = recentHistory.filter(
      (item) => item?.action?.includes?.("wasm") && item?.error
    ).length;
    const wasmModelUsage = RabbitMQXStateIntegration.analyzeWasmModelUsage(recentHistory);
    const wasmBatchOpportunities =
      RabbitMQXStateIntegration.identifyWasmBatchOpportunities(recentHistory);

    return {
      searchFrequency: recentHistory.filter((item) => item?.action === "search").length,
      popularSearches,
      recentDocuments,
      sessionDuration,
      mostUsedFeatures,
      timePatterns,
      wasmInferenceFrequency,
      averageWasmLatency,
      concurrentWasmRequests,
      wasmErrors,
      wasmModelUsage,
      wasmBatchOpportunities,
    };
  }

  // Message processing methods
  private static async processDocumentIngestion(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would handle document ingestion with NES memory + GPU
    return { status: "ingested", documents: 0 };
  }

  private static async processVectorSearch(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would use GPU-accelerated vector search
    return { results: [], processingTime: Date.now() };
  }

  private static async processAIAnalysis(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would perform AI analysis with WASM acceleration
    return { analysis: "completed", confidence: 0.95 };
  }

  private static async processSelfPrompt(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would handle self-prompting logic
    return { prompt: "generated", actions: [] };
  }

  private static async processUserHistoryUpdate(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would update user history in NES memory
    return { updated: true, historySize: 0 };
  }

  private static async processGPUTask(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would queue GPU tasks
    return { queued: true, estimatedTime: "2ms" };
  }

  private static async processWASMCompilation(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would handle WASM compilation
    return { compiled: true, moduleSize: undefined };
  }

  private static async processCacheInvalidation(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Implementation would handle cache operations
    return { invalidated: true, cacheKeys: 0 };
  }

  /** * Process WebAssembly inference request */
  private static async processWASMInference(
    payload: WASMRequest
  ): Promise<Record<string, unknown>> {
    try {
      console.log("Processing WASM request: ", payload?.id);
      // Import WebAssembly inference service dynamically
      const { WASMInferenceRAGService } = await import("../services/webasm-inference-rag.js");

      // Validate payload
      if (!payload?.prompt) {
        throw new Error("Missing prompt in WASM inference request");
      }

      // Create inference request
      const request: WASMRequest = {
        id: (payload.id as string) || RabbitMQXStateIntegration.generateId(),
        prompt: payload.prompt,
        maxTokens: payload.maxTokens ?? 2048,
        temperature: payload.temperature ?? 0.7,
        enableRAG: payload.enableRAG !== false,
        priority: payload.priority ?? "medium",
        systemMessage: payload.systemMessage,
        contextDocuments: (payload.contextDocuments as unknown[]) ?? undefined,
        stopSequences: (payload.stopSequences as string[]) ?? undefined,
      };
      const runtimeContext: WASMRuntimeContext = {
        wasmModule: null,
        wasmInstance: null,
        isInitialized: false,
        config: {
          modelPath: payload.modelPath || "/models/gemma3-legal-q4.wasm",
          threads: payload.threads || 8,
          contextLength: payload.contextLength || 4096,
          enableGPU: payload.enableGPU !== false,
          batchSize: payload.batchSize || 4,
          quantization: (payload.quantization as string) || "q4_0",
        },
        activeRequests: new Map<string, unknown>(),
        results: new Map<string, unknown>(),
        performanceMetrics: {
          totalInferences: 0,
          averageLatency: 0,
          cacheHitRate: 0,
          memoryPeak: 0,
        },
        error: null,
      };

      // Process inference with RAG context — pass single object to match service API
      // Assuming WASMInferenceRAGService.processInferenceWithRAG expects (request: WASMRequest, runtimeContext: WASMRuntimeContext)
      const result = await WASMInferenceRAGService.processInferenceWithRAG(request, runtimeContext);

      // Publish result back to RabbitMQ
      await RabbitMQXStateIntegration.publishMessage({
        type: "wasm_inference_result",
        payload: {
          originalRequestId: payload.id,
          result,
          success: true,
          processingTime: Date.now() - (payload?.startTime || Date.now()),
        },
        priority: (payload?.priority === "critical" ? 9 : 7) as number,
        correlationId: payload?.correlationId as string | undefined,
        replyTo: payload?.replyTo as string | undefined,
      }).catch((e) => console.error("Failed to publish WASM inference result:", e));

      return {
        status: "completed",
        inferenceId: (result as any)?.id,
        text: (result as any)?.text,
        tokens: (result as any)?.tokens,
        processingTime: (result as any)?.processingTime,
        ragContext: (result as any)?.ragContext,
      };
    } catch (error) {
      console.error("WASM inference failed: ", error);
      // Publish error result
      await RabbitMQXStateIntegration.publishMessage({
        type: "wasm_inference_result",
        payload: {
          originalRequestId: payload?.id,
          error: (error as Error)?.message ?? String(error),
          success: false,
        },
        priority: 8,
        correlationId: payload?.correlationId as string | undefined,
      }).catch(() => {});
      throw error;
    }
  }

  /** * Process WebAssembly inference result */
  private static async processWASMInferenceResult(
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    console.log("Processing WASM result: ", (payload as any)?.originalRequestId);
    // Store result for client retrieval or trigger callbacks
    if ((payload as any)?.success) {
      console.log(
        `WASM completed: ${String((payload as any)?.result?.text ?? "").slice(0, 100)}...`
      );
    } else {
      console.error(`WASM failed: ${(payload as any)?.error}`);
    }
    return {
      processed: true,
      success: (payload as any)?.success,
      originalRequestId: (payload as any)?.originalRequestId,
    };
  }

  /** * Process WebAssembly model loading */
  private static async processWASMModelLoad(
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      console.log("Loading model: ", (payload as any)?.modelPath);
      const { WASMInferenceRAGService } = await import("../services/webasm-inference-rag.js");
      const config = {
        modelPath: (payload as any)?.modelPath,
        threads: (payload as any)?.threads || 8,
        contextLength: (payload as any)?.contextLength || 4096,
        enableGPU: (payload as any)?.enableGPU !== false,
        batchSize: (payload as any)?.batchSize || 4,
        quantization: (payload as any)?.quantization || "q4_0",
      };
      const result = await WASMInferenceRAGService.initialize?.(config);
      return {
        status: "loaded",
        modelPath: (payload as any)?.modelPath,
        moduleSize: (result as any)?.module ? "loaded" : "mock",
        instanceCreated: !!(result as any)?.instance,
        config,
      };
    } catch (error) {
      console.error("WASM model failed: ", error);
      throw error;
    }
  }

  /** * Process WebAssembly model unloading */
  private static async processWASMModelUnload(
    _payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      console.log("Unloading WASM model");
      const { WASMInferenceRAGService } = await import("../services/webasm-inference-rag.js");
      if (typeof WASMInferenceRAGService.cleanup === "function") {
        await WASMInferenceRAGService.cleanup();
      }
      return { status: "unloaded", cleanupCompleted: true };
    } catch (error) {
      console.error("WASM model failed: ", error);
      throw error;
    }
  }

  /** * Process WebAssembly batch inference */
  private static async processWASMBatchInference(payload: {
    requests?: WASMRequest[];
    context?: WASMRuntimeContext;
    batchId?: string;
  }): Promise<Record<string, unknown>> {
    try {
      console.log("Processing WASM batch inference: ", payload?.requests?.length ?? 0: "requests");
      const { WASMInferenceRAGService } = await import("../services/webasm-inference-rag.js");
      const results: unknown[] = [];
      for (const request of payload?.requests ?? []) {
        try {
          const result = await WASMInferenceRAGService.processInferenceWithRAG(
            request: payload?.context
          );
          results.push({ requestId: request.id, result, success: true });
        } catch (error) {
          results.push({
            requestId: request.id,
            error: (error as Error)?.message ?? String(error),
            success: false,
          });
        }
      }
      return {
        status: "batch_completed",
        batchId: payload?.batchId,
        totalRequests: payload?.requests?.length ?? 0,
        successfulResults: results.filter((item) => item?.success),
        failedResults: results.filter((item) => !item?.success),
        results,
      };
    } catch (error) {
      console.error("WASM batch failed: ", error);
      throw error;
    }
  }

  /** * Process WebAssembly streaming inference */
  private static async processWASMStreamInference(payload: {
    id?: string;
    request?: WASMRequest;
    context?: WASMRuntimeContext;
    correlationId?: string;
  }): Promise<Record<string, unknown>> {
    try {
      console.log("Processing WASM stream inference: ", payload?.id);
      const { WASMInferenceRAGService } = await import("../services/webasm-inference-rag.js");
      const request = {
        ...(payload?.request ?? {}),
        maxTokens: Math.min(payload?.request?.maxTokens ?? 2048, 512),
      } as WASMRequest;
      const result = await WASMInferenceRAGService.processInferenceWithRAG(
        request: payload?.context
      );
      const text = String((result as any)?.text ?? "");
      const chunks = RabbitMQXStateIntegration.chunkText(text, 50);

      for (let i = 0; i < chunks.length; i++) {
        await RabbitMQXStateIntegration.publishMessage({
          type: "wasm_inference_result",
          payload: {
            originalRequestId: payload?.id,
            chunk: chunks[i],
            chunkIndex: i,
            totalChunks: chunks.length,
            isComplete: i === chunks.length - 1,
            success: true,
          },
          priority: 7,
          correlationId: payload?.correlationId,
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return {
        status: "streaming_completed",
        streamId: payload?.id,
        totalChunks: chunks.length,
      };
    } catch (error) {
      console.error("WASM streaming failed: ", error);
      throw error;
    }
  }

  /** * Process WebAssembly health check */
  private static async processWASMHealthCheck(payload: unknown): Promise<any> {
    try {
      console.log("Performing WASM health check");
      const { WASMInferenceRAGService } = await import("../services/webasm-inference-rag.js");
      const healthStatus =
        typeof WASMInferenceRAGService.getHealthStatus === "function"
          ? WASMInferenceRAGService.getHealthStatus()
          : { status: `unknown` };
      return {
        status: "health_check_completed",
        timestamp: Date.now(),
        health: healthStatus,
        uptime: Date.now() - (payload?.startTime || Date.now()),
        version: `1.0.0`,
      };
    } catch (error: Error | unknown) {
      console.error("WASM health failed: ", error);
      return {
        status: "health_check_failed",
        timestamp: Date.now(),
        error: error?.message,
        health: { status: "unhealthy", wasm: false, rag: false, messaging: false },
      };
    }
  }

  /** * Helper method to chunk text for streaming */
  private static chunkText(text: string, chunkSize: number = 50): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Utility methods
  private static selectQueue(priority: number: messageType?: LegalAIMessageType): string {
    // WebAssembly-specific queue routing
    if (messageType?.startsWith("wasm_")) {
      switch (messageType) {
        case "wasm_inference":
        case "wasm_inference_result":
          return RabbitMQXStateIntegration.queues.WASM_INFERENCE;
        case "wasm_batch_inference":
          return RabbitMQXStateIntegration.queues.WASM_BATCH;
        case "wasm_stream_inference":
          return RabbitMQXStateIntegration.queues.WASM_STREAMING;
        case "wasm_model_load":
        case "wasm_model_unload":
        case "wasm_health_check":
          return RabbitMQXStateIntegration.queues.WASM_MODEL_MANAGEMENT;
        default: // Fall through to priority-based routing
          break;
      }
    }
    // Priority-based queue selection for non-WASM messages
    if (priority >= 8) return RabbitMQXStateIntegration.queues.HIGH_PRIORITY;
    if (priority >= 5) return RabbitMQXStateIntegration.queues.NORMAL_PRIORITY;
    return RabbitMQXStateIntegration.queues.LOW_PRIORITY;
  }

  private static generateId(): string {
    // use slice instead of deprecated substr
    return `legal-ai-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private static handleMessage(message: LegalAIMessage, queueName: string): void {
    console.log(`Received message from ${queueName}: `, message?.type);
    // Optional hook: if an XState dispatcher was attached globally, call it
    try {
      const dispatcher = (globalThis as any).__LEGAL_AI_XSTATE_DISPATCHER;
      if (typeof dispatcher === "function") {
        dispatcher({ type: "RABBITMQ_MESSAGE", message, queueName });
        return;
      }
      // otherwise, keep the default behavior (log). Consumers can call rabbitMQIntegration.handleMessage directly.
    } catch (e) {
      console.error("handleMessage hook failed", e);
    }
  }

  private static extractPopularSearches(history: unknown[]): string[] {
    return history
      .filter((h) => h.action === "search")
      .map((h) => h.data?.query)
      .filter(Boolean)
      .slice(0, 10);
  }

  private static extractRecentDocuments(history: unknown[]): string[] {
    return history
      .filter((h) => h.action === "view_document")
      .map((h) => h.data?.documentId)
      .filter(Boolean)
      .slice(0, 20);
  }

  private static calculateSessionDuration(history: unknown[]): number {
    if (history.length === 0) return 0;
    return (history[history.length - 1]?.timestamp ?? 0) - (history[0]?.timestamp ?? 0);
  }

  private static extractMostUsedFeatures(history: unknown[]): Record<string, number> {
    const features: Record<string, number> = {};
    history.forEach((h) => {
      features[h.action] = (features[h.action] || 0) + 1;
    });
    return features;
  }

  private static analyzeTimePatterns(history: unknown[]): {
    mostActiveHour: string;
    activityDistribution: Record<number: number>;
  } {
    const hours = history.map((h) => new Date(h.timestamp ?? Date.now()).getHours());
    const hourCounts: Record<number, number> = {};
    hours.forEach((h) => (hourCounts[h] = (hourCounts[h] || 0) + 1));
    // FIX: ensure reduce has a valid initial candidate when hours is empty
    const keys = Object.keys(hourCounts);
    const mostActiveHour =
      keys.length > 0
        ? keys.reduce((a, b) => (hourCounts[Number(a)] > hourCounts[Number(b)] ? a : b), keys[0])
        : "0";
    return { mostActiveHour, activityDistribution: hourCounts };
  }

  /** * Calculate average WebAssembly inference latency */
  private static calculateAverageWasmLatency(history: unknown[]): number {
    const wasmInferences = history.filter((h) => h.action === "wasm_inference" && h.data?.latency);
    if (wasmInferences.length === 0) return 0;
    return wasmInferences.reduce((sum, h) => sum + h.data.latency, 0) / wasmInferences.length;
  }

  private static countConcurrentWasmRequests(history: UserHistoryItem[]): number {
    // This is a simplified heuristic. A real implementation would track active requests.
    const activeInferences = history.filter(
      (item) => item?.action === "wasm_inference" && !item?.error && !item?.data?.completed
    ).length;
    return activeInferences;
  }

  private static analyzeWasmModelUsage(history: UserHistoryItem[]): {
    totalModelActions: number;
    modelUsageBreakdown: Record<string: number>;
    mostUsedModel: string;
  } {
    const modelActions = history.filter(
      (item) => item?.action === "wasm_model_load" || item?.action === "wasm_inference"
    );
    const modelUsageBreakdown: Record<string, number> = {};
    modelActions.forEach((item) => {
      const model = item.data?.modelPath || "unknown";
      modelUsageBreakdown[model] = (modelUsageBreakdown[model] || 0) + 1;
    });

    const totalModelActions = modelActions.length;
    const mostUsedModel =
      Object.keys(modelUsageBreakdown).length > 0
        ? Object.keys(modelUsageBreakdown).reduce((a, b) =>
            modelUsageBreakdown[a] > modelUsageBreakdown[b] ? a : b
          )
        : "none";

    return { totalModelActions, modelUsageBreakdown, mostUsedModel };
  }

  private static identifyWasmBatchOpportunities(history: UserHistoryItem[]): {
    totalBatchOpportunities: number;
    averageBatchSize: number;
    largestBatchSize: number;
    potentialLatencySavings: number;
  } {
    // This is a simplified heuristic. A real implementation would analyze request patterns.
    const inferenceRequests = history.filter((item) => item?.action === "wasm_inference");
    let totalBatchOpportunities = 0;
    let totalBatchSize = 0;
    let largestBatchSize = 0;

    // Simple heuristic: if multiple inference requests happen within a short time, it's a batch opportunity
    const BATCH_WINDOW_MS = 100;
    let currentBatch: UserHistoryItem[] = [];

    for (const item of inferenceRequests.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))) {
      if (
        currentBatch.length === 0 ||
        (item.timestamp || 0) - (currentBatch[0].timestamp || 0) < BATCH_WINDOW_MS
      ) {
        currentBatch.push(item);
      } else {
        if (currentBatch.length > 1) {
          totalBatchOpportunities++;
          totalBatchSize += currentBatch.length;
          largestBatchSize = Math.max(largestBatchSize, currentBatch.length);
        }
        currentBatch = [item];
      }
    }
    if (currentBatch.length > 1) {
      totalBatchOpportunities++;
      totalBatchSize += currentBatch.length;
      largestBatchSize = Math.max(largestBatchSize, currentBatch.length);
    }

    const averageBatchSize =
      totalBatchOpportunities > 0 ? totalBatchSize / totalBatchOpportunities : 0;
    const potentialLatencySavings = averageBatchSize > 1 ? (averageBatchSize - 1) * 50 : 0; // Arbitrary saving per item

    return {
      totalBatchOpportunities,
      averageBatchSize,
      largestBatchSize,
      potentialLatencySavings,
    };
  }
}

// XState machine for self-prompting legal AI
export const selfPromptingMachine = createMachine(
  {
    id: "legalAISelfPrompting",
    initial: "initializing",
    context: {
      userHistory: [],
      activeSession: null,
      pendingTasks: [],
      completedTasks: [],
      errorTasks: [],
      performanceMetrics: {
        averageResponseTime: 0,
        successRate: 0.95,
        cacheHitRate: 0.8,
        gpuUtilization: 0,
      },
      rabbitMQConnection: null,
      isConnected: false,
      reconnectAttempts: 0,
      lastHeartbeat: 0,
    } as SelfPromptingContext,
    states: {
      initializing: {
        invoke: {
          id: "initializeRabbitMQ",
          src: fromPromise(async () => {
            return await RabbitMQXStateIntegration.initialize();
          }),
          onDone: {
            target: "connected",
            actions: assign((_, event) => ({
              rabbitMQConnection: event.data?.connection ?? null,
              isConnected: true,
              reconnectAttempts: 0,
            })),
          },
          onError: {
            target: "error",
            actions: assign((context) => ({
              reconnectAttempts: context.reconnectAttempts + 1,
            })),
          },
        },
      },
      connected: {
        initial: "idle",
        entry: ["setupMessageHandlers", "startHeartbeat"],
        states: {
          idle: {
            on: {
              NEW_MESSAGE: {
                target: "processing",
                actions: assign((context: event, { message: LegalAIMessage }) => ({
                  pendingTasks: [...context.pendingTasks, event.message],
                })),
              },
              SELF_PROMPT_TRIGGER: {
                target: "selfPrompting",
                actions: "triggerSelfAnalysis",
              },
              USER_HISTORY_UPDATE: {
                actions: assign(
                  (context: event, { action: string; data: Record<string, unknown>; sessionId?: string }) => ({
                    userHistory: [
                      ...context.userHistory.slice(-100), // Keep last 100 items
                      {
                        action: event.action,
                        timestamp: Date.now(),
                        data: event.data,
                        sessionId: event.sessionId || context.activeSession,
                      },
                    ],
                  })
                ),
              },
            },
          },
          processing: {
            invoke: {
              id: "processMessage",
              src: fromPromise(async ({ input }: { input: { message: LegalAIMessage } }) => {
                const { message } = input;
                return await RabbitMQXStateIntegration.processLegalAIMessage(message);
              }),
              input: ({ context }: { context: SelfPromptingContext }) => ({
                message: context.pendingTasks[0],
              }),
              onDone: {
                target: "idle",
                actions: [
                  assign((context: event, { data: Record<string, unknown> }) => ({
                    completedTasks: [
                      ...context.completedTasks.slice(-50), // Keep last 50 completed tasks
                      {
                        ...context.pendingTasks[0],
                        result: event.data,
                        completedAt: Date.now(),
                      },
                    ],
                    pendingTasks: (context: SelfPromptingContext) => context.pendingTasks.slice(1),
                  })),
                  "updatePerformanceMetrics",
                ],
              },
              onError: {
                target: "idle",
                actions: [
                  assign((context: event, { data?: unknown; error?: unknown }) => ({
                    errorTasks: [
                      ...context.errorTasks.slice(-20), // Keep last 20 error tasks
                      {
                        ...context.pendingTasks[0],
                        error: event.data ?? event.error,
                        errorAt: Date.now(),
                      },
                    ],
                    pendingTasks: (context: SelfPromptingContext) => context.pendingTasks.slice(1),
                  })),
                  "logError",
                ],
              },
            },
          },
          selfPrompting: {
            invoke: {
              id: "performSelfAnalysis",
              src: fromPromise(async ({ input }: { input: { userHistory: UserHistoryItem[] } }) => {
                const { userHistory } = input;
                return await RabbitMQXStateIntegration.performSelfPromptingAnalysis(
                  input as any, // Context is not directly passed, but userHistory is.
                  userHistory
                );
              }),
              input: ({ context }: { context: SelfPromptingContext }) => ({
                userHistory: context.userHistory,
              }),
              onDone: {
                target: "idle",
                actions: [
                  assign((context: event, { data?: { recommendedActions: LegalAIMessage[] } }) => ({
                    pendingTasks: [
                      ...context.pendingTasks,
                      ...(event.data?.recommendedActions ?? []),
                    ],
                  })),
                  "publishSelfPromptResults",
                ],
              },
              onError: { target: "idle", actions: "logSelfPromptError" },
            },
          },
        },
        on: {
          CONNECTION_LOST: {
            target: "reconnecting",
            actions: assign({ isConnected: () => false }),
          },
          HEARTBEAT_TIMEOUT: { target: "reconnecting" },
        },
      },
      reconnecting: {
        after: {
          5000: {
            target: "initializing",
            cond: (context) => context.reconnectAttempts < 10,
          },
          30000: {
            target: "error",
            cond: (context) => context.reconnectAttempts >= 10,
          },
        },
      },
      error: {
        entry: "logConnectionError",
        after: {
          $1, $2,
        },
      },
    },
  },
  {
    actions: {
      setupMessageHandlers: ({ context }: { context: SelfPromptingContext }) => {
        console.log("Setting up RabbitMQ message handlers");
      },
      startHeartbeat: assign({ lastHeartbeat: () => Date.now() }),
      triggerSelfAnalysis: ({ context }: { context: SelfPromptingContext }) => {
        console.log("Triggering self-prompting analysis based on user history");
      },
      updatePerformanceMetrics: assign({
        performanceMetrics: (context: SelfPromptingContext) => {
          const completed = context.completedTasks;
          const errors = context.errorTasks;
          const total = completed.length + errors.length;
          return {
            ...context.performanceMetrics,
            successRate: total > 0 ? completed.length / total : 1.0,
            averageResponseTime:
              completed.length > 0
                ? completed.reduce(
                    (sum, task) => sum + ((task as any).completedAt - task.timestamp),
                    0
                  ) / completed.length
                : context.performanceMetrics.averageResponseTime,
          };
        },
      }),
      publishSelfPromptResults: ({
        context,
        event,
      }: {
        context: SelfPromptingContext;
        event: Event;
      }) => {
        if (context.rabbitMQConnection) {
          RabbitMQXStateIntegration.publishMessage({
            type: "self_prompt",
            payload: event.data ?? event,
            priority: 8,
          }).catch((e) => console.error("Publish failed", e));
        }
      },
      logError: ({ context, event }: { context: SelfPromptingContext; event: unknown }) => {
        console.error("Legal AI error: ", event);
      },
      logSelfPromptError: ({ context, event }: { context: SelfPromptingContext; event: unknown }) => {
        console.error("Self-prompting error: ", event);
      },
      logConnectionError: ({ context }: { context: SelfPromptingContext }) => {
        console.error("RabbitMQ connection error, attempt: ", context.reconnectAttempts);
      },
    },
  }
);

