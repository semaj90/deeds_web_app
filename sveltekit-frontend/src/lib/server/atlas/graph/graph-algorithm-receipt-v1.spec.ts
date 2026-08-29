import { describe, expect, it } from 'vitest';
import { selectGraphAlgorithm } from './graph-algorithm-policy.js';
import { buildGraphAlgorithmExecutionReceiptV1 } from './graph-algorithm-receipt-v1.js';

describe('graph algorithm execution receipt', () => {
	it('binds policy, library, and graph revisions without execution', () => {
		const decision = selectGraphAlgorithm({
			intent: 'authority', direction: 'both', gpuAvailable: true, frozenSnapshotAvailable: true,
			envelope: { maxGraphHops: 2, maxCandidates: 32 } as never,
		});
		const receipt = buildGraphAlgorithmExecutionReceiptV1({
			decision,
			graphRevision: 'graph:sha256:g',
			workspaceRevision: 'sha256:w',
			graphOrdinalMapChecksum: 'sha256:gom',
			candidateOrdinalMapChecksum: 'sha256:com',
			algorithmLibraryRevision: 'cugraph:26.06.00',
		});
		expect(receipt).toMatchObject({ backend: 'cugraph', canonicalAuthority: false, writes: false });
	});

	it('rejects missing revision coordinates', () => {
		const decision = selectGraphAlgorithm({ intent: 'authority', direction: 'out', envelope: { maxGraphHops: 1, maxCandidates: 8 } as never });
		expect(() => buildGraphAlgorithmExecutionReceiptV1({ decision, graphRevision: '', workspaceRevision: 'w', graphOrdinalMapChecksum: 'g', algorithmLibraryRevision: 'networkx:3' })).toThrow('GRAPH_ALGORITHM_REVISION_BINDING_REQUIRED');
	});
});
