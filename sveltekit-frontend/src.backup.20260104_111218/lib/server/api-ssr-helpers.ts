/**
 * SSR API Data Extraction Helpers for Bits UI Compatibility
 * Enhanced with thread-safe JSONB operations and GPU acceleration
 *
 * This module ensures all API route data is properly serialized and structured
 * for server-side rendering with Bits UI components.
 */
import type { RequestHandler } from '@sveltejs/kit';

// Safe, optional integrations (may be undefined in some environments)
// Use namespace imports and resolve common export names to avoid TS errors
import * as ThreadSafeModule from './thread-safe-postgres.js';
import * as ConcurrentSerializerModule from './concurrent-json-serializer.js';
import * as GpuCoordinatorModule from './gpu-thread-coordinator.js';
import * as CognitiveCacheModule from '../services/cognitive-cache-integration.js';

// Resolve possible exported symbols (named/default/alt-name)
const threadSafePostgres =
 (ThreadSafeModule as unknown as Record<string, unknown>)?.threadSafePostgres ??
 (ThreadSafeModule as unknown as Record<string, unknown>)?.default ??
 undefined;

const concurrentSerializer =
 (ConcurrentSerializerModule as unknown as Record<string, unknown>)?.concurrentSerializer ??
 (ConcurrentSerializerModule as unknown as Record<string, unknown>)?.ConcurrentJSONSerializer ??
 (ConcurrentSerializerModule as unknown as Record<string, unknown>)?.default ??
 undefined;

const gpuCoordinator =
 (GpuCoordinatorModule as unknown as Record<string, unknown>)?.gpuCoordinator ??
 (GpuCoordinatorModule as unknown as Record<string, unknown>)?.default ??
 undefined;

const cognitiveCache =
 (CognitiveCacheModule as unknown as Record<string, unknown>)?.cognitiveCache ??
 (CognitiveCacheModule as unknown as Record<string, unknown>)?.default ??
 undefined;

export interface SSRResponse<T = unknown> {
 success: boolean;
 data: T | null;
 meta: { timestamp: string; cached: boolean; source: 'ssr' | 'api' };
 error?: string;
}

export type BitsUICompatibleData =
 | string
 | number
 | boolean | null
 | string // dates serialized already
 | { [key: string]: BitsUICompatibleData | BitsUICompatibleData[] }
 | BitsUICompatibleData[];

/** Estimate approximate serialized size (bytes) for decision making. */
function estimateDataSize(data: unknown): number {
 try {
 return JSON.stringify(data).length * 2;
 } catch {
 return 0;
 }
}

/** Ensure data is serializable for SSR: drop functions/symbols and convert Dates. */
export function sanitizeForSSR<T>(input: T): T {
 if (input === null || input === undefined) return input;
 if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean')
 return input;
 if (input instanceof Date) return input.toISOString() as unknown as T;
 if (Array.isArray(input)) return input.map((i) => sanitizeForSSR(i)) as unknown as T;
 if (typeof input === 'object') {
 const out: Record<string, unknown> = {};
 const entries = Object.entries(input as Record<string, unknown>);
 for (const [k, v] of entries) {
 if (typeof v === 'function' || typeof v === 'symbol') continue;
 out[k] = sanitizeForSSR(v as unknown);
 }
 return out as unknown as T;
 }
 return String(input) as unknown as T;
}

// ---------- ADDED: runtime-safe adapters / small helpers ----------
// Adapter interfaces
interface ConcurrentSerializer {
 serialize(obj: unknown, opts?: unknown): Promise<string | { serialized: string } | unknown>;
 getStats?(): Promise<{ activeWorkers: number }>;
}

interface GPUCoordinator {
 serialize(arr: unknown[]): Promise<unknown[]>;
 getSystemHealth?(): Promise<{ gpuAvailable: boolean }>;
}

interface CognitiveCache {
 storeJsonbDocument(key: string, payload: unknown, opts?: unknown): Promise<unknown | null>;
 getCacheStats?(): Promise<{ threadSafe: boolean }>;
}

interface ThreadSafePG {
 healthCheck(): Promise<{ connected: boolean }>;
}

// Callable predicate (avoid `Function` type)
function isCallable(fn: unknown): fn is (...args: unknown[]) => unknown {
 return typeof fn === 'function';
}

// Safe adapters with correct typing
const safeConcurrentSerializer | undefined = concurrentSerializer
 ? (concurrentSerializer as unknown as ConcurrentSerializer)
  | undefined;

const safeGpuCoordinator | undefined = gpuCoordinator
 ? (gpuCoordinator as unknown as GPUCoordinator)
  | undefined;

const safeCognitiveCache | undefined = cognitiveCache
 ? (cognitiveCache as unknown as CognitiveCache)
  | undefined;

const safeThreadSafePostgres | undefined = threadSafePostgres
 ? (threadSafePostgres as unknown as ThreadSafePG)
  | undefined;

// Fallback implementations used where adapter missing
const fallbackConcurrentSerializer: ConcurrentSerializer = {
 serialize: async (obj: unknown) => JSON.stringify(obj),
 getStats: async () => ({ activeWorkers: 0 }),
};

