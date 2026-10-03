import { createHash } from 'node:crypto';

const tupleKey = (value) => JSON.stringify([
	value?.packetKey,
	value?.sourceRef,
	value?.sourceRevision,
	value?.workspaceRevision,
]);

export function rebaseLargeCorpusCrosswalkV2({ priorRows, currentMap, priorMapBinding }) {
	if (!Array.isArray(priorRows) || !Array.isArray(currentMap?.candidates)) {
		throw new Error('PRIOR_ROWS_AND_CURRENT_MAP_REQUIRED');
	}
	if (currentMap.rowCount !== currentMap.candidates.length) throw new Error('CURRENT_MAP_ROW_COUNT_MISMATCH');

	const currentByTuple = new Map();
	currentMap.candidates.forEach((candidate, index) => {
		if (candidate.candidateOrdinal !== index) throw new Error(`CURRENT_MAP_ORDINAL_SEQUENCE_BROKEN:${index}`);
		const key = tupleKey(candidate);
		if (currentByTuple.has(key)) throw new Error(`CURRENT_MAP_IDENTITY_TUPLE_AMBIGUOUS:${index}`);
		currentByTuple.set(key, candidate);
	});

	const rows = priorRows.map((prior, inputOrdinal) => {
		const priorIdentity = prior.status === 'EXACT_CURRENT_CANDIDATE_MATCH' ? prior.identity : null;
		const currentCandidate = priorIdentity ? currentByTuple.get(tupleKey(priorIdentity)) : null;
		const currentMapResolution = !priorIdentity
			? 'NOT_ATTEMPTED_PRIOR_ROW_NOT_EXACT'
			: currentCandidate
				? 'EXACT_CURRENT_MAP_MATCH'
				: 'PRIOR_MATCH_NOT_IN_CURRENT_QUALIFIED_MAP';
		return {
			schema: 'atlas.mapreduce-candidate-evidence-current-map-rebase-row.v2',
			inputOrdinal,
			inputArtifactSha256: prior.inputArtifactSha256 ?? null,
			priorStatus: prior.status ?? 'UNCLASSIFIED',
			currentMapResolution,
			identity: currentCandidate ? {
				candidateOrdinal: currentCandidate.candidateOrdinal,
				canonicalId: currentCandidate.canonicalId,
				packetKey: currentCandidate.packetKey,
				sourceRef: currentCandidate.sourceRef,
				sourceRevision: currentCandidate.sourceRevision,
				workspaceRevision: currentCandidate.workspaceRevision,
				candidateSnapshotRevision: currentMap.candidateSnapshotRevision,
				ordinalMapChecksum: currentMap.ordinalMapChecksum,
			} : null,
			priorIdentity: priorIdentity ? {
				candidateOrdinal: priorIdentity.candidateOrdinal,
				candidateSnapshotRevision: priorMapBinding.candidateSnapshotRevision,
				ordinalMapChecksum: priorMapBinding.ordinalMapChecksum,
			} : null,
			canonicalAuthority: false,
			featureAdmitted: false,
		};
	});

	const currentMatches = rows.filter((row) => row.currentMapResolution === 'EXACT_CURRENT_MAP_MATCH');
	const ordinals = currentMatches.map((row) => row.identity.candidateOrdinal);
	if (new Set(ordinals).size !== ordinals.length) throw new Error('CURRENT_MAP_REBASE_ORDINAL_DUPLICATE');
	const counts = {};
	for (const row of rows) counts[row.currentMapResolution] = (counts[row.currentMapResolution] ?? 0) + 1;
	return { rows, counts, exactCurrentMapMatches: currentMatches.length };
}

export function projectCurrentOrdinalMapCoreV1(rawMap) {
	if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) throw new Error('CURRENT_MAP_OBJECT_REQUIRED');
	const allowedKeys = new Set([
		'schema', 'candidateSnapshotRevision', 'workspaceRevision', 'rowCount', 'candidates',
		'ordinalMapChecksum', 'identityAuthority', 'producerRevision',
		'lineageQualifiedRowCount', 'lineageRequired', 'canonicalOrderingPolicy',
	]);
	const unexpected = Object.keys(rawMap).filter((key) => !allowedKeys.has(key));
	if (unexpected.length) throw new Error(`CURRENT_MAP_UNRECOGNIZED_EXTENSION_FIELDS:${unexpected.sort().join(',')}`);
	if (rawMap.lineageQualifiedRowCount !== rawMap.rowCount
		|| rawMap.lineageRequired !== true
		|| rawMap.canonicalOrderingPolicy !== 'CANONICAL_ID_ASCENDING') {
		throw new Error('CURRENT_MAP_EXTENSION_METADATA_INVALID');
	}
	const {
		lineageQualifiedRowCount: _lineageQualifiedRowCount,
		lineageRequired: _lineageRequired,
		canonicalOrderingPolicy: _canonicalOrderingPolicy,
		...core
	} = rawMap;
	return core;
}

export function sha256HexV2(value) {
	return createHash('sha256').update(value).digest('hex');
}
