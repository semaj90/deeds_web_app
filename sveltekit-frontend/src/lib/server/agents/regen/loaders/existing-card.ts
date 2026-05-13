/**
 * Loader 6 — existing AgentsDirectoryCard lookup (per-directory).
 *
 * Phase A1.8 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * Called per-dir inside composeCard (not part of buildRegenContext) to
 * support incremental updates — fetches the prior card so the diff/hash
 * comparison can short-circuit unchanged dirs without re-doing the full
 * section-builder pipeline.
 *
 * Cascade:  Redis  →  CouchDB  →  null
 * Failure of either tier is non-fatal — null + 'none' is a valid result
 * (means "no prior card; full write happens regardless of diff").
 */

import { cardIdForDir, readCardFromRedis, agentsDirectoryCardSchema } from '../../agents-card-store.js';
import type { AgentsDirectoryCard } from '../../agents-card-store.js';
import type { LoadExistingCardResult } from './types.js';
import { ENV } from '../../../../env.server.js';

const COUCHDB_URL  = ENV.COUCHDB_URL;
const COUCHDB_DB   = process.env.COUCHDB_AGENTS_DB ?? 'karpathy_wiki';
const COUCHDB_USER = ENV.COUCHDB_USER;
const COUCHDB_PASS = ENV.COUCHDB_PASSWORD;
const COUCHDB_TIMEOUT_MS = 2_000;

export async function loadExistingCard(dirPath: string): Promise<LoadExistingCardResult> {
	const loadedAt = new Date().toISOString();

	// Tier 1: Redis (cheap, 5ms)
	try {
		const card = await readCardFromRedis(dirPath);
		if (card) return { card, source: 'redis', loadedAt };
	} catch {
		// fall through to CouchDB
	}

	// Tier 2: CouchDB durable (slower, ~20-50ms)
	const couchCard = await readCardFromCouch(dirPath);
	if (couchCard) return { card: couchCard, source: 'couchdb', loadedAt };

	return { card: null, source: 'none', loadedAt };
}

// ── Internals ────────────────────────────────────────────────────────────────

async function readCardFromCouch(dirPath: string): Promise<AgentsDirectoryCard | null> {
	const id  = cardIdForDir(dirPath);
	const url = `${COUCHDB_URL}/${COUCHDB_DB}/${encodeURIComponent(id)}`;
	const auth = 'Basic ' + Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASS}`).toString('base64');

	let res: Response;
	try {
		res = await fetch(url, {
			headers: { Authorization: auth },
			signal:  AbortSignal.timeout(COUCHDB_TIMEOUT_MS),
		});
	} catch {
		return null;
	}
	if (!res.ok) return null;

	let body: unknown;
	try {
		body = await res.json();
	} catch {
		return null;
	}
	if (!body || typeof body !== 'object') return null;

	// CouchDB adds _id + _rev — strip before Zod parse.
	const { _id: _i, _rev: _r, ...card } = body as Record<string, unknown>;
	void _i; void _r;

	const parsed = agentsDirectoryCardSchema.safeParse(card);
	return parsed.success ? parsed.data : null;
}
