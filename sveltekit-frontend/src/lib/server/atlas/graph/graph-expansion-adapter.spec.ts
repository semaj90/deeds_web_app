import { describe, expect, it, vi } from 'vitest';
import { atlasToolRegistry } from '$lib/server/ace/atlas-tool-registry.js';

const graphDriver = vi.hoisted(() => ({
	session: vi.fn(() => ({
		run: vi.fn().mockResolvedValue({ records: [] }),
		close: vi.fn().mockResolvedValue(undefined),
	})),
}));

vi.mock('$lib/server/neo4j-driver.js', () => ({ getNeo4jDriver: () => graphDriver }));
import { expandAtlasGraph } from './graph-expansion-adapter.js';

describe('Parent Atlas bounded graph expansion adapter', () => {
	it('fails closed at a zero-hop resource boundary before touching Neo4j', async () => {
		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'neighborhood',
			maxHops: 4,
			resourceEnvelope: { maxGraphHops: 0 }
		});
		expect(result.status).toBe('BOUNDARY_EXHAUSTED');
		expect(result.nodes).toEqual([]);
		expect(result.edges).toEqual([]);
		expect(result.reasonCodes).toContain('ZERO_HOP_ENVELOPE');
		expect(result.executionStatus).toBe('BOUNDARY_EXHAUSTED');
		expect(result.effectiveBackend).toBeNull();
	});

	it('reports live Neo4j execution as unproven without a revision-bound receipt', async () => {
		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'neighborhood',
			maxHops: 2,
		});

		expect(result.executionStatus).toBe('EXECUTED');
		expect(result.requestedBackend).toBe('neo4j');
		expect(result.effectiveBackend).toBe('neo4j');
		expect(result.executionReceipt).toBeUndefined();
		expect(result.status).toBe('EXECUTED_UNPROVEN');
		const mcpOutput = atlasToolRegistry['atlas.graph.expand'].outputSchema.parse(result);
		expect(mcpOutput.status).toBe('EXECUTED_UNPROVEN');
		expect(mcpOutput.requestedBackend).toBe('neo4j');
		expect(mcpOutput.effectiveBackend).toBe('neo4j');
		expect(mcpOutput.executionStatus).toBe('EXECUTED');
		expect(mcpOutput.graphRevision).toBeNull();
	});

	it('fails closed when Neo4j errors and never claims a fallback executor', async () => {
		graphDriver.session.mockReturnValueOnce({
			run: vi.fn().mockRejectedValue(new Error('neo4j unavailable')),
			close: vi.fn().mockResolvedValue(undefined),
		});

		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'neighborhood',
			maxHops: 2,
		});

		expect(result.status).toBe('ALGORITHM_UNAVAILABLE');
		expect(result.nodes).toEqual([]);
		expect(result.edges).toEqual([]);
		expect(result.requestedBackend).toBe('neo4j');
		expect(result.effectiveBackend).toBe('neo4j');
		expect(result.executionStatus).toBe('FAILED');
		expect(result.fallbackReason).toBeNull();
		expect(result.reasonCodes).toContain('EXECUTION_FAILED:neo4j unavailable');
	});

	it('does not fake success for an SSSP route before the executor is wired', async () => {
		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'dependency_path',
			hasPositiveEdgeWeights: true,
			gpuAvailable: true,
			frozenSnapshotAvailable: true,
			maxHops: 3
		});
		expect(result.status).toBe('ALGORITHM_UNAVAILABLE');
		expect(result.decision.algorithm).toBe('sssp');
		expect(result.reasonCodes.some((code) => code.includes('EXECUTOR_NOT_WIRED'))).toBe(true);
		expect(result.requestedBackend).toBe('cugraph');
		expect(result.effectiveBackend).toBeNull();
		expect(result.executionStatus).toBe('UNAVAILABLE');
	});

	it('does not silently run Neo4j when cuGraph BFS is selected', async () => {
		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'dependency_path',
			hasPositiveEdgeWeights: false,
			gpuAvailable: true,
			frozenSnapshotAvailable: true,
			maxHops: 3
		});
		expect(result.status).toBe('ALGORITHM_UNAVAILABLE');
		expect(result.decision.algorithm).toBe('bfs');
		expect(result.decision.backend).toBe('cugraph');
		expect(result.requestedBackend).toBe('cugraph');
		expect(result.effectiveBackend).toBeNull();
		expect(result.executionStatus).toBe('UNAVAILABLE');
		expect(result.reasonCodes).toContain('EXECUTOR_NOT_WIRED:cugraph:bfs');
	});

	it('does not pretend Leiden filtering exists just because community labels exist', async () => {
		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'community_context',
			hasCommunityLabels: true,
			maxHops: 2
		});
		expect(result.status).toBe('ALGORITHM_UNAVAILABLE');
		expect(result.decision.algorithm).toBe('leiden_filtered_bfs');
	});

	it('keeps Viterbi lineage outside the graph database executor', async () => {
		const result = await expandAtlasGraph({
			packetKey: 'packet:a',
			intent: 'revision_lineage',
			maxHops: 2
		});
		expect(result.status).toBe('ALGORITHM_UNAVAILABLE');
		expect(result.decision.backend).toBe('temporal_dp');
		expect(result.decision.algorithm).toBe('k_best_viterbi');
		expect(result.requestedBackend).toBe('temporal_dp');
		expect(result.effectiveBackend).toBeNull();
		expect(result.executionStatus).toBe('UNAVAILABLE');
	});
});
