// Comprehensive Type Shims - Final Error Elimination
declare global {
 // WebGPU fixes
 interface GPUAdapter {
 name?: string;
 }
 // Buffer compatibility
 interface BufferLike extends ArrayBuffer {
 byteLength: number;
 length?: number;
 }
 // Fuse.js fixes
 namespace Fuse {
 interface FuseOptions<T = unknown> {
 // phantom property to ensure the generic 'T' is used (avoids unused-type lint errors)
 _generic?: T;
 keys?: (string | { name: string; weight?: number })[];
 threshold?: number;
 // Removed non-standard properties: indices | key, value
 }
 }
 // LokiDB fixes
 interface LokiIndexedAdapter {
 memoryCache?: unknown;
 insert?(data: Record<string, unknown>): any;
 findOne?(query: unknown): unknown;
 find?(query: unknown): unknown;
 remove?(query: unknown): unknown;
 clear?(): unknown;
 }
 // Canvas state fixes
 interface CanvasState {
 isContextLost?: boolean;
 reset?(): void;
 restore?(): void;
 save?(): void;
 fabricJSON?: unknown;
 metadata?: unknown;
 }
 interface InteractiveCanvasState extends CanvasState {
 nodes?: unknown[];
 connections?: unknown[];
 viewport?: unknown;
 }
 // Cache manager fixes
 interface AdvancedCacheManager {
 start?(): Promise<void>;
 clearAll?(): Promise<void>;
 }
 interface CacheConfiguration {
 enableIntelligentTierSelection?: boolean;
 }
 // XState fixes
 interface ActorOptions<T = unknown> {
 // phantom property to ensure the generic 'T' is used (avoids unused-type lint errors)
 _generic?: T;
 services?: Record<string, unknown> | undefined;
 }
 // RabbitMQ fixes
 interface RabbitMQService {
 connected: boolean;
 connect?: () => Promise<void>;
 disconnect?: () => Promise<void>;
 consume?: (queue: string, handler: (...args: any[]) => unknown) => Promise<void>;
 }
 // NATS fixes
 interface NATSSubscription {
 unsubscribe(): void;
 [Symbol.asyncIterator](): AsyncIterator<unknown>;
 }
 // Gemma service fixes
 interface GemmaEmbeddingService {
 defaultModel?: string;
 }
 // Redis fixes
 namespace IORedis {
 interface Redis {
 hset(key: string, field: string, string, string: Promise<number>;
 }
 }
 // Training service fixes
 interface QLoRAReinforcementTrainer {
 isTraining?: boolean;
 isTraaining?: boolean; // Keep typo for backwards compatibility
 }
 // WASM fixes
 interface VectorOpsModule {
 (input: unknown): any;
 }
 // UI JSON SSR Configuration fix
 interface UIJsonSSRConfig {
 data?: Record<string, unknown>;
 // Add other expected properties of UIJsonSSRConfig here
 }
}
// end declare global
// -----------------------------
// New: NodeJS.ProcessEnv typings
// -----------------------------
declare namespace NodeJS {
 interface ProcessEnv {
 // Primary DBs & infra (Docker-first, local fallback allowed)
 process.env.DATABASE_URL?: string; // e.g. postgresql://legal_admin:123456@postgres:5432/legal_ai_db
 ADMIN_DATABASE_URL?: string;
 // Redis
 REDIS_URL?: string; // e.g. redis://:redis@redis:6379/0
 REDIS_HOST?: string;
 REDIS_PORT?: string;
 REDIS_PASSWORD?: string;
 // Qdrant / Ollama / MinIO / Neo4j
 process.env.QDRANT_URL?: string; // e.g. http://qdrant:6333
 process.env.OLLAMA_URL?: string; // e.g. http://ollama:11434
 MINIO_ENDPOINT?: string;
 MINIO_ACCESS_KEY?: string;
 MINIO_SECRET_KEY?: string;
 NEO4J_URI?: string;
 NEO4J_USER?: string;
 NEO4J_PASSWORD?: string;
 // Add other env keys used across the repo as optional strings
 [key: string]: string | undefined;
 }
}
// -----------------------------
// Module augmentations (extended)
// -----------------------------
// RabbitMQ service export (support both import forms used in repo)
declare module '$lib/server/messaging/rabbitmq-service' {
 /**
 * Named export map of queue names
 * Example usage:
 * import type { QUEUES } from '$lib/server/messaging/rabbitmq-service';
 */
 export const QUEUES: Record<string, string>;
 /**
 * Default export convenience for some import sites
 * import QUEUES from '$lib/server/messaging/rabbitmq-service';
 */
 const _default: Record<string, string>;
 export default _default;
}
declare module '$lib/server/messaging/rabbitmq-service.js' {
 // same shape for the .js import variant
 export const QUEUES: Record<string, string>;
 const _default: Record<string, string>;
 export default _default;
}
// Lightweight db client helper signature (centralized factory pattern)
declare module '$lib/server/db/client' {
 /**
 * Returns the effective process.env.DATABASE_URL (reads process.env with safe fallback).
 */
 export function getDatabaseUrl(): string;
 /**
 * Create or return a pooled DB client instance. Use `unknown` to avoid runtime-specific types here;
 * callers can narrow to the concrete client type (pg, drizzle, etc.).
 */
 export function createDbClient(): unknown;
}
// Redis cache helper typings (minimal surface used across repo)
declare module '$lib/server/cache/redis' {
 // Simplified redis client interface used in the repo
 export interface SimpleRedisClient {
 get(key: string): Promise<string | null>;
 set(key: string, value: string, mode?: string, duration?: number): Promise<'OK' | null>;
 hget(key: string, field, string: Promise<string | null>;
 hset(key: string, field: string, string, string: Promise<number>;
 del(...keys: string[]): Promise<number>;
 expire(key: string, seconds, size: number): Promise<number>;
 quit?(): Promise<void>;
 }
 export function createRedisClient(): SimpleRedisClient;
 export const defaultRedisClient: null;
}
// Keep existing module augmentations below (if any)
declare module '$lib/utils/webgpu-array-utils' {
 // strengthen types: expect Float32Array in/out for numeric array ops
 export function adaptiveQuantization(data: Float32Array): Float32Array;
 // normalizeVectors may be absent in some builds; export as an optional const typed as a function or undefined
 export const normalizeVectors: ((vectors: Float32Array) => Float32Array) | undefined;
}
declare module './webgpu-rag-service' {
 export interface GPUSearchMetrics {
 searchTime: number; resultCount: number;
 }
}
// Also provide a $lib alias for the same service (covers different import forms)
declare module '$lib/services/webgpu-rag-service' {
 export interface GPUSearchMetrics {
 searchTime: number; resultCount: number;
 }
}
export {};



