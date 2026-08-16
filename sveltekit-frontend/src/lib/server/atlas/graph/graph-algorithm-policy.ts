import type { ResourceEnvelopeV1 } from '$lib/server/retrieval/bounded-resolution.js';

export type GraphExpansionIntent =
	| 'neighborhood'
	| 'dependency_path'
	| 'alternative_paths'
	| 'authority'
	| 'community_context'
	| 'structural_core'
	| 'similarity'
	| 'explore'
	| 'revision_lineage';

export type GraphExpansionAlgorithm =
	| 'bfs'
	| 'reverse_bfs'
	| 'sssp'
	| 'yen'
	| 'personalized_pagerank'
	| 'leiden_filtered_bfs'
	| 'kcore'
	| 'jaccard'
	| 'neighbor_sampling'
	| 'k_best_viterbi';

export type GraphExpansionBackend = 'neo4j' | 'cugraph' | 'networkx' | 'temporal_dp';

export interface GraphAlgorithmPolicyInput {
	intent: GraphExpansionIntent;
	direction: 'out' | 'in' | 'both';
	hasPositiveEdgeWeights?: boolean;
	hasCommunityLabels?: boolean;
	hasTarget?: boolean;
	gpuAvailable?: boolean;
	frozenSnapshotAvailable?: boolean;
	envelope: ResourceEnvelopeV1;
}

export interface GraphAlgorithmDecisionV1 {
	schemaVersion: 'atlas.graph-algorithm-decision.v1';
	algorithm: GraphExpansionAlgorithm;
	backend: GraphExpansionBackend;
	reasonCodes: string[];
	maxHops: number;
	maxCandidates: number;
	deterministic: boolean;
}

/**
 * Deterministic policy only. It does not execute graph work and does not add a
 * retrieval vote. Community detection is treated as a derived graph feature,
 * not as query-time traversal.
 */
export function selectGraphAlgorithm(input: GraphAlgorithmPolicyInput): GraphAlgorithmDecisionV1 {
	const maxHops = Math.max(0, input.envelope.maxGraphHops);
	const maxCandidates = Math.max(1, input.envelope.maxCandidates);
	const gpuBulk = Boolean(input.gpuAvailable && input.frozenSnapshotAvailable);

	let algorithm: GraphExpansionAlgorithm;
	let backend: GraphExpansionBackend;
	const reasonCodes: string[] = [];

	switch (input.intent) {
		case 'revision_lineage':
			algorithm = 'k_best_viterbi';
			backend = 'temporal_dp';
			reasonCodes.push('TEMPORAL_LINEAGE_INTENT');
			break;
		case 'dependency_path':
			algorithm = input.hasPositiveEdgeWeights ? 'sssp' : input.direction === 'in' ? 'reverse_bfs' : 'bfs';
			backend = gpuBulk ? 'cugraph' : 'neo4j';
			reasonCodes.push(input.hasPositiveEdgeWeights ? 'POSITIVE_EDGE_COSTS' : 'UNIT_HOP_COST');
			break;
		case 'alternative_paths':
			algorithm = input.hasTarget ? 'yen' : 'bfs';
			backend = 'neo4j';
			reasonCodes.push(input.hasTarget ? 'MULTIPLE_SOURCE_TARGET_PATHS' : 'TARGET_REQUIRED_FALLBACK_BFS');
			break;
		case 'authority':
			algorithm = 'personalized_pagerank';
			backend = gpuBulk ? 'cugraph' : 'neo4j';
			reasonCodes.push('QUERY_CONDITIONED_AUTHORITY');
			break;
		case 'community_context':
			algorithm = input.hasCommunityLabels ? 'leiden_filtered_bfs' : 'bfs';
			backend = 'neo4j';
			reasonCodes.push(input.hasCommunityLabels ? 'USE_PROMOTED_COMMUNITY_LABELS' : 'COMMUNITY_LABELS_UNAVAILABLE');
			break;
		case 'structural_core':
			algorithm = 'kcore';
			backend = gpuBulk ? 'cugraph' : 'networkx';
			reasonCodes.push('STRUCTURAL_CORE_INTENT');
			break;
		case 'similarity':
			algorithm = 'jaccard';
			backend = gpuBulk ? 'cugraph' : 'networkx';
			reasonCodes.push('BOUNDED_NEIGHBORHOOD_SIMILARITY');
			break;
		case 'explore':
			algorithm = 'neighbor_sampling';
			backend = gpuBulk ? 'cugraph' : 'neo4j';
			reasonCodes.push('BOUNDED_EXPLORATION');
			break;
		case 'neighborhood':
		default:
			algorithm = input.direction === 'in' ? 'reverse_bfs' : 'bfs';
			backend = gpuBulk ? 'cugraph' : 'neo4j';
			reasonCodes.push('LOCAL_NEIGHBORHOOD_INTENT');
	}

	if (maxHops === 0 && algorithm !== 'k_best_viterbi') {
		reasonCodes.push('ZERO_HOP_ENVELOPE');
	}
	if (gpuBulk) reasonCodes.push('GPU_FROZEN_SNAPSHOT_AVAILABLE');
	else reasonCodes.push('LIVE_OR_CPU_GRAPH_PATH');

	return {
		schemaVersion: 'atlas.graph-algorithm-decision.v1',
		algorithm,
		backend,
		reasonCodes,
		maxHops,
		maxCandidates,
		deterministic: true
	};
}
