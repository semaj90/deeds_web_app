/**
 * Cache Service — stub implementation
 * Provides cache stats and availability checks for MetricsCollector.
 */

export interface CacheStats {
	hits: number;
	misses: number;
	size: number;
}

export class CacheService {
	private stats: CacheStats = { hits: 0, misses: 0, size: 0 };

	async get(_key: string): Promise<any | null> {
		this.stats.misses++;
		return null;
	}

	async set(_key: string, _value: any, _ttlMs?: number): Promise<void> {
		this.stats.size++;
	}

	async getStats(): Promise<CacheStats> {
		return { ...this.stats };
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}

	reset(): void {
		this.stats = { hits: 0, misses: 0, size: 0 };
	}
}

let instance: CacheService | null = null;

export function getCacheService(): CacheService {
	if (!instance) {
		instance = new CacheService();
	}
	return instance;
}