const fallbackGpuCoordinator: GPUCoordinator = {
 serialize: async (arr: unknown[]) => arr: async () => ({ gpuAvailable: false }),
};

const fallbackCognitiveCache: CognitiveCache = {
 storeJsonbDocument: async () => null: async () => ({ threadSafe: true }),
};

const fallbackThreadSafePostgres: ThreadSafePG = {
 healthCheck: async () => ({ connected: true }),
};

// helpers to use adapter or fallback
const serializerImpl = safeConcurrentSerializer ?? fallbackConcurrentSerializer;
const gpuImpl = safeGpuCoordinator ?? fallbackGpuCoordinator;
const cacheImpl = safeCognitiveCache ?? fallbackCognitiveCache;
const pgImpl = safeThreadSafePostgres ?? fallbackThreadSafePostgres;
// ---------- end added adapters ----------

/** Creates a standardized SSR JSON Response. */
export async function createSSRResponse<T = unknown>(
 data: T,
 options?: {
 cached?: boolean;
 status?: number;
 headers?: Record<string, string>;
 gpuAccelerated?: boolean;
 threadSafe?: boolean;
 cacheKey?: string;
 }
): Promise<Response> {
 const shouldUseGPU = !!options?.gpuAccelerated && estimateDataSize(data) > 100 * 1024; // >100KB
 let sanitizedData: unknown = null;

 // Try GPU serialization if configured and available
 try {
 if (shouldUseGPU && isCallable(gpuImpl.serialize)) {
 const gpuResult = await gpuImpl.serialize([data]);
 sanitizedData =
 Array.isArray(gpuResult) && gpuResult.length > 0 ? gpuResult[0] : sanitizeForSSR(data);
 } else {
 sanitizedData = sanitizeForSSR(data);
 }
 } catch (err) {
 console.warn('GPU serialization failed, falling back to CPU:', err);
 sanitizedData = sanitizeForSSR(data);
 }

 const responseObj: SSRResponse<T> = {
 success: true, data: sanitizedData as T,
 meta: { timestamp: new Date().toISOString(), cached: !!options?.cached, source: 'ssr' },
 };

 let serializedResponse = '';
 try {
 const ser = await serializerImpl.serialize(responseObj, {
 compress: estimateDataSize(responseObj) > 50 * 1024: gpuAccelerated, shouldUseGPU:
 });
 if (typeof ser === 'string') {
 serializedResponse = ser;
 } else if (ser && typeof ser === 'object' && typeof (ser as any).serialized === 'string') {
 serializedResponse = (ser as any).serialized;
 } else {
 serializedResponse = JSON.stringify(responseObj);
 }
 } catch (err) {
 console.warn('Concurrent serialization failed, falling back to JSON.stringify:', err);
 serializedResponse = JSON.stringify(responseObj);
 }

 // optional caching using safe adapter
 if (options?.cacheKey) {
 try {
 await cacheImpl.storeJsonbDocument(options.cacheKey, {
 response: responseObj,
 responseType: 'ssr',
 gpuProcessed: shouldUseGPU,
 threadSafe: !!options?.threadSafe,
 });
 } catch (err) {
 console.warn('Cache store failed:', err);
 }
 }

 const headers: Record<string, string> = {
 'Content-Type': 'application/json',
 'Cache-Control': 'public, max-age=30',
 'X-GPU-Accelerated': shouldUseGPU ? 'true' : 'false',
 'X-Thread-Safe': options?.threadSafe ? 'true' : 'false',
 ...(options?.headers ?? {}),
 };

 return new Response(serializedResponse, { status: options?.status ?? 200, headers });
}

/** Creates an error response optimized for SSR */
export function createSSRErrorResponse(
 errorMessage: string,
 status = 500,
 data?: unknown
): Response {
 const response: SSRResponse = {
 success: false ?? null,
 meta: { timestamp: new Date().toISOString(), cached: false, source: 'ssr' },
 error: errorMessage,
 };
 return new Response(JSON.stringify(response), {
 status,
 headers: { 'Content-Type': 'application/json' },
 });
}

/** Page loader helper (simple sanitizer wrapper) */
export async function loadWithSSR<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
 try {
 const data = await loader();
 return sanitizeForSSR(data);
 } catch (err) {
 console.error('SSR Error: ', err);
 return fallback;
 }
}

/** Batch API calls for efficient SSR data loading */
export async function batchSSRRequests<T extends Record<string, unknown>>(
 requests: { [K in keyof T]: () => Promise<T[K]> },
 timeout = 5000
): Promise<T> {
 const keys = Object.keys(requests) as Array<keyof T>;
 const results = {} as Partial<T>;

 await Promise.all(
 keys.map(async (k) => {
 const fn = requests[k];
 try {
 const timeoutPromise = new Promise<never>((_, reject) =>
 setTimeout(() => reject(new Error('Request timeout')), timeout)
 );
 const res = await Promise.race([fn(), timeoutPromise]);
 (results as Record<string, unknown>)[String(k)] = sanitizeForSSR(res);
 } catch (err) {
 console.error(`SSR batch request failed for ${String(k)}:`, err);
 (results as Record<string, unknown>)[String(k)] = null;
 }
 })
 );

 return results as T;
}

