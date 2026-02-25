/**
 * Client-Side Cache Layer — LokiJS (session) + IndexedDB (persistent).
 *
 * LokiJS: In-memory session cache for fast cache hits during active chat.
 *   - Router decisions (keyed by hash of user text)
 *   - Recent replies (keyed by prompt hash + context hash)
 *   - Cleared on page refresh (session-scoped)
 *
 * IndexedDB: Persistent storage for embeddings + chat history.
 *   - Model outputs (keyed by prompt hash)
 *   - Embeddings (keyed by doc chunk hash)
 *   - Chat history for offline replay
 *   - 7-day TTL with automatic eviction
 *
 * Redis (server-side mirror): Multi-device continuity via /api endpoints.
 *   - Not directly accessed from browser (ioredis = Node.js only)
 *   - Synced via SSE pub/sub events
 *
 * Usage:
 *   import { clientCache } from '$lib/ai/client-cache.js';
 *   const cached = await clientCache.getReply(promptHash);
 *   if (!cached) { ... run inference ... await clientCache.putReply(promptHash, result); }
 */

import { openDB, type IDBPDatabase } from 'idb';
import Loki from 'lokijs';

// ── LokiJS: In-Memory Session Cache ─────────────────────────────────────
// Fast hot-path cache — cleared on page refresh (session-scoped).
// Sits in front of IndexedDB: check LokiJS first, then IndexedDB, then inference.

interface LokiReplyEntry {
	promptHash: string;
	content: string;
	source: string;
	ts: number;
}

interface LokiRouterEntry {
	promptHash: string;
	source: string;
	reason: string;
	confidence: number;
	ts: number;
}

let loki: Loki | null = null;
let replyCache: Collection<LokiReplyEntry> | null = null;
let routerCache: Collection<LokiRouterEntry> | null = null;

function ensureLoki(): { replies: Collection<LokiReplyEntry>; router: Collection<LokiRouterEntry> } {
	if (!loki) {
		loki = new Loki('chat-session-cache.db', {
			adapter: new Loki.LokiMemoryAdapter()
		});
		replyCache = loki.addCollection<LokiReplyEntry>('recentReplies', {
			ttl: 600_000,         // 10min TTL
			ttlInterval: 60_000   // Check every minute
		});
		routerCache = loki.addCollection<LokiRouterEntry>('routerDecisions', {
			ttl: 300_000,         // 5min TTL
			ttlInterval: 60_000
		});
	}
	return { replies: replyCache!, router: routerCache! };
}

// ── IndexedDB: Persistent Cache ──────────────────────────────────────────

const DB_NAME = 'deeds-ai-cache';
const DB_VERSION = 1;
const STORES = {
	replies: 'replies',
	embeddings: 'embeddings',
	chatHistory: 'chatHistory'
} as const;

/** 7-day TTL for persistent cache entries */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase> | null = null;
let evictionScheduled = false;

function getDB(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORES.replies)) {
					db.createObjectStore(STORES.replies, { keyPath: 'promptHash' });
				}
				if (!db.objectStoreNames.contains(STORES.embeddings)) {
					db.createObjectStore(STORES.embeddings, { keyPath: 'chunkHash' });
				}
				if (!db.objectStoreNames.contains(STORES.chatHistory)) {
					const store = db.createObjectStore(STORES.chatHistory, { keyPath: 'id', autoIncrement: true });
					store.createIndex('chatId', 'chatId', { unique: false });
					store.createIndex('timestamp', 'timestamp', { unique: false });
				}
			}
		});
		// Auto-evict expired entries once per session (deferred, non-blocking)
		if (!evictionScheduled) {
			evictionScheduled = true;
			dbPromise.then(() => {
				setTimeout(() => clientCache.evictExpired(), 5000);
			});
		}
	}
	return dbPromise;
}

// ── Simple hash for cache keys ───────────────────────────────────────────

function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0; // Convert to 32bit integer
	}
	return hash.toString(36);
}

// ── Public API ───────────────────────────────────────────────────────────

