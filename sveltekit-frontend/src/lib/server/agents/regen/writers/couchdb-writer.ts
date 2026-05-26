/**
 * Phase A4+ — Production-safe CouchDB durable writer for AgentsDirectoryCard.
 *
 * Improvements over Phase A4:
 *  - Stamps every doc with runId, workspace, source, updatedAt
 *  - 409 conflict: retry once (GET latest rev → compare hash → PUT with new rev)
 *  - _bulk_docs batch writer: 2-request round trip (_all_docs + _bulk_docs)
 *  - Rollback by runId using _bulk_docs with _deleted: true
 *  - Optional conflict audit via GET ?conflicts=true
 *  - Timeout + jitter on 409 retry
 *  - Credentials redacted from all logs
 *  - Returns wrote, skipped, docId, rev, durationMs, contentHash
 *
 * Writes are GATED: callers MUST pass `enabled: true` to fire HTTP calls.
 * Test-env gate prevents accidental live CouchDB writes under VITEST/NODE_ENV=test.
 */

import type { AgentsDirectoryCard } from '../../agents-card-store.js';
import { ENV } from '../../../env.server.js';

const DEFAULT_COUCHDB_URL  = ENV.COUCHDB_URL;
const DEFAULT_COUCHDB_DB   = process.env.COUCHDB_AGENTS_DB    ?? 'karpathy_wiki';
const DEFAULT_COUCHDB_USER = process.env.COUCHDB_USER          ?? 'admin';
const DEFAULT_COUCHDB_PASS = process.env.COUCHDB_PASSWORD      ?? 'legal_ai_pass';
const DEFAULT_TIMEOUT_MS   = 5_000;
const BULK_CHUNK_SIZE      = 100;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CouchWriteOptions {
	enabled?:               boolean;
	url?:                   string;
	database?:              string;
	user?:                  string;
	password?:              string;
	fetchImpl?:             typeof fetch;
	/** Set true ONLY in integration tests that intentionally hit a real CouchDB. */
	allowLiveWritesInTests?: boolean;
	/** Stamped onto every written doc for rollback and filtering. */
	runId?:                 string;
	workspace?:             string;
	source?:                string;
	timeoutMs?:             number;
}

export interface CouchWriteResult {
	wrote:        boolean;
	skipped:      'disabled' | 'unchanged' | 'test-env-blocked' | null;
	docId:        string;
	rev?:         string;
	durationMs:   number;
	contentHash?: string;
	/** true when a 409 was encountered and retried. */
	conflicted?:  boolean;
	error?:       string;
}

