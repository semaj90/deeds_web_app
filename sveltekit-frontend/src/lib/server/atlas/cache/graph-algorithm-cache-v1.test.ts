import { describe, expect, it } from 'vitest';
import {
	buildGraphAlgorithmCacheKeyV1,
	buildWarmLoadGraphProjectionDescriptorV1,
	canReuseGraphAlgorithmArtifactV1,
	resolveSharedGraphAlgorithmArtifactV1,
	type GraphAlgorithmArtifactRecordV1,
	type GraphAlgorithmCacheKeyV1Input,
	type GraphExecutorParityProofV1,
} from './graph-algorithm-cache-v1.js';

describe('graph-algorithm-cache-v1', () => {
	const sampleOrdinalChecksum = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
	const sampleResultHash = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';

	const pagerankInput: GraphAlgorithmCacheKeyV1Input = {
		canonicalGraphRevision: 'graph-rev-42',
		algorithm: 'pagerank',
		algorithmRevision: 'cugraph-pagerank-v1',
		parameterRevision: 'alpha-0.85-tol-1e-6',
		parameters: { alpha: 0.85, maxIter: 100 },
	};

	const pprInput: GraphAlgorithmCacheKeyV1Input = {
		canonicalGraphRevision: 'graph-rev-42',
		algorithm: 'ppr',
		algorithmRevision: 'cugraph-ppr-v1',
		parameterRevision: 'alpha-0.85-source-chunk42',
		parameters: { alpha: 0.85, sourceNode: 'chunk:42' },
	};

	it('builds deterministic, algorithm-specific cache keys', () => {
		const key1 = buildGraphAlgorithmCacheKeyV1(pagerankInput);
		const key2 = buildGraphAlgorithmCacheKeyV1(pagerankInput);
		const pprKey = buildGraphAlgorithmCacheKeyV1(pprInput);

		expect(key1).toBe(key2);
		expect(key1.startsWith('atlas:graph-cache:v1:pagerank:')).toBe(true);
		expect(pprKey.startsWith('atlas:graph-cache:v1:ppr:')).toBe(true);
		expect(key1).not.toBe(pprKey);
	});

	it('preserves parameter independence: changing PPR parameter does not invalidate PageRank key', () => {
		const pageRankBase = buildGraphAlgorithmCacheKeyV1(pagerankInput);

		const updatedPprInput: GraphAlgorithmCacheKeyV1Input = {
			...pprInput,
			parameters: { alpha: 0.9, sourceNode: 'chunk:42' },
			parameterRevision: 'alpha-0.90-source-chunk42',
		};

		const pprBase = buildGraphAlgorithmCacheKeyV1(pprInput);
		const pprUpdated = buildGraphAlgorithmCacheKeyV1(updatedPprInput);

		expect(pprBase).not.toBe(pprUpdated);
		// PageRank key remains 100% stable
		expect(buildGraphAlgorithmCacheKeyV1(pagerankInput)).toBe(pageRankBase);
	});

	it('validates reuse against exact proven status, ordinal checksum, and revisions', () => {
		const key = buildGraphAlgorithmCacheKeyV1(pagerankInput);
		const artifact: GraphAlgorithmArtifactRecordV1 = {
			schema: 'atlas.graph-algorithm-artifact.v1',
			cacheKey: key,
			algorithm: 'pagerank',
			canonicalGraphRevision: 'graph-rev-42',
			ordinalMapChecksum: sampleOrdinalChecksum,
			algorithmRevision: 'cugraph-pagerank-v1',
			parameterRevision: 'alpha-0.85-tol-1e-6',
			resultHash: sampleResultHash,
			arrowArtifactRef: 'docs/artifacts/graph/pagerank-graph42-v1.arrow',
			byteSize: 2048576,
			residency: 'WARM_LOCAL',
			status: 'proven',
			canonicalAuthority: false,
			writesPerformed: false,
		};

		expect(
			canReuseGraphAlgorithmArtifactV1(pagerankInput, artifact, {
				expectedOrdinalMapChecksum: sampleOrdinalChecksum,
			}),
		).toBe(true);

		// Rejects on ordinal map drift
		expect(
			canReuseGraphAlgorithmArtifactV1(pagerankInput, artifact, {
				expectedOrdinalMapChecksum: 'sha256:drifted_ordinal_map_checksum_value',
			}),
		).toBe(false);

		// Rejects if status is not proven
		expect(
			canReuseGraphAlgorithmArtifactV1(pagerankInput, { ...artifact, status: 'partial' }, {
				expectedOrdinalMapChecksum: sampleOrdinalChecksum,
			}),
		).toBe(false);
	});

	it('generates warm-load descriptor for Arrow/mmap projection without JSON float serialization', () => {
		const key = buildGraphAlgorithmCacheKeyV1(pagerankInput);
		const artifact: GraphAlgorithmArtifactRecordV1 = {
			schema: 'atlas.graph-algorithm-artifact.v1',
			cacheKey: key,
			algorithm: 'pagerank',
			canonicalGraphRevision: 'graph-rev-42',
			ordinalMapChecksum: sampleOrdinalChecksum,
			algorithmRevision: 'cugraph-pagerank-v1',
			parameterRevision: 'alpha-0.85-tol-1e-6',
			resultHash: sampleResultHash,
			arrowArtifactRef: 'docs/artifacts/graph/pagerank-graph42-v1.arrow',
			byteSize: 2048576,
			residency: 'WARM_LOCAL',
			status: 'proven',
			canonicalAuthority: false,
			writesPerformed: false,
		};

		const descriptor = buildWarmLoadGraphProjectionDescriptorV1(artifact, true);
		expect(descriptor.schema).toBe('atlas.warm-load-graph-projection.v1');
		expect(descriptor.arrowArtifactRef).toBe('docs/artifacts/graph/pagerank-graph42-v1.arrow');
		expect(descriptor.byteSize).toBe(2048576);
		expect(descriptor.mmapSafe).toBe(true);
		expect(descriptor.vramPinned).toBe(true);
		expect(descriptor.targetResidency).toBe('GPU_VRAM');
	});

	it('allows NetworkX and cuGraph to share one logical artifact only after parity gates pass', () => {
		const validParityProof: GraphExecutorParityProofV1 = {
			schema: 'atlas.graph-executor-parity-proof.v1',
			canonicalGraphRevision: 'graph-rev-42',
			algorithm: 'pagerank',
			primaryExecutor: 'networkx',
			secondaryExecutor: 'cugraph',
			maxAbsoluteError: 1e-6,
			meanAbsoluteError: 2e-7,
			spearmanCorrelation: 0.9998,
			topKOverlap: 1.0,
			maxAllowedMae: 1e-5,
			minRequiredCorrelation: 0.999,
			parityPassed: true,
		};

		const nxResolution = resolveSharedGraphAlgorithmArtifactV1({
			cacheInput: pagerankInput,
			executor: 'networkx',
			parityProofs: [validParityProof],
		});

		const cuGraphResolution = resolveSharedGraphAlgorithmArtifactV1({
			cacheInput: pagerankInput,
			executor: 'cugraph',
			parityProofs: [validParityProof],
		});

		// Both share identical canonical logical key when parity passes
		expect(nxResolution.sharedAcrossExecutors).toBe(true);
		expect(cuGraphResolution.sharedAcrossExecutors).toBe(true);
		expect(nxResolution.effectiveKey).toBe(cuGraphResolution.effectiveKey);
		expect(nxResolution.laneVotes).toBe(1);
		expect(cuGraphResolution.laneVotes).toBe(1);
	});

	it('isolates unproven executor when parity has not passed or failed', () => {
		const failedParityProof: GraphExecutorParityProofV1 = {
			schema: 'atlas.graph-executor-parity-proof.v1',
			canonicalGraphRevision: 'graph-rev-42',
			algorithm: 'pagerank',
			primaryExecutor: 'networkx',
			secondaryExecutor: 'neo4j_gds',
			maxAbsoluteError: 0.05, // Exceeds tolerance
			meanAbsoluteError: 0.01,
			spearmanCorrelation: 0.85,
			topKOverlap: 0.6,
			maxAllowedMae: 1e-5,
			minRequiredCorrelation: 0.999,
			parityPassed: false, // Parity gate failed!
		};

		const neo4jResolution = resolveSharedGraphAlgorithmArtifactV1({
			cacheInput: pagerankInput,
			executor: 'neo4j_gds',
			parityProofs: [failedParityProof],
		});

		expect(neo4jResolution.sharedAcrossExecutors).toBe(false);
		expect(neo4jResolution.effectiveKey).toContain(':isolated:neo4j_gds');
		// Executor != lane vote: still exactly 1 vote in fusion
		expect(neo4jResolution.laneVotes).toBe(1);
	});
});
