/**
 * Citation Cache — LokiJS + IndexedDB + Fuse.js + Server Fallback
 *
 * Architecture:
 *   L0: LokiJS (in-memory, 5min TTL, session-scoped)
 *   L1: IndexedDB (persistent, 7-day TTL, survives refresh)
 *   L2: Server (/api/citations, Redis-cached on backend)
 *
 * Search pipeline:
 *   1. Fuse.js fuzzy search on local IndexedDB cache (instant, offline)
 *   2. Server RAG search fallback via /api/rag/search (Qdrant hybrid)
 *   3. Merge + deduplicate results, backfill local cache
 */

import { openDB, type IDBPDatabase } from 'idb';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { browser } from '$app/environment';

// ── Types ────────────────────────────────────────────────────────────────

export interface CachedCitation {
	id: string;
	userId?: string;
	caseId?: string;
	statuteCode: string;
	statuteTitle?: string;
	jurisdiction?: string;
	severity?: string;
	year?: number;
	sourceType?: string;
	highlightedText?: string;
	notes?: string;
	createdAt: string;
	updatedAt?: string;
	_cachedAt?: number;
}

export interface CitationSearchResult {
	citation: CachedCitation;
	score: number;
	source: 'fuse' | 'rag' | 'server';
}

interface LokiCitationEntry {
	id: string;
	citation: CachedCitation;
	ts: number;
}

// ── LokiJS: Session Cache ────────────────────────────────────────────────

let loki: Loki | null = null;
let citationStore: Collection<LokiCitationEntry> | null = null;

function ensureLoki(): Collection<LokiCitationEntry> | null {
	if (!browser) return null;

	if (!loki) {
		loki = new Loki('citation-cache.db', {
			adapter: new Loki.LokiMemoryAdapter()
		});
		citationStore = loki.addCollection<LokiCitationEntry>('citations', {
			ttl: 300_000,
			ttlInterval: 60_000,
			unique: ['id']
		});
	}

	return citationStore;
}

// ── IndexedDB: Persistent Storage ────────────────────────────────────────

const DB_NAME = 'deeds-citations';
const DB_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
	if (!browser) return Promise.reject(new Error('SSR: IndexedDB unavailable'));

	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains('citations')) {
					const store = db.createObjectStore('citations', { keyPath: 'id' });
					store.createIndex('caseId', 'caseId', { unique: false });
					store.createIndex('createdAt', 'createdAt', { unique: false });
				}
				if (!db.objectStoreNames.contains('syncQueue')) {
					const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
					store.createIndex('type', 'type', { unique: false });
				}
			}
		});
	}

	return dbPromise;
}

// ── Fuse.js: Fuzzy Search ────────────────────────────────────────────────

let fuseIndex: Fuse<CachedCitation> | null = null;

async function buildFuseIndex(): Promise<Fuse<CachedCitation>> {
	if (!browser) throw new Error('SSR: Fuse.js unavailable');

	const db = await getDB();
	const citations = await db.getAll('citations');

	fuseIndex = new Fuse(citations, {
		keys: [
			{ name: 'statuteCode', weight: 0.4 },
			{ name: 'statuteTitle', weight: 0.3 },
			{ name: 'highlightedText', weight: 0.2 },
			{ name: 'notes', weight: 0.1 }
		],
		threshold: 0.3,
		includeScore: true,
		minMatchCharLength: 2
	});

	return fuseIndex;
}

// ── Local save (no sync queue — for server backfill) ────────────────────

async function saveCitationLocal(citation: CachedCitation): Promise<void> {
	if (!browser) return;

	const store = ensureLoki();
	if (store) {
		try {
			store.insert({ id: citation.id, citation, ts: Date.now() });
		} catch {
			const existing = store.findOne({ id: citation.id });
			if (existing) {
				existing.citation = citation;
				existing.ts = Date.now();
				store.update(existing);
			}
		}
	}

	try {
		const db = await getDB();
		await db.put('citations', { ...citation, _cachedAt: Date.now() });
	} catch { /* non-critical */ }

	fuseIndex = null; // Rebuild on next search
}

// ── Public API ───────────────────────────────────────────────────────────

