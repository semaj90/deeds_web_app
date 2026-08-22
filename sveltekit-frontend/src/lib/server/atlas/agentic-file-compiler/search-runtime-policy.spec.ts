import { describe, expect, it } from 'vitest';
import { chooseSemanticExecutor } from './search-runtime-policy.js';

const base = {
	representation: 'semantic_768' as const,
	exactness: 'APPROXIMATE_ALLOWED' as const,
	corpusResidency: 'GPU_HOT' as const,
	gpuAvailable: true,
	freeVramBytes: 2_000_000_000,
	minFreeVramBytes: 512_000_000,
	diskAnnAvailable: true,
	qdrantAvailable: true,
	cagraAvailable: true,
	cuVsExactAvailable: true,
};

describe('semantic runtime policy', () => {
	it('uses CAGRA for a hot GPU shard but preserves one semantic vote', () => {
		const decision = chooseSemanticExecutor(base);
		expect(decision.executor).toBe('CAGRA');
		expect(decision.voteKey).toBe('semantic');
	});

	it('uses DiskANN for cold NVMe corpus', () => {
		const decision = chooseSemanticExecutor({ ...base, corpusResidency: 'NVME_COLD' });
		expect(decision.executor).toBe('DISKANN');
		expect(decision.voteKey).toBe('semantic');
	});

	it('forces cuVS exact when exactness is required', () => {
		const decision = chooseSemanticExecutor({ ...base, exactness: 'REQUIRED' });
		expect(decision.executor).toBe('CUVS_EXACT');
	});
});
