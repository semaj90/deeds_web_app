/**
 * Citation Cache System — LokiJS + IndexedDB + Fuse.js + Tensor Search
 *
 * Architecture:
 *   L0: LokiJS (in-memory, 5min TTL, session-scoped)
 *   L1: IndexedDB (persistent, 7-day TTL, survives refresh)
 *   L2: Server (PostgreSQL via /api/citations, Redis-cached)
 *
 * Search pipeline:
 *   1. Fuse.js fuzzy search on local IndexedDB cache (instant, offline)
 *   2. Server tensor search fallback via /api/rag/search (Redis → Qdrant → GPU cosine)
 *   3. Merge + deduplicate results, backfill local cache
 *
 * Features:
 *   - Offline citation management (IndexedDB)
 *   - Fast fuzzy search (Fuse.js on cached citations)
 *   - Tensor similarity fallback (server-side CHR-ROM97 cartridge tensors)
 *   - Auto-sync to server when online
 *   - Concurrent server fetch + local search (Promise.allSettled)
 *   - SSR-safe (browser-only execution)
 */

import { openDB, type IDBPDatabase } from 'idb';
import Loki from 'lokijs';
import Fuse from 'fuse.js';
import { browser } from '$app/environment';

// ── Types ────────────────────────────────────────────────────────────────

export interface Citation {
	id: string;
	citationText: string;
	caseId?: string;
	sourceUrl?: string;
	createdAt: string;
	updatedAt?: string;
}

interface CitationCollection {
	id: string;
	userId: string;
	name: string;
	color?: string;
	isPublic: boolean;
	citationCount: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface CitationSearchResult {
	citation: Citation;
	score: number;
	source: 'fuse' | 'tensor' | 'server';
}

interface LokiCitationEntry {
	id: string;
	citation: Citation;
	ts: number;
}

interface LokiCollectionEntry {
	id: string;
	collection: CitationCollection;
	ts: number;
}

// ── LokiJS: Session Cache ────────────────────────────────────────────────

let loki: Loki | null = null;
let citationStore: Collection<LokiCitationEntry> | null = null;
let collectionStore: Collection<LokiCollectionEntry> | null = null;

function ensureLoki() {
	if (!browser) return null;

	if (!loki) {
		loki = new Loki('citation-cache.db', {
			adapter: new Loki.LokiMemoryAdapter()
		});

		citationStore = loki.addCollection<LokiCitationEntry>('citations', {
			ttl: 300_000,         // 5min TTL
			ttlInterval: 60_000,  // Check every minute
			unique: ['id']
		});

		collectionStore = loki.addCollection<LokiCollectionEntry>('collections', {
			ttl: 300_000,
			ttlInterval: 60_000,
			unique: ['id']
		});
	}

	return { citations: citationStore!, collections: collectionStore! };
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

				if (!db.objectStoreNames.contains('collections')) {
					const store = db.createObjectStore('collections', { keyPath: 'id' });
					store.createIndex('userId', 'userId', { unique: false });
				}

				if (!db.objectStoreNames.contains('collectionCitations')) {
					const store = db.createObjectStore('collectionCitations', { keyPath: ['collectionId', 'citationId'] });
					store.createIndex('collectionId', 'collectionId', { unique: false });
					store.createIndex('citationId', 'citationId', { unique: false });
				}

				if (!db.objectStoreNames.contains('syncQueue')) {
					const store = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
					store.createIndex('type', 'type', { unique: false });
					store.createIndex('timestamp', 'timestamp', { unique: false });
				}
			}
		});
	}

	return dbPromise;
}

// ── Fuse.js: Fuzzy Search ────────────────────────────────────────────────

let fuseIndex: Fuse<Citation> | null = null;

async function buildFuseIndex(): Promise<Fuse<Citation>> {
	if (!browser) throw new Error('SSR: Fuse.js unavailable');

	const db = await getDB();
	const citations = await db.getAll('citations');

	fuseIndex = new Fuse(citations, {
		keys: [
			{ name: 'citationText', weight: 0.7 },
			{ name: 'sourceUrl', weight: 0.3 }
		],
		threshold: 0.3,
		includeScore: true,
		minMatchCharLength: 2
	});

	return fuseIndex;
}

