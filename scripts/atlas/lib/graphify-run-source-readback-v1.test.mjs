import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
	resolveCompletedGraphifyRunV1,
	resolveGraphifyRunSnapshotBindingV1,
	selectGraphifySourcesByDirectoryV1,
	isGraphifySourceInDirectoryScopeV1,
	normalizeGraphifyDirectoryScopeV1,
	resolveGraphifySnapshotSourcePath,
	verifyGraphifyRunSourceReadbackV1,
	selectRoundRobinSourcesWithCursor,
} from './graphify-run-source-readback-v1.mjs';

const revision = `sha256:${'a'.repeat(64)}`;

test('requires the completed daily Graphify receipt and exact workspace revision', () => {
	const runId = '018f1f7a-9b3e-7c2d-8a4b-7e6f5d4c3b2a';
	const receipt = { schema: 'atlas.graphify-daily-lifecycle.v1', status: 'COMPLETED', runId, workspaceRevision: revision };
	assert.equal(resolveCompletedGraphifyRunV1(receipt, revision), runId);
	assert.throws(() => resolveCompletedGraphifyRunV1({ ...receipt, status: 'RUNNING' }, revision), /COMPLETED_RUN_RECEIPT_REQUIRED/);
	assert.throws(() => resolveCompletedGraphifyRunV1({ ...receipt, runId: 'run-1' }, revision), /COMPLETED_RUN_ID_INVALID/);
	assert.throws(() => resolveCompletedGraphifyRunV1(receipt, `sha256:${'b'.repeat(64)}`), /WORKSPACE_REVISION_MISMATCH/);
});

test('run-scoped structural materialization requires an explicit sealed snapshot binding', () => {
	const binding = resolveGraphifyRunSnapshotBindingV1({
		snapshotRoot: 'C:/sealed/snapshot',
		expectedWorkspaceRevision: 'sha256:' + 'a'.repeat(64),
	});
	assert.equal(binding.snapshotRoot, path.resolve('C:/sealed/snapshot'));
	assert.throws(() => resolveGraphifyRunSnapshotBindingV1({ snapshotRoot: '', expectedWorkspaceRevision: 'rev' }), /SNAPSHOT_ROOT_REQUIRED/);
	assert.throws(() => resolveGraphifyRunSnapshotBindingV1({ snapshotRoot: 'C:/sealed/snapshot', expectedWorkspaceRevision: '' }), /WORKSPACE_REVISION_REQUIRED/);
});

test('resolves a relative source only inside the sealed snapshot root', () => {
	assert.equal(resolveGraphifySnapshotSourcePath('C:/sealed/root', 'src/lib/a.ts'), 'C:\\sealed\\root\\src\\lib\\a.ts');
	assert.throws(() => resolveGraphifySnapshotSourcePath('C:/sealed/root', '../outside.ts'), /SOURCE_REF_INVALID/);
	assert.throws(() => resolveGraphifySnapshotSourcePath('C:/sealed/root', 'C:/outside.ts'), /SOURCE_REF_INVALID/);
});

test('matches directory scopes by path segment, not string prefix', () => {
	assert.equal(normalizeGraphifyDirectoryScopeV1('src\\lib\\'), 'src/lib');
	assert.equal(isGraphifySourceInDirectoryScopeV1('src/lib/file.ts', 'src/lib'), true);
	assert.equal(isGraphifySourceInDirectoryScopeV1('src/library/file.ts', 'src/lib'), false);
	assert.throws(() => normalizeGraphifyDirectoryScopeV1('../outside'), /DIRECTORY_SCOPE_INVALID/);
});

test('bounded Graphify source selection does not starve later directories', () => {
	const rows = [
		{ source_ref: 'src/a/1.ts' }, { source_ref: 'src/a/2.ts' }, { source_ref: 'src/a/3.ts' },
		{ source_ref: 'src/b/1.ts' }, { source_ref: 'src/c/1.ts' },
	];
	const selected = selectGraphifySourcesByDirectoryV1(rows, 3);
	assert.deepEqual(selected.map((row) => row.source_ref), ['src/a/1.ts', 'src/b/1.ts', 'src/c/1.ts']);
	assert.deepEqual(selectGraphifySourcesByDirectoryV1(rows, 4).map((row) => row.source_ref), ['src/a/1.ts', 'src/a/2.ts', 'src/b/1.ts', 'src/c/1.ts']);
});

test('verifies raw source bytes and revision before AST extraction', () => {
	const bytes = Buffer.from('const value = 1;\r\n', 'utf8');
	const digest = createHash('sha256').update(bytes).digest('hex');
	assert.deepEqual(verifyGraphifyRunSourceReadbackV1({
		bytes,
		expectedContentHash: digest,
		rowWorkspaceRevision: revision,
		expectedWorkspaceRevision: revision,
	}), { contentHash: `sha256:${digest}`, byteLength: bytes.length, verified: true });
	assert.throws(() => verifyGraphifyRunSourceReadbackV1({ bytes, expectedContentHash: '0'.repeat(64), rowWorkspaceRevision: revision, expectedWorkspaceRevision: revision }), /CONTENT_HASH_MISMATCH/);
	assert.throws(() => verifyGraphifyRunSourceReadbackV1({ bytes, expectedContentHash: digest, rowWorkspaceRevision: 'stale', expectedWorkspaceRevision: revision }), /WORKSPACE_REVISION_MISMATCH/);
});

