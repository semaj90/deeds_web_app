import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCurrentOrdinalMapCoreV1, rebaseLargeCorpusCrosswalkV2 } from './large-corpus-current-map-rebase-v2.mjs';

const candidate = (candidateOrdinal, packetKey = 'packet:a') => ({
	candidateOrdinal,
	canonicalId: packetKey,
	packetKey,
	sourceRef: 'src/a.ts',
	sourceRevision: 'sha256:source-a',
	workspaceRevision: 'sha256:workspace',
});
const exactPrior = (candidateOrdinal, packetKey = 'packet:a') => ({
	status: 'EXACT_CURRENT_CANDIDATE_MATCH',
	inputArtifactSha256: 'sha256:historical-input',
	identity: candidate(candidateOrdinal, packetKey),
});

test('rebases only exact packet/source/revision/workspace tuples and replaces the ordinal', () => {
	const result = rebaseLargeCorpusCrosswalkV2({
		priorRows: [exactPrior(41)],
		currentMap: {
			rowCount: 1,
			candidateSnapshotRevision: 'sha256:new-snapshot',
			ordinalMapChecksum: 'new-map-checksum',
			candidates: [candidate(0)],
		},
		priorMapBinding: { candidateSnapshotRevision: 'sha256:old-snapshot', ordinalMapChecksum: 'old-map-checksum' },
	});
	assert.equal(result.rows[0].identity.candidateOrdinal, 0);
	assert.equal(result.rows[0].identity.ordinalMapChecksum, 'new-map-checksum');
	assert.equal(result.rows[0].priorIdentity.candidateOrdinal, 41);
	assert.equal(result.rows[0].canonicalAuthority, false);
	assert.equal(result.rows[0].featureAdmitted, false);
});

test('preserves prior exact matches outside the current qualified map without carrying current identity', () => {
	const result = rebaseLargeCorpusCrosswalkV2({
		priorRows: [exactPrior(41)],
		currentMap: { rowCount: 0, candidates: [], ordinalMapChecksum: 'new-map' },
		priorMapBinding: { candidateSnapshotRevision: 'old-snapshot', ordinalMapChecksum: 'old-map' },
	});
	assert.equal(result.rows[0].currentMapResolution, 'PRIOR_MATCH_NOT_IN_CURRENT_QUALIFIED_MAP');
	assert.equal(result.rows[0].identity, null);
	assert.equal(result.rows[0].priorIdentity.candidateOrdinal, 41);
});

test('does not attempt current mapping for prior non-exact statuses', () => {
	const result = rebaseLargeCorpusCrosswalkV2({
		priorRows: [{ status: 'NO_UNIQUE_VERIFIED_CURRENT_BINDING', identity: null }],
		currentMap: { rowCount: 1, candidates: [candidate(0)] },
		priorMapBinding: { candidateSnapshotRevision: 'old-snapshot', ordinalMapChecksum: 'old-map' },
	});
	assert.equal(result.rows[0].currentMapResolution, 'NOT_ATTEMPTED_PRIOR_ROW_NOT_EXACT');
	assert.equal(result.rows[0].identity, null);
});

test('fails closed on duplicate identity tuples in current map', () => {
	assert.throws(() => rebaseLargeCorpusCrosswalkV2({
		priorRows: [],
		currentMap: { rowCount: 2, candidates: [candidate(0), candidate(1)] },
		priorMapBinding: {},
	}), /CURRENT_MAP_IDENTITY_TUPLE_AMBIGUOUS/);
});

test('fails closed on duplicate current ordinals selected by different prior rows', () => {
	assert.throws(() => rebaseLargeCorpusCrosswalkV2({
		priorRows: [exactPrior(41), exactPrior(42)],
		currentMap: { rowCount: 1, candidates: [candidate(0)] },
		priorMapBinding: { candidateSnapshotRevision: 'old', ordinalMapChecksum: 'old' },
	}), /CURRENT_MAP_REBASE_ORDINAL_DUPLICATE/);
});

test('projects only the three recognized map-producer extensions after validating their values', () => {
	const core = projectCurrentOrdinalMapCoreV1({
		schema: 'atlas.candidate-ordinal-map.v1', candidateSnapshotRevision: 'snapshot', workspaceRevision: 'workspace',
		rowCount: 0, candidates: [], ordinalMapChecksum: 'checksum', identityAuthority: false, producerRevision: 'producer',
		lineageQualifiedRowCount: 0, lineageRequired: true, canonicalOrderingPolicy: 'CANONICAL_ID_ASCENDING',
	});
	assert.equal('lineageQualifiedRowCount' in core, false);
	assert.equal(core.rowCount, 0);
});

test('rejects invalid or unknown current map extension fields', () => {
	assert.throws(() => projectCurrentOrdinalMapCoreV1({ rowCount: 1, lineageQualifiedRowCount: 0 }), /CURRENT_MAP_EXTENSION_METADATA_INVALID/);
	assert.throws(() => projectCurrentOrdinalMapCoreV1({ unexpected: true }), /CURRENT_MAP_UNRECOGNIZED_EXTENSION_FIELDS/);
});
