/**
 * ACE context source for AgentsDirectoryCard lookup.
 *
 * Lookup order: Redis hot cache → Qdrant payload search → CouchDB durable.
 * Returns directory-card context for a free-form query so the ACE assembler
 * can rank chunks by their owning directory's authority.
 *
 * Cards are LEXICON HINTS, NOT canonical spec. The assembler should treat
 * card.purpose as soft context, never as a hard fact about feature shape —
 * canonical truth lives in code + tests + master_agents.md.
 */

import { z } from 'zod';
import {
	cardIdForDir,
	readCardsByIds,
	readCardFromRedis,
	readCardFromCouchdb,
	type AgentsDirectoryCard,
} from '$lib/server/agents/agents-card-store';

export interface AgentsContextHit {
	card:     AgentsDirectoryCard;
	source:   'redis' | 'qdrant' | 'couchdb' | 'none';
	relevance: number; // 0..1; ties broken by directory depth
}

export interface AgentsContextOptions {
	/** Max cards to return. Default 5. */
	limit?:        number;
	/** Optional file path: walk-up gives the nearest directory card first. */
	filePath?:     string;
	/** If false, skip Qdrant/CouchDB fallthrough (Redis-only). Default true. */
	allowFallback?: boolean;
}

const REDIS_CARDS_SCAN_LIMIT = 60; // bounded scan; ACE caller is hot-path

/**
 * Get directory-card context for a query.
 *
 * Returns up to `limit` cards ranked by query relevance. Sources fall
 * through in this order, stopping when `limit` is reached:
 *   1. Redis exact: derive cardId from `filePath` walk-up
 *   2. Redis broad: scan `agents:dir:*`, filter by query keyword in tags
 *   3. Qdrant: search `codebase_chunks_768` and pull out unique `agents_card_id` payload values
 *   4. CouchDB: not yet wired (returns empty); leaves a hook
 */
export async function getAgentsContextForQuery(
	query: string,
	options: AgentsContextOptions = {}
): Promise<AgentsContextHit[]> {
	const limit         = Math.max(1, Math.min(options.limit ?? 5, 25));
	const allowFallback = options.allowFallback ?? true;
	const hits: AgentsContextHit[] = [];

	// Stage 1: Redis exact walk-up if filePath given.
	if (options.filePath) {
		const walkupCard = await walkUpForCard(options.filePath);
		if (walkupCard) {
			hits.push({ card: walkupCard, source: 'redis', relevance: 1.0 });
		}
	}

	if (hits.length >= limit) return hits.slice(0, limit);

	// Stage 2: Redis broad scan + keyword match.
	const keywords = extractKeywords(query);
	if (keywords.length > 0) {
		const scanned = await scanRedisCardsByKeywords(keywords, REDIS_CARDS_SCAN_LIMIT);
		for (const { card, score } of scanned) {
			if (hits.find((h) => h.card.id === card.id)) continue;
			hits.push({ card, source: 'redis', relevance: score });
			if (hits.length >= limit) break;
		}
	}

	if (hits.length >= limit) return hits.slice(0, limit);

	// Stage 3: Qdrant fallthrough — pull distinct agents_card_id payloads.
	if (allowFallback) {
		try {
			const qdrantCards = await qdrantPayloadCardIds(query, limit - hits.length);
			if (qdrantCards.length > 0) {
				const fetched = await readCardsByIds(qdrantCards);
				for (let i = 0; i < fetched.length; i++) {
					const c = fetched[i];
					if (!c) continue;
					if (hits.find((h) => h.card.id === c.id)) continue;
					hits.push({ card: c, source: 'qdrant', relevance: 0.6 });
					if (hits.length >= limit) break;
				}
			}
		} catch {
			/* Qdrant unreachable → silent fall-through; CouchDB hook below */
		}
	}

	// Stage 4: CouchDB durable fallback — try when filePath was given but Redis
	// missed it (cold cache scenario). Walks the same path up the dir tree.
	if (allowFallback && options.filePath && hits.length < limit) {
		const segments = options.filePath.replace(/\\/g, '/').split('/').filter(Boolean);
		if (segments[segments.length - 1].includes('.')) segments.pop();
		for (let i = segments.length; i > 0 && hits.length < limit; i--) {
			const dir = segments.slice(0, i).join('/');
			const card = await readCardFromCouchdb(dir);
			if (card && !hits.find((h) => h.card.id === card.id)) {
				hits.push({ card, source: 'couchdb', relevance: 0.5 });
			}
		}
	}

	return hits.slice(0, limit);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Walk a file path up the directory tree, return the first matching Redis card. */
async function walkUpForCard(filePath: string): Promise<AgentsDirectoryCard | null> {
	const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
	if (segments[segments.length - 1].includes('.')) segments.pop(); // drop filename
	for (let i = segments.length; i > 0; i--) {
		const dir  = segments.slice(0, i).join('/');
		const card = await readCardFromRedis(dir);
		if (card) return card;
	}
	return null;
}

/** Lightweight keyword extractor — lowercase tokens of length ≥ 4, deduped, capped 12. */
function extractKeywords(text: string): string[] {
	const tokens = text
		.toLowerCase()
		.match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const t of tokens) {
		if (!seen.has(t)) {
			seen.add(t);
			out.push(t);
			if (out.length >= 12) break;
		}
	}
	return out;
}

