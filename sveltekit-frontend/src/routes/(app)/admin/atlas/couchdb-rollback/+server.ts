import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { rollbackByRunId } from '$lib/server/agents/regen/writers/couchdb-writer.js';

const COUCHDB_URL  = (process.env.COUCHDB_URL  ?? 'http://localhost:5984').replace(/\/+$/, '');
const COUCHDB_USER = process.env.COUCHDB_USER  ?? 'admin';
const COUCHDB_PASS = process.env.COUCHDB_PASS  ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass';
const DB_NAME      = process.env.COUCHDB_AGENTS_DB ?? 'karpathy_wiki';

const schema = z.object({
	runId:  z.string().min(1).max(200),
	dryRun: z.boolean().default(false),
});

function authHeader(): string {
	return 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json().catch(() => ({}));
	const parsed = schema.safeParse(body);
	if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Bad request');

	const { runId, dryRun } = parsed.data;

	if (dryRun) {
		// Count how many docs would be deleted without touching anything.
		const headers = { 'Content-Type': 'application/json', Authorization: authHeader() };
		let count = 0;
		try {
			const findRes = await fetch(`${COUCHDB_URL}/${DB_NAME}/_find`, {
				method:  'POST',
				headers,
				body:    JSON.stringify({
					selector: { runId: { $eq: runId } },
					fields:   ['_id'],
					limit:    1000,
				}),
				signal: AbortSignal.timeout(5_000),
			});
			if (findRes.ok) {
				const data = await findRes.json() as { docs: unknown[] };
				count = data.docs.length;
			}
		} catch {
			throw error(502, 'CouchDB unreachable during dry-run count');
		}
		return json({ dryRun: true, wouldDelete: count, deleted: 0, failed: 0, durationMs: 0 });
	}

	const result = await rollbackByRunId(runId, {
		enabled:  true,
		url:      COUCHDB_URL,
		database: DB_NAME,
		user:     COUCHDB_USER,
		password: COUCHDB_PASS,
	});

	return json({ dryRun: false, wouldDelete: null, ...result });
};
