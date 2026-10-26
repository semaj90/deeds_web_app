import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveCouchDbConfigV1 } from '$lib/server/config/couchdb-config.js';
const DB_NAME      = process.env.COUCHDB_AGENTS_DB ?? 'karpathy_wiki';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let couchDb: ReturnType<typeof resolveCouchDbConfigV1>;
	try {
		couchDb = resolveCouchDbConfigV1(process.env);
	} catch {
		return json({ ok: false, dbName: DB_NAME, docCount: 0, indexes: [], lastRunId: undefined });
	}
	const headers = { 'Content-Type': 'application/json', Authorization: couchDb.authorization };

	// DB info
	let docCount = 0;
	let ok = false;
	try {
		const infoRes = await fetch(`${couchDb.baseUrl}/${DB_NAME}`, {
			headers, signal: AbortSignal.timeout(3_000),
		});
		if (infoRes.ok) {
			const info = await infoRes.json() as { doc_count?: number };
			docCount = info.doc_count ?? 0;
			ok = true;
		}
	} catch { /* offline */ }

	// Index list
	const indexes: string[] = [];
	if (ok) {
		try {
			const idxRes = await fetch(`${couchDb.baseUrl}/${DB_NAME}/_index`, {
				headers, signal: AbortSignal.timeout(3_000),
			});
			if (idxRes.ok) {
				const idxData = await idxRes.json() as { indexes: Array<{ name: string; ddoc?: string }> };
				for (const idx of idxData.indexes) {
					if (idx.ddoc && idx.name !== '_all_docs') indexes.push(idx.name);
				}
			}
		} catch { /* skip */ }
	}

	// Last runId — query _find for most recent doc with runId field
	let lastRunId: string | undefined;
	if (ok) {
		try {
			const findRes = await fetch(`${couchDb.baseUrl}/${DB_NAME}/_find`, {
				method:  'POST',
				headers,
				body:    JSON.stringify({
					selector: { runId: { $exists: true } },
					sort:     [{ updatedAt: 'desc' }],
					fields:   ['runId', 'updatedAt'],
					limit:    1,
				}),
				signal: AbortSignal.timeout(3_000),
			});
			if (findRes.ok) {
				const findData = await findRes.json() as { docs: Array<{ runId?: string }> };
				lastRunId = findData.docs[0]?.runId;
			}
		} catch { /* skip */ }
	}

	return json({ ok, dbName: DB_NAME, docCount, indexes, lastRunId });
};
