/**
 * AgentsDirectoryCard store — typed read/write for the directory-card
 * semantic index. Cards are indexable "lexicon entries" for the codebase,
 * NOT canonical feature specs (per next_steps/active/2026-05-11 plan).
 *
 * Storage tiers (all already in the codebase):
 *   - Redis  agents:dir:{hash}        — hot cache, 24h TTL
 *   - CouchDB karpathy_wiki dir docs  — durable, MapReduce views
 *   - Qdrant codebase_chunks_768      — payload tags (agents_card_id, etc.)
 *
 * The card SHAPE is a superset of the existing `AgentsMdEnvelope` (parse layer)
 * — adds dirPath / featureKeys / route / tags / auditStatus / lastIndexedAt so
 * ACE retrieval can rank by directory authority.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

// ── Card shape (canonical for the store contract) ────────────────────────────

export const agentsDirectoryCardSchema = z.object({
	/** stable id derived from dirPath; same dir → same id across runs */
	id:             z.string().min(1).max(160),
	dirPath:        z.string().min(1).max(500),
	title:          z.string().default(''),
	summary:        z.string().max(2000).default(''),

	staticImports:  z.array(z.string()).default([]),
	dynamicImports: z.array(z.string()).default([]),
	pathAliases:    z.array(z.string()).default([]),

	featureKeys:    z.array(z.string()).default([]),
	routeSurfaces:  z.array(z.string()).default([]),
	schemaTables:   z.array(z.string()).default([]),

	qdrantTags:     z.array(z.string()).default([]),
	neo4jNodeId:    z.string().optional(),
	couchDocId:     z.string().optional(),

	/** SHIPPED | PARTIAL | SPEC_ONLY | SCHEMA_DEFERRED | EXPERIMENTAL */
	auditStatus:    z
		.enum(['SHIPPED', 'PARTIAL', 'SPEC_ONLY', 'SCHEMA_DEFERRED', 'EXPERIMENTAL'])
		.default('SPEC_ONLY'),
	recommendations: z.array(z.string()).default([]),

	activityScore:  z.number().default(0),
	lastAccessedAt: z.string().optional(), // ISO timestamp
	lastIndexedAt:  z.string(), // ISO timestamp

	/** sha256 of normalised content — drives idempotent re-indexing */
	contentHash:    z.string().length(64),
	
	/** Logic gates (G-AI-01 etc.) */
	gates:          z.record(z.boolean()).default({}),
});

export type AgentsDirectoryCard = z.infer<typeof agentsDirectoryCardSchema>;

// ── Deterministic ID + content hash ──────────────────────────────────────────

/**
 * Derive the canonical id from a directory path.
 * Same dirPath → same id, always. Used as Redis key suffix + Qdrant payload tag.
 *
 * Example: `src/lib/server/vector` → `agents:dir:src-lib-server-vector`
 */
