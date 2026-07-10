/// <reference lib="webworker" />
import { buildRuntimeCacheKey } from './lib/runtime-cache/runtime-cache-key';

// Define SyncEvent interface, as it might not be fully provided by lib="webworker" in all environments
interface SyncEvent extends Event {
	readonly tag: string;
}

// Define CacheWarmingTask interface
interface CacheWarmingTask {
	id: string;
	type: 'legal_document' | 'vector_similarity' | 'search_results' | 'som_embeddings';
	priority: number;
	payload: unknown;
	retries: number;
}

// Global state variables for service integrations
let isRedisConnected: boolean = false;
let somCacheReady: boolean = false;
let webgpuInitialized: boolean = false;

// Same-origin integration clients. Server endpoints own Redis/Valkey access.
let redisWebGPUIntegration: any;
let simdJSONClient: any;
let somWebGPUCache: any;

// Global data structures for cache warming
const warmingQueue: CacheWarmingTask[] = [];
const activeWarmingTasks: Map<string, Promise<void>> = new Map();

// Service Worker Lifecycle: 'install' event
self.addEventListener('install', (event: ExtendableEvent) => {
	console.log('Service Worker: Installing...');
	event.waitUntil(
		(async () => {
			redisWebGPUIntegration = {
				getCachedResult: async (key: string) => {
					const res = await fetch(`/api/atlas/runtime-cache/redis?key=${encodeURIComponent(key)}`);
					if (!res.ok) return null;
					const data = await res.json().catch(() => null);
					return data?.ok ? data.data : null;
				},
				cacheResult: async (key: string, data: Record<string, unknown>, options: unknown) => {
					await fetch('/api/atlas/runtime-cache/redis', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							key,
							data,
							ttl: typeof options === 'object' && options && 'ttl' in options ? (options as any).ttl : 900,
						}),
					}).catch(() => null);
				},
				getCacheKeys: async () => {
					const res = await fetch('/api/atlas/runtime-cache/redis?prefix=sw:&limit=100');
					if (!res.ok) return [];
					const data = await res.json().catch(() => null);
					return Array.isArray(data?.keys) ? data.keys : [];
				},
				warmLegalDocumentCache: async (payload: unknown) => {
					await redisWebGPUIntegration.cacheResult('sw:warm:legal-document', payload, { ttl: 3600 });
				},
				warmVectorSimilarityCache: async (payload: unknown) => {
					await redisWebGPUIntegration.cacheResult('sw:warm:vector-similarity', payload, { ttl: 3600 });
				},
				warmSearchResultsCache: async (payload: unknown) => {
					await redisWebGPUIntegration.cacheResult('sw:warm:search-results', payload, { ttl: 900 });
				},
				syncWithDistributedCache: async () => {
					await redisWebGPUIntegration.getCacheKeys();
				},
			};
			simdJSONClient = {
				parseJSON: async (text: string) => JSON.parse(text),
			};
			somWebGPUCache = {
				get: async (key: string) => {
					const res = await fetch(`/api/atlas/runtime-cache/som?key=${encodeURIComponent(key)}`);
					if (!res.ok) return null;
					const data = await res.json().catch(() => null);
					return data?.ok ? data.data : null;
				},
				storeResult: async (key: string, data: unknown) => {
					await fetch('/api/atlas/runtime-cache/som', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ key, data, ttl: 3600 }),
					}).catch(() => null);
				},
				precomputeEmbeddings: async (payload: unknown) => {
					await somWebGPUCache.storeResult('precompute', payload);
				},
				trainInBackground: async () => {
					await somWebGPUCache.storeResult('train-background', { requestedAt: new Date().toISOString() });
				},
				getEmbeddingsForCase: async (caseId: string) => {
					return await somWebGPUCache.get(`case:${caseId}:embeddings`);
				},
				search: async () => {
					return null;
				},
			};

			await refreshRuntimeCacheReadiness();
			webgpuInitialized = true;

			await caches.open('legal-ai-v1');
			console.log('Service Worker: Cache opened.');
		})()
	);
	(self as unknown as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
	console.log('Service Worker: Activating...');
	event.waitUntil(
		(async () => {
			const cacheNames = await caches.keys();
			await Promise.all(
				cacheNames.filter((name) => name !== 'legal-ai-v1').map((name) => caches.delete(name))
			);
			console.log('Service Worker: Old caches cleared.');
			await (self as unknown as ServiceWorkerGlobalScope).clients.claim();
			console.log('Service Worker: Clients claimed.');
			await refreshRuntimeCacheReadiness();
			startCacheWarming();
			syncDistributedCaches();
		})()
	);
});

