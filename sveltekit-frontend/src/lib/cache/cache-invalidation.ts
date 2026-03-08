/**
 * Client-side cache invalidation helpers
 * Delegates to server API endpoints for actual invalidation
 */

export const CacheInvalidation = {
	async invalidateEvidence(caseId: string): Promise<void> {
		try {
			await fetch('/api/cache/invalidate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pattern: `evidence:${caseId}:*` })
			});
		} catch (e) {
			console.warn('[CacheInvalidation] invalidateEvidence failed (non-fatal):', e);
		}
	},

	async invalidateCase(caseId: string): Promise<void> {
		try {
			await fetch('/api/cache/invalidate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pattern: `case:${caseId}:*` })
			});
		} catch (e) {
			console.warn('[CacheInvalidation] invalidateCase failed (non-fatal):', e);
		}
	}
};

export const CacheMonitoring = {
	async getHealth(): Promise<{
		status: string;
		layers: Array<{ name: string; healthy: boolean; hitRate: number }>;
	}> {
		try {
			const res = await fetch('/api/cache/stats');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		} catch {
			return {
				status: 'unavailable',
				layers: []
			};
		}
	}
};
