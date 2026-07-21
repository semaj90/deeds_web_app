import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		const cacheStatsRes = await fetch('/api/acp/kv-cache-stats', {
			method: 'GET',
			signal: AbortSignal.timeout(5000)
		});

		if (!cacheStatsRes.ok) {
			console.error('Failed to fetch cache stats:', cacheStatsRes.status);
			return { cacheStats: null, error: 'Cache stats unavailable' };
		}

		const cacheStats = await cacheStatsRes.json();
		return { cacheStats };
	} catch (error) {
		console.error('Error loading cache stats:', error);
		return { cacheStats: null, error: 'Failed to load cache stats' };
	}
};
