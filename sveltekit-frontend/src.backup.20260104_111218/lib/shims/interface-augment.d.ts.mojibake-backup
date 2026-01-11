import type { Document } from '$lib/types';
// Interface and property augmentations to fix common missing property errors
// Augment common interfaces with missing properties
declare global {
  interface Document {
    embedding?: unknown;
    document_chunks?: unknown;
  }
}
// Drizzle ORM result augmentations
declare global {
  interface RowList<T> {
    rows: T;
  }
}
// Redis client augmentations
declare module 'ioredis' {
  interface Redis {
    ping?(): Promise<string>;
    setex?(_key: string, seconds: number, value: unknown): Promise<any>;
    psubscribe?(pattern: string, listener?: (...args: unknown[]) => void): Promise<any>;
    disconnect?(): void;
    on?(_event: string, cb: (...args: unknown[]) => void): void;
  }
}
// XState type augmentations
declare global {
  interface AssignArgs<TContext, TEvent, TAction, TExpressionEvent, TActor> {
    userContext?: unknown;
    error?: unknown;
  }
}
// AI Service augmentations
declare global {
  interface AIService {
    taskId?: string;
    providerId?: string;
    model?: string;
    activeRequests?: number;
    queueLength?: number;
  }
  interface WorkerStatus {
    activeRequests?: number;
    queueLength?: number;
  }
  interface WorkerMessage {
    taskId?: string;
  }
}
// Cache service augmentations
declare global {
  interface CacheOptions {
    ttl: number;
    contentType?: string;
  }
  // Worker message types
  interface WorkerMessage {
    taskId?: string;
    type: 'error' | 'status' | 'result' | 'task' | 'TASK_STARTED' | 'TASK_COMPLETED' | 'TASK_ERROR' | 'TASK_CANCELLED' | 'STATUS_UPDATE';
    data?: any;
  }
  // Enrichment job interface
  interface EnrichmentJob {
    id: string;
    type: string;
    entityId: string;
    entityType: string;
    status: string;
    createdAt: Date;
    priority: number;
    data: Record<string, unknown>;
  }
}
// QdrantClient augmentations
declare module '@qdrant/qdrant-js' {
  interface QdrantClient {
    baseUrl?: string;
    createPayloadIndex?(collection: string, field: string): Promise<any>;
    retrieve?(collection: string, ids: string[]): Promise<any>;
  }
}
// Connection interface for AMQP
declare global {
  interface Connection {
    serverProperties?: unknown;
    expectSocketClose?: unknown;
    sentSinceLastCheck?: unknown;
    recvSinceLastCheck?: unknown;
    sendMessage?: unknown;
    createChannel?(): unknown;
    close?(): void;
  }
}
// LokiJS types
declare global {
  namespace loki {
    interface LokiMemoryAdapter {
      new (): unknown;
    }
  }
}
// Ollama types
declare global {
  interface OllamaResponse {
    content?: string;
  }
  interface ChatRequest {
    model?: string;
    maxTokens?: number;
  }
  interface ChatStreamOptions {
    createStream?: unknown;
  }
}