export const citationCache = {
	/** Get citation by ID (LokiJS → IndexedDB → Server) */
	async getCitation(id: string): Promise<CachedCitation | null> {
		if (!browser) return null;

		// L0: LokiJS
		const store = ensureLoki();
		if (store) {
			const entry = store.findOne({ id });
			if (entry) return entry.citation;
		}

		// L1: IndexedDB
		try {
			const db = await getDB();
			const citation = await db.get('citations', id);
			if (citation) {
				if (store) {
					try { store.insert({ id: citation.id, citation, ts: Date.now() }); } catch { /* dup */ }
				}
				return citation;
			}
		} catch (err) {
			console.warn('[citation-cache] IndexedDB read failed:', err);
		}

		// L2: Server
		try {
			const res = await fetch('/api/citations?limit=50', {
				signal: AbortSignal.timeout(5000)
			});
			if (res.ok) {
				const data = await res.json();
				const all = (data.citations ?? data.data ?? []) as CachedCitation[];
				for (const c of all) await saveCitationLocal(c);
				return all.find(c => c.id === id) ?? null;
			}
		} catch { /* offline */ }

		return null;
	},

	/** Save citation (local + sync queue) */
	async saveCitation(citation: CachedCitation): Promise<void> {
		if (!browser) return;

		await saveCitationLocal(citation);

		try {
			const db = await getDB();
			await db.add('syncQueue', {
				type: 'citation:create',
				data: citation,
				timestamp: Date.now()
			});
		} catch (err) {
			console.error('[citation-cache] Sync queue add failed:', err);
		}
	},

	saveCitationLocal,

	/**
	 * Search citations — concurrent Fuse.js + server RAG search.
	 * Returns merged, deduplicated results sorted by score.
	 */
	async searchCitations(
		query: string,
		opts: { limit?: number; caseId?: string; ragFallback?: boolean } = {}
	): Promise<CitationSearchResult[]> {
		if (!browser || !query.trim()) return [];

		const limit = opts.limit ?? 20;
		const useRag = opts.ragFallback !== false;

		const [fuseSettled, ragSettled] = await Promise.allSettled([
			// Local Fuse.js fuzzy search (instant, offline)
			(async () => {
				const fuse = fuseIndex || await buildFuseIndex();
				return fuse.search(query, { limit }).map(r => ({
					citation: r.item,
					score: 1 - (r.score ?? 0),
					source: 'fuse' as const
				}));
			})(),

			// Server RAG hybrid search (Qdrant dense+sparse)
			useRag ? (async () => {
				const res = await fetch('/api/rag/search', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						query,
						top_k: limit,
						min_score: 0.4,
						scoring_method: 'hybrid',
						caseId: opts.caseId
					}),
					signal: AbortSignal.timeout(8000)
				});

				if (!res.ok) return [];

				const data = await res.json();
				const chunks = data.chunks ?? [];
				const results: CitationSearchResult[] = [];

				for (const chunk of chunks) {
					if (chunk.source_type === 'citation' || chunk.text?.includes('§') || chunk.text?.includes('v.')) {
						const citation: CachedCitation = {
							id: chunk.source_id || chunk.chunk_id,
							statuteCode: chunk.text?.slice(0, 200) ?? '',
							createdAt: new Date().toISOString()
						};
						results.push({ citation, score: chunk.score ?? 0, source: 'rag' });
						saveCitationLocal(citation).catch(() => {});
					}
				}
				return results;
			})() : Promise.resolve([])
		]);

		const fuseResults = fuseSettled.status === 'fulfilled' ? fuseSettled.value : [];
		const ragResults = ragSettled.status === 'fulfilled' ? ragSettled.value : [];

		// Deduplicate by ID, keep higher score
		const seen = new Map<string, CitationSearchResult>();
		for (const r of [...fuseResults, ...ragResults]) {
			const existing = seen.get(r.citation.id);
			if (!existing || r.score > existing.score) {
				seen.set(r.citation.id, r);
			}
		}

		return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit);
	},

	/** Get all citations for a case */
	async getCitationsByCase(caseId: string): Promise<CachedCitation[]> {
		if (!browser) return [];

		try {
			const db = await getDB();
			const tx = db.transaction('citations', 'readonly');
			const local = await tx.store.index('caseId').getAll(caseId);
			await tx.done;
			if (local.length > 0) return local;
		} catch { /* fallthrough */ }

		try {
			const res = await fetch(`/api/citations?case_id=${encodeURIComponent(caseId)}&limit=100`, {
				signal: AbortSignal.timeout(5000)
			});
			if (res.ok) {
				const data = await res.json();
				const citations = (data.citations ?? data.data ?? []) as CachedCitation[];
				for (const c of citations) await saveCitationLocal(c);
				return citations;
			}
		} catch { /* offline */ }

		return [];
	},

	/** Preload citations from server into local cache */
	async preload(opts: { caseId?: string; limit?: number } = {}): Promise<number> {
		if (!browser) return 0;

		try {
			const params = new URLSearchParams();
			if (opts.caseId) params.set('case_id', opts.caseId);
			params.set('limit', String(opts.limit ?? 100));

			const res = await fetch(`/api/citations?${params}`, {
				signal: AbortSignal.timeout(8000)
			});
			if (!res.ok) return 0;

			const data = await res.json();
			const citations = (data.citations ?? data.data ?? []) as CachedCitation[];
			for (const c of citations) await saveCitationLocal(c);

			// Pre-build Fuse index so first search is instant
			if (citations.length > 0) {
				await buildFuseIndex();
			}

			return citations.length;
		} catch {
			return 0;
		}
	},

	/** Sync pending changes to server */
	async sync(): Promise<{ success: number; failed: number }> {
		if (!browser) return { success: 0, failed: 0 };

		let success = 0;
		let failed = 0;

		try {
			const db = await getDB();
			const queue = await db.getAll('syncQueue');

			for (const item of queue) {
				try {
					const response = await fetch('/api/citations', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(item.data)
					});

					if (response.ok) {
						await db.delete('syncQueue', item.id);
						success++;
					} else {
						failed++;
					}
				} catch {
					failed++;
				}
			}
		} catch (err) {
			console.error('[citation-cache] Sync failed:', err);
		}

		return { success, failed };
	},

	/** Clear stale entries (7-day TTL) */
	async evictStale(): Promise<number> {
		if (!browser) return 0;

		const cutoff = Date.now() - TTL_MS;
		let evicted = 0;

		try {
			const db = await getDB();
			const tx = db.transaction('citations', 'readwrite');
			const all = await tx.store.getAll();

			for (const citation of all) {
				if ((citation as any)._cachedAt < cutoff) {
					await tx.store.delete(citation.id);
					evicted++;
				}
			}
			await tx.done;
		} catch (err) {
			console.error('[citation-cache] Eviction failed:', err);
		}

		return evicted;
	}
};

// ── Auto-sync + preload on page load ─────────────────────────────────────

if (browser) {
	window.addEventListener('online', () => {
		citationCache.sync().then(r => {
			if (r.success > 0) console.log(`[citation-cache] Synced ${r.success} items`);
		});
	});

	setTimeout(() => {
		citationCache.preload({ limit: 100 }).then(n => {
			if (n > 0) console.log(`[citation-cache] Preloaded ${n} citations`);
		});
	}, 3000);

	setTimeout(() => citationCache.evictStale(), 60_000);
}