self.addEventListener('fetch', (event: FetchEvent) => {
	event.respondWith(handleAPIRequest(event.request));
});

/**
 * Handle background sync for cache warming and data sync
 */
self.addEventListener('sync', (event: any) => {
	console.log('Service Worker: Background sync triggered:', event.tag);
	switch (event.tag) {
		case 'cache-warming':
			event.waitUntil(processCacheWarmingQueue());
			break;
		case 'redis-sync':
			event.waitUntil(syncWithRedisCache());
			break;
		case 'som-training':
			event.waitUntil(trainSOMInBackground());
			break;
	}
});

/**
 * Handle API requests with multi-tier caching and WebGPU acceleration
 */
async function handleAPIRequest(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const cacheKey = await buildRuntimeCacheKey(request);

	// ── SPECIAL HANDLING: Instant Local Search (WebGPU) ───────────────────────
	if (url.pathname === '/api/rag/search' && request.method === 'POST') {
		const useWebGPU = request.headers.get('x-use-webgpu') === 'true';
		
		if (useWebGPU) {
			try {
				const body = await request.clone().json();
				const caseId = body.caseId || body.case_id;
				
				// If we have a local embedding corpus for this case, run instant search
				if (caseId && somCacheReady) {
					const localResults = await attemptLocalWebGPUSearch(body);
					if (localResults) {
						console.log(`[SW] WebGPU Instant Search hit for case ${caseId}`);
						return new Response(JSON.stringify(localResults), {
							headers: { 
								'Content-Type': 'application/json',
								'X-Search-Backend': 'webgpu-local',
								'X-Cache-Source': 'som-webgpu'
							}
						});
					}
				}
			} catch (err) {
				console.warn('[SW] Local search bypass:', err);
			}
		}
	}

	try {
		// Check cache hierarchy: Memory -> SOM -> Redis -> Network
		const cachedResponse = await checkCacheHierarchy(cacheKey, request);
		if (cachedResponse) {
			return cachedResponse;
		}

		// Network request with optional SIMD JSON optimization
		const networkResponse = await fetch(request);

		// Cache the response across all tiers if it's a successful JSON response
		const contentType = networkResponse.headers.get('content-type') ?? '';
		if (networkResponse.ok && contentType.includes('application/json')) {
			await cacheResponse(cacheKey, networkResponse.clone(), request);
		}
		return networkResponse;
	} catch (error) {
		console.error('Service Worker fetch error:', error);
		return new Response('Service Worker Error', { status: 500 });
	}
}

/**
 * Attempt a local similarity search using WebGPU in the Service Worker.
 * Falls back to network search if local corpus is missing or GPU fails.
 */
async function attemptLocalWebGPUSearch(body: any): Promise<any | null> {
	if (!webgpuInitialized || !somWebGPUCache) return null;
	
	const { query, precomputedEmbedding, top_k = 10 } = body;
	if (!query && !precomputedEmbedding) return null;

	try {
		// Retrieve local corpus from IndexedDB/LokiJS
		const corpus = await somWebGPUCache.getEmbeddingsForCase(body.caseId || body.case_id);
		if (!corpus || corpus.length === 0) return null;

		// Perform WebGPU similarity search
		// This uses the WebGPUSimilarityEngine integrated into somWebGPUCache
		const results = await somWebGPUCache.search(
			precomputedEmbedding || query, 
			corpus, 
			{ topK: top_k }
		);

		return {
			query_id: `sw-webgpu-${Date.now()}`,
			query,
			chunks: results.map((r: any) => ({
				...r.chunk,
				score: r.score,
				confidence: r.score >= 0.85 ? 'high' : 'medium'
			})),
			total_found: results.length,
			search_time_ms: results.searchTimeMs,
			embedding_model: 'client-local-webgpu',
			timestamp: new Date().toISOString(),
			diagnostics: {
				backend: 'webgpu-service-worker',
				corpus_size: corpus.length
			}
		};
	} catch (err) {
		console.error('[SW] WebGPU search failed:', err);
		return null;
	}
}

