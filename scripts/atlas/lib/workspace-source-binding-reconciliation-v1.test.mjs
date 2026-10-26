import test from 'node:test';
import assert from 'node:assert/strict';
import {
	planWorkspaceSourceBindingsV1,
	verifyWorkspaceSourceBindingReadbackV1,
} from './workspace-source-binding-reconciliation-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const source = (sourceRef, manifestOrdinal = 0) => ({
	repositoryId: 'repo:root',
	sourceRef,
	sourceRevision,
	contentDigest: sourceRevision.slice(7),
	byteLength: 12,
	manifestOrdinal,
});
const graph = (sourceRef) => ({ source_ref: sourceRef, content_hash: sourceRevision.slice(7), byte_length: 12 });
const registry = (sourceRef, overrides = {}) => ({ source_ref_key: sourceRef, source_type: 'code', content_hash: sourceRevision.slice(7), ...overrides });
const base = (overrides = {}) => ({
	snapshotSources: [source('src/a.ts')],
	graphRows: [graph('src/a.ts')],
	registryRows: [registry('src/a.ts')],
	existingBindings: [],
	repoId: 'deeds-web-app',
	workspaceRevision,
	producerRevision: 'workspace-source-binding-test.v1',
	...overrides,
});

test('plans only exact matches and preserves the source manifest ordinal', () => {
	const result = planWorkspaceSourceBindingsV1(base({
		snapshotSources: [source('src/a.ts', 7), source('src/b.ts', 8)],
		graphRows: [graph('src/a.ts'), { ...graph('src/b.ts'), byte_length: 11 }],
		registryRows: [registry('src/a.ts'), registry('src/b.ts')],
	}));
	assert.equal(result.rows.length, 1);
	assert.equal(result.rows[0].sourceManifestOrdinal, 0);
	assert.equal(result.counts.byteLengthMismatch, 1);
	assert.equal(result.canonicalAuthority, false);
	assert.equal(result.writesPerformed, false);
});

test('excludes registry hash mismatches, unexpected source types, and duplicate graph refs', () => {
	const result = planWorkspaceSourceBindingsV1(base({
		snapshotSources: [source('src/a.ts'), source('src/b.ts'), source('src/c.ts')],
		graphRows: [graph('src/a.ts'), graph('src/b.ts'), graph('src/c.ts'), graph('src/c.ts')],
		registryRows: [registry('src/a.ts', { content_hash: 'c'.repeat(64) }), registry('src/b.ts', { source_type: 'document' }), registry('src/c.ts')],
	}));
	assert.equal(result.rows.length, 0);
	assert.equal(result.counts.registryContentMismatch, 1);
	assert.equal(result.counts.sourceTypeMismatch, 1);
	assert.equal(result.counts.duplicateGraphRows, 1);
});

test('rejects duplicate registry identities rather than choosing one row', () => {
	const result = planWorkspaceSourceBindingsV1(base({
		registryRows: [registry('src/a.ts'), registry('src/a.ts')],
	}));
	assert.equal(result.rows.length, 0);
	assert.equal(result.counts.duplicateRegistryRows, 1);
});

test('existing exact bindings are idempotent; conflicting rows are not overwritten', () => {
	const planned = planWorkspaceSourceBindingsV1(base());
	const expected = planned.rows[0];
	const row = {
		canonical_source_ref: expected.sourceRef,
		source_revision: expected.sourceRevision,
		content_digest: expected.contentDigest,
		byte_length: expected.byteLength,
		source_manifest_ordinal: expected.sourceManifestOrdinal,
		producer_revision: expected.producerRevision,
		binding_checksum: expected.bindingChecksum,
	};
	const exact = planWorkspaceSourceBindingsV1(base({ existingBindings: [row] }));
	assert.equal(exact.counts.alreadyBound, 1);
	assert.equal(exact.rows.length, 0);
	const conflicting = planWorkspaceSourceBindingsV1(base({ existingBindings: [{ ...row, content_digest: 'c'.repeat(64) }] }));
	assert.equal(conflicting.counts.bindingConflict, 1);
	assert.equal(conflicting.rows.length, 0);
});

test('readback requires every exact row and rejects missing, duplicate, or altered rows', () => {
	const expected = planWorkspaceSourceBindingsV1(base()).rows;
	const actual = expected.map((row) => ({
		canonical_source_ref: row.sourceRef,
		source_revision: row.sourceRevision,
		content_digest: row.contentDigest,
		byte_length: row.byteLength,
		source_manifest_ordinal: row.sourceManifestOrdinal,
		producer_revision: row.producerRevision,
		binding_checksum: row.bindingChecksum,
	}));
	assert.deepEqual(verifyWorkspaceSourceBindingReadbackV1(expected, actual), { verifiedCount: 1, mismatches: [] });
	assert.throws(() => verifyWorkspaceSourceBindingReadbackV1(expected, []), /READBACK_MISMATCH/);
	assert.throws(() => verifyWorkspaceSourceBindingReadbackV1(expected, [...actual, ...actual]), /READBACK_MISMATCH/);
	assert.throws(() => verifyWorkspaceSourceBindingReadbackV1(expected, [{ ...actual[0], binding_checksum: 'bad' }]), /READBACK_MISMATCH/);
});
