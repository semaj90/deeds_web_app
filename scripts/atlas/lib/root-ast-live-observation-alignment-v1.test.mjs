import test from 'node:test';
import assert from 'node:assert/strict';
import {
	diagnoseRootAstObservationAlignmentV1,
	selectRootAstObservationBoundByLiveSymbolProofV1,
} from './root-ast-live-observation-alignment-v1.mjs';

const observation = { observation_id: 'obs-1', source_ref: 'src/a.ts', source_revision: 'sha256:source', byte_start: 0, byte_end: 3 };
const proof = {
	status: 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH', canonicalAuthority: false, persistentStoreWritesPerformed: false,
	exactBinding: { packetKey: 'packet-1', symbolVersionId: 'symbol-1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', admissionStatus: 'PROPOSAL_ONLY', canonicalAuthority: false, astObservation: observation }
};

test('joins a source-only AST row only through the exact live symbol proof', () => {
	const row = { identityStatus: 'SOURCE_ONLY_UNBOUND', packetKey: null, sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', observation };
	assert.deepEqual(selectRootAstObservationBoundByLiveSymbolProofV1(proof, [row]), {
		row, identityBindingMode: 'SOURCE_ONLY_WITH_EXACT_LIVE_SYMBOL_PROOF'
	});
});

test('accepts an already packet-bound exact observation', () => {
	const row = { identityStatus: 'PACKET_REFERENCE', packetKey: 'packet-1', sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', observation };
	assert.equal(selectRootAstObservationBoundByLiveSymbolProofV1(proof, [row]).identityBindingMode, 'PACKET_REFERENCE');
});

test('reports a producer revision mismatch without allowing feature compilation', () => {
	const row = {
		identityStatus: 'PACKET_REFERENCE', packetKey: 'packet-1', sourceRef: 'src/a.ts',
		sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
		observation: { ...observation, extractor_revision: 'root-prefill-v2' },
	};
	const unrelated = { ...row, observation: { ...observation, observation_id: 'obs-other', byte_start: 8 } };
	const result = diagnoseRootAstObservationAlignmentV1(proof, [row, unrelated]);
	assert.equal(result.status, 'BLOCKED_PRODUCER_REVISION_MISMATCH');
	assert.equal(result.producerRevisionMismatchCount, 1);
	assert.equal(result.observationMismatchCount, 1);
	assert.equal(result.candidates[0].differences[0].field, 'extractor_revision');
	assert.equal(result.featureCompilationAllowed, false);
	assert.equal(result.canonicalAuthority, false);
	assert.throws(() => selectRootAstObservationBoundByLiveSymbolProofV1(proof, [row]), /ROOT_OBSERVATION_NOT_UNIQUE_EXACT_MATCH:0/);
});

test('reports structural observation drift separately from producer revision drift', () => {
	const row = {
		identityStatus: 'PACKET_REFERENCE', packetKey: 'packet-1', sourceRef: 'src/a.ts',
		sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace',
		observation: { ...observation, byte_end: 4, extractor_revision: 'root-prefill-v2' },
	};
	const result = diagnoseRootAstObservationAlignmentV1(proof, [row]);
	assert.equal(result.status, 'BLOCKED_OBSERVATION_MISMATCH');
	assert.deepEqual(result.candidates[0].differences.map(({ field }) => field), ['byte_end', 'extractor_revision']);
	assert.equal(result.featureCompilationAllowed, false);
});

test('reports missing identity candidates without guessing from source paths', () => {
	const row = {
		identityStatus: 'PACKET_REFERENCE', packetKey: 'packet-other', sourceRef: 'src/a.ts',
		sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', observation,
	};
	assert.equal(diagnoseRootAstObservationAlignmentV1(proof, [row]).status, 'NO_IDENTITY_MATCH');
});

test('rejects source, workspace, AST, packet, duplicate, and unverified identity mismatches', () => {
	const base = { identityStatus: 'SOURCE_ONLY_UNBOUND', packetKey: null, sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'sha256:workspace', observation };
	for (const changed of [
		{ ...base, sourceRef: 'src/b.ts' }, { ...base, sourceRevision: 'sha256:stale' },
		{ ...base, workspaceRevision: 'sha256:other' }, { ...base, observation: { ...observation, byte_start: 1 } },
		{ ...base, identityStatus: 'SOURCE_ONLY_UNBOUND', packetKey: 'packet-1' },
		{ ...base, identityStatus: 'PACKET_REFERENCE', packetKey: 'packet-other' }
	]) assert.throws(() => selectRootAstObservationBoundByLiveSymbolProofV1(proof, [changed]), /ROOT_OBSERVATION_NOT_UNIQUE_EXACT_MATCH:0/);
	assert.throws(() => selectRootAstObservationBoundByLiveSymbolProofV1(proof, [base, base]), /ROOT_OBSERVATION_NOT_UNIQUE_EXACT_MATCH:2/);
	assert.throws(() => selectRootAstObservationBoundByLiveSymbolProofV1({ ...proof, exactBinding: { ...proof.exactBinding, canonicalAuthority: true } }, [base]), /LIVE_SYMBOL_PROOF_BINDING_REQUIRED/);
});
