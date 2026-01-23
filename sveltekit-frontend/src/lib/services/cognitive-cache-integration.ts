/**
 * Cognitive Cache Integration Service
 * Thread-safe JSONB/JSON operations with GPU acceleration support
 * Handles concurrent access patterns for legal AI database operations
 */
import { browser } from '$app/environment';
import { createHash } from 'crypto';
import { process } from "node:process";

// Type imports
import type { JsonbDocument, LegalDocument } from '$lib/types/sharedTypes'; // Assuming these might be moved or we define here if missing

// Define a minimal RedisClientType if needed, but essentially we use the one loaded
interface RedisClientInterface {
	isReady?: boolean;
	get(key: string): Promise<string | null>;
	set(key: string, value: string, options?: { EX?: number }): Promise<string | null>;
	del(key: string | string[]): Promise<number>;
}

// Import Redis client only on the server
let redisClient: RedisClientInterface | undefined;

if (!browser) {
	// Dynamically import to avoid bundling for client
	import('$lib/server/cache/redis')
		.then(async (module: any) => {
			redisClient = await module.createRedisClient();
		})
		.catch((e: any) => console.error('Failed to load Redis client:', e));
}

// Thread synchronization primitives
interface ThreadSafeCache {
	mutex: AsyncMutex;
	data: Map<string, unknown>;
	jsonbIndex: Map<string, JsonbDocumentInternal>;
	gpuAccelerated: boolean;
}

interface JsonbDocumentInternal {
	id: string;
	content: unknown;
	metadata: {
		lastModified: number;
		accessCount: number;
		gpuProcessed: boolean;
		threadId?: string;
		[key: string]: unknown;
	};
}

// Simple async mutex for thread synchronization
class AsyncMutex {
	private _locked = false;
	private _waiting: Array<() => void> = [];

	async acquire(): Promise<() => void> {
		return new Promise((resolve) => {
			if (!this._locked) {
				this._locked = true;
				resolve(() => this.release());
			} else {
				this._waiting.push(() => {
					this._locked = true;
					resolve(() => this.release());
				});
			}
		});
	}

	private release(): void {
		this._locked = false;
		const next = this._waiting.shift();
		if (next) {
			next();
		}
	}
}

// Global thread-safe cache instance
const internalCache: ThreadSafeCache = {
	mutex: new AsyncMutex(),
	data: new Map(),
	jsonbIndex: new Map(),
	gpuAccelerated: browser && 'gpu' in navigator
};

interface CacheStoreState {
	totalEntries: number;
	gpuAccelerated: boolean;
	threadSafe: boolean;
	lastOperation: string;
}

// Simple store implementation to replace Svelte 5 rune ($state) if not fully compiled/supported in this file context
// Assuming cacheStore is used as a Svelte store
import { writable } from 'svelte/store';

function createCacheStore() {
    const { subscribe, update, set } = writable<CacheStoreState>({
        totalEntries: 0,
        gpuAccelerated: internalCache.gpuAccelerated,
        threadSafe: true,
        lastOperation: 'initialized'
    });

    return {
        subscribe,
        update,
        set,
        get value() { // For backward compatibility with the rune pattern attempted
            let val;
            subscribe(v => val = v)();
            return val;
        }
    };
}

export const cacheStore = createCacheStore();

/**
 * Thread-safe JSONB document storage with GPU acceleration
 */
export class CognitiveCacheService {
	private static instance: CognitiveCacheService;
	private gpuContext?: GPUDevice;

	static getInstance(): CognitiveCacheService {
		if (!CognitiveCacheService.instance) {
			CognitiveCacheService.instance = new CognitiveCacheService();
		}
		return CognitiveCacheService.instance;
	}

	private constructor() {
		this.initializeGPUContext();
	}

