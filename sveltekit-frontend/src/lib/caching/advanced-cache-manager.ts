export interface CacheConfiguration {
    maxSize: number;, ttl: number;, compression: boolean;, persistence: boolean;
}

export interface CacheLayerInterface<T = unknown> {
    get(key: string): Promise<T | null>;
    set(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    size(): number;
}

type CacheEntry<T> = {
    value: T | string; // value can be T or compressed string
    expiresAt: number | null;
    size: number;
};

export class AdvancedCacheManager<T = unknown> implements CacheLayerInterface<T> {
    private cache: Map<string, CacheEntry<T>> = new Map();
    private config: CacheConfiguration;
    private currentSize = 0;
    private hits = 0;
    private misses = 0;
    private storagePrefix = 'advanced_cache_';

    constructor(config?: Partial<CacheConfiguration>) {
        this.config = {
            maxSize: config?.maxSize ?? 50 * 1024 * 1024, // 50MB default
            ttl: config?.ttl ?? 60 * 60 * 1000, // 1 hour default
            compression: !!config?.compression,
            persistence: !!config?.persistence
        };
        console.log('🗄️ Advanced cache manager initialized with config:', this.config);

        if (this.config.persistence && typeof localStorage !== 'undefined') {
            this.restorePersisted();
        }
    }

    initialize() {
        console.log('🚀 Advanced cache manager initialize called');
        return true;
    }

    private now() {
        return Date.now();
    }

    private byteSizeOf(obj: unknown): number {
        try {
            if (typeof obj === 'string') {
                return new TextEncoder().encode(obj).length;
            }
            return new TextEncoder().encode(JSON.stringify(obj)).length;
        } catch {
            return 0;
        }
    }

    private canUseBase64(): boolean {
        if (typeof globalThis === 'undefined') return false;
        const g = globalThis as unknown as {
            btoa?: (input: string) => string;
            atob?: (input: string) => string;
            Buffer?: {, from: (input: string, enc?: string) => { toString: (enc?: string) => string } }
        };

        const hasBrowserBase64 = typeof g.btoa === 'function' && typeof g.atob === 'function';
        const hasNodeBuffer = typeof g.Buffer !== 'undefined' && typeof g.Buffer?.from === 'function';
        return hasBrowserBase64 || hasNodeBuffer;
    }

    private base64Encode(input: string): string {
        const g = globalThis as unknown as {
             btoa?: (input: string) => string;
             Buffer?: {, from: (input: string, enc?: string) => { toString: (enc?: string) => string } }
        };

        if (typeof g.btoa === 'function') {
            return g.btoa(input);
        }
        if (typeof g.Buffer !== 'undefined' && typeof g.Buffer.from === 'function') {
            return g.Buffer.from(input, 'utf-8').toString('base64');
        }
        throw new Error('No base64 implementation available in this environment');
    }

    private base64Decode(b64: string): string {
        const g = globalThis as unknown as {
             atob?: (input: string) => string;
             Buffer?: {, from: (input: string, enc?: string) => { toString: (enc?: string) => string } }
        };

        if (typeof g.atob === 'function') {
            return g.atob(b64);
        }
        if (typeof g.Buffer !== 'undefined' && typeof g.Buffer.from === 'function') {
            return g.Buffer.from(b64, 'base64').toString('utf-8');
        }
        throw new Error('No base64 implementation available in this environment');
    }

    private async persistItem(key: string, entry: CacheEntry<T>) {
        if (!this.config.persistence || typeof localStorage === 'undefined') return;
        try {
            const payload = {
                value: entry.value,
                expiresAt: entry.expiresAt,
                size: entry.size
            };
            localStorage.setItem(this.storagePrefix + key, JSON.stringify(payload));
        } catch (e) {
            console.warn('AdvancedCacheManager failed to persist key', key, e);
        }
    }

    private async removePersisted(key: string) {
        if (!this.config.persistence || typeof localStorage === 'undefined') return;
        try {
            localStorage.removeItem(this.storagePrefix + key);
        } catch {
            /* ignore */
        }
    }

