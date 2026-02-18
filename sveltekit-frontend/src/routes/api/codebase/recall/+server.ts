/**
 * POST /api/codebase/recall
 *
 * Stage A of the 2-stage retrieval pipeline.
 * Cheap recall: Fuse.js fuzzy search on chunk metadata (paths, symbols, tags).
 * Returns 20–200 candidate chunks in <200ms.
 *
 * No embeddings needed — pure string matching on indexed metadata.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Fuse from 'fuse.js';
import { ENV } from '$lib/server/env.server.js';

interface ChunkMetadataEntry {
	path: string;
	relativePath: string;
	symbol: string;
	kind: string;
	httpMethod?: string;
	routeId?: string;
	tags: string[];
	signature: string;
	lineStart: number;
	lineEnd: number;
}

// In-memory metadata cache — populated from Qdrant scroll.
// This is the "cheap recall" index: metadata only, no vectors, no content.
let metadataCache: ChunkMetadataEntry[] = [];
let fuseIndex: Fuse<ChunkMetadataEntry> | null = null;
let lastRefresh = 0;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function refreshMetadataCache(): Promise<void> {
	const now = Date.now();
	if (fuseIndex && now - lastRefresh < REFRESH_INTERVAL) return;

	try {
		const res = await fetch(`${ENV.QDRANT_URL}/collections/codebase_chunks/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				limit: 10000,
				with_payload: true,
				with_vector: false
			})
		});

		if (!res.ok) {
			console.warn('[recall] Qdrant scroll failed, using stale cache');
			return;
		}

		const data = await res.json();
		const points = data.result?.points ?? [];

		metadataCache = points.map((p: { payload: Record<string, unknown> }) => ({
			path: p.payload.path as string,
			relativePath: p.payload.relativePath as string,
			symbol: p.payload.symbol as string,
			kind: p.payload.kind as string,
			httpMethod: p.payload.httpMethod as string | undefined,
			routeId: p.payload.routeId as string | undefined,
			tags: (p.payload.tags as string[]) ?? [],
			signature: (p.payload.signature as string) ?? '',
			lineStart: p.payload.lineStart as number,
			lineEnd: p.payload.lineEnd as number
		}));

		fuseIndex = new Fuse(metadataCache, {
			keys: [
				{ name: 'symbol', weight: 0.35 },
				{ name: 'signature', weight: 0.25 },
				{ name: 'relativePath', weight: 0.2 },
				{ name: 'tags', weight: 0.1 },
				{ name: 'routeId', weight: 0.1 }
			],
			threshold: 0.45,
			includeScore: true,
			minMatchCharLength: 2
		});

		lastRefresh = now;
	} catch (err) {
		console.error('[recall] Failed to refresh metadata cache:', err);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const query = body?.query;
	const limit = Math.min(body?.limit ?? 100, 200);

	if (!query || typeof query !== 'string') {
		throw error(400, 'Missing query string');
	}

	await refreshMetadataCache();

	if (!fuseIndex || metadataCache.length === 0) {
		return json({ candidates: [], total: 0, cached: false });
	}

	const start = performance.now();
	const results = fuseIndex.search(query, { limit });

	const candidates = results.map((r) => ({
		path: r.item.path,
		relativePath: r.item.relativePath,
		symbol: r.item.symbol,
		kind: r.item.kind,
		httpMethod: r.item.httpMethod,
		routeId: r.item.routeId,
		tags: r.item.tags,
		fuseScore: 1 - (r.score ?? 1),
		lineStart: r.item.lineStart,
		lineEnd: r.item.lineEnd
	}));

	const elapsed = performance.now() - start;

	return json({
		candidates,
		total: metadataCache.length,
		recallMs: Math.round(elapsed),
		cached: true
	});
};