export interface CouchBatchResult {
	wrote:       number;
	skipped:     number;
	conflicted:  number;
	failed:      number;
	results:     CouchWriteResult[];
	durationMs:  number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function isTestEnv(): boolean {
	return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

function redactUrl(url: string): string {
	try {
		const u = new URL(url);
		if (u.password) u.password = '***';
		return u.toString();
	} catch {
		return url.replace(/:[^:@/]+@/, ':***@');
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

interface CouchCtx {
	baseUrl:   string;
	db:        string;
	fetcher:   typeof fetch;
	timeoutMs: number;
	auth:      string;
	headers:   Record<string, string>;
}

function buildCtx(opts: CouchWriteOptions): CouchCtx {
	const rawUrl    = opts.url      ?? DEFAULT_COUCHDB_URL;
	const parsedUrl = (() => {
		try { return new URL(rawUrl); } catch { return null; }
	})();
	const baseUrl   = parsedUrl
		? parsedUrl.origin.replace(/\/+$/, '')
		: rawUrl.replace(/\/+$/, '');
	const db        = opts.database  ?? DEFAULT_COUCHDB_DB;
	const user      = opts.user      ?? parsedUrl?.username ?? DEFAULT_COUCHDB_USER;
	const password  = opts.password  ?? parsedUrl?.password ?? DEFAULT_COUCHDB_PASS;
	const fetcher   = opts.fetchImpl ?? fetch;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const auth      = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
	const headers   = { 'Content-Type': 'application/json', Authorization: auth };
	return { baseUrl, db, fetcher, timeoutMs, auth, headers };
}

function stamps(opts: CouchWriteOptions): Record<string, unknown> {
	const s: Record<string, unknown> = { updatedAt: new Date().toISOString() };
	if (opts.runId)     s.runId     = opts.runId;
	if (opts.workspace) s.workspace = opts.workspace;
	if (opts.source)    s.source    = opts.source;
	return s;
}

// ── Single-doc write ──────────────────────────────────────────────────────────

export async function writeCardToCouchDB(
	card: AgentsDirectoryCard,
	opts: CouchWriteOptions = {},
): Promise<CouchWriteResult> {
	const t0    = Date.now();
	const docId = card.id;

	if (!opts.enabled) {
		return { wrote: false, skipped: 'disabled', docId, durationMs: 0, contentHash: card.contentHash };
	}
	if (isTestEnv() && !opts.allowLiveWritesInTests) {
		return { wrote: false, skipped: 'test-env-blocked', docId, durationMs: 0 };
	}

	const { baseUrl, db, fetcher, timeoutMs, auth, headers } = buildCtx(opts);
	const url = `${baseUrl}/${db}/${encodeURIComponent(docId)}`;

	// ── GET existing doc ──────────────────────────────────────────────────────
	let existingRev: string | undefined;
	try {
		const getRes = await fetcher(url, {
			headers: { Authorization: auth },
			signal:  AbortSignal.timeout(timeoutMs),
		});
		if (getRes.ok) {
			const existing = await getRes.json() as Record<string, unknown>;
			if (existing.contentHash === card.contentHash) {
				return { wrote: false, skipped: 'unchanged', docId, durationMs: Date.now() - t0, contentHash: card.contentHash };
			}
			existingRev = typeof existing._rev === 'string' ? existing._rev : undefined;
		}
	} catch (err) {
		return { wrote: false, skipped: null, docId, durationMs: Date.now() - t0, error: (err as Error)?.message ?? String(err) };
	}

	// ── PUT ───────────────────────────────────────────────────────────────────
	const body: Record<string, unknown> = { ...card, ...stamps(opts) };
	if (existingRev) body._rev = existingRev;

	try {
		const putRes = await fetcher(url, {
			method:  'PUT',
			headers,
			body:    JSON.stringify(body),
			signal:  AbortSignal.timeout(timeoutMs),
		});

		if (putRes.ok) {
			const putData = await putRes.json() as { rev?: string };
			return { wrote: true, skipped: null, docId, rev: putData.rev, durationMs: Date.now() - t0, contentHash: card.contentHash };
		}

		// ── 409 conflict: retry once with fresh rev ───────────────────────────
		if (putRes.status === 409) {
			await sleep(50 + Math.random() * 100); // 50–150ms jitter

			const retryGet = await fetcher(url, {
				headers: { Authorization: auth },
				signal:  AbortSignal.timeout(timeoutMs),
			});
			if (retryGet.ok) {
				const latest = await retryGet.json() as Record<string, unknown>;
				if (latest.contentHash === card.contentHash) {
					// Another writer already wrote the same hash — treat as unchanged
					return { wrote: false, skipped: 'unchanged', docId, durationMs: Date.now() - t0, contentHash: card.contentHash, conflicted: true };
				}
				const retryBody = { ...card, ...stamps(opts), _rev: latest._rev };
				const retryPut = await fetcher(url, {
					method:  'PUT',
					headers,
					body:    JSON.stringify(retryBody),
					signal:  AbortSignal.timeout(timeoutMs),
				});
				if (retryPut.ok) {
					const retryData = await retryPut.json() as { rev?: string };
					return { wrote: true, skipped: null, docId, rev: retryData.rev, durationMs: Date.now() - t0, contentHash: card.contentHash, conflicted: true };
				}
			}
			return { wrote: false, skipped: null, docId, durationMs: Date.now() - t0, error: 'conflict unresolved after retry', conflicted: true };
		}

		// ── Other non-OK ──────────────────────────────────────────────────────
		let reason = `HTTP ${putRes.status}`;
		try {
			const errBody = await putRes.json() as { reason?: string };
			if (errBody.reason) reason = errBody.reason;
		} catch { /* keep HTTP fallback */ }
		return { wrote: false, skipped: null, docId, durationMs: Date.now() - t0, error: reason };

	} catch (err) {
		return { wrote: false, skipped: null, docId, durationMs: Date.now() - t0, error: (err as Error)?.message ?? String(err) };
	}
}

// ── Batch write via _bulk_docs ────────────────────────────────────────────────
//
// Round-trip budget: 2 HTTP calls per BULK_CHUNK_SIZE cards.
//   1. POST /_all_docs?include_docs=true  → fetch existing revs + hashes in bulk
//   2. POST /_bulk_docs                   → write only the changed docs

export async function writeCardsToCouchDB(
	cards: AgentsDirectoryCard[],
	opts: CouchWriteOptions = {},
): Promise<CouchBatchResult> {
	const t0 = Date.now();

	if (!opts.enabled) {
		return {
			wrote: 0, skipped: cards.length, conflicted: 0, failed: 0, durationMs: 0,
			results: cards.map(c => ({ wrote: false, skipped: 'disabled' as const, docId: c.id, durationMs: 0 })),
		};
	}
	if (isTestEnv() && !opts.allowLiveWritesInTests) {
		return {
			wrote: 0, skipped: cards.length, conflicted: 0, failed: 0, durationMs: 0,
			results: cards.map(c => ({ wrote: false, skipped: 'test-env-blocked' as const, docId: c.id, durationMs: 0 })),
		};
	}

	const { baseUrl, db, fetcher, timeoutMs, headers } = buildCtx(opts);
	const s = stamps(opts);
	const results: CouchWriteResult[] = [];
	let wrote = 0, skipped = 0, conflicted = 0, failed = 0;

	for (let i = 0; i < cards.length; i += BULK_CHUNK_SIZE) {
		const chunk  = cards.slice(i, i + BULK_CHUNK_SIZE);
		const docIds = chunk.map(c => c.id);

		// ── 1. Fetch existing revs + content hashes in one request ────────────
		const existingMap = new Map<string, { rev: string; contentHash?: string }>();
		try {
			const allDocsRes = await fetcher(`${baseUrl}/${db}/_all_docs?include_docs=true`, {
				method:  'POST',
				headers,
				body:    JSON.stringify({ keys: docIds }),
				signal:  AbortSignal.timeout(timeoutMs),
			});
			if (allDocsRes.ok) {
				const data = await allDocsRes.json() as {
					rows: Array<{ id: string; doc?: Record<string, unknown>; error?: string }>;
				};
				for (const row of data.rows) {
					if (row.doc && !row.error) {
						existingMap.set(row.id, {
							rev:         row.doc._rev as string,
							contentHash: row.doc.contentHash as string | undefined,
						});
					}
				}
			}
		} catch {
			// Treat all docs as new — _bulk_docs will reject any that need _rev
		}

		// ── 2. Build payload: skip unchanged, stamp changed ───────────────────
		const toWrite: Record<string, unknown>[] = [];

		for (const card of chunk) {
			const existing = existingMap.get(card.id);
			if (existing?.contentHash === card.contentHash) {
				skipped++;
				results.push({ wrote: false, skipped: 'unchanged', docId: card.id, durationMs: 0, contentHash: card.contentHash });
				continue;
			}
			const doc: Record<string, unknown> = { ...card, ...s, _id: card.id };
			if (existing?.rev) doc._rev = existing.rev;
			toWrite.push(doc);
		}

		if (toWrite.length === 0) continue;

		// ── 3. POST _bulk_docs ────────────────────────────────────────────────
		try {
			const bulkRes = await fetcher(`${baseUrl}/${db}/_bulk_docs`, {
				method:  'POST',
				headers,
				body:    JSON.stringify({ docs: toWrite }),
				signal:  AbortSignal.timeout(timeoutMs),
			});

			if (!bulkRes.ok) {
				for (const doc of toWrite) {
					failed++;
					results.push({ wrote: false, skipped: null, docId: doc._id as string, durationMs: Date.now() - t0, error: `HTTP ${bulkRes.status}` });
				}
				continue;
			}

			const bulkData = await bulkRes.json() as Array<{
				id: string; rev?: string; ok?: boolean; error?: string; reason?: string;
			}>;

			for (const item of bulkData) {
				const hash = chunk.find(c => c.id === item.id)?.contentHash;
				if (item.ok) {
					wrote++;
					results.push({ wrote: true, skipped: null, docId: item.id, rev: item.rev, durationMs: Date.now() - t0, contentHash: hash });
				} else if (item.error === 'conflict') {
					conflicted++;
					results.push({ wrote: false, skipped: null, docId: item.id, durationMs: Date.now() - t0, error: item.reason ?? 'conflict', conflicted: true });
				} else {
					failed++;
					results.push({ wrote: false, skipped: null, docId: item.id, durationMs: Date.now() - t0, error: item.reason ?? item.error });
				}
			}
		} catch (err) {
			for (const doc of toWrite) {
				failed++;
				results.push({ wrote: false, skipped: null, docId: doc._id as string, durationMs: Date.now() - t0, error: (err as Error)?.message ?? String(err) });
			}
		}
	}

	const durationMs = Date.now() - t0;
	const safeDb     = `${redactUrl((opts.url ?? DEFAULT_COUCHDB_URL).replace(/\/+$/, ''))}/${opts.database ?? DEFAULT_COUCHDB_DB}`;
	console.log(`[couchdb-writer] batch: wrote=${wrote} skipped=${skipped} conflicted=${conflicted} failed=${failed} (${durationMs}ms) db=${safeDb}`);
	return { wrote, skipped, conflicted, failed, results, durationMs };
}

// ── Rollback by runId ─────────────────────────────────────────────────────────
//
// Finds all docs with matching runId via Mango _find, then deletes them
// in one _bulk_docs call with _deleted: true.

export async function rollbackByRunId(
	runId: string,
	opts:  CouchWriteOptions = {},
): Promise<{ deleted: number; failed: number; durationMs: number }> {
	const t0 = Date.now();

	if (!opts.enabled)                              return { deleted: 0, failed: 0, durationMs: 0 };
	if (isTestEnv() && !opts.allowLiveWritesInTests) return { deleted: 0, failed: 0, durationMs: 0 };

	const { baseUrl, db, fetcher, timeoutMs, headers } = buildCtx(opts);

	let docs: Array<{ _id: string; _rev: string }> = [];
	try {
		const findRes = await fetcher(`${baseUrl}/${db}/_find`, {
			method:  'POST',
			headers,
			body:    JSON.stringify({ selector: { runId: { $eq: runId } }, fields: ['_id', '_rev'], limit: 1000 }),
			signal:  AbortSignal.timeout(timeoutMs),
		});
		if (findRes.ok) {
			const data = await findRes.json() as { docs: Array<{ _id: string; _rev: string }> };
			docs = data.docs;
		}
	} catch {
		return { deleted: 0, failed: 0, durationMs: Date.now() - t0 };
	}

	if (docs.length === 0) return { deleted: 0, failed: 0, durationMs: Date.now() - t0 };

	const deleteDocs = docs.map(d => ({ _id: d._id, _rev: d._rev, _deleted: true }));
	try {
		const bulkRes = await fetcher(`${baseUrl}/${db}/_bulk_docs`, {
			method:  'POST',
			headers,
			body:    JSON.stringify({ docs: deleteDocs }),
			signal:  AbortSignal.timeout(timeoutMs),
		});
		if (!bulkRes.ok) return { deleted: 0, failed: docs.length, durationMs: Date.now() - t0 };
		const bulkData = await bulkRes.json() as Array<{ ok?: boolean }>;
		const deleted  = bulkData.filter(r => r.ok).length;
		return { deleted, failed: bulkData.length - deleted, durationMs: Date.now() - t0 };
	} catch {
		return { deleted: 0, failed: docs.length, durationMs: Date.now() - t0 };
	}
}

// ── Conflict audit ────────────────────────────────────────────────────────────
//
// Returns the list of conflicting revision strings for a given doc.
// An empty array means no conflicts. Use _bulk_docs + _deleted: true
// to delete losing revisions once you identify the winning rev.

export async function findConflicts(
	docId: string,
	opts:  CouchWriteOptions = {},
): Promise<string[]> {
	if (!opts.enabled)                              return [];
	if (isTestEnv() && !opts.allowLiveWritesInTests) return [];

	const { baseUrl, db, fetcher, timeoutMs, auth } = buildCtx(opts);
	const url = `${baseUrl}/${db}/${encodeURIComponent(docId)}?conflicts=true`;
	try {
		const res = await fetcher(url, { headers: { Authorization: auth }, signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) return [];
		const doc = await res.json() as { _conflicts?: string[] };
		return doc._conflicts ?? [];
	} catch {
		return [];
	}
}
