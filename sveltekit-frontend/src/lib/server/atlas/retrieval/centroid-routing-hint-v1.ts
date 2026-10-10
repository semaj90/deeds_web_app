export interface LegacyCentroidHintV1 {
	clusterId: number;
	similarity: number;
	source: string;
}

export interface CentroidHintDiagnosticV1 {
	status: 'DIAGNOSTIC_ONLY';
	reason: 'CANONICAL_CANDIDATE_MAP_REQUIRED';
	clusterId: number;
	similarity: number;
	source: string;
	canRestrictRetrieval: false;
	canonicalAuthority: false;
}

export function classifyLegacyCentroidHintV1(
	hint: LegacyCentroidHintV1,
): CentroidHintDiagnosticV1 {
	if (!Number.isSafeInteger(hint.clusterId) || hint.clusterId < 0) {
		throw new Error('INVALID_CENTROID_HINT_CLUSTER_ID');
	}
	if (!Number.isFinite(hint.similarity) || hint.similarity < -1 || hint.similarity > 1) {
		throw new Error('INVALID_CENTROID_HINT_SIMILARITY');
	}
	if (!hint.source.trim()) throw new Error('INVALID_CENTROID_HINT_SOURCE');

	return {
		status: 'DIAGNOSTIC_ONLY',
		reason: 'CANONICAL_CANDIDATE_MAP_REQUIRED',
		clusterId: hint.clusterId,
		similarity: hint.similarity,
		source: hint.source,
		canRestrictRetrieval: false,
		canonicalAuthority: false,
	};
}