export function cardIdForDir(dirPath: string): string {
	const slug = dirPath
		.replace(/[\\/]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.toLowerCase();
	return `agents:dir:${slug}`;
}

/**
 * SHA-256 over a stable JSON projection of card fields that drive content
 * (purpose / featureKeys / importantFiles / routes / tags / auditStatus).
 * Deliberately excludes `lastIndexedAt` so re-runs don't churn the hash.
 */
export function computeCardContentHash(
	card: Partial<AgentsDirectoryCard> & { dirPath: string }
): string {
	const payload = JSON.stringify({
		dirPath:        card.dirPath,
		title:          card.title ?? '',
		summary:        card.summary ?? '',
		staticImports:  [...(card.staticImports ?? [])].sort(),
		dynamicImports: [...(card.dynamicImports ?? [])].sort(),
		pathAliases:    [...(card.pathAliases ?? [])].sort(),
		featureKeys:    [...(card.featureKeys ?? [])].sort(),
		routeSurfaces:  [...(card.routeSurfaces ?? [])].sort(),
		schemaTables:   [...(card.schemaTables ?? [])].sort(),
		qdrantTags:     [...(card.qdrantTags ?? [])].sort(),
		auditStatus:    card.auditStatus ?? 'SPEC_ONLY',
		gates:          Object.keys(card.gates ?? {}).sort().reduce((acc, k) => {
			acc[k] = !!card.gates?.[k];
			return acc;
		}, {} as Record<string, boolean>),
	});
	return createHash('sha256').update(payload).digest('hex');
}

// ── Redis I/O ────────────────────────────────────────────────────────────────

// Lazy-loaded so this module can be imported in test env without a live Redis.
let _getRedis: (() => unknown) | null = null;
async function loadRedis() {
	if (!_getRedis) {
		const mod = await import('$lib/server/redis');
		_getRedis = mod.getRedis;
	}
	return (_getRedis as unknown as () => { setex: (...a: unknown[]) => Promise<unknown>; get: (k: string) => Promise<string | null>; mget?: (keys: string[]) => Promise<(string | null)[]>; scan?: unknown })();
}

const CARD_TTL_SECONDS = 24 * 60 * 60; // 24h hot cache

/**
 * Write a card to Redis under its canonical id. Skips the write if the
 * existing record has the same content_hash (idempotent — saves Redis churn).
 *
 * Returns true if a write actually happened, false if skipped.
 */
export async function writeCardToRedis(card: AgentsDirectoryCard): Promise<boolean> {
	const validated = agentsDirectoryCardSchema.parse(card);
	const redis = await loadRedis();
	const existing = await redis.get(validated.id);
	if (existing) {
		try {
			const prev = JSON.parse(existing) as AgentsDirectoryCard;
			if (prev.contentHash === validated.contentHash) return false; // unchanged
		} catch {
			// fall through to overwrite
		}
	}
	await redis.setex(validated.id, CARD_TTL_SECONDS, JSON.stringify(validated));
	return true;
}

/**
 * Read a single card from Redis. Returns null if absent OR malformed.
 */
export async function readCardFromRedis(dirPath: string): Promise<AgentsDirectoryCard | null> {
	const redis = await loadRedis();
	const raw = await redis.get(cardIdForDir(dirPath));
	if (!raw) return null;
	try {
		return agentsDirectoryCardSchema.parse(JSON.parse(raw));
	} catch {
		return null;
	}
}

/**
 * Batch-read cards by id. Order preserved. Missing/malformed entries → null.
 * Uses `mget` when available, otherwise falls back to N parallel `get`s.
 */
export async function readCardsByIds(ids: readonly string[]): Promise<(AgentsDirectoryCard | null)[]> {
	if (ids.length === 0) return [];
	const redis = await loadRedis();
	let raws: (string | null)[];
	if (typeof redis.mget === 'function') {
		raws = await redis.mget([...ids]);
	} else {
		raws = await Promise.all(ids.map((id) => redis.get(id)));
	}
	return raws.map((raw) => {
		if (!raw) return null;
		try {
			return agentsDirectoryCardSchema.parse(JSON.parse(raw));
		} catch {
			return null;
		}
	});
}

// ── CouchDB I/O (durable tier — survives Redis flush) ────────────────────────

const COUCHDB_DB = 'karpathy_wiki';

type CouchDocBase = { _id: string; _rev?: string };

/**
 * Write a card to CouchDB karpathy_wiki under doc id `agents:dir:<slug>`.
 * Idempotent: skips the write if the existing doc has the same contentHash.
 *
 * Returns true if a write actually happened, false if skipped or failed.
 * Failures are non-fatal and logged — Redis remains the hot tier of truth.
 */
export async function writeCardToCouchdb(card: AgentsDirectoryCard): Promise<boolean> {
	const validated = agentsDirectoryCardSchema.parse(card);
	try {
		const { couchdb } = await import('$lib/server/services/couchdb-client');
		// Try to fetch existing rev for idempotency check + update
		let existingRev: string | undefined;
		try {
			const prev = (await couchdb.get(COUCHDB_DB, validated.id)) as CouchDocBase &
				Partial<AgentsDirectoryCard>;
			if (prev?.contentHash === validated.contentHash) return false; // unchanged
			existingRev = prev?._rev;
		} catch {
			// Doc doesn't exist yet — that's fine, we'll create it
		}
		const doc: Record<string, unknown> = { ...validated };
		if (existingRev) doc._rev = existingRev;
		await couchdb.put(COUCHDB_DB, validated.id, doc);
		return true;
	} catch (err) {
		console.warn('[agents-card-store] couchdb write failed (non-fatal):', err);
		return false;
	}
}

/**
 * Read a single card from CouchDB. Returns null on miss / parse failure / network error.
 * The fallback path used by ACE when Redis is cold and Qdrant doesn't have the card id.
 */
export async function readCardFromCouchdb(dirPath: string): Promise<AgentsDirectoryCard | null> {
	try {
		const { couchdb } = await import('$lib/server/services/couchdb-client');
		const doc = (await couchdb.get(COUCHDB_DB, cardIdForDir(dirPath))) as Record<string, unknown>;
		// Strip Couch metadata keys before zod validation
		const { _id, _rev, ...rest } = doc;
		void _id; void _rev;
		return agentsDirectoryCardSchema.parse(rest);
	} catch {
		return null;
	}
}

// ── Combined writer (Redis + CouchDB in one call) ────────────────────────────

export interface CardWriteResult {
	redis:   { wrote: boolean; skipped: boolean };
	couchdb: { wrote: boolean; skipped: boolean };
}

/**
 * Convenience: write to both tiers. Each tier's contentHash check is independent
 * so Redis can short-circuit even if CouchDB needs the update (rare).
 */
export async function writeCard(card: AgentsDirectoryCard): Promise<CardWriteResult> {
	const [redisWrote, couchWrote] = await Promise.all([
		writeCardToRedis(card).catch(() => false),
		writeCardToCouchdb(card).catch(() => false),
	]);
	return {
		redis:   { wrote: redisWrote, skipped: !redisWrote },
		couchdb: { wrote: couchWrote, skipped: !couchWrote },
	};
}
