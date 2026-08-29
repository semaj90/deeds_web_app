import type { GraphAlgorithmDecisionV1 } from './graph-algorithm-policy.js';
import { getGraphAlgorithmRegistryEntryV1 } from './graph-algorithm-registry.js';

export type GraphAlgorithmExecutionReceiptV1 = {
	schema: 'atlas.graph-algorithm-execution-receipt.v1';
	algorithm: GraphAlgorithmDecisionV1['algorithm'];
	backend: GraphAlgorithmDecisionV1['backend'];
	graphRevision: string;
	workspaceRevision: string;
	graphOrdinalMapChecksum: string;
	candidateOrdinalMapChecksum: string | null;
	algorithmLibraryRevision: string;
	parameters: Record<string, unknown>;
	deterministic: true;
	canonicalAuthority: false;
	writes: false;
};

/** Binds a policy decision to revisions; it does not execute graph work. */
export function buildGraphAlgorithmExecutionReceiptV1(input: {
	decision: GraphAlgorithmDecisionV1;
	graphRevision: string;
	workspaceRevision: string;
	graphOrdinalMapChecksum: string;
	candidateOrdinalMapChecksum?: string | null;
	algorithmLibraryRevision: string;
	parameters?: Record<string, unknown>;
}): GraphAlgorithmExecutionReceiptV1 {
	if (!input.graphRevision || !input.workspaceRevision || !input.graphOrdinalMapChecksum) {
		throw new Error('GRAPH_ALGORITHM_REVISION_BINDING_REQUIRED');
	}
	const registry = getGraphAlgorithmRegistryEntryV1(input.decision.algorithm as Parameters<typeof getGraphAlgorithmRegistryEntryV1>[0]);
	const backendName = input.decision.backend === 'cugraph' ? 'CUGRAPH' : input.decision.backend === 'networkx' ? 'NETWORKX' : null;
	if (backendName && registry.cpuBackend !== backendName && registry.gpuBackend !== backendName) {
		throw new Error(`GRAPH_ALGORITHM_BACKEND_NOT_REGISTERED:${input.decision.algorithm}:${input.decision.backend}`);
	}
	return {
		schema: 'atlas.graph-algorithm-execution-receipt.v1',
		algorithm: input.decision.algorithm,
		backend: input.decision.backend,
		graphRevision: input.graphRevision,
		workspaceRevision: input.workspaceRevision,
		graphOrdinalMapChecksum: input.graphOrdinalMapChecksum,
		candidateOrdinalMapChecksum: input.candidateOrdinalMapChecksum ?? null,
		algorithmLibraryRevision: input.algorithmLibraryRevision,
		parameters: input.parameters ?? {},
		deterministic: true,
		canonicalAuthority: false,
		writes: false,
	};
}
