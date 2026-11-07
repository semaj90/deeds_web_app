/**
 * Board Persistence — IndexedDB + LokiJS dual-tier for EvidenceBoard.
 * Follows client-cache.ts pattern: LokiJS for session reads, IndexedDB for persistence.
 *
 * Auto-saves debounced 2s after mutations + beforeunload.
 * Server initialNodes win when present; IndexedDB for offline/fresh loads.
 */

import { openDB, type IDBPDatabase } from 'idb';
import Loki, { type Collection } from 'lokijs';

export interface BoardLayout {
	caseId: string;
	nodes: any[];
	connections: any[];
	viewport: { zoom: number; panX: number; panY: number };
	timestamp: number;
}

export function toPlainBoardLayout(layout: BoardLayout): BoardLayout {
	const serialized = JSON.stringify(layout);
	if (!serialized) throw new Error('Board layout is not serializable');
	return JSON.parse(serialized) as BoardLayout;
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

export async function saveLayout(layout: BoardLayout): Promise<boolean> {
	try {
		const snapshot = toPlainBoardLayout(layout);
		const db = await getDB();
		await db.put(STORE_NAME, { ...snapshot, timestamp: Date.now() });
		updateLokiCache(snapshot);
		return true;
	} catch (err) {
		console.error('[board-persistence] IndexedDB save failed:', err);
		return false;
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
	layout = toPlainBoardLayout(layout);
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

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingLayouts = new Map<string, BoardLayout>();

export function scheduleSave(layout: BoardLayout): void {
	if (!layout.caseId) return;
	const pending = toPlainBoardLayout(layout);
	pendingLayouts.set(layout.caseId, pending);
	// Update LokiJS immediately for fast reads
	updateLokiCache(pending);

	const priorTimer = saveTimers.get(layout.caseId);
	if (priorTimer) clearTimeout(priorTimer);
	const timer = setTimeout(async () => {
		saveTimers.delete(layout.caseId);
		const latest = pendingLayouts.get(layout.caseId);
		if (!latest) return;
		const saved = await saveLayout(latest);
		if (saved && pendingLayouts.get(layout.caseId) === latest) pendingLayouts.delete(layout.caseId);
	}, 2000);
	saveTimers.set(layout.caseId, timer);
}

export function flushSave(caseId?: string): void {
	const caseIds = caseId ? [caseId] : [...pendingLayouts.keys()];
	for (const id of caseIds) {
		const timer = saveTimers.get(id);
		if (timer) clearTimeout(timer);
		saveTimers.delete(id);
		const pending = pendingLayouts.get(id);
		if (!pending) continue;
		void saveLayout(pending).then((saved) => {
			if (saved && pendingLayouts.get(id) === pending) pendingLayouts.delete(id);
		});
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

interface PendingServerSave {
	caseId: string;
	snapshot: ServerSnapshot;
}

const serverSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingServerSaves = new Map<string, PendingServerSave>();

/**
 * Post the board snapshot to /api/cases/{caseId}/canvas. Intended shape is
 * the same one board.serialize() returns — NOT the LokiJS/IndexedDB BoardLayout,
 * because the server validates against boardSnapshotSchema.
 */
export function scheduleServerSave(caseId: string, snapshot: ServerSnapshot): void {
	if (!caseId) return;
	const pending = { caseId, snapshot };
	pendingServerSaves.set(caseId, pending);

	const priorTimer = serverSaveTimers.get(caseId);
	if (priorTimer) clearTimeout(priorTimer);
	const timer = setTimeout(async () => {
		serverSaveTimers.delete(caseId);
		const latest = pendingServerSaves.get(caseId);
		if (!latest) return;
		const saved = await postSnapshotToServer(latest.caseId, latest.snapshot);
		if (saved && pendingServerSaves.get(caseId) === latest) pendingServerSaves.delete(caseId);
	}, 4000);
	serverSaveTimers.set(caseId, timer);
}

/** Save the current snapshot once, replacing any queued debounce for this case. */
export async function saveServerSnapshot(caseId: string, snapshot: ServerSnapshot): Promise<boolean> {
	if (!caseId) return false;
	const timer = serverSaveTimers.get(caseId);
	if (timer) clearTimeout(timer);
	serverSaveTimers.delete(caseId);
	const pending = { caseId, snapshot };
	pendingServerSaves.set(caseId, pending);
	const saved = await postSnapshotToServer(caseId, snapshot);
	if (saved && pendingServerSaves.get(caseId) === pending) pendingServerSaves.delete(caseId);
	return saved;
}

export function flushServerSave(caseId?: string): void {
	const caseIds = caseId ? [caseId] : [...pendingServerSaves.keys()];
	for (const id of caseIds) {
		const timer = serverSaveTimers.get(id);
		if (timer) clearTimeout(timer);
		serverSaveTimers.delete(id);
		const pending = pendingServerSaves.get(id);
		if (!pending) continue;

		// sendBeacon survives beforeunload; falls back to fetch in other contexts.
		if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
			try {
				const blob = new Blob([JSON.stringify(pending.snapshot)], { type: 'application/json' });
				if (navigator.sendBeacon(`/api/cases/${id}/canvas`, blob)) {
					if (pendingServerSaves.get(id) === pending) pendingServerSaves.delete(id);
					continue;
				}
			} catch {
				/* fall through to fetch */
			}
		}
		void postSnapshotToServer(id, pending.snapshot).then((saved) => {
			if (saved && pendingServerSaves.get(id) === pending) pendingServerSaves.delete(id);
		});
	}
}

async function postSnapshotToServer(
	caseId: string,
	snapshot: ServerSnapshot,
): Promise<boolean> {
	try {
		const response = await fetch(`/api/cases/${caseId}/canvas`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(snapshot),
			// Avoid cancellation on navigate
			keepalive: true,
		signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) {
			console.warn(`[board-persistence] server save rejected (${response.status}) for case ${caseId}`);
			return false;
		}
		return true;
	} catch (err) {
		console.warn('[board-persistence] server save failed:', (err as Error)?.message);
		return false;
	}
}
