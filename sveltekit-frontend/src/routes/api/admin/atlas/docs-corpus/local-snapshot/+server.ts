/** Read-only view of one explicitly pinned local docs artifact. */
import { json, type RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth-utils';
import { findRepoRoot } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';
import { readLocalChunkSnapshotPageV1 } from '$lib/server/atlas/docs/local-chunk-snapshot-v1.js';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const rawOffset = Number(event.url.searchParams.get('offset') ?? 0);
	const result = readLocalChunkSnapshotPageV1({
		root: findRepoRoot(),
		query: event.url.searchParams.get('q') ?? '',
		offset: Number.isSafeInteger(rawOffset) ? rawOffset : 0,
		limit: 10,
		expectedManifestChecksum: event.url.searchParams.get('manifestChecksum') ?? undefined
	});
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
};
