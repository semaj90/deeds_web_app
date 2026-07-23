export interface AuthorityParityArtifact {
	status: 'PAGERANK_PARITY_PROVEN' | 'PAGERANK_PARITY_FAILED' | 'PAGERANK_PARITY_NOT_RUN';
	topologyHash: string;
	networkxResultHash: string;
	neo4jResultHash: string;
}

export interface GraphAuthorityV2Policy {
	enabled: boolean;
	promotionEnabled: false;
	mode: 'disabled' | 'fixture-validation' | 'read-only-live';
}

function enabled(value: string | undefined): boolean {
	return value === 'true';
}

export function resolveGraphAuthorityV2Policy(
	environment: Pick<NodeJS.ProcessEnv, 'ATLAS_GRAPH_AUTHORITY_V2_ENABLED' | 'ATLAS_GRAPH_AUTHORITY_V2_PROMOTION_ENABLED'>,
	parityArtifact?: AuthorityParityArtifact
): GraphAuthorityV2Policy {
	const v2Enabled = enabled(environment.ATLAS_GRAPH_AUTHORITY_V2_ENABLED);
	const promotionRequested = enabled(environment.ATLAS_GRAPH_AUTHORITY_V2_PROMOTION_ENABLED);

	if (promotionRequested) {
		if (!v2Enabled) throw new Error('Graph authority V2 promotion requires ATLAS_GRAPH_AUTHORITY_V2_ENABLED=true.');
		if (!parityArtifact || parityArtifact.status !== 'PAGERANK_PARITY_PROVEN') {
			throw new Error('Graph authority V2 promotion requires a valid PAGERANK_PARITY_PROVEN artifact.');
		}
		throw new Error('Graph authority V2 promotion is not implemented in this validation milestone.');
	}

	return {
		enabled: v2Enabled,
		promotionEnabled: false,
		mode: v2Enabled ? 'read-only-live' : 'fixture-validation'
	};
}
