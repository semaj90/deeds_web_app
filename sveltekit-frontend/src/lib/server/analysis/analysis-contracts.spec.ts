import { describe, expect, it } from 'vitest';
import { GraphAnalysisRunSchema } from '$lib/server/graph/graph-analysis-types.js';
import { ModelAnalysisRunSchema, ExperimentAnalysisRunSchema } from './model-analysis-types.js';
import { AnalysisRunBaseSchema } from './analysis-run-contract.js';
import { GraphAnalysisEngineSchema } from '$lib/server/graph/graph-analysis-contract.js';
import { SequenceModelRunSchema } from './sequence-model-contract.js';
import { VectorExperimentRunSchema } from './vector-experiment-contract.js';
import { AblationRunSchema } from './ablation-contract.js';
import { AnalysisPromotionDecisionSchema } from './promotion-decision-contract.js';
import { RepresentationExperimentRunSchema } from './representation-experiment-contract.js';
import {
  AnalysisPassResultSchema,
  AstUnitSchema,
  SemanticCodeCardSchema,
  HMMObservationSchema,
  ExperimentFeatureMatrixSchema,
  compileEventHypergraphBundle,
  compileExperimentFeatureMatrix,
} from './nlp-feature-compiler.js';
import { createModelAnalysisSidecarClient } from './model-analysis-sidecar.js';
import { createExperimentAnalysisSidecarClient } from './experiment-analysis-sidecar.js';
import { getRepresentationAnalysisService } from './representation-analysis-service.js';
import { getModelAnalysisService } from './model-analysis-service.js';
import { getExperimentAnalysisService } from './experiment-analysis-service.js';

