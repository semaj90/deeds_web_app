import test from 'node:test';
import assert from 'node:assert/strict';
import {
	canonicalSourceRefSqlV1,
	chunkLineageCandidateChecksumV2,
	classifyChunkLineageMirrorCandidateV2,
	CHUNK_LINEAGE_MIRROR_ASSIGNMENTS_V2,
	CHUNK_LINEAGE_MIRROR_FIELDS_V2,
	digestSqlV1,
	normalizeCanonicalSourceRefV1,
	parseChunkLineageMirrorArgsV2,
} from './chunk-lineage-mirror-policy-v2.mjs';

test('canonical source path normalization matches separators and prefixes without case folding', () => {
	assert.equal(normalizeCanonicalSourceRefV1('./src\\Lib\\Thing.ts'), 'src/Lib/Thing.ts');
	assert.equal(normalizeCanonicalSourceRefV1('/src/Lib/Thing.ts'), 'src/Lib/Thing.ts');
	assert.notEqual(normalizeCanonicalSourceRefV1('src/Lib/Thing.ts'), normalizeCanonicalSourceRefV1('src/lib/thing.ts'));
	assert.match(canonicalSourceRefSqlV1('c.source_ref'), /replace\(btrim\(c\.source_ref\)/);
	assert.doesNotMatch(canonicalSourceRefSqlV1('c.source_ref'), /lower\(/);
	assert.match(digestSqlV1('c.file_content_hash'), /lower\(/);
});

test('bridge/binding disagreement is a typed rejection and is never selected for update', () => {
	assert.equal(classifyChunkLineageMirrorCandidateV2({
		pathBindingCount: 1,
		pathExact: true,
		digestExact: true,
		bindingSourceRevision: 'sha256:binding',
		bindingWorkspaceRevision: 'sha256:workspace',
		bridgeSourceRevisions: ['sha256:bridge'],
	}), 'BRIDGE_BINDING_SOURCE_REVISION_CONFLICT');
});

test('case-fold-only frozen-cohort matches are rejected instead of replaced', () => {
	assert.equal(classifyChunkLineageMirrorCandidateV2({
		pathBindingCount: 1,
		pathExact: false,
		digestExact: true,
	}), 'CASE_INSENSITIVE_SOURCE_REF_ONLY');
});

test('only the four approved mirror fields can be changed', () => {
	assert.deepEqual(CHUNK_LINEAGE_MIRROR_FIELDS_V2, [
		'workspace_revision',
		'source_revision',
		'lineage_binding_checksum',
		'lineage_producer_revision',
	]);
	assert.equal(CHUNK_LINEAGE_MIRROR_FIELDS_V2.includes('representation_revision'), false);
	assert.equal(CHUNK_LINEAGE_MIRROR_FIELDS_V2.includes('packet_key'), false);
	assert.deepEqual(CHUNK_LINEAGE_MIRROR_ASSIGNMENTS_V2, [
		'workspace_revision = s.workspace_revision',
		'source_revision = s.source_revision',
		'lineage_binding_checksum = s.binding_checksum',
		'lineage_producer_revision = s.producer_revision',
	]);
	assert.equal(CHUNK_LINEAGE_MIRROR_ASSIGNMENTS_V2.some((assignment) => /representation_revision|packet_key|canonical_chunk_id|content|embedding/i.test(assignment)), false);
});

test('candidate checksum is stable under row ordering', () => {
	const first = { id: 'b', sourceRef: 'b.ts', fileContentHash: 'hash-b', bridgeSourceRevisions: [] };
	const second = { id: 'a', sourceRef: 'a.ts', fileContentHash: 'hash-a', bridgeSourceRevisions: [] };
	assert.equal(chunkLineageCandidateChecksumV2([first, second]), chunkLineageCandidateChecksumV2([second, first]));
});

test('CLI requires an explicit repository and admitted workspace inputs', () => {
	assert.throws(() => parseChunkLineageMirrorArgsV2([
		'--workspace-revision=sha256:ws', '--limit=5000', '--admission-receipt=docs/admission.json',
	]), /REQUIRED_ARGUMENT_MISSING: --repo-id/);
	assert.equal(parseChunkLineageMirrorArgsV2([
		'--repo-id=deeds-web-app', '--workspace-revision=sha256:ws', '--limit=5000',
		'--admission-receipt=docs/admission.json',
	]).apply, false);
});

test('apply requires frozen canary proof and explicit authorization', () => {
	const base = [
		'--repo-id=deeds-web-app', '--workspace-revision=sha256:ws', '--limit=5000',
		'--admission-receipt=docs/admission.json', '--apply', '--expected-count=5000',
		`--expected-checksum=sha256:${'a'.repeat(64)}`,
	];
	assert.throws(() => parseChunkLineageMirrorArgsV2(base), /REQUIRED_ARGUMENT_MISSING: --authorization/);
	assert.equal(parseChunkLineageMirrorArgsV2([...base, '--authorization=CHUNK-LINEAGE-APPLY-01:COMMIT']).apply, true);
	assert.throws(() => parseChunkLineageMirrorArgsV2([
		...base.filter((argument) => !argument.startsWith('--limit=')), '--limit=4999',
		'--authorization=CHUNK-LINEAGE-APPLY-01:COMMIT',
	]), /APPLY_REQUIRES_FROZEN_5000_ROW_CANARY/);
});
