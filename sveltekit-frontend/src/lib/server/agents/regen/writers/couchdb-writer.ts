/**
 * Phase A4 — CouchDB durable writer for AgentsDirectoryCard.
 *
 * Mirrors the existing `scripts/agents/build-agents-index.mjs` writer:
 *   - Database: `karpathy_wiki` (overridable via env)
 *   - Doc id:   `agents:dir:<slug>` (same as cardIdForDir output)
 *   - Update protocol: GET → check _rev + hash → PUT with _rev (or POST when new)
 *   - Idempotent: skips PUT when stored contentHash matches the candidate
 *
 * Writes are GATED: callers MUST pass `enabled: true` to actually fire HTTP
 * calls. The runRegen orchestrator passes `enabled: !dryRun && !redisOnly`.
 *
 * Errors are non-fatal — caller decides whether to push them into
 * `failures[]` or continue silently.
 */

import type { AgentsDirectoryCard } from '../../agents-card-store.js';
import { ENV } from '../../../../env.server.js';

const DEFAULT_COUCHDB_URL  = ENV.COUCHDB_URL;
const DEFAULT_COUCHDB_DB   = process.env.COUCHDB_AGENTS_DB    ?? 'karpathy_wiki';
const DEFAULT_COUCHDB_USER = ENV.COUCHDB_USER;
const DEFAULT_COUCHDB_PASS = ENV.COUCHDB_PASSWORD;
const REQUEST_TIMEOUT_MS = 5_000;

export interface CouchWriteOptions {
	enabled?:  boolean;            // master gate (caller decides — runRegen sets from !dryRun && !redisOnly)
	url?:      string;
	database?: string;
	user?:     string;
	password?: string;
	fetchImpl?: typeof fetch;      // DI for tests
	/** Belt-and-braces test-env override. Set true ONLY in integration tests that
	 *  intend to hit a real CouchDB. Default behavior: live writes blocked under
	 *  VITEST / NODE_ENV=test so a forgetful test cannot leak into karpathy_wiki. */
	allowLiveWritesInTests?: boolean;
}

export interface CouchWriteResult {
	wrote:   boolean;              // true if a PUT/POST actually fired
	skipped: 'disabled' | 'unchanged' | 'test-env-blocked' | null;
	docId:   string;
	error?:  string;
}

function isTestEnv(): boolean {
	return Boolean(process.env.VITEST) || process.env.NODE_ENV === 'test';
}

export async function writeCardToCouchDB(
	card: AgentsDirectoryCard,
	opts: CouchWriteOptions = {},
): Promise<CouchWriteResult> {
	if (!opts.enabled) {
		return { wrote: false, skipped: 'disabled', docId: card.id };
	}
	if (isTestEnv() && !opts.allowLiveWritesInTests) {
		return { wrote: false, skipped: 'test-env-blocked', docId: card.id };
	}

	const baseUrl  = (opts.url      ?? DEFAULT_COUCHDB_URL).replace(/\/+$/, '');
	const db       = opts.database  ?? DEFAULT_COUCHDB_DB;
	const user     = opts.user      ?? DEFAULT_COUCHDB_USER;
	const password = opts.password  ?? DEFAULT_COUCHDB_PASS;
	const fetcher  = opts.fetchImpl ?? fetch;
	const docId    = card.id;
	const url      = `${baseUrl}/${db}/${encodeURIComponent(docId)}`;
	const auth     = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
	const headers  = { 'Content-Type': 'application/json', Authorization: auth };

	let existingRev: string | undefined;
	try {
		const getRes = await fetcher(url, {
			headers: { Authorization: auth },
			signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (getRes.ok) {
			const existing = await getRes.json() as Record<string, unknown>;
			if (existing.contentHash === card.contentHash) {
				return { wrote: false, skipped: 'unchanged', docId };
			}
			existingRev = typeof existing._rev === 'string' ? existing._rev : undefined;
		}
		// 404 or other non-OK → write as new doc
	} catch (err) {
		return { wrote: false, skipped: null, docId, error: (err as Error)?.message ?? String(err) };
	}

	const body: Record<string, unknown> = { ...card };
	if (existingRev) body._rev = existingRev;

	try {
		const putRes = await fetcher(url, {
			method:  'PUT',
			headers,
			body:    JSON.stringify(body),
			signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
		if (!putRes.ok) {
			let reason = `HTTP ${putRes.status}`;
			try {
				const errBody = await putRes.json() as { reason?: string };
				if (errBody.reason) reason = errBody.reason;
			} catch {
				// keep HTTP fallback
			}
			return { wrote: false, skipped: null, docId, error: reason };
		}
		return { wrote: true, skipped: null, docId };
	} catch (err) {
		return { wrote: false, skipped: null, docId, error: (err as Error)?.message ?? String(err) };
	}
}
