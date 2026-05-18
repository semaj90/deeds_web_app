import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const COUCHDB_URL  = (process.env.COUCHDB_URL ?? 'http://localhost:5984').replace(/\/+$/, '');
const COUCHDB_USER = process.env.COUCHDB_USER ?? 'admin';
const COUCHDB_PASS = (process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass');
const DB_NAME      = process.env.COUCHDB_AGENTS_DB ?? 'karpathy_wiki';

function authHeader(): string {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const headers = { 'Content-Type': 'application/json', Authorization: authHeader() };

	// DB info
	let docCount = 0;
	let ok = false;
	try {
		const infoRes = await fetch(`${COUCHDB_URL}/${DB_NAME}`, {
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
			const idxRes = await fetch(`${COUCHDB_URL}/${DB_NAME}/_index`, {
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
			const findRes = await fetch(`${COUCHDB_URL}/${DB_NAME}/_find`, {
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
