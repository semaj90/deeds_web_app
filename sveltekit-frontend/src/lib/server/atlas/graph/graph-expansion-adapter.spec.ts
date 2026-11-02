import { describe, expect, it } from 'vitest';
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
