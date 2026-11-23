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
			// /api/cache/stats does not return { status, layers }. Keep the declared shape so
			// callers can read layers without throwing; an absent list is an empty list.
			const body = (await res.json()) as Partial<{ status: string; success: boolean; layers: unknown }>;
			return {
				status: typeof body.status === 'string' ? body.status : body.success === true ? 'ok' : 'unavailable',
				layers: Array.isArray(body.layers) ? (body.layers as Array<{ name: string; healthy: boolean; hitRate: number }>) : []
			};
		} catch {
			return {
				status: 'unavailable',
				layers: []
			};
		}
	}
};