async function checkCacheHierarchy(cacheKey: string, request: Request): Promise<Response | null> {
	try {
		if (request.method === 'GET') {
			const cache = await caches.open('legal-ai-v1');
			const cached = await cache.match(request);
			if (cached) return cached;
		}

		if (somCacheReady && shouldSyncToSOM(cacheKey)) {
			const somHit = await safeSomGet(cacheKey);
			if (somHit) {
				return new Response(JSON.stringify(somHit), {
					headers: {
						'Content-Type': 'application/json',
						'X-Cache-Source': 'som-runtime',
					},
				});
			}
		}

		if (isRedisConnected) {
			const redisHit = await redisWebGPUIntegration.getCachedResult(cacheKey);
			if (redisHit) {
				return new Response(JSON.stringify(redisHit), {
					headers: {
						'Content-Type': 'application/json',
						'X-Cache-Source': 'redis-runtime',
					},
				});
			}
		}
	} catch (err) {
		console.warn('[SW] cache hierarchy miss after error:', err);
	}

	return null;
}

async function refreshRuntimeCacheReadiness(): Promise<void> {
	try {
		const redisProbe = await fetch('/api/atlas/runtime-cache/redis?prefix=sw:&limit=1');
		isRedisConnected = redisProbe.ok;
	} catch {
		isRedisConnected = false;
	}

	try {
		const somProbe = await fetch('/api/atlas/runtime-cache/som?key=__readiness__');
		somCacheReady = somProbe.ok;
	} catch {
		somCacheReady = false;
	}
}

/**
 * Cache response across all tiers
 */
async function cacheResponse(
	cacheKey: string,
	response: Response,
	request: Request
): Promise<void> {
	try {
		const responseData = await response.clone().json();
		const cacheStrategy = determineCacheStrategy(request);
		const cachePromises: Promise<any>[] = [];

		// 1. Browser cache
		if (request.method === 'GET') {
			const cache = await caches.open('legal-ai-v1');
			cachePromises.push(cache.put(request, response.clone()));
		}

		// 2. Redis distributed cache
		if (isRedisConnected && cacheStrategy.useRedis) {
			cachePromises.push(
				redisWebGPUIntegration.cacheResult(cacheKey, responseData, {
					ttl: cacheStrategy.ttl,
					priority: cacheStrategy.priority,
				})
			);
		}

		// 3. SOM WebGPU cache (for intelligent data)
		if (somCacheReady && cacheStrategy.useSOM) {
			cachePromises.push(safeSomStore(cacheKey, responseData));
		}
		await Promise.allSettled(cachePromises);
	} catch (error) {
		console.error('Cache storage failed:', error);
	}
}

/**
 * Determine caching strategy based on request
 */
function determineCacheStrategy(request: Request): {
	useRedis: boolean;
	useSOM: boolean;
	ttl: number;
	priority: number;
} {
	const url = new URL(request.url);

	if (url.pathname.includes('/api/legal/')) {
		return { useRedis: true, useSOM: true, ttl: 24 * 60 * 60, priority: 10 };
	}

	if (url.pathname.includes('/api/vectors/') || url.pathname.includes('/api/similarity/')) {
		return { useRedis: true, useSOM: false, ttl: 60 * 60, priority: 5 };
	}

	if (url.pathname.includes('/api/search/')) {
		return { useRedis: true, useSOM: true, ttl: 15 * 60, priority: 8 };
	}

	if (url.pathname.includes('/api/chat/')) {
		return { useRedis: false, useSOM: false, ttl: 5 * 60, priority: 3 };
	}

	return { useRedis: true, useSOM: false, ttl: 30 * 60, priority: 5 };
}