export const clientCache = {
	/** Check if a reply is cached — LokiJS (hot) then IndexedDB (persistent) */
	async getReply(prompt: string): Promise<{ content: string; source: string } | null> {
		if (typeof window === 'undefined') return null;
		const key = simpleHash(prompt);

		// Hot path: LokiJS session cache (sync, ~0ms)
		try {
			const { replies } = ensureLoki();
			const lokiHit = replies.findOne({ promptHash: key });
			if (lokiHit) {
				return { content: lokiHit.content, source: lokiHit.source };
			}
		} catch {
			// LokiJS failure is non-critical
		}

		// Cold path: IndexedDB persistent cache (async, ~1-5ms)
		try {
			const db = await getDB();
			const entry = await db.get(STORES.replies, key);
			if (!entry) return null;
			if (Date.now() - entry.timestamp > TTL_MS) {
				await db.delete(STORES.replies, key);
				return null;
			}
			// Promote to LokiJS for subsequent hits
			try {
				const { replies } = ensureLoki();
				replies.insert({ promptHash: key, content: entry.content, source: entry.source, ts: Date.now() });
			} catch { /* non-critical */ }
			return { content: entry.content, source: entry.source };
		} catch {
			return null;
		}
	},

	/** Cache a reply — writes to both LokiJS (session) and IndexedDB (persistent) */
	async putReply(prompt: string, content: string, source: string): Promise<void> {
		if (typeof window === 'undefined') return;
		const key = simpleHash(prompt);

		// LokiJS: session cache (sync)
		try {
			const { replies } = ensureLoki();
			const existing = replies.findOne({ promptHash: key });
			if (existing) {
				existing.content = content;
				existing.source = source;
				existing.ts = Date.now();
				replies.update(existing);
			} else {
				replies.insert({ promptHash: key, content, source, ts: Date.now() });
			}
		} catch { /* non-critical */ }

		// IndexedDB: persistent cache (async)
		try {
			const db = await getDB();
			await db.put(STORES.replies, {
				promptHash: key,
				content,
				source,
				timestamp: Date.now()
			});
		} catch {
			// Cache write failure is non-critical
		}
	},

	/** Cache an embedding vector */
	async putEmbedding(text: string, vector: number[]): Promise<void> {
		if (typeof window === 'undefined') return;
		try {
			const db = await getDB();
			await db.put(STORES.embeddings, {
				chunkHash: simpleHash(text),
				vector,
				dims: vector.length,
				timestamp: Date.now()
			});
		} catch {
			// Non-critical
		}
	},

	/** Retrieve a cached embedding */
	async getEmbedding(text: string): Promise<number[] | null> {
		if (typeof window === 'undefined') return null;
		try {
			const db = await getDB();
			const key = simpleHash(text);
			const entry = await db.get(STORES.embeddings, key);
			if (!entry) return null;
			if (Date.now() - entry.timestamp > TTL_MS) {
				await db.delete(STORES.embeddings, key);
				return null;
			}
			return entry.vector;
		} catch {
			return null;
		}
	},

	/** Persist chat message to IndexedDB for offline replay */
	async saveChatMessage(chatId: string, role: string, content: string, metadata?: Record<string, unknown>): Promise<void> {
		if (typeof window === 'undefined') return;
		try {
			const db = await getDB();
			await db.add(STORES.chatHistory, {
				chatId,
				role,
				content,
				metadata,
				timestamp: Date.now()
			});
		} catch {
			// Non-critical
		}
	},

	/** Retrieve chat history for a conversation */
	async getChatHistory(chatId: string): Promise<Array<{ role: string; content: string; timestamp: number }>> {
		if (typeof window === 'undefined') return [];
		try {
			const db = await getDB();
			const tx = db.transaction(STORES.chatHistory, 'readonly');
			const index = tx.store.index('chatId');
			return await index.getAll(chatId);
		} catch {
			return [];
		}
	},

	/** Cache a router decision in LokiJS (session-only, 5min TTL) */
	cacheRouterDecision(prompt: string, source: string, reason: string, confidence: number): void {
		if (typeof window === 'undefined') return;
		try {
			const key = simpleHash(prompt);
			const { router } = ensureLoki();
			const existing = router.findOne({ promptHash: key });
			if (existing) {
				existing.source = source;
				existing.reason = reason;
				existing.confidence = confidence;
				existing.ts = Date.now();
				router.update(existing);
			} else {
				router.insert({ promptHash: key, source, reason, confidence, ts: Date.now() });
			}
		} catch { /* non-critical */ }
	},

	/** Get a cached router decision (LokiJS only — session-scoped) */
	getCachedRouterDecision(prompt: string): { source: string; reason: string; confidence: number } | null {
		if (typeof window === 'undefined') return null;
		try {
			const key = simpleHash(prompt);
			const { router } = ensureLoki();
			const hit = router.findOne({ promptHash: key });
			if (!hit) return null;
			return { source: hit.source, reason: hit.reason, confidence: hit.confidence };
		} catch {
			return null;
		}
	},

	/** Evict expired entries across all stores. Called automatically on first cache access. */
	async evictExpired(): Promise<number> {
		if (typeof window === 'undefined') return 0;
		let evicted = 0;
		const cutoff = Date.now() - TTL_MS;
		try {
			const db = await getDB();
			for (const storeName of [STORES.replies, STORES.embeddings]) {
				const tx = db.transaction(storeName, 'readwrite');
				let cursor = await tx.store.openCursor();
				while (cursor) {
					if (cursor.value.timestamp < cutoff) {
						await cursor.delete();
						evicted++;
					}
					cursor = await cursor.continue();
				}
			}
		} catch {
			// Non-critical
		}
		return evicted;
	}
};
