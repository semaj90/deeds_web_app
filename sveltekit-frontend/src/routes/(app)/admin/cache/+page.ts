import type { PageLoad } from './$types';

/**
 * Same shape the page template reads from `/api/cache/stats`. Returned when the API is unreachable
 * or answers badly, so the page degrades to zeros plus a notice instead of throwing from `load()`
 * (previously an unhandled "Failed to fetch" and the top-ranked runtime error group).
 */
const EMPTY_STATS = {
	redis: { connected: false, totalKeys: 0, memoryUsed: 0, uptimeMs: 0, connectedClients: 0, keyPatterns: [] as unknown[] },
	memory: { size: 0, estimatedSize: 0, defaultTTL: 300_000, hitRate: 0 },
	template: { totalKeys: 0, metadataKeys: 0, aiContentKeys: 0, renderedKeys: 0 },
	llm: { totalResponses: 0, hits: 0, misses: 0, hitRate: 0 },
	export: {
		totalKeys: 0,
		formats: {} as Record<string, number>,
		totalSizeBytes: 0,
		oldestExport: null as string | null,
		newestExport: null as string | null,
	},
};

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/cache/stats');
		if (!res.ok) throw new Error(`Cache stats request failed (${res.status})`);
		const json = await res.json();
		if (!json?.data) throw new Error('Cache stats response had no data');
		return { stats: json.data, loadError: null as string | null };
	} catch (error) {
		return {
			stats: EMPTY_STATS as typeof EMPTY_STATS & Record<string, any>,
			loadError: error instanceof Error ? error.message : 'Cache stats unavailable',
		};
	}
};

// Disable SSR for real-time dashboard
export const ssr = false;
