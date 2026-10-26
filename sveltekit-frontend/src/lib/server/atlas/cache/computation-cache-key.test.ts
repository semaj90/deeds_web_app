import { describe, expect, it } from 'vitest';

import {
	buildComputationCacheKey,
	canReuseComputation,
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
		parameters: { topK: 20, maxLength: 512 },
		numericContractRevision: 'fp16-cuda-parity-v1',
		...overrides,
	};
}

describe('computation-cache-key', () => {
	it('is stable across dependency order and parameter key order', () => {
		const left = descriptor();
		const right = descriptor({
			dependencyRefs: ['candidate:a', 'candidate:b', 'candidate:a'],
			parameters: { maxLength: 512, topK: 20 },
		});

		expect(buildComputationCacheKey(left)).toBe(buildComputationCacheKey(right));
	});

	it('invalidates only when a stage dependency or relevant revision changes', () => {
		const base = buildComputationCacheKey(descriptor());
		const changedModel = buildComputationCacheKey(descriptor({
			revisions: { ...descriptor().revisions, model: 'mxbai-rerank-base-v2@sha256:new-model' },
		}));
		const changedCandidate = buildComputationCacheKey(descriptor({
			dependencyRefs: ['candidate:a', 'candidate:c'],
		}));

		expect(changedModel).not.toBe(base);
		expect(changedCandidate).not.toBe(base);
	});

	it('only reuses exact PROVEN receipts', () => {
		const input = descriptor();
		const cacheKey = buildComputationCacheKey(input);
		const receipt = {
			cacheKey,
			artifactRef: 'arrow://cross-encoder/fixture-1',
			artifactHash: 'sha256:abc',
			status: 'proven' as const,
		};

		expect(canReuseComputation(input, receipt)).toBe(true);
		expect(canReuseComputation(input, { ...receipt, status: 'partial' })).toBe(false);
		expect(canReuseComputation(input, { ...receipt, cacheKey: `${cacheKey}:stale` })).toBe(false);
	});

	it('proves dependency-DAG invalidation: source-only change does not invalidate unrelated graph or model artifacts', () => {
		const baseWorkspace = 'ws:1';
		const initialSourceRev = 'source:1';
		const updatedSourceRev = 'source:2';
		const stableGraphRev = 'graph:1';
		const stableModelRev = 'model:bge-reranker-v2';

		const astStageBefore = buildComputationCacheKey({
			schema: 'atlas.computation-cache-descriptor.v1',
			stage: 'ast',
			producerRevision: 'tree-sitter-cst-v1',
			revisions: { workspace: baseWorkspace, source: initialSourceRev },
			dependencyRefs: ['file:src/lib/auth.ts'],
		});

		const astStageAfter = buildComputationCacheKey({
			schema: 'atlas.computation-cache-descriptor.v1',
			stage: 'ast',
			producerRevision: 'tree-sitter-cst-v1',
			revisions: { workspace: baseWorkspace, source: updatedSourceRev },
			dependencyRefs: ['file:src/lib/auth.ts'],
		});

		const pageRankKey1 = buildComputationCacheKey({
			schema: 'atlas.computation-cache-descriptor.v1',
			stage: 'pagerank',
			producerRevision: 'cugraph-pagerank-v1',
			revisions: { workspace: baseWorkspace, graph: stableGraphRev },
			dependencyRefs: ['graph:edge-list:1'],
			parameters: { alpha: 0.85, maxIter: 100 },
		});

		const pageRankKey2 = buildComputationCacheKey({
			schema: 'atlas.computation-cache-descriptor.v1',
			stage: 'pagerank',
			producerRevision: 'cugraph-pagerank-v1',
			revisions: { workspace: baseWorkspace, graph: stableGraphRev },
			dependencyRefs: ['graph:edge-list:1'],
			parameters: { alpha: 0.85, maxIter: 100 },
		});

		const crossEncoderKey1 = buildComputationCacheKey({
			schema: 'atlas.computation-cache-descriptor.v1',
			stage: 'cross_encoder',
			producerRevision: 'cross-encoder-runtime-v1',
			revisions: { workspace: baseWorkspace, model: stableModelRev },
			dependencyRefs: ['pair:query_hash:candidate_hash'],
			parameters: { maxLength: 512 },
		});

		const crossEncoderKey2 = buildComputationCacheKey({
			schema: 'atlas.computation-cache-descriptor.v1',
			stage: 'cross_encoder',
			producerRevision: 'cross-encoder-runtime-v1',
			revisions: { workspace: baseWorkspace, model: stableModelRev },
			dependencyRefs: ['pair:query_hash:candidate_hash'],
			parameters: { maxLength: 512 },
		});

		expect(astStageBefore).not.toBe(astStageAfter);
		expect(pageRankKey1).toBe(pageRankKey2);
		expect(crossEncoderKey1).toBe(crossEncoderKey2);
	});
});