/**
 * SCAN agents:dir:* in Redis, fetch the card payloads, return ones whose
 * tags / featureKeys / purpose intersect the query keywords.
 */
async function scanRedisCardsByKeywords(
	keywords: readonly string[],
	maxScan: number
): Promise<Array<{ card: AgentsDirectoryCard; score: number }>> {
	const { getRedis } = await import('$lib/server/redis');
	const redis = getRedis() as unknown as {
		scan: (cursor: string, ...args: unknown[]) => Promise<[string, string[]]>;
		get:  (k: string) => Promise<string | null>;
	};

	let cursor = '0';
	const collected: string[] = [];
	let calls = 0;
	const HARD_CAP = 8; // ≤8 SCAN calls — bounded latency

	while (calls++ < HARD_CAP) {
		const [next, keys] = await redis.scan(cursor, 'MATCH', 'agents:dir:*', 'COUNT', '200');
		collected.push(...keys);
		cursor = next;
		if (cursor === '0' || collected.length >= maxScan) break;
	}

	const ids   = collected.slice(0, maxScan);
	const cards = await readCardsByIds(ids);

	const scored: Array<{ card: AgentsDirectoryCard; score: number }> = [];
	for (const card of cards) {
		if (!card) continue;
		const haystack = [
			...card.tags,
			...card.featureKeys,
			card.purpose,
			card.dirPath,
		].join(' ').toLowerCase();
		let hits = 0;
		for (const k of keywords) if (haystack.includes(k)) hits++;
		if (hits === 0) continue;
		// Score: keyword-hit rate, with a small bonus for SHIPPED status
		const base = hits / Math.max(keywords.length, 1);
		const bonus = card.auditStatus === 'SHIPPED' ? 0.05 : 0;
		scored.push({ card, score: Math.min(base + bonus, 0.95) });
	}
	scored.sort((a, b) => b.score - a.score);
	return scored;
}

/**
 * Search Qdrant codebase chunks for a query, pull the unique `agents_card_id`
 * payload values. Best-effort: returns empty array if Qdrant unreachable.
 */
async function qdrantPayloadCardIds(query: string, limit: number): Promise<string[]> {
	if (limit <= 0) return [];
	try {
		const { qdrant }     = await import('$lib/server/vector/qdrant-manager');
		const { generateEmbedding } = await import('$lib/server/grpc/embedding-client');
		const vec = await generateEmbedding(query);
		if (!vec) return [];
		const res = await qdrant.hybridSearch({
			query,
			queryEmbedding: vec,
			collection:     'codebase_chunks_768',
			limit:          Math.min(limit * 3, 30),
		});
		const seen = new Set<string>();
		const out: string[] = [];
		for (const r of res.results) {
			const id = (r.payload as { agents_card_id?: unknown } | undefined)?.agents_card_id;
			if (typeof id === 'string' && !seen.has(id)) {
				seen.add(id);
				out.push(id);
				if (out.length >= limit) break;
			}
		}
		return out;
	} catch {
		return [];
	}
}

// ── Zod re-export for callers that want to validate the response shape ─────

export const agentsContextHitSchema = z.object({
	card:     z.object({}).passthrough(),
	source:   z.enum(['redis', 'qdrant', 'couchdb', 'none']),
	relevance: z.number().min(0).max(1),
});
