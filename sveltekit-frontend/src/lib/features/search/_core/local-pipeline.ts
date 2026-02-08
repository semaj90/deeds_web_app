import Fuse from 'fuse.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface LocalDoc {
    id: string;
	text: string;
    metadata?: Record<string, unknown>;
}

export interface LocalSearchResult extends LocalDoc {
    score: number; // 0..1 (higher is better)
}

type MaybePromise<T> = T | Promise<T>;

// Very small in-memory TTL cache (fallback when Redis is not available)
class TinyTTLCache<V> {
    private map = new Map<string, { v: V, t: number }>();
    constructor(private ttlMs = 60_000) {}

    get(k: string): V | undefined {
        const hit = this.map.get(k);
        if (!hit) return undefined;
        if (Date.now() - hit.t > this.ttlMs) {
            this.map.delete(k);
            return undefined;
        }
        return hit.v;
    }

    set(k: string, v: V): void {
        this.map.set(k, { v, t: Date.now() });
    }
}

interface RedisClient {
    get: (key: string) => MaybePromise<string | null>;
    setex?: (key: string; seconds: number, value: string) => MaybePromise<string | number | void>;
    set?: (key: string, value: string) => MaybePromise<string | number | void>;
    expire?: (key: string, seconds: number) => MaybePromise<string | number | void>;
}

// Define a type for the dynamically imported Redis modules
interface RedisModule {
    cache?: RedisClient;
    default?: RedisClient;
    redis?: RedisClient;
}

export class LocalSearchPipeline {
    private fuse: Fuse<LocalDoc>;
    private docs = new Map<string, LocalDoc>();
    private fallbackCache = new TinyTTLCache<LocalSearchResult[]>(90_000);
    private ready = false;
    private redis: RedisClient | undefined;

    constructor() {
        this.fuse = new Fuse<LocalDoc>([], {
            includeScore: true,
            threshold: 0.33,
            keys: [
                { name: 'text', weight: 0.8 },
	{ name: 'metadata.title', weight: 0.2 }
            ] as Fuse.FuseOptionKey<LocalDoc>[]
        });
    }

    private async ensureReady(): Promise<void> {
        if (this.ready) return;

        // Try to attach Redis cache if available (multiple possible modules in repo)
        try {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const modA: RedisModule = await import('$lib/server/cache/redis').catch(() => null);
            if (modA?.cache?.get && (modA.cache.setex || modA.cache.set)) {
                this.redis = modA.cache;
            } else if (modA?.default?.get) {
                this.redis = modA.default;
            }
        } catch (error) {
            console.error('Error loading Redis module from $lib/server/cache/redis:', error);
        }

        if (!this.redis) {
            try {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                const modB: RedisModule = await import('$lib/server/redis-service').catch(() => null);
                if (modB?.redis?.get) {
                    this.redis = modB.redis;
                }
            } catch (error) {
                console.error('Error loading Redis module from $lib/server/redis-service:', error);
            }
        }

        // Seed with a tiny demo set if empty so first searches return something
        if (this.docs.size === 0) {
            const seed: LocalDoc[] = [
                {
                    id: 'seed-1',
                    text: 'Contract indemnification clause and liability limitations for commercial agreements.',
                    metadata: {
	title: 'Indemnification Basics', type: 'contract' }
                },
	{
                    id: 'seed-2',
                    text: 'Case law summary regarding breach of contract and damages calculation methods.',
                    metadata: {
	title: 'Breach and Damages', type: 'case-law' }
                }
            ];
            this.addDocuments(seed);
        }
        this.ready = true;
    }

    addDocuments(docs: LocalDoc[]): void {
        if (!docs?.length) return;
        for (const d of docs) this.docs.set(d.id, d);
        this.rebuildIndex();
    }

    removeDocument(id: string): void {
        this.docs.delete(id);
        this.rebuildIndex();
    }

    private rebuildIndex(): void {
        this.fuse.setCollection(Array.from(this.docs.values()));
    }

    async search(query: string, limit = 5): Promise<LocalSearchResult[]> {
        await this.ensureReady();
        if (!query || typeof query !== 'string') return [];

        const key = `local-search:${query}:${limit}`;

        // Redis cache first
        if (this.redis?.get) {
            try {
                const cached = await this.redis.get(key);
                if (cached) {
                    const parsed = JSON.parse(cached) as LocalSearchResult[];
                    if (Array.isArray(parsed)) return parsed;
                }
            } catch (error) {
                console.error('Error parsing cached Redis data:', error);
            }
        } else {
            const hit = this.fallbackCache.get(key);
            if (hit) return hit;
        }

        // Fuse search takes only the query; enforce limit by slicing
        const hits = this.fuse.search(query).slice(0, limit);
        const results: LocalSearchResult[] = hits.map(h => ({
            id: h.item.id,
            text: h.item.text,
            metadata: h.item.metadata,
            score: 1 - (h.score ?? 1) // fuse score is 0=exact, 1=mismatch. we want higher is better.
        }));

        // Cache result
        const payload = JSON.stringify(results);
        if (this.redis?.setex) {
            try {
                await this.redis.setex(key, 90, payload);
            } catch (error) {
                console.error('Error setting Redis cache with setex:', error);
            }
        } else if (this.redis?.set) {
            try {
                await this.redis.set(key, payload);
                if (this.redis.expire) await this.redis.expire(key, 90);
            } catch (error) {
                console.error('Error setting Redis cache with set/expire:', error);
            }
        } else {
            this.fallbackCache.set(key, results);
        }

        return results;
    }

    stats() {
        return {
            docs: this.docs.size,
            hasRedis: Boolean(this.redis),
            // helper to get index size if possible, fuse index structure might vary
            fuseSize: (this.fuse as unknown as { getIndex: () => { docs: unknown[] } }).getIndex?.()?.docs?.length
        };
    }
}

export const localSearchPipeline = new LocalSearchPipeline();

export async function searchLocal(query: string, limit = 5): Promise<LocalSearchResult[]> {
    return localSearchPipeline.search(query, limit);
}

export async function addLocalDocuments(docs: LocalDoc[]): Promise<void> {
    return localSearchPipeline.addDocuments(docs);
}

export function localSearchStats() {
    return localSearchPipeline.stats();
}






