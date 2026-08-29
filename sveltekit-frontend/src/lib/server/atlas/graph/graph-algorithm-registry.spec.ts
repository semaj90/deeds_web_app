import { describe, expect, it } from 'vitest';
import { getGraphAlgorithmRegistryEntryV1 } from './graph-algorithm-registry.js';

describe('graph algorithm registry', () => {
	it('delegates graph algorithms to proven libraries', () => {
		expect(getGraphAlgorithmRegistryEntryV1('pagerank')).toMatchObject({ cpuBackend: 'NETWORKX', gpuBackend: 'CUGRAPH', executionOwner: 'LIBRARY' });
	});

	it('keeps closeness CPU-owned and k-truss projection-qualified', () => {
		expect(getGraphAlgorithmRegistryEntryV1('closeness').gpuBackend).toBeNull();
		expect(getGraphAlgorithmRegistryEntryV1('k_truss').projectionRequired).toBe('STRUCTURAL_AFFINITY');
	});

	it('registers vector challengers without making them identity owners', () => {
		expect(getGraphAlgorithmRegistryEntryV1('cagra')).toMatchObject({ gpuBackend: 'CUVS', output: 'VECTOR_NEIGHBORS' });
	});
});
