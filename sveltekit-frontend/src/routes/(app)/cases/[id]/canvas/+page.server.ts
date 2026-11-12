import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';
import { clientKey, TTL } from '$lib/server/cache-keys.js';
import { getFromMemoryCache, setCache } from '$lib/server/cache.js';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// The parent case layout performs UUID validation and membership checks.
	// Await it before looking up a cache entry so cached views cannot bypass access.
	const { caseData } = await parent();
	const caseId = caseData?.id;
	if (!caseId || caseId.toLowerCase() !== params.id.toLowerCase()) {
		return { user: locals.user, caseData: null, evidence: [] };
	}

	const cacheKey = clientKey.view(String(locals.user.id), caseId, 'canvas-v1');
	const cached = getFromMemoryCache(cacheKey);
	if (cached.found && cached.value) return cached.value as any;
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redisValue = await getRedis().get(cacheKey);
		if (redisValue) {
			const parsed = JSON.parse(redisValue);
			if (parsed?.caseData?.id === caseId && Array.isArray(parsed.evidence)) return parsed;
		}
	} catch {
		// Redis is an optional cache; continue with the authorized database read.
	}

	try {
		const rows = await db.query.evidence.findMany({
			where: eq(evidence.caseId, caseId),
			orderBy: [desc(evidence.uploadedAt), desc(evidence.createdAt)],
			limit: 100,
		});
		const result = {
			user: locals.user,
			caseData,
			evidence: rows.map((row) => ({
				id: row.id,
				title: row.title,
				fileName: row.fileName,
				mimeType: row.mimeType,
				fileType: row.fileType,
				evidenceType: row.evidenceType,
				type: row.type,
				fileSize: row.fileSize,
				hash: row.hash,
				evidenceNumber: row.evidenceNumber,
				summary: row.summary,
				createdAt: row.createdAt?.toISOString() ?? null,
				uploadedAt: row.uploadedAt ?? null,
			})),
		};
		setCache(cacheKey, result, TTL.CLIENT_VIEW * 1000).catch(() => {});
		return result;
	} catch (error) {
		console.error('[CaseCanvas] Failed to load case evidence:', error);
		return { user: locals.user, caseData, evidence: [], loadError: 'Case evidence could not be loaded. Refresh to try again.' };
	}
};