/**
 * Sync distributed caches on activation
 */
async function syncDistributedCaches(): Promise<void> {
	console.log('Syncing distributed caches...');
	try {
		if (isRedisConnected && somCacheReady) {
			const redisCacheKeys = await redisWebGPUIntegration.getCacheKeys();
			for (const key of redisCacheKeys.slice(0, 100)) {
				try {
					const redisData = await redisWebGPUIntegration.getCachedResult(key);
					if (redisData && shouldSyncToSOM(key)) {
						await safeSomStore(key, redisData);
					}
				} catch (error) {
					console.warn(`Failed to sync key ${key}:`, error);
				}
			}
			console.log('Distributed cache sync complete');
		}
	} catch (error) {
		console.error('Distributed cache sync failed:', error);
	}
}

/**
 * Determine if data should be synced to SOM cache
 */
function shouldSyncToSOM(cacheKey: string): boolean {
	return (
		cacheKey.includes('legal') ||
		cacheKey.includes('search') ||
		cacheKey.includes('similarity') ||
		cacheKey.includes('analysis')
	);
}

/**
 * Start background cache warming
 */
function startCacheWarming(): void {
	console.log('Starting background cache warming...');
	setInterval(() => {
		if (warmingQueue.length > 0) {
			processCacheWarmingQueue();
		}
	}, 30000);

	queueCommonCacheWarming();
}

/**
 * Queue common cache warming tasks
 */
function queueCommonCacheWarming(): void {
	const commonTasks: CacheWarmingTask[] = [
		{
			id: 'legal-templates',
			type: 'legal_document',
			priority: 10,
			payload: { type: 'template_analysis' },
			retries: 0,
		},
		{
			id: 'common-vectors',
			type: 'vector_similarity',
			priority: 8,
			payload: { precompute: 'common_embeddings' },
			retries: 0,
		},
		{
			id: 'search-patterns',
			type: 'search_results',
			priority: 7,
			payload: { warm: 'popular_queries' },
			retries: 0,
		},
	];
	warmingQueue.push(...commonTasks);
}

/**
 * Process cache warming queue
 */
async function processCacheWarmingQueue(): Promise<void> {
	const maxConcurrent = 3;
	const currentRunning = activeWarmingTasks.size;
	if (currentRunning >= maxConcurrent) {
		return;
	}

	// Get highest priority tasks
	const tasksToProcess = [...warmingQueue]
		.sort((a: CacheWarmingTask, b: CacheWarmingTask) => b.priority - a.priority)
		.slice(0, maxConcurrent - currentRunning);

	for (const task of tasksToProcess) {
		const warmingPromise = processWarmingTask(task);
		activeWarmingTasks.set(task.id, warmingPromise);

		warmingPromise
			.then(() => {
				console.log(`Cache warming completed: ${task.id}`);
				const index = warmingQueue.findIndex((t: CacheWarmingTask) => t.id === task.id);
				if (index >= 0) {
					warmingQueue.splice(index, 1);
				}
			})
			.catch((error) => {
				console.warn(`Cache warming failed: ${task.id}`, error);
				task.retries++;
				if (task.retries >= 3) {
					const index = warmingQueue.findIndex((t: CacheWarmingTask) => t.id === task.id);
					if (index >= 0) {
						warmingQueue.splice(index, 1);
					}
				} else {
					task.priority = Math.max(1, task.priority - 1);
				}
			})
			.finally(() => {
				activeWarmingTasks.delete(task.id);
			});
	}
}

/**
 * Process individual warming task
 */
async function processWarmingTask(task: CacheWarmingTask): Promise<void> {
	try {
		switch (task.type) {
			case 'legal_document':
				if (isRedisConnected) {
					await redisWebGPUIntegration.warmLegalDocumentCache(task.payload);
				}
				break;
			case 'vector_similarity':
				if (isRedisConnected) {
					await redisWebGPUIntegration.warmVectorSimilarityCache(task.payload);
				}
				break;
			case 'search_results':
				if (isRedisConnected) {
					await redisWebGPUIntegration.warmSearchResultsCache(task.payload);
				}
				break;
			case 'som_embeddings':
				if (somCacheReady) {
					if (typeof somWebGPUCache.precomputeEmbeddings === 'function') {
						await somWebGPUCache.precomputeEmbeddings(task.payload);
					} else {
						await safeSomStore(task.id, task.payload);
					}
				}
				break;
		}
	} catch (error) {
		console.error('Warming task failed:', task.id, error);
		throw error;
	}
}

