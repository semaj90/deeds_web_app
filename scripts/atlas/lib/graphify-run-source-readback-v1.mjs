import { createHash } from 'node:crypto';
import path from 'node:path';

export function resolveCompletedGraphifyRunV1(receipt, expectedWorkspaceRevision) {
	if (!receipt || receipt.schema !== 'atlas.graphify-daily-lifecycle.v1' || receipt.status !== 'COMPLETED') {
		throw new Error('GRAPHIFY_COMPLETED_RUN_RECEIPT_REQUIRED');
	}
	if (typeof receipt.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt.runId)) {
		throw new Error('GRAPHIFY_COMPLETED_RUN_ID_INVALID');
	}
	if (!expectedWorkspaceRevision || receipt.workspaceRevision !== expectedWorkspaceRevision) {
		throw new Error('GRAPHIFY_RUN_WORKSPACE_REVISION_MISMATCH');
	}
	return receipt.runId;
}

export function resolveGraphifyRunSnapshotBindingV1({ snapshotRoot, expectedWorkspaceRevision }) {
	const root = typeof snapshotRoot === 'string' ? snapshotRoot.trim() : '';
	const revision = typeof expectedWorkspaceRevision === 'string' ? expectedWorkspaceRevision.trim() : '';
	if (!root) throw new Error('GRAPHIFY_RUN_SNAPSHOT_ROOT_REQUIRED');
	if (!revision) throw new Error('GRAPHIFY_RUN_WORKSPACE_REVISION_REQUIRED');
	return { snapshotRoot: path.resolve(root), workspaceRevision: revision };
}

export function resolveGraphifySnapshotSourcePath(snapshotRoot, sourceRef) {
	if (typeof sourceRef !== 'string' || !sourceRef.trim() || path.posix.isAbsolute(sourceRef.replaceAll('\\', '/')) || /^[a-z]:/i.test(sourceRef) || sourceRef.startsWith('\\\\')) {
		throw new Error('GRAPHIFY_SOURCE_REF_INVALID');
	}
	const normalized = sourceRef.replaceAll('\\', '/');
	if (normalized.split('/').some((part) => part === '..' || part === '')) {
		throw new Error('GRAPHIFY_SOURCE_REF_INVALID');
	}
	const root = path.resolve(snapshotRoot);
	const absolutePath = path.resolve(root, ...normalized.split('/'));
	if (!absolutePath.startsWith(`${root}${path.sep}`)) throw new Error('GRAPHIFY_SOURCE_PATH_OUTSIDE_SNAPSHOT');
	return absolutePath;
}

export function normalizeGraphifyDirectoryScopeV1(scope) {
	if (scope === undefined || scope === null || !String(scope).trim()) return '';
	const normalized = String(scope).trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
	if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some((part) => part === '..' || part === '')) {
		throw new Error('GRAPHIFY_DIRECTORY_SCOPE_INVALID');
	}
	return normalized;
}