describe('analysis contracts', () => {
  it('validates graph, model, and experiment run envelopes independently', () => {
    const now = '2026-08-09T00:00:00.000Z';

    expect(
      AnalysisRunBaseSchema.parse({
        runId: 'run:base:1',
        algorithm: 'pagerank',
        algorithmRevision: 'base-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'offline',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
      }),
    ).toMatchObject({ algorithm: 'pagerank', backendPreference: 'native-ts' });

    expect(
      GraphAnalysisRunSchema.parse({
        runId: 'run:graph:1',
        algorithm: 'pagerank',
        algorithmRevision: 'pagerank-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'offline',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        graphRevision: 'graph-v1',
        projectionRevision: 'projection-v1',
        projectionName: 'atlas_dependency_v1',
        nodeCount: 12,
        relationshipCount: 34,
      }),
    ).toMatchObject({ algorithm: 'pagerank', projectionName: 'atlas_dependency_v1' });

    expect(
      ModelAnalysisRunSchema.parse({
        runId: 'run:model:1',
        algorithm: 'hmm_section_classifier',
        algorithmRevision: 'hmm-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'native-ts',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        modelFamily: 'hmm',
        modelRevision: 'hmm-v1',
        corpusRevision: 'corpus-v1',
        sequenceLength: 3,
        observationCount: 3,
        stateCount: 7,
        decoderRevision: 'decoder-v1',
        trainable: false,
      }),
    ).toMatchObject({ algorithm: 'hmm_section_classifier', modelFamily: 'hmm' });

    expect(
      ExperimentAnalysisRunSchema.parse({
        runId: 'run:experiment:1',
        algorithm: 'experiment',
        algorithmRevision: 'exp-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'offline',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        experimentKind: 'parity',
        baselineRunId: null,
        candidateRunIds: ['run:model:1'],
        metricNames: ['mrr@10'],
        passCriteria: {},
        comparisonSummary: {},
      }),
    ).toMatchObject({ experimentKind: 'parity' });

    expect(GraphAnalysisEngineSchema.parse('neo4j-gds')).toBe('neo4j-gds');
    expect(
      SequenceModelRunSchema.parse({
        runId: 'run:sequence:1',
        algorithm: 'viterbi',
        algorithmRevision: 'seq-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'offline',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        modelFamily: 'hmm',
        modelRevision: 'model-v1',
        corpusRevision: null,
        sequenceLength: 3,
        observationCount: 3,
        stateCount: 2,
        decoderRevision: null,
        trainable: false,
      }),
    ).toMatchObject({ algorithm: 'viterbi' });

    expect(
      VectorExperimentRunSchema.parse({
        runId: 'run:vector:1',
        algorithm: 'length_squared_sampling',
        algorithmRevision: 'vec-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'gpu-sidecar',
        backendActual: 'offline',
        gpuAccelerated: true,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        vectorRevision: 'semantic-768-v1',
        sourceDimension: 768,
        targetDimension: 128,
        distanceMetric: 'l2',
        trainable: false,
      }),
    ).toMatchObject({ algorithm: 'length_squared_sampling', targetDimension: 128 });

    expect(
      AblationRunSchema.parse({
        runId: 'run:ablation:1',
        algorithm: 'ablation',
        algorithmRevision: 'abl-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'offline',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        baselineRunId: null,
        candidateRunIds: ['run:candidate'],
        metricNames: ['mrr@10'],
        passCriteria: {},
        comparisonSummary: {},
      }),
    ).toMatchObject({ algorithm: 'ablation' });

    expect(
      AnalysisPromotionDecisionSchema.parse({
        decisionId: 'decision:1',
        runId: 'run:ablation:1',
        decision: 'keep_experimental',
        reason: 'insufficient lift',
        reviewedAt: now,
        reviewer: null,
        targetFeatureSet: ['pagerankAuthority'],
        evidence: {},
      }),
    ).toMatchObject({ decision: 'keep_experimental' });

    expect(
      RepresentationExperimentRunSchema.parse({
        runId: 'run:repr:1',
        algorithm: 'representation_experiment',
        algorithmRevision: 'repr-v1',
        parameterRevision: 'params-v1',
        workspaceRevision: 'workspace-v1',
        sourceRevision: 'source-v1',
        startedAt: now,
        completedAt: null,
        status: 'running',
        parameters: {},
        metrics: {},
        backendPreference: 'native-ts',
        backendActual: 'offline',
        gpuAccelerated: false,
        sidecarUrl: null,
        inputHash: null,
        outputHash: null,
        experimentKind: 'retrieval_ablation',
        baselineRepresentation: 'semantic_768',
        candidateRepresentation: 'codebert_768',
        sourceDimension: 768,
        targetDimension: 768,
        metricNames: ['recall@5', 'mrr@10'],
        passCriteria: { todo: 'freeze gate later' },
        comparisonSummary: {},
      }),
    ).toMatchObject({ candidateRepresentation: 'codebert_768' });

    const passResults = [
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
        artifacts: { ast_units: [{ treeNodeId: 'node-1' }] },
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
        artifacts: { concepts: ['rerank', 'executor'] },
        evidence: [],
        warnings: [],
      }),
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
        artifacts: { semantic_cards: [{ symbol: 'rerankCandidates' }] },
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
        artifacts: { observations: [{ observation: 'EXACT_SYMBOL_FOUND' }] },
        evidence: [],
        warnings: [],
      }),
    ];

    const compiled = compileExperimentFeatureMatrix({
      requestId: 'req:1',
      packetKey: 'packet:1',
      sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
      sourceRevision: 'source-v1',
      passResults,
    });

    expect(compiled.control5.lexical_confidence).toBeGreaterThan(0.7);
    expect(compiled.matrix.dense_cosine).toBeGreaterThan(0.8);
    expect(compiled.matrix.passCount).toBe(4);
    expect(compiled.matrix.candidateId).toBe('packet:1');

    expect(
      AstUnitSchema.parse({
        sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
        sourceRevision: 'source-v1',
        treeNodeId: 'node-1',
        symbolVersionId: 'symbol-1',
        language: 'ts',
        nodeKind: 'function',
        qualifiedSymbol: 'rerankCandidates',
        byteStart: 0,
        byteEnd: 10,
        lineStart: 1,
        lineEnd: 2,
        parentSymbol: null,
        imports: ['zod'],
        exports: ['rerankCandidates'],
        calls: ['blendScores'],
        references: ['RuntimeReranker'],
        tests: ['src/lib/server/retrieval/canonical-rerank-executor.spec.ts'],
        comments: ['Canonical Rerank Executor'],
        docstrings: ['Keeps canonical rerank ownership'],
        parserEngine: 'tree-sitter',
        parserRevision: '1.0.0',
        grammarRevision: '1.0.0',
        chunker: 'treesitter-chunker',
        chunkerRevision: '1.0.0',
        structuralRevision: 'structural-v1',
        contentHash: 'content-1',
      }),
    ).toMatchObject({ qualifiedSymbol: 'rerankCandidates' });

    expect(
      SemanticCodeCardSchema.parse({
        sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
        sourceRevision: 'source-v1',
        treeNodeId: 'node-1',
        symbolVersionId: 'symbol-1',
        language: 'ts',
        symbol: 'rerankCandidates',
        kind: 'function',
        role: 'canonical reranking controller',
        calls: ['blendScores'],
        references: ['RuntimeReranker'],
        invariants: ['call-boundary-preserved'],
        excerpt: 'export function rerankCandidates() {}',
        lexicalFacts: ['rerank', 'executor'],
        linguisticFacts: ['canonical reranking controller'],
        structuralRevision: 'structural-v1',
        semanticCardRevision: 'semantic-card-v1',
        semanticRevision: 'semantic-768-v1',
        inputHash: 'input-1',
        outputHash: 'output-1',
      }),
    ).toMatchObject({ symbol: 'rerankCandidates' });

    expect(
      HMMObservationSchema.parse({
        requestId: 'req:1',
        packetKey: 'packet:1',
        sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
        sourceRevision: 'source-v1',
        position: 0,
        observation: 'EXACT_SYMBOL_FOUND',
        weight: 1,
        sourcePass: 'structural',
        stateHint: 'TRACE',
        createdAt: now,
        metadata: { entity_count: 1 },
      }),
    ).toMatchObject({ observation: 'EXACT_SYMBOL_FOUND' });

    expect(
      ExperimentFeatureMatrixSchema.parse({
        requestId: 'req:1',
        candidateId: 'packet:1',
        packetKey: 'packet:1',
        sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
        sourceRevision: 'source-v1',
        featureRevision: 'nlp-feature-compiler-v1',
        graphRevision: null,
        representationRevision: 'semantic-768-v1',
        dense_cosine: 0.88,
        bm25: 0.73,
        rrf: null,
        ast_match: 1,
        pagerank: null,
        cheirank: null,
        community_affinity: null,
        hop_distance: 1,
        kmeans_distance: null,
        som_distance: null,
        manifold_distance: null,
        cross_encoder_score: null,
        mixedbread_score: null,
        historical_execution_success: null,
        test_impact: null,
        reranker_score: null,
        control5: compiled.control5,
        features: {},
        passCount: 4,
        inputHash: 'input-a',
        outputHash: 'output-b',
      }),
    ).toMatchObject({ candidateId: 'packet:1' });

    const eventBundle = compileEventHypergraphBundle({
      requestId: 'req:1',
      packetKey: 'packet:1',
      sourceRef: 'src/lib/server/retrieval/canonical-rerank-executor.ts',
      sourceRevision: 'source-v1',
      workspaceRevision: 'workspace-v1',
      passResults,
      control5: compiled.control5,
      experimentFeatureMatrix: compiled.matrix,
    });

    expect(eventBundle.events.length).toBeGreaterThan(0);
    expect(eventBundle.ontologyEventTuples.length).toBeGreaterThan(0);
    expect(eventBundle.recommendationJudgment?.candidateKey).toBeTruthy();
  });

  it('falls back to the local model path when the sidecar is unavailable', async () => {
    const service = getModelAnalysisService(createModelAnalysisSidecarClient('http://127.0.0.1:65500'));
    const response = await service.section({
      text: 'decode hidden states with viterbi',
      workspaceRevision: 'workspace-v1',
      sourceRevision: 'source-v1',
      modelRevision: 'model-v1',
      parameterRevision: 'params-v1',
      sidecarUrl: 'http://127.0.0.1:65500',
    });

    expect(response.run.modelFamily).toBe('hmm');
    expect(response.run.sidecarUrl).toBe('http://127.0.0.1:65500');
    expect(response.result.sidecarUsed).toBe(false);
    expect(response.prediction.stateSequence.length).toBeGreaterThan(0);
  });

  it('keeps experiment comparison importable even before the promotion gate is wired', async () => {
    const service = getExperimentAnalysisService(createExperimentAnalysisSidecarClient('http://127.0.0.1:65501'));
    const response = await service.compare({
      workspaceRevision: 'workspace-v1',
      sourceRevision: 'source-v1',
      baselineRunId: 'run:baseline',
      candidateRunIds: ['run:candidate'],
      metricNames: ['recall@5', 'mrr@10'],
      experimentKind: 'ablation',
      sidecarUrl: 'http://127.0.0.1:65501',
    });

    expect(response.run.algorithm).toBe('experiment');
    expect(response.run.experimentKind).toBe('ablation');
    expect(response.summary.todo).toContain('promotion gate');
    expect(response.results).toHaveLength(2);
  });

  it('keeps representation experiments importable before promotion', async () => {
    const service = getRepresentationAnalysisService();
    const response = await service.compare({
      workspaceRevision: 'workspace-v1',
      sourceRevision: 'source-v1',
      candidateRepresentation: 'graphcodebert_768',
      sourceDimension: 768,
      targetDimension: 768,
      metricNames: ['boundary_preservation', 'recall@5'],
    });

    expect(response.run.algorithm).toBe('representation_experiment');
    expect(response.run.baselineRepresentation).toBe('semantic_768');
    expect(response.run.candidateRepresentation).toBe('graphcodebert_768');
    expect(response.summary.todo).toContain('promotion');
    expect(response.results).toHaveLength(2);
  });
});
