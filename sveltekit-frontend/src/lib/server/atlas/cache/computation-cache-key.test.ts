import { describe, expect, it } from 'vitest';

import {
	buildComputationCacheKey,
	buildComputationInputHash,
	canReuseComputation,
	type ComputationArtifactReceiptV1,
	type ComputationCacheDescriptorV1,
} from './computation-cache-key.js';

function descriptor(overrides: Partial<ComputationCacheDescriptorV1> = {}): ComputationCacheDescriptorV1 {
	return {
		schema: 'atlas.computation-cache-descriptor.v1',
		stage: 'cross_encoder',
		producerRevision: 'cross-encoder-runtime-v1',
		revisions: {
			workspace: 'workspace:42',
			source: 'source:7',
			feature: 'feature:3',
			model: 'mxbai-rerank-base-v2@sha256:model',
		},
		dependencyRefs: ['candidate:b', 'candidate:a'],
		parameters: { maxLength: 512 },
		numericContractRevision: 'fp16-cuda-parity-v1',
		...overrides,
	};
}

function provenReceipt(input: ComputationCacheDescriptorV1): ComputationArtifactReceiptV1 {
	return {
		schema: 'atlas.computation-artifact-receipt.v1',
		artifactId: 'artifact:cross-encoder:fixture-1',
		cacheKey: buildComputationCacheKey(input),
		stage: input.stage,
		dependencyRefs: [...input.dependencyRefs],
		inputHash: buildComputationInputHash(input),
		artifactRef: 'arrow://cross-encoder/fixture-1',
		artifactHash: 'sha256:abc',
		producerRevision: input.producerRevision,
		numericContractRevision: input.numericContractRevision ?? null,
		status: 'proven',
		durationMs: 12.5,
		byteLength: 128,
		runtime: 'node:test',
		createdAt: '2026-08-17T12:00:00.000Z',
		proofRefs: ['proof:fixture-1'],
	};
}

describe('computation-cache-key', () => {
	it('is stable across dependency order and parameter key order', () => {
		const left = descriptor();
		const right = descriptor({
			dependencyRefs: ['candidate:a', 'candidate:b', 'candidate:a'],
			parameters: { maxLength: 512 },
		});

		expect(buildComputationCacheKey(left)).toBe(buildComputationCacheKey(right));
	});

	it('changes only when a real stage dependency/revision/parameter changes', () => {
		const base = buildComputationCacheKey(descriptor());
		const changedModel = buildComputationCacheKey(descriptor({
			revisions: { ...descriptor().revisions, model: 'mxbai-rerank-base-v2@sha256:new-model' },
		}));
		const changedCandidate = buildComputationCacheKey(descriptor({
			dependencyRefs: ['candidate:a', 'candidate:c'],
		}));
		const changedMaxLength = buildComputationCacheKey(descriptor({ parameters: { maxLength: 1024 } }));

		expect(changedModel).not.toBe(base);
		expect(changedCandidate).not.toBe(base);
		expect(changedMaxLength).not.toBe(base);
	});

	it('only reuses exact PROVEN receipts with matching input hash', () => {
		const input = descriptor();
		const receipt = provenReceipt(input);

		expect(canReuseComputation(input, receipt)).toBe(true);
		expect(canReuseComputation(input, { ...receipt, status: 'partial' })).toBe(false);
		expect(canReuseComputation(input, { ...receipt, cacheKey: `${receipt.cacheKey}:stale` })).toBe(false);
		expect(canReuseComputation(input, { ...receipt, inputHash: 'sha256:stale' })).toBe(false);
	});

	it('supports SVD/subspace stages without treating them as retrieval lanes', () => {
		const subspace = descriptor({
			stage: 'feature_subspace_fit',
			producerRevision: 'svd-fit-v1',
			dependencyRefs: ['feature-matrix:sha256:abc'],
			revisions: { workspace: 'workspace:42', feature: 'feature:static-v1' },
			parameters: { rankK: 16, centering: true },
			numericContractRevision: 'torch-svd-cpu-cuda-parity-v1',
		});
		expect(buildComputationCacheKey(subspace)).toContain(':feature_subspace_fit:');
	});
});