export function isGraphifySourceInDirectoryScopeV1(sourceRef, scope) {
	const normalizedScope = normalizeGraphifyDirectoryScopeV1(scope);
	const normalizedRef = String(sourceRef ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
	if (!normalizedScope) return Boolean(normalizedRef);
	return normalizedRef === normalizedScope || normalizedRef.startsWith(`${normalizedScope}/`);
}

export function selectGraphifySourcesByDirectoryV1(rows, limit) {
	if (!Number.isInteger(limit) || limit < 1) throw new Error('GRAPHIFY_SOURCE_LIMIT_INVALID');
	const groups = new Map();
	for (const row of rows) {
		const ref = String(row.source_ref ?? '').replaceAll('\\', '/');
		const directory = path.posix.dirname(ref);
		if (!groups.has(directory)) groups.set(directory, []);
		groups.get(directory).push({ ...row, source_ref: ref });
	}
	for (const group of groups.values()) group.sort((a, b) => a.source_ref.localeCompare(b.source_ref));
	const directories = [...groups.keys()].sort((a, b) => a.localeCompare(b));
	const selected = [];
	for (let depth = 0; selected.length < limit; depth += 1) {
		let found = false;
		for (const directory of directories) {
			const row = groups.get(directory)[depth];
			if (!row) continue;
			selected.push(row);
			found = true;
			if (selected.length === limit) break;
		}
		if (!found) break;
	}
	return selected.sort((a, b) => path.posix.dirname(a.source_ref).localeCompare(path.posix.dirname(b.source_ref)) || a.source_ref.localeCompare(b.source_ref));
}

export function verifyGraphifyRunSourceReadbackV1({ bytes, expectedContentHash, rowWorkspaceRevision, expectedWorkspaceRevision }) {
	if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new Error('GRAPHIFY_SOURCE_BYTES_REQUIRED');
	if (typeof expectedContentHash !== 'string' || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(expectedContentHash)) {
		throw new Error('GRAPHIFY_SOURCE_CONTENT_HASH_REQUIRED');
	}
	if (!expectedWorkspaceRevision || rowWorkspaceRevision !== expectedWorkspaceRevision) {
		throw new Error('GRAPHIFY_SOURCE_WORKSPACE_REVISION_MISMATCH');
	}
	const actualContentHash = createHash('sha256').update(bytes).digest('hex');
	if (actualContentHash !== expectedContentHash.replace(/^sha256:/i, '').toLowerCase()) {
		throw new Error('GRAPHIFY_SOURCE_CONTENT_HASH_MISMATCH');
	}
	return { contentHash: `sha256:${actualContentHash}`, byteLength: bytes.byteLength, verified: true };
}

export function selectRoundRobinSourcesWithCursor(sources, {
	limit = 50,
	workspaceRevision,
	snapshotManifestDigest,
	cursor = null,
	maxRetries = 3,
} = {}) {
	if (!workspaceRevision || !snapshotManifestDigest) {
		throw new Error('GRAPHIFY_SOURCE_SELECTION_MISSING_REVISION_OR_DIGEST');
	}
	if (cursor) {
		if (cursor.workspaceRevision !== workspaceRevision) {
			throw new Error('GRAPHIFY_CURSOR_REVISION_MISMATCH');
		}
		if (cursor.snapshotManifestDigest !== snapshotManifestDigest) {
			throw new Error('GRAPHIFY_CURSOR_MANIFEST_DIGEST_MISMATCH');
		}
	}
	const completedSet = new Set(cursor?.completedIds ?? []);
	const retryCounts = new Map(Object.entries(cursor?.retryCounts ?? {}));
	const quarantinedSet = new Set(cursor?.quarantinedIds ?? []);

	const buckets = new Map();
	for (const src of sources) {
		if (src.isSymlink) continue;
		if (completedSet.has(src.sourceId) || quarantinedSet.has(src.sourceId)) continue;
		const attempts = retryCounts.get(src.sourceId) ?? 0;
		if (attempts >= maxRetries) continue;

		const normPath = src.relativePath.replace(/\\/g, '/');
		const lastSlash = normPath.lastIndexOf('/');
		const dirBucket = `${src.repoId ?? 'root'}::${lastSlash >= 0 ? normPath.slice(0, lastSlash + 1) : './'}`;
		if (!buckets.has(dirBucket)) buckets.set(dirBucket, []);
		buckets.get(dirBucket).push(src);
	}
	const sortedDirs = [...buckets.keys()].sort();
	for (const d of sortedDirs) {
		buckets.get(d).sort((a, b) => a.relativePath.localeCompare(b.relativePath) || a.sourceId.localeCompare(b.sourceId));
	}

	let startIdx = 0;
	if (cursor?.lastBucketKey && sortedDirs.length > 0) {
		const found = sortedDirs.findIndex((d) => d > cursor.lastBucketKey);
		startIdx = found >= 0 ? found : 0;
	}
	const rotatedDirs = [...sortedDirs.slice(startIdx), ...sortedDirs.slice(0, startIdx)];
	const selected = [];
	const offsets = new Map(rotatedDirs.map((d) => [d, 0]));
	let progressed = true;
	while (selected.length < limit && progressed) {
		progressed = false;
		for (const d of rotatedDirs) {
			if (selected.length >= limit) break;
			const list = buckets.get(d);
			const idx = offsets.get(d);
			if (idx < list.length) {
				selected.push({ ...list[idx], directoryBucket: d });
				offsets.set(d, idx + 1);
				progressed = true;
			}
		}
	}
	const lastItem = selected.at(-1) ?? null;
	return {
		selected,
		nextCursorDraft: {
			workspaceRevision,
			snapshotManifestDigest,
			lastBucketKey: lastItem ? lastItem.directoryBucket : (cursor?.lastBucketKey ?? null),
			completedIds: [...completedSet],
			quarantinedIds: [...quarantinedSet],
			retryCounts: Object.fromEntries(retryCounts),
		},
	};
}