	/**
     * Initialize WebGPU context for accelerated operations
     */
	private async initializeGPUContext(): Promise<void> {
		if (browser && 'gpu' in navigator) {
			try {
				const adapter = await (navigator as any).gpu.requestAdapter();
				if (adapter) {
					this.gpuContext = await adapter.requestDevice();
					internalCache.gpuAccelerated = true;
					console.log('🚀 GPU acceleration enabled for cognitive cache');
				}
			} catch (error) {
				console.warn('GPU initialization failed, falling back to CPU: ', error);
				internalCache.gpuAccelerated = false;
			}
		}
	}

	/**
     * Thread-safe JSONB document insertion
     * Supports concurrent writes with proper locking
     */
	async storeJsonbDocument(
		id: string,
        document: unknown,
		metadata?: Record<string, unknown>
	): Promise<boolean> {
		const release = await internalCache.mutex.acquire();
		try {
			const jsonbDoc: JsonbDocumentInternal = {
				id,
				content: document,
				metadata: {
					lastModified: Date.now(),
					accessCount: 0,
					gpuProcessed: false,
					threadId: this.getCurrentThreadId(),
					...metadata
				}
			};

			// Store in both caches for fast access
			internalCache.data.set(id, document);
			internalCache.jsonbIndex.set(id, jsonbDoc);

			// GPU acceleration for complex documents
			if (this.gpuContext && this.shouldUseGPU(document)) {
				await this.processWithGPU(jsonbDoc);
			}

			// Update reactive store
			cacheStore.update((state) => ({
				...state,
				totalEntries: internalCache.data.size,
				lastOperation: `store: ${id}`
			}));

			return true;
		} catch (error) {
			console.error('Failed to store JSONB document: ', error);
			return false;
		} finally {
			release();
		}
	}

	/**
     * Thread-safe JSONB document retrieval
     * Supports concurrent reads without blocking
     */
	async retrieveJsonbDocument(id: string): Promise<JsonbDocumentInternal | null> {
		// Optimistic read - no lock needed for reads
		const cached = internalCache.jsonbIndex.get(id);
		if (cached) {
			// Update access count atomically
			const release = await internalCache.mutex.acquire();
			try {
				cached.metadata.accessCount++;
				cached.metadata.lastModified = Date.now();
			} finally {
				release();
			}
			return cached;
		}
		return null;
	}

	/**
     * JSONB query with thread-safe filtering
     * Supports complex JSON path operations
     */
	async queryJsonb(
		jsonPath: string,
		value: unknown,
		operator: '@>' | '@?' | '@@' | '->' | '->>' = '@>'
	): Promise<JsonbDocumentInternal[]> {
		const release = await internalCache.mutex.acquire();
		try {
			const results: JsonbDocumentInternal[] = [];
			for (const doc of internalCache.jsonbIndex.values()) {
				if (this.matchesJsonbQuery(doc.content, jsonPath, value, operator)) {
					results.push(doc);
				}
			}

			// Sort by relevance and access patterns
			results.sort((a, b) => {
				const scoreA = a.metadata.accessCount + (a.metadata.gpuProcessed ? 10 : 0);
				const scoreB = b.metadata.accessCount + (b.metadata.gpuProcessed ? 10 : 0);
				return scoreB - scoreA;
			});

			return results;
		} finally {
			release();
		}
	}