// ── Local-only save (no sync queue, for backfill from server) ────────────

async function saveCitationLocal(citation: Citation): Promise<void> {
	if (!browser) return;

	const stores = ensureLoki();
	if (stores) {
		try {
			stores.citations.insert({ id: citation.id, citation, ts: Date.now() });
		} catch {
			// Duplicate key — update instead
			const existing = stores.citations.findOne({ id: citation.id });
			if (existing) {
				existing.citation = citation;
				existing.ts = Date.now();
				stores.citations.update(existing);
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
	/** Get citation by ID (LokiJS → IndexedDB → Server async pull) */
	async getCitation(id: string): Promise<Citation | null> {
		if (!browser) return null;

		// L0: LokiJS hot cache
		const stores = ensureLoki();
		if (stores) {
			const lokiEntry = stores.citations.findOne({ id });
			if (lokiEntry) return lokiEntry.citation;
		}

		// L1: IndexedDB persistent cache
		try {
			const db = await getDB();
			const citation = await db.get('citations', id);

			if (citation) {
				// Promote to LokiJS
				if (stores) {
					try {
						stores.citations.insert({ id: citation.id, citation, ts: Date.now() });
					} catch { /* duplicate */ }
				}
				return citation;
			}
		} catch (err) {
			console.warn('[citation-cache] IndexedDB read failed:', err);
		}

		// L2: Server async pull (Redis-cached on backend)
		try {
			const res = await fetch('/api/citations?limit=50', {
				signal: AbortSignal.timeout(5000)
			});
			if (res.ok) {
				const data = await res.json();
				const all = (data.citations ?? []) as Citation[];
				// Backfill all fetched citations into local cache
				for (const c of all) {
					await saveCitationLocal(c);
				}
				return all.find(c => c.id === id) ?? null;
			}
		} catch {
			// Server unavailable — offline mode
		}

		return null;
	},

	/** Save citation (LokiJS + IndexedDB + sync queue for server upload) */
	async saveCitation(citation: Citation): Promise<void> {
		if (!browser) return;

		await saveCitationLocal(citation);

		// Add to sync queue for server upload
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

	/** Save citation locally only (no sync queue — for server backfill) */
	saveCitationLocal,

	/**
	 * Search citations — concurrent Fuse.js + server tensor search.
	 *
	 * Pipeline:
	 *   1. Fuse.js fuzzy on local IndexedDB (instant, works offline)
	 *   2. Server /api/rag/search tensor similarity (Redis → Qdrant → GPU cosine)
	 *   3. Merge + deduplicate, backfill new server results into local cache
	 */
	async searchCitations(
		query: string,
		opts: { limit?: number; caseId?: string; tensorFallback?: boolean } = {}
	): Promise<CitationSearchResult[]> {
		if (!browser) return [];
		if (!query.trim()) return [];

		const limit = opts.limit ?? 20;
		const useTensor = opts.tensorFallback !== false; // default: true

		// Run Fuse.js local + server tensor search concurrently
		const [fuseSettled, tensorSettled] = await Promise.allSettled([
			// Path A: Local Fuse.js fuzzy search (instant)
			(async () => {
				const fuse = fuseIndex || await buildFuseIndex();
				return fuse.search(query, { limit }).map(r => ({
					citation: r.item,
					score: 1 - (r.score ?? 0), // Fuse score is 0=perfect, invert
					source: 'fuse' as const
				}));
			})(),

			// Path B: Server tensor similarity (Redis-cached → Qdrant → cosine)
			useTensor ? (async () => {
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
					// Map RAG chunks back to citation-like objects
					if (chunk.source_type === 'citation' || chunk.text?.includes('§') || chunk.text?.includes('v.')) {
						const citation: Citation = {
							id: chunk.source_id || chunk.chunk_id,
							citationText: chunk.text?.slice(0, 500) ?? '',
							sourceUrl: chunk.source_url,
							createdAt: new Date().toISOString(),
						};
						results.push({
							citation,
							score: chunk.score ?? 0,
							source: 'tensor'
						});
						// Backfill into local cache (fire-and-forget)
						saveCitationLocal(citation).catch(() => {});
					}
				}

				return results;
			})() : Promise.resolve([])
		]);

		// Merge results from both paths
		const fuseResults = fuseSettled.status === 'fulfilled' ? fuseSettled.value : [];
		const tensorResults = tensorSettled.status === 'fulfilled' ? tensorSettled.value : [];

		// Deduplicate by citation ID, prefer higher score
		const seen = new Map<string, CitationSearchResult>();

		for (const r of [...fuseResults, ...tensorResults]) {
			const existing = seen.get(r.citation.id);
			if (!existing || r.score > existing.score) {
				seen.set(r.citation.id, r);
			}
		}

		// Sort by score descending
		return [...seen.values()]
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	},

	/** Get all citations for a case (local → server fallback) */
	async getCitationsByCase(caseId: string): Promise<Citation[]> {
		if (!browser) return [];

		// L1: IndexedDB
		try {
			const db = await getDB();
			const tx = db.transaction('citations', 'readonly');
			const index = tx.store.index('caseId');
			const localCitations = await index.getAll(caseId);
			await tx.done;

			if (localCitations.length > 0) return localCitations;
		} catch (err) {
			console.error('[citation-cache] Query by case failed:', err);
		}

		// L2: Server fallback
		try {
			const res = await fetch(`/api/citations?case_id=${encodeURIComponent(caseId)}&limit=100`, {
				signal: AbortSignal.timeout(5000)
			});
			if (res.ok) {
				const data = await res.json();
				const serverCitations = (data.citations ?? []) as Citation[];
				// Backfill local
				for (const c of serverCitations) {
					await saveCitationLocal(c);
				}
				return serverCitations;
			}
		} catch { /* offline */ }

		return [];
	},

	/** Preload citations from server into local cache (call on page load) */
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
			const serverCitations = (data.citations ?? []) as Citation[];

			for (const c of serverCitations) {
				await saveCitationLocal(c);
			}

			return serverCitations.length;
		} catch {
			return 0;
		}
	},

	/** Save collection */
	async saveCollection(collection: CitationCollection): Promise<void> {
		if (!browser) return;

		const stores = ensureLoki();
		if (stores) {
			stores.collections.insert({ id: collection.id, collection, ts: Date.now() });
		}

		try {
			const db = await getDB();
			await db.put('collections', collection);
			await db.add('syncQueue', {
				type: 'collection:create',
				data: collection,
				timestamp: Date.now()
			});
		} catch (err) {
			console.error('[citation-cache] Collection save failed:', err);
		}
	},

	/** Add citation to collection */
	async addToCollection(collectionId: string, citationId: string): Promise<void> {
		if (!browser) return;

		try {
			const db = await getDB();
			await db.put('collectionCitations', {
				collectionId,
				citationId,
				addedAt: new Date()
			});
			await db.add('syncQueue', {
				type: 'collection:add-citation',
				data: { collectionId, citationId },
				timestamp: Date.now()
			});
		} catch (err) {
			console.error('[citation-cache] Add to collection failed:', err);
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
					const endpoint = item.type.startsWith('collection')
						? '/api/citations/collections'
						: '/api/citations';

					const response = await fetch(endpoint, {
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
				} catch (err) {
					console.error('[citation-cache] Sync item failed:', item, err);
					failed++;
				}
			}
		} catch (err) {
			console.error('[citation-cache] Sync failed:', err);
		}

		return { success, failed };
	},

	/** Clear old cached entries (7-day TTL) */
	async evictStale(): Promise<number> {
		if (!browser) return 0;

		const cutoff = Date.now() - TTL_MS;
		let evicted = 0;

		try {
			const db = await getDB();
			const tx = db.transaction('citations', 'readwrite');
			const citations = await tx.store.getAll();

			for (const citation of citations) {
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
	// Sync pending changes when online
	window.addEventListener('online', () => {
		citationCache.sync().then(result => {
			if (result.success > 0) {
				console.log(`[citation-cache] Synced ${result.success} items to server`);
			}
		});
	});

	// Preload citations from server on first load (async, non-blocking)
	setTimeout(() => {
		citationCache.preload({ limit: 100 }).then(count => {
			if (count > 0) console.log(`[citation-cache] Preloaded ${count} citations from server`);
		});
	}, 3000);

	// Periodic stale eviction
	setTimeout(() => citationCache.evictStale(), 60_000);
}
