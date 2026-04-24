/**
 * Board Persistence — IndexedDB + LokiJS dual-tier for EvidenceBoard.
 * Follows client-cache.ts pattern: LokiJS for session reads, IndexedDB for persistence.
 *
 * Auto-saves debounced 2s after mutations + beforeunload.
 * Server initialNodes win when present; IndexedDB for offline/fresh loads.
 */

import { openDB, type IDBPDatabase } from 'idb';
import Loki from 'lokijs';

export interface BoardLayout {
	caseId: string;
	nodes: any[];
	connections: any[];
	viewport: { zoom: number; panX: number; panY: number };
	timestamp: number;
}

// ── IndexedDB ──────────────────────────────────────────────────

const DB_NAME = 'deeds-evidence-board';
const DB_VERSION = 1;
const STORE_NAME = 'board-layouts';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		dbPromise = openDB(DB_NAME, DB_VERSION, {
			upgrade(db) {
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: 'caseId' });
				}
			}
		});
	}
	return dbPromise;
}

export async function saveLayout(layout: BoardLayout): Promise<void> {
	try {
		const db = await getDB();
		await db.put(STORE_NAME, { ...layout, timestamp: Date.now() });
		updateLokiCache(layout);
	} catch (err) {
		console.error('[board-persistence] IndexedDB save failed:', err);
	}
}

export async function loadLayout(caseId: string): Promise<BoardLayout | null> {
	// Check LokiJS first (hot cache)
	const cached = getLokiCache(caseId);
	if (cached) return cached;

	// Fall back to IndexedDB
	try {
		const db = await getDB();
		const layout = await db.get(STORE_NAME, caseId);
		if (layout) {
			updateLokiCache(layout as BoardLayout);
			return layout as BoardLayout;
		}
	} catch (err) {
		console.error('[board-persistence] IndexedDB load failed:', err);
	}
	return null;
}

export async function deleteLayout(caseId: string): Promise<void> {
	try {
		const db = await getDB();
		await db.delete(STORE_NAME, caseId);
		removeLokiCache(caseId);
	} catch (err) {
		console.error('[board-persistence] IndexedDB delete failed:', err);
	}
}

// ── LokiJS Session Cache ──────────────────────────────────────

interface LokiBoardEntry {
	caseId: string;
	data: BoardLayout;
	ts: number;
}

let loki: Loki | null = null;
let layoutCache: Collection<LokiBoardEntry> | null = null;

function ensureLoki(): Collection<LokiBoardEntry> {
	if (!loki) {
		loki = new Loki('board-position-cache.db', {
			adapter: new Loki.LokiMemoryAdapter()
		});
		layoutCache = loki.addCollection<LokiBoardEntry>('boardLayouts', {
			ttl: 600_000,       // 10min TTL
			ttlInterval: 60_000
		});
	}
	return layoutCache!;
}

function getLokiCache(caseId: string): BoardLayout | null {
	const coll = ensureLoki();
	const entry = coll.findOne({ caseId });
	return entry?.data ?? null;
}

function updateLokiCache(layout: BoardLayout): void {
	const coll = ensureLoki();
	const existing = coll.findOne({ caseId: layout.caseId });
	if (existing) {
		existing.data = layout;
		existing.ts = Date.now();
		coll.update(existing);
	} else {
		coll.insert({ caseId: layout.caseId, data: layout, ts: Date.now() });
	}
}

function removeLokiCache(caseId: string): void {
	const coll = ensureLoki();
	const entry = coll.findOne({ caseId });
	if (entry) coll.remove(entry);
}

// ── Debounced Auto-Save (IndexedDB) ────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLayout: BoardLayout | null = null;

export function scheduleSave(layout: BoardLayout): void {
	pendingLayout = layout;
	// Update LokiJS immediately for fast reads
	updateLokiCache(layout);

	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		if (pendingLayout) {
			await saveLayout(pendingLayout);
			pendingLayout = null;
		}
	}, 2000);
}

export function flushSave(): void {
	if (saveTimer) clearTimeout(saveTimer);
	if (pendingLayout) {
		saveLayout(pendingLayout);
		pendingLayout = null;
	}
}

// ── Debounced Server Auto-Save ─────────────────────────────────
//
// IndexedDB keeps the user's work safe on *their* device, but a cross-device
// switch (or a browser data wipe) loses everything unless the snapshot also
// reaches the server. We mirror the client debounce with a longer window (4s)
// so the server gets fewer, coarser writes than the local cache.
//
// On beforeunload the caller should invoke flushServerSave(), which uses
// navigator.sendBeacon() so the request survives page teardown.

interface ServerSnapshot {
	version: number;
	viewport: { pan: { x: number; y: number }; zoom: number };
	nodes: unknown[];
	edges: unknown[];
	updatedAt?: string;
}

let serverSaveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingServerSave: { caseId: string; snapshot: ServerSnapshot } | null = null;

/**
 * Post the board snapshot to /api/cases/{caseId}/canvas. Intended shape is
 * the same one board.serialize() returns — NOT the LokiJS/IndexedDB BoardLayout,
 * because the server validates against boardSnapshotSchema.
 */
export function scheduleServerSave(caseId: string, snapshot: ServerSnapshot): void {
	if (!caseId) return;
	pendingServerSave = { caseId, snapshot };

	if (serverSaveTimer) clearTimeout(serverSaveTimer);
	serverSaveTimer = setTimeout(async () => {
		if (pendingServerSave) {
			await postSnapshotToServer(pendingServerSave.caseId, pendingServerSave.snapshot);
			pendingServerSave = null;
		}
	}, 4000);
}

export function flushServerSave(): void {
	if (serverSaveTimer) clearTimeout(serverSaveTimer);
	if (!pendingServerSave) return;
	const { caseId, snapshot } = pendingServerSave;
	pendingServerSave = null;

	// sendBeacon survives beforeunload; falls back to fetch in other contexts.
	if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
		try {
			const blob = new Blob([JSON.stringify(snapshot)], {
				type: 'application/json',
			});
			const ok = navigator.sendBeacon(`/api/cases/${caseId}/canvas`, blob);
			if (ok) return;
		} catch {
			/* fall through to fetch */
		}
	}
	// Fallback: fire-and-forget fetch. Await is pointless here — page may unload.
	void postSnapshotToServer(caseId, snapshot);
}

async function postSnapshotToServer(
	caseId: string,
	snapshot: ServerSnapshot,
): Promise<void> {
	try {
		await fetch(`/api/cases/${caseId}/canvas`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(snapshot),
			// Avoid cancellation on navigate
			keepalive: true,
		});
	} catch (err) {
		console.warn('[board-persistence] server save failed:', (err as Error)?.message);
	}
}