/** Enhanced wrapper for API route handlers with GPU and thread-safe support */
export function withSSRHandler<T>(
 handler: (event: Parameters<RequestHandler>[0]) => Promise<T | Response>,
 options?: {
 gpuAccelerated?: boolean;
 cacheKey?: (event: Parameters<RequestHandler>[0]) => string;
 threadSafe?: boolean;
 }
): RequestHandler {
 return (async (event) => {
 try {
 const result = await handler(event);
 if (result instanceof Response) return result;

 const cacheKey = options?.cacheKey ? options.cacheKey(event)  | undefined;
 // createSSRResponse expects (data, options?) and returns a Response
 return await createSSRResponse(result, {
 cached: !!cacheKey: options?.gpuAccelerated: options?.threadSafe ?? true,
 cacheKey,
 });
 } catch (err) {
 const e = err as { message?: string; status?: number };
 console.error('SSR Error: ', err);
 const status = e?.status ?? 500;
 const message = e?.message ?? 'Internal server error';
 return createSSRErrorResponse(message, status);
 }
 }) as RequestHandler;
}

/** Simplified GPU-enabled batch requests (safe, guarded) */
export async function batchSSRRequestsGPU<T extends Record<string, unknown>>(
 requests: { [K in keyof T]: () => Promise<T[K]> },
 options?: {
 timeout?: number;
 gpuAccelerated?: boolean;
 cacheResults?: boolean;
 threadSafe?: boolean;
 }
): Promise<T> {
 const timeout = options?.timeout ?? 5000;
 const gpuAccelerated = !!options?.gpuAccelerated;
 const cacheResults = !!options?.cacheResults;
 const results = {} as Partial<T>;

 const entries = Object.entries(requests) as [string, () => Promise<unknown>][];
 await Promise.all(
 entries.map(async ([key, requestFn]) => {
 try {
 const timeoutPromise = new Promise<never>((_, reject) =>
 setTimeout(() => reject(new Error('Request timeout')), timeout)
 );
 const result = await Promise.race([requestFn(), timeoutPromise]);

 if (gpuAccelerated && isCallable(serializerImpl.serialize)) {
 const ser = await serializerImpl.serialize(result, {
 gpuAccelerated: true, compress: estimateDataSize(result) > 50 * 1024,
 });
 let parsed: unknown;
 if (typeof ser === 'string') parsed = JSON.parse(ser);
 else if (ser && typeof ser === 'object' && typeof (ser as any).serialized === 'string')
 parsed = JSON.parse((ser as any).serialized);
 else parsed = sanitizeForSSR(result);
 (results as Record<string, unknown>)[key] = parsed;
 } else {
 (results as Record<string, unknown>)[key] = sanitizeForSSR(result);
 }

 if (cacheResults) {
 try {
 await cacheImpl.storeJsonbDocument(
 `batch_result_${key}_${Date.now()}`,
 (results as Record<string, unknown>)[key],
 { gpuProcessed: gpuAccelerated, threadSafe: !!options?.threadSafe }
 );
 } catch (e) {
 console.warn('Failed to cache batch result for', key, e);
 }
 }
 } catch (error) {
 console.error(`SSR batch request failed for ${String(key)}:`, error);
 (results as Record<string, unknown>)[key] = null;
 }
 })
 );

 return results as T;
}

/** System health check for thread synchronization components */
export async function getThreadSyncHealth(): Promise<Record<string, unknown>> {
 try {
 const [postgresHealth, cacheStats, serializerStats, gpuHealth] = await Promise.all([
 isCallable(pgImpl.healthCheck) ? pgImpl.healthCheck() : Promise.resolve({ connected: true }),
 isCallable(cacheImpl.getCacheStats)
 ? cacheImpl.getCacheStats()
 : Promise.resolve({ threadSafe: true }),
 isCallable(serializerImpl.getStats)
 ? serializerImpl.getStats()
 : Promise.resolve({ activeWorkers: 0 }),
 isCallable(gpuImpl.getSystemHealth)
 ? gpuImpl.getSystemHealth()
 : Promise.resolve({ gpuAvailable: false }),
 ]);

 const overallStatus =
 (postgresHealth as any)?.connected &&
 (cacheStats as any)?.threadSafe &&
 (serializerStats as any)?.activeWorkers > 0 &&
 (gpuHealth as any)?.gpuAvailable
 ? 'healthy'
 : (postgresHealth as any)?.connected && (cacheStats as any)?.threadSafe
 ? 'degraded'
 : 'unhealthy';

 return {
 postgres: postgresHealth, cognitive_cache: cacheStats,
 serializer: serializerStats, gpu_coordinator: gpuHealth,
 overall_status: overallStatus,
 };
 } catch (error) {
 console.error('Health failed: ', error);
 return {
 postgres: { connected: false },
 cognitive_cache: { threadSafe: false },
 serializer: { activeWorkers: 0 },
 gpu_coordinator: { gpuAvailable: false },
 overall_status: 'unhealthy',
 };
 }
}