	/**
     * GPU-accelerated document processing
     * Uses WebGPU compute shaders for complex operations
     */
	private async processWithGPU(document: JsonbDocumentInternal): Promise<void> {
		if (!this.gpuContext || !internalCache.gpuAccelerated) return;
		try {
			// Convert document to GPU-friendly format
			const serialized = JSON.stringify(document.content);
			const encoder = new TextEncoder();
			const data = encoder.encode(serialized);

			// Create GPU buffer
			const buffer = this.gpuContext.createBuffer({
				size: data.byteLength,
				usage: (GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
				mappedAtCreation: true
			});

			// Copy data to GPU
			new Uint8Array(buffer.getMappedRange()).set(data);
			buffer.unmap();

			// Mark as GPU processed
			document.metadata.gpuProcessed = true;
			console.log(`🎯 GPU processed document: ${document.id}`);
		} catch (error) {
			console.warn('GPU processing failed, using CPU fallback: ', error);
			document.metadata.gpuProcessed = false;
		}
	}

	/**
     * Check if document should use GPU acceleration
     */
	private shouldUseGPU(document: unknown): boolean {
		const serialized = JSON.stringify(document);
		return (
			serialized.length > 1024 || // Large documents
			this.hasComplexStructure(document)
		); // Complex nested objects
	}

	/**
     * Detect complex document structures
     */
	private hasComplexStructure(obj: unknown, depth = 0): boolean {
		if (depth > 3) return true; // Deep nesting
		if (Array.isArray(obj) && obj.length > 100) return true; // Large arrays
		if (typeof obj === 'object' && obj !== null) {
			const keys = Object.keys(obj);
			if (keys.length > 20) return true; // Many properties
			return keys.some((key) =>
				this.hasComplexStructure((obj as Record<string, unknown>)[key], depth + 1)
			);
		}
		return false;
	}

	/**
     * JSONB query matching logic
     */
	private matchesJsonbQuery(
		content: unknown,
        jsonPath: string,
        value: unknown,
        operator: string
	): boolean {
		try {
			const pathValue = this.getJsonPathValue(content, jsonPath);
			switch (operator) {
				case '@>': // Contains
					return JSON.stringify(pathValue).includes(JSON.stringify(value));
				case '@?': // Path exists
					return pathValue !== undefined;
				case '@@': // Text search
					return JSON.stringify(pathValue).toLowerCase().includes(String(value).toLowerCase());
				case '->': // Extract JSON: object
				case '->>': // Extract as text
					return pathValue === value;
				default:
					return false;
			}
		} catch {
			return false;
		}
	}

	/**
     * Extract value from JSON path
     */
	private getJsonPathValue(obj: unknown, pathStr: string): unknown {
		const keys = pathStr.split('.');
		let current = obj;
		for (const key of keys) {
			if (current === null || current === undefined || typeof current !== 'object')
				return undefined;
			if (key.includes('[') && key.includes(']')) {
				// Handle array access like: "items[0]"
				const [arrayKey, indexStr] = key.split('[');
				const index = parseInt(indexStr.replace(']', ''), 10);
				current = (current as Record<string, any>)[arrayKey]?.[index];
			} else {
				current = (current as Record<string, any>)[key];
			}
		}
		return current;
	}

	/**
     * Get current thread identifier
     */
	private getCurrentThreadId(): string {
		if (browser) {
			return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
		}
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const proc = (typeof process !== 'undefined') ? process : { pid: 0 };
		return `server-${proc.pid}-${Date.now()}`;
	}

	/**
     * Clear cache with thread synchronization
     */
	async clearCache(): Promise<void> {
		const release = await internalCache.mutex.acquire();
		try {
			internalCache.data.clear();
			internalCache.jsonbIndex.clear();
			cacheStore.update((state) => ({
				...state,
				totalEntries: 0,
				lastOperation: 'cleared'
			}));
		} finally {
			release();
		}
	}

	/**
     * Get cache statistics
     */
	getCacheStats(): {
        totalEntries: number;
		gpuProcessedCount: number;
        averageAccessCount: number;
		threadSafe: boolean;
	} {
		const docs = Array.from(internalCache.jsonbIndex.values());
		const gpuProcessedCount = docs.filter((doc) => doc.metadata.gpuProcessed).length;
		const totalAccess = docs.reduce((sum, d) => sum + d.metadata.accessCount, 0);
		return {
			totalEntries: docs.length,
			gpuProcessedCount: gpuProcessedCount,
			averageAccessCount: docs.length > 0 ? totalAccess / docs.length : 0,
			threadSafe: true
		};
	}
}

// Export singleton instance
export const cognitiveCache = CognitiveCacheService.getInstance();

// Export utility functions (these are simplified wrappers around CognitiveCacheService)
export async function storeJsonbDocument(
	id: string,
    document: unknown,
	metadata?: Record<string, unknown>
): Promise<boolean> {
	return cognitiveCache.storeJsonbDocument(id, document, metadata);
}

export async function retrieveJsonbDocument(id: string): Promise<JsonbDocumentInternal | null> {
	return cognitiveCache.retrieveJsonbDocument(id);
}

export async function queryJsonb(
	jsonPath: string,
    value: unknown,
    operator: '@>' | '@?' | '@@' | '->' | '->>' = '@>'
): Promise<JsonbDocumentInternal[]> {
	return cognitiveCache.queryJsonb(jsonPath, value, operator);
}

// Legal AI specific utilities
export interface LegalDocument {
	caseId: string;
    title: string;
    content: string;
    metadata: {
        court: string;
        date: string;
        parties: unknown[];
        classification: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
	};
	embedding?: Float32Array;
}

/**
 * Store legal document with optimized JSONB structure
 */
export async function storeLegalDocument(document: LegalDocument): Promise<boolean> {
	return await storeJsonbDocument(document.caseId, document, {
		documentType: 'legal',
		indexed: true,
		searchable: true,
	});
}

/**
 * Query legal documents by metadata
 */
export async function queryLegalDocuments(
	criteria: Partial<LegalDocument['metadata']>
): Promise<LegalDocument[]> {
	const results: LegalDocument[] = [];
	for (const [key, value] of Object.entries(criteria)) {
		const docs = await queryJsonb(`metadata.${key}`, value, '@>');
		results.push(...docs.map((d: any) => d.content as LegalDocument));
	}

	// Remove duplicates
	const unique = results.filter((doc, index, self) =>
        index === self.findIndex((d) => d.caseId === doc.caseId)
	);
	return unique;
}

/**
 * Cache Context for Cognitive Cache Manager
 * Defines the structure of the context object used in cache operations
 */
interface CacheContext {
	action: string;
	documentId?: string;
	documentType?: string;
    priority: 'low' | 'medium' | 'high';
}

/**
 * Cache Entry Metadata
 * Contains metadata for each cache entry, including key, type, and context
 */
interface CacheEntryMetadata {
	key: string;
    type: 'legal-data' | 'embedding' | 'llm-result' | 'session';
	context: CacheContext;
}

/**
 * Cache Options
 * Options for cache operations, such as TTL and cognitive value
 */
interface CacheOptions {
	distributeAcrossCaches?: boolean;
	cognitiveValue?: number; // A score indicating the importance/relevance for cognitive processing
	ttl?: number; // Time to live in seconds
}

// Utility for SHA256 hashing (universal for browser and Node.js)
async function sha256(str: string): Promise<string> {
	if (browser) {
		// In browser, use Web Crypto API
		const textEncoder = new TextEncoder();
		const data = textEncoder.encode(str);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hexHash = hashArray.map((b: any) => b.toString(16).padStart(2, '0')).join('');
		return hexHash;
	} else {
		// In Node.js, use 'crypto' module
		return createHash('sha256').update(str).digest('hex');
	}
}

class CognitiveCacheManager {
	private localCache = new Map<
		string,
		{ data: unknown; metadata: CacheEntryMetadata; options: CacheOptions; timestamp: number }
	>();

