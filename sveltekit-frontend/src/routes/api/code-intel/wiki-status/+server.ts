// @ts-check
import { json } from '@sveltejs/kit';
import { getRedis } from '$lib/server/redis.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user)
		return json(
			{ noteCount: 0, couchNoteCount: 0, couchDbStatus: 'unauthorized', latestNote: null, syncStatus: 'unknown' },
			{ status: 401 }
		);

	try {
		const redis = getRedis();

		// Count cached wiki notes (redis SCAN — avoids KEYS on large keyspaces)
		const noteKeys: string[] = [];
		let cursor = '0';
		do {
			const [next, found] = await redis.scan(cursor, 'MATCH', 'wiki:note:*', 'COUNT', 200);
			cursor = next;
			noteKeys.push(...found);
		} while (cursor !== '0');

		// Sample the newest key's metadata (first match is sufficient)
		let latestNote: Record<string, unknown> | null = null;
		if (noteKeys.length > 0) {
			const raw = await redis.get(noteKeys[0]).catch(() => null);
			if (raw) {
				try { latestNote = JSON.parse(raw) as Record<string, unknown>; } catch { /* skip */ }
			}
		}

		// CouchDB karpathy_wiki database status
		let couchDbStatus: 'ok' | 'unreachable' | 'error' = 'unreachable';
		let couchNoteCount = 0;
		let latestSyncAt: string | null = null;
		try {
			const { couchdb } = await import('$lib/server/services/couchdb-client.js');
			const rows = await couchdb.allDocs('karpathy_wiki', { limit: 1, descending: true } as { limit: number });
			couchNoteCount = (rows as { total_rows?: number }).total_rows ?? 0;
			couchDbStatus = 'ok';
			// Most-recent doc id encodes the timestamp in karpathy wiki format
			const topId = ((rows as { rows?: Array<{ id: string }> }).rows ?? [])[0]?.id ?? null;
			latestSyncAt = topId ?? null;
		} catch { /* non-fatal */ }

		return json({
			noteCount:     noteKeys.length,
			couchNoteCount,
			couchDbStatus,
			latestNote,
			latestSyncAt,
			syncStatus: couchDbStatus === 'ok' && noteKeys.length > 0 ? 'synced' : 'degraded',
		});
	} catch {
		return json({
			noteCount: 0,
			couchNoteCount: 0,
			couchDbStatus: 'error',
			latestNote: null,
			latestSyncAt: null,
			syncStatus: 'error',
		});
	}
};
