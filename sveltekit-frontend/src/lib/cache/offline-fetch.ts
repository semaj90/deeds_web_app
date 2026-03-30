/**
 * Offline-aware fetch helper — serves cached data when navigator.onLine is false,
 * and queues mutations for later sync.
 */
import { get, set } from 'idb-keyval';

interface FetchOptions {
	cacheKey: string;
	forceFresh?: boolean;
	ttl?: number;
}

interface CacheEntry<T = unknown> {
	data: T;
	timestamp: number;
	ttl: number;
}

const DEFAULT_TTL = 3_600_000; // 1 hour

export async function offlineFetch<T = unknown>(
	url: string,
	options: FetchOptions,
): Promise<T> {
	const { cacheKey, forceFresh = false, ttl = DEFAULT_TTL } = options;

	// Try cache first when offline
	if (!navigator.onLine) {
		const cached = await get<CacheEntry<T>>(cacheKey);
		if (cached && Date.now() - cached.timestamp < cached.ttl) {
			return cached.data;
		}
		throw new Error('Offline and no valid cache entry');
	}

	// Online path: optionally check cache unless forceFresh
	if (!forceFresh) {
		const cached = await get<CacheEntry<T>>(cacheKey);
		if (cached && Date.now() - cached.timestamp < cached.ttl) {
			return cached.data;
		}
	}

	const res = await fetch(url);
	if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
	const data = (await res.json()) as T;

	// Write-through to cache
	await set(cacheKey, { data, timestamp: Date.now(), ttl } satisfies CacheEntry<T>);
	return data;
}

interface MutateOptions {
	method?: string;
	body?: string;
}

const QUEUE_KEY = '__offline_mutation_queue';

export async function offlineMutate(url: string, opts: MutateOptions): Promise<void> {
	if (!navigator.onLine) {
		const queue = (await get<Array<{ url: string; opts: MutateOptions }>>(QUEUE_KEY)) ?? [];
		queue.push({ url, opts });
		await set(QUEUE_KEY, queue);
		throw new Error('queued for sync');
	}

	const res = await fetch(url, {
		method: opts.method ?? 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: opts.body,
	});
	if (!res.ok) throw new Error(`Mutation failed: ${res.status}`);
}