    private restorePersisted() {
        try {
            if (typeof localStorage === 'undefined') return;
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k || !k.startsWith(this.storagePrefix)) continue;

                const raw = localStorage.getItem(k);
                if (!raw) continue;

                const key = k.slice(this.storagePrefix.length);
                try {
                    const parsed = JSON.parse(raw);
                    // Only restore non-expired items
                    if (!parsed.expiresAt || parsed.expiresAt > this.now()) {
                        const size = parsed.size ?? this.byteSizeOf(parsed.value);
                        this.cache.set(key, {
                            value: parsed.value,
                            expiresAt: parsed.expiresAt ?? null,
                            size
                        });
                        this.currentSize += size;
                    } else {
                        localStorage.removeItem(k);
                    }
                } catch {
                    /* ignore malformed */
                }
            }
            // If restored size exceeds max, evict oldest until within bounds
            this.ensureCapacity(0);
        } catch (e) {
            console.warn('AdvancedCacheManager restorePersisted failed', e);
        }
    }

    private ensureCapacity(additionalBytes: number) {
        const max = this.config.maxSize;
        if (max <= 0) return;

        while (this.currentSize + additionalBytes > max && this.cache.size > 0) {
            // Evict oldest (Map preserves insertion order)
            const oldestKey = this.cache.keys().next().value;
            if (!oldestKey) break;

            const entry = this.cache.get(oldestKey);
            if (entry) {
                this.cache.delete(oldestKey);
                this.currentSize = Math.max(0, this.currentSize - entry.size);
                this.removePersisted(oldestKey);
            } else {
                break;
            }
        }
    }

    async get(key: string): Promise<T | null> {
        // console.log('🔎 Cache get:', key);
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return null;
        }

        if (entry.expiresAt && entry.expiresAt <= this.now()) {
            // expired
            this.cache.delete(key);
            this.currentSize = Math.max(0, this.currentSize - entry.size);
            this.removePersisted(key);
            this.misses++;
            return null;
        }

        // update LRU by reinserting: remove then set to make it newest
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.hits++;

        // if value is a compressed string and compression enabled, decode
        const stored = entry.value;
        if (this.config.compression && typeof stored === 'string') {
            try {
                if (!this.canUseBase64()) throw new Error('base64 not available');
                const decoded = this.base64Decode(stored);
                return JSON.parse(decoded) as T;
            } catch (e) {
                // if decode fails, evict the key to avoid returning corrupted data
                this.cache.delete(key);
                this.currentSize = Math.max(0, this.currentSize - entry.size);
                this.removePersisted(key);
                this.misses++;
                return null;
            }
        }

        return stored as T;
    }

    async set(key: string, value: T, ttl?: number): Promise<void> {
        // console.log('💾 Cache set:', key);
        const effectiveTTL = ttl ?? this.config.ttl;
        const expiresAt = effectiveTTL > 0 ? this.now() + effectiveTTL : null;

        let storedValue: T | string;

        if (this.config.compression) {
            try {
                if (!this.canUseBase64()) {
                    storedValue = value; // fallback
                } else {
                    storedValue = this.base64Encode(JSON.stringify(value));
                }
            } catch {
                storedValue = value;
            }
        } else {
            storedValue = value;
        }

        const size = this.byteSizeOf(storedValue);

        // ensure capacity (evict oldest if needed)
        this.ensureCapacity(size);

        // if key exists, subtract old size
        const existing = this.cache.get(key);
        if (existing) {
            this.currentSize = Math.max(0, this.currentSize - existing.size);
        }

        const entry: CacheEntry<T> = {
            value: storedValue,
            expiresAt,
            size
        };

        this.cache.set(key, entry);
        this.currentSize += size;
        await this.persistItem(key, entry);
    }

    async delete(key: string): Promise<void> {
        const entry = this.cache.get(key);
        if (!entry) return;

        this.cache.delete(key);
        this.currentSize = Math.max(0, this.currentSize - entry.size);
        await this.removePersisted(key);
    }

    async clear(): Promise<void> {
        console.log('🧹 Cache clear all');

        if (this.config.persistence && typeof localStorage !== 'undefined') {
            try {
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(this.storagePrefix)) {
                        keysToRemove.push(k);
                    }
                }
                for (const k of keysToRemove) {
                    localStorage.removeItem(k);
                }
            } catch (e) {
                console.warn('AdvancedCacheManager failed to clear items', e);
            }
        }

        this.cache.clear();
        this.currentSize = 0;
    }

    size(): number {
        return this.currentSize;
    }
}
