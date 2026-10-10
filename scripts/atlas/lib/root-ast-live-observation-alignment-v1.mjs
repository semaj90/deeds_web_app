import { isDeepStrictEqual } from 'node:util';

function validateLiveSymbolProof(proof) {
	const binding = proof?.exactBinding;
	if (proof?.status !== 'READ_ONLY_SOURCE_AND_AST_OBSERVATION_MATCH'
		|| proof?.canonicalAuthority !== false
		|| proof?.persistentStoreWritesPerformed !== false
		|| !binding?.packetKey
		|| !binding?.symbolVersionId
		|| binding?.admissionStatus !== 'PROPOSAL_ONLY'
		|| binding?.canonicalAuthority !== false) {
		throw new Error('LIVE_SYMBOL_PROOF_BINDING_REQUIRED');
	}
	return binding;
}

function observationDifferences(expected, actual, prefix = '') {
	if (isDeepStrictEqual(expected, actual)) return [];
	if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') {
		return [{ field: prefix || '$', expected: expected ?? null, actual: actual ?? null }];
	}
	const fields = new Set([...Object.keys(expected), ...Object.keys(actual)]);
	return [...fields].sort().flatMap((field) => observationDifferences(
		expected[field], actual[field], prefix ? `${prefix}.${field}` : field,
	));
}

export function diagnoseRootAstObservationAlignmentV1(proof, rows) {
	const binding = validateLiveSymbolProof(proof);
	if (!Array.isArray(rows)) throw new Error('ROOT_OBSERVATIONS_NOT_ARRAY');
	const identityCandidates = rows.filter((row) => row?.sourceRef === binding.sourceRef
		&& row?.sourceRevision === binding.sourceRevision
		&& row?.workspaceRevision === binding.workspaceRevision
		&& ((row.identityStatus === 'PACKET_REFERENCE' && row.packetKey === binding.packetKey)
			|| (row.identityStatus === 'SOURCE_ONLY_UNBOUND' && row.packetKey === null)));
	const candidates = identityCandidates.map((row) => {
		const differences = observationDifferences(binding.astObservation, row.observation);
		const producerRevisionOnly = differences.length === 1
			&& differences[0].field === 'extractor_revision';
		return {
			identityStatus: row.identityStatus,
			packetKey: row.packetKey,
			observationId: row.observation?.observation_id ?? null,
			status: differences.length === 0
				? 'EXACT_MATCH'
				: producerRevisionOnly ? 'PRODUCER_REVISION_MISMATCH' : 'OBSERVATION_MISMATCH',
			differences,
		};
	});
	const exactCount = candidates.filter((candidate) => candidate.status === 'EXACT_MATCH').length;
	const revisionMismatchCount = candidates.filter((candidate) => candidate.status === 'PRODUCER_REVISION_MISMATCH').length;
	return {
		schema: 'atlas.root-ast-observation-alignment-diagnostic.v1',
		status: exactCount === 1 && candidates.length === 1
			? 'EXACT_MATCH'
			: exactCount === 0 && revisionMismatchCount === 1
				? 'BLOCKED_PRODUCER_REVISION_MISMATCH'
				: candidates.length > 0 ? 'BLOCKED_OBSERVATION_MISMATCH' : 'NO_IDENTITY_MATCH',
		identityCandidateCount: candidates.length,
		exactMatchCount: exactCount,
		producerRevisionMismatchCount: revisionMismatchCount,
		observationMismatchCount: candidates.filter((candidate) => candidate.status === 'OBSERVATION_MISMATCH').length,
		candidates,
		canonicalAuthority: false,
		featureCompilationAllowed: exactCount === 1 && candidates.length === 1,
	};
}

export function selectRootAstObservationBoundByLiveSymbolProofV1(proof, rows) {
	const binding = validateLiveSymbolProof(proof);
	if (!Array.isArray(rows)) throw new Error('ROOT_OBSERVATIONS_NOT_ARRAY');
	const matches = rows.filter((row) => {
		if (row?.sourceRef !== binding.sourceRef
			|| row?.sourceRevision !== binding.sourceRevision
			|| row?.workspaceRevision !== binding.workspaceRevision
			|| !isDeepStrictEqual(row?.observation, binding.astObservation)) return false;
		if (row.identityStatus === 'PACKET_REFERENCE') return row.packetKey === binding.packetKey;
		return row.identityStatus === 'SOURCE_ONLY_UNBOUND' && row.packetKey === null;
	});
	if (matches.length !== 1) throw new Error(`ROOT_OBSERVATION_NOT_UNIQUE_EXACT_MATCH:${matches.length}`);
	return {
		row: matches[0],
		identityBindingMode: matches[0].identityStatus === 'PACKET_REFERENCE'
			? 'PACKET_REFERENCE'
			: 'SOURCE_ONLY_WITH_EXACT_LIVE_SYMBOL_PROOF'
	};
}