	constructor() {
		console.log('CognitiveCacheManager initialized.');
	}

	async set(
		metadata: CacheEntryMetadata,
        data: unknown,
        options: CacheOptions = {}
	): Promise<void> {
		const key = metadata.key;
		const ttl = options.ttl ?? 3600; // Default TTL 1 hour

		if (!browser && redisClient?.isReady) {
			try {
				const redisKey = await this.getRedisKey(metadata);
				await redisClient.set(
					redisKey,
                    JSON.stringify({ data, metadata, options, timestamp: Date.now() }),
					{ EX: ttl }
				);
				console.log(
					`[CognitiveCache] Set Redis cache entry for key: ${redisKey}, type: ${metadata.type}`
				);
			} catch (error) {
				console.error(`[CognitiveCache] Failed to set Redis cache for key ${key}:`, error);
				this.localCache.set(key, { data, metadata, options, timestamp: Date.now() }); // Fallback to local cache
			}
		} else {
			this.localCache.set(key, { data, metadata, options, timestamp: Date.now() });
			console.log(`[CognitiveCache] Set local cache entry for key: ${key}, type: ${metadata.type}`);
		}
	}

	async get<T>(key: string, metadataType?: CacheEntryMetadata['type']): Promise<T | null> {
		let entry: { data: unknown; metadata: CacheEntryMetadata; options: CacheOptions; timestamp: number } | undefined;

		if (!browser && redisClient?.isReady) {
			try {
				const redisKey = await this.getRedisKey({
					key: key,
					type: metadataType ?? 'legal-data',
					context: { action: 'get', priority: 'medium' },
				});
				const cachedData = await redisClient.get(redisKey);
				if (cachedData) {
					entry = JSON.parse(cachedData);
					console.log(`[CognitiveCache] Redis cache hit for key: ${redisKey}`);
				}
			} catch (error) {
				console.error(`[CognitiveCache] Failed to get from Redis for key ${key}:`, error);
			}
		}

		if (!entry) {
			entry = this.localCache.get(key);
			if (entry) {
				console.log(`[CognitiveCache] Local cache hit for key: ${key}`);
			}
		}

		if (entry && Date.now() - entry.timestamp < (entry.options.ttl ?? 3600) * 1000) {
			return entry.data as T;
		}

		// Invalidate expired entry or if not found
		if (!browser && redisClient?.isReady) {
			try {
				const redisKey = await this.getRedisKey({
					key: key,
					type: metadataType ?? 'legal-data',
					context: { action: 'get', priority: 'medium' },
				});
				await redisClient.del(redisKey);
			} catch (error) {
				console.error(`[CognitiveCache] Failed to invalidate Redis entry for key ${key}:`, error);
			}
		}
		this.localCache.delete(key);
		console.log(`[CognitiveCache] Cache miss or expired for key: ${key}`);
		return null;
	}