test('selectRoundRobinSourcesWithCursor covers 165-file fixture in 3x50 + 15 batches without duplicates', () => {
	const workspaceRevision = `sha256:${'a'.repeat(64)}`;
	const snapshotManifestDigest = `sha256:${'b'.repeat(64)}`;
	const sources = [];

	const addSources = (dir, count) => {
		for (let i = 0; i < count; i++) {
			const rel = `${dir}/file_${String(i).padStart(3, '0')}.ts`;
			sources.push({
				sourceId: `id:${rel}`,
				repoId: 'root',
				relativePath: rel,
				isSymlink: false,
			});
		}
	};

	addSources('dir-a', 120);
	addSources('dir-b', 30);
	addSources('dir-b-extra', 10);
	addSources('dir-c', 5);
	assert.equal(sources.length, 165);

	// Batch 1: 50 files
	const batch1 = selectRoundRobinSourcesWithCursor(sources, {
		limit: 50,
		workspaceRevision,
		snapshotManifestDigest,
	});
	assert.equal(batch1.selected.length, 50);

	// Advance cursor 1
	const cursor1 = {
		...batch1.nextCursorDraft,
		completedIds: batch1.selected.map((s) => s.sourceId),
	};

	// Batch 2: 50 files
	const batch2 = selectRoundRobinSourcesWithCursor(sources, {
		limit: 50,
		workspaceRevision,
		snapshotManifestDigest,
		cursor: cursor1,
	});
	assert.equal(batch2.selected.length, 50);

	// Advance cursor 2
	const cursor2 = {
		...batch2.nextCursorDraft,
		completedIds: [...cursor1.completedIds, ...batch2.selected.map((s) => s.sourceId)],
	};

	// Batch 3: 50 files
	const batch3 = selectRoundRobinSourcesWithCursor(sources, {
		limit: 50,
		workspaceRevision,
		snapshotManifestDigest,
		cursor: cursor2,
	});
	assert.equal(batch3.selected.length, 50);

	// Advance cursor 3
	const cursor3 = {
		...batch3.nextCursorDraft,
		completedIds: [...cursor2.completedIds, ...batch3.selected.map((s) => s.sourceId)],
	};

	// Batch 4: remaining 15 files
	const batch4 = selectRoundRobinSourcesWithCursor(sources, {
		limit: 50,
		workspaceRevision,
		snapshotManifestDigest,
		cursor: cursor3,
	});
	assert.equal(batch4.selected.length, 15);

	// Total reconciliation
	const allSelected = [
		...batch1.selected.map((s) => s.sourceId),
		...batch2.selected.map((s) => s.sourceId),
		...batch3.selected.map((s) => s.sourceId),
		...batch4.selected.map((s) => s.sourceId),
	];
	assert.equal(allSelected.length, 165);
	const uniqueIds = new Set(allSelected);
	assert.equal(uniqueIds.size, 165);
});

test('selectRoundRobinSourcesWithCursor isolates prefix collisions and rejects invalid cursor revisions', () => {
	const workspaceRevision = `sha256:${'a'.repeat(64)}`;
	const snapshotManifestDigest = `sha256:${'b'.repeat(64)}`;

	const sources = [
		{ sourceId: '1', relativePath: 'src/lib/a.ts', repoId: 'root', isSymlink: false },
		{ sourceId: '2', relativePath: 'src/lib/b.ts', repoId: 'root', isSymlink: false },
		{ sourceId: '3', relativePath: 'src/lib-extra/a.ts', repoId: 'root', isSymlink: false },
	];

	const batch = selectRoundRobinSourcesWithCursor(sources, {
		limit: 10,
		workspaceRevision,
		snapshotManifestDigest,
	});
	const dirBuckets = new Set(batch.selected.map((s) => s.directoryBucket));
	assert.equal(dirBuckets.has('root::src/lib/'), true);
	assert.equal(dirBuckets.has('root::src/lib-extra/'), true);

	// Revision mismatch check
	assert.throws(
		() => selectRoundRobinSourcesWithCursor(sources, {
			limit: 10,
			workspaceRevision,
			snapshotManifestDigest,
			cursor: {
				workspaceRevision: `sha256:${'c'.repeat(64)}`,
				snapshotManifestDigest,
				completedIds: [],
			},
		}),
		/GRAPHIFY_CURSOR_REVISION_MISMATCH/,
	);

	// Manifest digest mismatch check
	assert.throws(
		() => selectRoundRobinSourcesWithCursor(sources, {
			limit: 10,
			workspaceRevision,
			snapshotManifestDigest,
			cursor: {
				workspaceRevision,
				snapshotManifestDigest: `sha256:${'d'.repeat(64)}`,
				completedIds: [],
			},
		}),
		/GRAPHIFY_CURSOR_MANIFEST_DIGEST_MISMATCH/,
	);
});