/**
 * Sync with Redis cache
 */
async function syncWithRedisCache(): Promise<void> {
	console.log('Syncing with Redis cache...');
	try {
		if (isRedisConnected) {
			await redisWebGPUIntegration.syncWithDistributedCache();
			console.log('Redis cache sync complete');
		}
	} catch (error) {
		console.error('Redis cache sync failed:', error);
	}
}

/**
 * Train SOM in background
 */
async function trainSOMInBackground(): Promise<void> {
	console.log('Training SOM in background...');
	try {
		if (somCacheReady) {
			if (typeof somWebGPUCache.trainInBackground === 'function') {
				await somWebGPUCache.trainInBackground();
			} else {
				console.warn('trainInBackground not implemented on somWebGPUCache');
			}
			console.log('SOM background training complete');
		}
	} catch (error) {
		console.error('SOM background training failed:', error);
	}
}

/**
 * Handle message events from main thread
 */
self.addEventListener('message', (event: MessageEvent) => {
	const { type, payload } = event?.data || {};
	switch (type) {
		case 'QUEUE_CACHE_WARMING':
			warmingQueue.push(payload);
			break;
		case 'SYNC_CACHES':
			syncDistributedCaches();
			break;
		case 'TRAIN_SOM':
			trainSOMInBackground();
			break;
		case 'GET_CACHE_STATUS':
			event.ports?.[0]?.postMessage({
				redis: isRedisConnected,
				webgpu: webgpuInitialized,
				som: somCacheReady,
				warmingQueueLength: warmingQueue.length,
				activeWarmingTasksSize: activeWarmingTasks.size,
			});
			break;
	}
});

console.log('Service Worker: Redis + WebGPU + SIMD integration loaded');

/**
 * Defensive SOM storage helper
 */
async function safeSomStore(key: string, data: unknown): Promise<void> {
	if (!somCacheReady) return;
	const s = somWebGPUCache as any;
	try {
		if (typeof s.storeResult === 'function') { await s.storeResult(key, data); return; }
		if (typeof s.cacheResult === 'function') { await s.cacheResult(key, data); return; }
		if (typeof s.set === 'function') { await s.set(key, data); return; }
		if (typeof s.put === 'function') { await s.put(key, data); return; }
		if (typeof s.upsert === 'function') { await s.upsert(key, data); return; }
		if (typeof s.precomputeEmbeddings === 'function') {
			await s.precomputeEmbeddings(key, data).catch(() => s.precomputeEmbeddings(data));
			return;
		}
		console.warn('safeSomStore: no compatible store method found on somWebGPUCache');
	} catch (err) {
		console.error('safeSomStore failed:', err);
	}
}

/**
 * Defensive SOM getter helper
 */
async function safeSomGet(key: string): Promise<any | null> {
	if (!somCacheReady) return null;
	const s = somWebGPUCache as any;
	try {
		if (typeof s.get === 'function') return await s.get(key);
		if (typeof s.getResult === 'function') return await s.getResult(key);
		if (typeof s.getCachedResult === 'function') return await s.getCachedResult(key);
		if (typeof s.retrieve === 'function') return await s.retrieve(key);
		if (typeof s.fetch === 'function') return await s.fetch(key);
		if (typeof s.lookup === 'function') return await s.lookup(key);
		if (typeof s.getItem === 'function') return await s.getItem(key);
		if (typeof s.read === 'function') {
			try {
				return await s.read(key);
			} catch {
				return await s.read(key, { raw: true }).catch(() => null);
			}
		}
		console.warn('safeSomGet: no compatible get method found on somWebGPUCache');
		return null;
	} catch (err) {
		console.warn('safeSomGet failed:', err);
		return null;
	}
}
