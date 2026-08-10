import { describe, expect, it } from 'vitest';
import { compileExperimentFeatureMatrix, AnalysisPassResultSchema } from './nlp-feature-compiler';

const now = '2026-08-09T00:00:00.000Z';

const passResults = [
	AnalysisPassResultSchema.parse({
		requestId: 'req:1',
		packetKey: 'packet:1',
		sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
		sourceRevision: 'source-v1',
		family: 'semantic',
		passName: 'semantic_card',
		passRevision: 'semantic-v1',
		backend: 'embeddinggemma',
		backendVersion: '1.0.0',
		device: 'cpu',
		inputHash: 'input-3',
		outputHash: 'output-3',
		startedAt: now,
		completedAt: now,
		status: 'succeeded',
		features: { dense_cosine: 0.88, semantic_confidence: 0.86 },
		artifacts: {},
		evidence: [],
		warnings: [],
	}),
	AnalysisPassResultSchema.parse({
		requestId: 'req:1',
		packetKey: 'packet:1',
		sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
		sourceRevision: 'source-v1',
		family: 'lexical',
		passName: 'lexical_terms',
		passRevision: 'lexical-v1',
		backend: 'regex',
		backendVersion: '1.0.0',
		device: 'cpu',
		inputHash: 'input-2',
		outputHash: 'output-2',
		startedAt: now,
		completedAt: now,
		status: 'succeeded',
		features: { bm25: 0.73, lexical_confidence: 0.8 },
		artifacts: {},
		evidence: [],
		warnings: [],
	}),
	AnalysisPassResultSchema.parse({
		requestId: 'req:1',
		packetKey: 'packet:1',
		sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
		sourceRevision: 'source-v1',
		family: 'structural',
		passName: 'treesitter_chunk',
		passRevision: 'treesitter-chunker-v1',
		backend: 'treesitter-chunker',
		backendVersion: '1.0.0',
		device: 'cpu',
		inputHash: 'input-1',
		outputHash: 'output-1',
		startedAt: now,
		completedAt: now,
		status: 'succeeded',
		features: { ast_match: 1, structural_confidence: 0.9 },
		artifacts: {},
		evidence: [],
		warnings: [],
	}),
	AnalysisPassResultSchema.parse({
		requestId: 'req:1',
		packetKey: 'packet:1',
		sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
		sourceRevision: 'source-v1',
		family: 'sequence',
		passName: 'hmm_observations',
		passRevision: 'sequence-v1',
		backend: 'hmmlearn',
		backendVersion: '1.0.0',
		device: 'cpu',
		inputHash: 'input-4',
		outputHash: 'output-4',
		startedAt: now,
		completedAt: now,
		status: 'succeeded',
		features: { hop_distance: 1, execution_confidence: 0.67 },
		artifacts: {},
		evidence: [],
		warnings: [],
	}),
];

describe('compileExperimentFeatureMatrix', () => {
	it('is independent of shuffled async completion order', () => {
		const forward = compileExperimentFeatureMatrix({
			requestId: 'req:1',
			sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
			sourceRevision: 'source-v1',
			passResults,
		});
		const reversed = compileExperimentFeatureMatrix({
			requestId: 'req:1',
			sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
			sourceRevision: 'source-v1',
			passResults: [...passResults].reverse(),
		});

		expect(forward.matrix).toEqual(reversed.matrix);
		expect(forward.control5).toEqual(reversed.control5);
		expect(forward.matrix.passCount).toBe(4);
	});

	it('rejects duplicate pass contributions for the same identity', () => {
		expect(() =>
			compileExperimentFeatureMatrix({
				requestId: 'req:1',
				sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
				sourceRevision: 'source-v1',
				passResults: [...passResults, passResults[0]],
			}),
		).toThrow(/duplicate analysis pass result/i);
	});
});
