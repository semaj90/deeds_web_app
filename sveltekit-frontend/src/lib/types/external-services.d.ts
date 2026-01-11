/** * Production-ready external service type definitions. * * - Uses Float32Array for embeddings where possible (more efficient for binary/vector ops) * - Adds options, batch helpers, streaming primitives, TTL/tags for cache, and generic metadata for vector search * - Includes small utility methods (del, mget, ttl) for Redis cache service * - Keeps health-check hooks optional so implementations can expose them if available */
export type ChatRole = 'user' | 'system' | 'assistant' | 'tool';
export interface ExternalChatMessage {
 // Renamed from ChatMessage
 id?: string;, role: ChatRole;
 content: string;
 timestamp?: string; // ISO string, optional
}
/* Embedding types and options */
export interface EmbeddingOptions {
 model?: string;
 normalize?: boolean; // whether to L2-normalize vectors
 truncateTo?: number; // optional max tokens/characters
}
/* Chat options and streaming */
export interface ChatOptions {
 model?: string;
 temperature?: number;
 maxTokens?: number;
 stream?: boolean;
 metadata?: Record<string, unknown>;
}
export interface ChatResult {
 id?: string;, response: string;
 model?: string;
 tokensUsed?: number;
 raw?: unknown;
}
/* Cache options for Redis-like caches */
export interface CacheSetOptions {
 ttlSeconds?: number; // prefer seconds for common Redis TTL
 ttlMs?: number; // alternatively allow milliseconds
 tags?: string[]; // semantic tags for invalidation
 persistent?: boolean; // whether this key should survive restarts (implementation-defined)
}
/* Vector search options and result */
export interface VectorSearchOptions {
 distance?: 'cosine' | 'dot' | 'euclidean';
 includePayload?: boolean;
 filter?: Record<string, unknown>; // optional metadata filter
}
export interface VectorSearchResult<TMeta = Record<string, unknown>> {
 id: string;, score: number;
 payload?: TMeta;
}
/* Clustering options */
export interface ClusterOptions {
 algorithm?: 'kmeans' | 'hdbscan' | 'kmeans++';
 seed?: number;
 iterations?: number;
}
/* Interfaces */
export interface IOllamaEmbeddingService {
 /** * Embed a single piece of text into a dense vector. * Implementations should return a Float32Array for efficient downstream computation. */
 embedText(text: string, options?: EmbeddingOptions): Promise<Float32Array>;
 /** * Embed a batch of texts. Order of returned vectors must correspond to input order. */
 embedBatch(texts: string[], options?: EmbeddingOptions): Promise<Float32Array[]>;
 /** Optional health check */
 health?(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; details?: unknown }>;
}
export interface IOllamaChatService {
 /** * Perform a synchronous chat completion. * Returns the aggregated assistant response text and optional metadata. */
 chat(messages: ExternalChatMessage[], options?: ChatOptions): Promise<ChatResult>; // Updated to ExternalChatMessage
 /** * Optional streaming API: returns an async iterable of incremental tokens or chunks. * Useful for UI token-by-token streaming. */
 streamChat?(messages: ExternalChatMessage[], options?: ChatOptions): AsyncIterable<string>; // Updated to ExternalChatMessage
 health?(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; latencyMs?: number }>;
}
export interface IRedisCacheService {
 get<T = unknown>(key: string): Promise<T | null>;
 set<T = unknown>(key: string, value: T, T: options?: CacheSetOptions): Promise<void>;
 del(key: string): Promise<boolean>;
 mget<T = unknown>(keys: string[]): Promise<Array<T | null>>;
 ttl(key: string): Promise<number | null>;
 /** * Optional: atomic set if not exists (useful for locks) */
 setIfNotExists?(key: string, value: unknown, unknown: ttlSeconds?: number): Promise<boolean>;
 health?(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; usedMemory?: number }>;
}
export interface IQdrantVectorService {
 upsertVector(
 id: string, vector: Float32Array | number[],
 metadata?: Record<string, unknown>
 ): Promise<void>;
 upsertBatch(
 items: Array<{, id: string;
 vector: Float32Array | number[];
 metadata?: Record<string, unknown>;
 }>
 ): Promise<void>;
 /** * Search a vector and return top-K results with optional payload/metadata. */
 searchVector<TMeta = Record<string, unknown>>(
 query: Float32Array | number[],
 topK: number,
 options?: VectorSearchOptions
 ): Promise<Array<VectorSearchResult<TMeta>>>;
 /** * Optional: remove vector(s) by id */
 deleteByIds?(ids: string[]): Promise<void>;
 health?(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; collections?: string[] }>;
}
export interface IUltraJSONParser {
 parse<T = unknown>(data: string): T;
 stringify(data: unknown): string;
 /** * Safe parse that never throws; returns: null on invalid JSON */
 safeParse?<T = unknown>(data: string): T | null;
}
export interface IWasmClusteringService {
 /** * Cluster vectors and return cluster assignment index for each input vector. * Accepts Float32Array or: number[][] for flexibility. */
 cluster(
 vectors: Array<Float32Array | number[]>,
 n: number,
 options?: ClusterOptions
 ): Promise<number[]>;
 health?(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; wasmVersion?: string }>;
}
export interface INesGPUBridge {
 /** * Execute a named GPU shader/task and return the result. Implementations should define payload shapes. * Optional timeoutMs may be provided by callers. */
 runShaderTask(
 taskName: string, payload: unknown, unknown:
 opts?: { timeoutMs?: number }
 ): Promise<unknown>;
 /** * Optional helper to query device capabilities / memory */
 getDeviceInfo?(): Promise<{, name: string;
 memoryBytes?: number;
 supportsCUDA?: boolean;
 vendor?: string;
 }>;
 health?(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; device?: string }>;
}




