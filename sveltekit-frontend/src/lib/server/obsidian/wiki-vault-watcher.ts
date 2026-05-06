/**
 * Bidirectional Obsidian vault watcher.
 *
 * Watches `karpathy-wiki/` inside the configured Obsidian vault for file changes
 * made directly by the user in Obsidian desktop, then:
 *  1. Reads & parses the markdown file back into a WikiNote
 *  2. Upserts to CouchDB `karpathy_wiki`
 *  3. Refreshes Redis `wiki:note:*` TTL
 *  4. Skips files written by the server itself (2-second write-guard via timestamp)
 *
 * Singleton — only one watcher runs per process. Use start/stop/status API.
 */

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parseMarkdownWikiNote } from './markdown-wiki-note.js';
import { couchPut, docId } from '$lib/server/indexer/karpathy-wiki.js';
import { ENV } from '$lib/server/env.server.js';
import { getRedis } from '$lib/server/redis.js';

// chokidar has no @types — use a dynamic import typed manually
type ChokidarWatcher = {
	close(): Promise<void>;
	on(event: string, fn: (...args: unknown[]) => void): ChokidarWatcher;
};

// ── State ────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS   = 800;   // coalesce rapid saves (Obsidian can emit 2-3 events per save)
const WRITE_GUARD_MS = 2000; // ignore files written by server within this window

let watcher: ChokidarWatcher | null = null;
let vaultRoot = '';
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Tracks paths the server just wrote, so we don't echo them back to CouchDB
const recentServerWrites = new Map<string, number>(); // path → ms timestamp

export function markServerWrite(obsidianPath: string): void {
	recentServerWrites.set(obsidianPath, Date.now());
	// Auto-expire after write-guard window
	setTimeout(() => recentServerWrites.delete(obsidianPath), WRITE_GUARD_MS + 500);
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface WatcherStatus {
	running: boolean;
	vaultRoot: string;
	watchedGlob: string;
	pendingDebounce: number;
	recentServerWrites: number;
}

export async function startWatcher(): Promise<{ ok: boolean; error?: string }> {
	if (watcher) return { ok: true }; // already running

	if (!ENV.OBSIDIAN_VAULT_PATH) {
		return { ok: false, error: 'OBSIDIAN_VAULT_PATH not configured' };
	}

	vaultRoot = ENV.OBSIDIAN_VAULT_PATH;
	const wikiGlob = join(vaultRoot, 'karpathy-wiki', '**', '*.md');

	try {
		const { watch } = await import('chokidar');
		watcher = watch(wikiGlob, {
			ignoreInitial: true,
			awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
			persistent: true,
		}) as unknown as ChokidarWatcher;

		watcher.on('add', (p: unknown) => scheduleIngest(String(p)));
		watcher.on('change', (p: unknown) => scheduleIngest(String(p)));
		// Deletions: ignore — CouchDB retains the record; Obsidian deletion is rarely intentional

		return { ok: true };
	} catch (err) {
		watcher = null;
		return { ok: false, error: (err as Error).message };
	}
}

export async function stopWatcher(): Promise<void> {
	if (!watcher) return;
	await watcher.close();
	watcher = null;
	debounceTimers.forEach((t) => clearTimeout(t));
	debounceTimers.clear();
}

export function getWatcherStatus(): WatcherStatus {
	return {
		running: watcher !== null,
		vaultRoot,
		watchedGlob: vaultRoot ? join(vaultRoot, 'karpathy-wiki', '**', '*.md') : '',
		pendingDebounce: debounceTimers.size,
		recentServerWrites: recentServerWrites.size,
	};
}

// ── Ingest pipeline ──────────────────────────────────────────────────────────

function scheduleIngest(absPath: string): void {
	const existing = debounceTimers.get(absPath);
	if (existing) clearTimeout(existing);
	debounceTimers.set(
		absPath,
		setTimeout(() => {
			debounceTimers.delete(absPath);
			ingestFile(absPath).catch((err) =>
				console.error('[wiki-watcher] ingest error', absPath, err),
			);
		}, DEBOUNCE_MS),
	);
}

async function ingestFile(absPath: string): Promise<void> {
	// Write-guard: skip if server wrote this file within the guard window
	const writeTs = recentServerWrites.get(absPath);
	if (writeTs && Date.now() - writeTs < WRITE_GUARD_MS) return;

	let raw: string;
	try {
		raw = await readFile(absPath, 'utf8');
	} catch {
		return; // file disappeared between event and read
	}

	const relPath = relative(vaultRoot, absPath).replace(/\\/g, '/');
	const parsed = parseMarkdownWikiNote(raw, relPath);
	if (!parsed) return; // not a wiki note (e.g. MOC index, reports/)

	const { note, contentHash } = parsed;

	// ── CouchDB upsert ─────────────────────────────────────────────────────
	const id = docId(note);
	// Fetch current rev to avoid conflict
	let rev: string | undefined;
	try {
		const res = await couchFetch(`/${id}`);
		if (res.ok) {
			const doc = (await res.json()) as Record<string, unknown>;
			rev = String(doc._rev);
			// If content hash unchanged, skip upsert
			if (doc._contentHash === contentHash) return;
		}
	} catch { /* doc doesn't exist yet — that's fine */ }

	await couchPut(id, { ...note, _contentHash: contentHash, _rev: rev, source: 'obsidian-vault', lastSyncedAt: new Date().toISOString() });

	// ── Redis refresh ───────────────────────────────────────────────────────
	try {
		const redis = getRedis();
		const redisKey = redisKeyForNote(note);
		if (redisKey) {
			await redis.setex(redisKey, 86_400, JSON.stringify(note));
		}
	} catch { /* Redis unavailable — non-fatal */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function redisKeyForNote(note: { type: string; [k: string]: unknown }): string | null {
	switch (note.type) {
		case 'cluster': {
			const n = note as { clusterType: string; clusterId: number };
			return `wiki:note:cluster:${n.clusterType}:${n.clusterId}`;
		}
		case 'retrieval': {
			const n = note as { queryHash: string };
			return `wiki:note:retrieval:${n.queryHash}`;
		}
		case 'playbook': {
			const n = note as { symptom: string };
			return `wiki:note:playbook:${n.symptom.slice(0, 60).replace(/\W+/g, '_')}`;
		}
		case 'research': {
			const n = note as { query: string };
			return `wiki:note:research:${n.query.slice(0, 60).replace(/\W+/g, '_')}`;
		}
		case 'directory': {
			const n = note as { path: string };
			return `wiki:note:dir:${n.path.replace(/[/\\]/g, ':')}`;
		}
		default: return null;
	}
}

async function couchFetch(path: string, options: RequestInit = {}): Promise<Response> {
	const urlObj = new URL(ENV.COUCHDB_URL || 'http://localhost:5984');
	const username = urlObj.username;
	const password = urlObj.password;
	urlObj.username = '';
	urlObj.password = '';
	const headers = new Headers(options.headers || {});
	if (username || password) {
		headers.set('Authorization', `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`);
	}
	return fetch(`${urlObj.origin}/karpathy_wiki${path}`, { ...options, headers });
}