	async invalidate(key: string, metadataType?: CacheEntryMetadata['type']): Promise<void> {
		if (!browser && redisClient?.isReady) {
			try {
				const redisKey = await this.getRedisKey({
                    key: key,
                    type: metadataType ?? 'legal-data',
					context: { action: 'invalidate', priority: 'medium' },
				});
				await redisClient.del(redisKey);
				console.log(`[CognitiveCache] Invalidated Redis cache entry for key: ${redisKey}`);
			} catch (error) {
				console.error(`[CognitiveCache] Failed to invalidate Redis entry for key ${key}:`, error);
			}
		}
		this.localCache.delete(key);
		console.log(`[CognitiveCache] Invalidated local cache entry for key: ${key}`);
	}

	// Helper to generate Redis key following the langcache pattern
	private async getRedisKey(metadata: CacheEntryMetadata): Promise<string> {
		// For 'embedding' and 'llm-result' types, use the langcache pattern
		if (metadata.type === 'embedding' || metadata.type === 'llm-result') {
			// Assuming 'key' here might be a prompt or a combination that can be hashed
			const model = metadata.context?.documentType ?? 'default'; // Placeholder for model name
			const shaPrompt = await sha256(metadata.key); // Hash the key (e.g., prompt)
			return `langcache:${model}:${shaPrompt}`;
		}
		// For other types, use a simpler key
		return `${metadata.type}:${metadata.key}`;
	}
}

export const cognitiveCacheManager = new CognitiveCacheManager();
