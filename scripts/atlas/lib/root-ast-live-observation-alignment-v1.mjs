import { isDeepStrictEqual } from 'node:util';

export function selectRootAstObservationBoundByLiveSymbolProofV1(proof, rows) {
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
