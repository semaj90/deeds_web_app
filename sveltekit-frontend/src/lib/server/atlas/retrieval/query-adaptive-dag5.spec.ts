import { describe, expect, it } from 'vitest';
import {
  adaptCandidateFeatureMatrixRowToQas,
  adaptSearchRuntimeCandidatesToQasRows,
  buildSearchRuntimeQasRows,
  compileQasCandidateFeatures,
  toQasSamplerCandidates,
} from './query-adaptive-feature-compiler.js';
import { buildCandidateFeatureMatrixRow } from '../contracts/feature-extraction-v1.js';
import { promoteQasCandidatesExact } from './query-adaptive-exact-promotion.js';
import { evaluateQueryAdaptiveSample } from './query-adaptive-evaluator.js';

const row = {
  canonicalId: 'symbol:one',
  packetKey: 'packet:one',
  symbolVersionId: 'symbol-version:one',
  sourceRef: 'src/one.ts',
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  graphRevision: 'graph:r1',
  featureRevision: 'features:r1',
  representationRevision: 'semantic_768:r1',
  taskKind: 'DEBUG',
  domainClass: 'retrieval',
  features: {
    semanticAffinity: 0.9,
    lexicalAffinity: 0.8,
    graphAuthority: 0.7,
    astAffinity: 0.6,
    processAffinity: 0.5,
    domainAffinity: 0.8,
    priorExecutionSuccess: 0.4,
    reuseProbability: 0.3,
    recency: 0.9,
  },
  evidenceRefs: ['evidence:one'],
};

describe('DAG-5 QAS contracts', () => {
  it('compiles revision-qualified rows without creating a new identity', () => {
    const [compiled] = compileQasCandidateFeatures({ requestId: 'request:one', policyRevision: 'policy:r1', candidates: [row] });
    expect(compiled.packetKey).toBe('packet:one');
    expect(compiled.canonicalId).toBe('symbol:one');
    expect(toQasSamplerCandidates([compiled])[0].packetKey).toBe('packet:one');
  });

  it('promotes only exact, revision-compatible evidence', async () => {
    const samples = [{ packetKey: 'packet:one', sourceRef: 'src/one.ts', symbolVersionId: 'symbol-version:one', proposalScore: 1, sampleRank: 1, exactPromotionRequired: true as const }];
    const [promoted] = await promoteQasCandidatesExact({
      samples,
      workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      resolve: async () => ({ canonicalId: 'symbol:one', packetKey: 'packet:one', sourceRef: 'src/one.ts', workspaceRevision: 'workspace:r1', representationRevision: 'semantic_768:r1', evidenceRefs: ['evidence:one'] }),
    });
    expect(promoted.state).toBe('EXACT_PROMOTED');
    expect(promoted.canonicalId).toBe('symbol:one');
  });

  it('evaluates bounded samples against an exact baseline', () => {
    const evaluation = evaluateQueryAdaptiveSample({
      baselineIds: ['a', 'b', 'c', 'd'],
      sampledIds: ['a', 'b'],
      exactPromotedIds: ['a', 'b'],
      budget: 2,
    });
    expect(evaluation.recallAt10).toBe(0.5);
    expect(evaluation.top1Preserved).toBe(true);
    expect(evaluation.candidateReduction).toBe(0.5);
  });

  it('adapts SearchRuntime candidates only when canonical identity and feature provenance exist', () => {
    const result = adaptSearchRuntimeCandidatesToQasRows({
      requestId: 'request:search-runtime',
      policyRevision: 'policy:r1',
      workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      candidates: [
        {
          packetKey: 'packet:one',
          sourceRef: 'src/one.ts',
          stableSymbolId: 'symbol:one',
          symbolVersionId: 'symbol-version:one',
          workspaceRevision: 'workspace:r1',
          sourceRevision: 'source:r1',
          fusionScore: 0.91,
          rankBefore: 1,
        },
        {
          packetKey: 'packet:legacy-only',
          sourceRef: 'src/legacy.ts',
          sourceRevision: 'source:r1',
        },
      ],
      resolveFeatures: (candidate) => candidate.packetKey === 'packet:one'
        ? {
          graphRevision: 'graph:r1',
          featureRevision: 'features:r1',
          representationRevision: 'semantic_768:r1',
          taskKind: 'DEBUG',
          domainClass: 'retrieval',
          features: row.features,
          evidenceRefs: ['feature:evidence:one'],
        }
        : null,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].canonicalId).toBe('symbol:one');
    expect(result.rows[0].packetKey).toBe('packet:one');
    expect(result.rows[0].representationRevision).toBe('semantic_768:r1');
    expect(result.rejected).toEqual([
      { packetKey: 'packet:legacy-only', reason: 'MISSING_CANONICAL_ID' },
    ]);
  });

  it('maps the existing 25-column feature owner without padding QAS dimensions', () => {
    const featureRow = buildCandidateFeatureMatrixRow({
      queryPacketKey: 'query:one',
      candidatePacketKey: 'packet:one',
      sourceRef: 'src/one.ts',
      sourceRevision: 'source:r1',
      workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      featureRevision: 'features:r1',
      semanticSimilarity768: 0.91,
      lexicalScore: 0.8,
      exactSymbolMatch: 0.7,
      astSignal: 0.6,
      authorityNorm: 0.5,
      communityFit: 0.4,
      domainFitQuery: 0.9,
      conceptFit: 0.4,
      naryRelationFit: 0.3,
      kmeansCentroidSimilarity: 0.2,
      kmeansClusterRank: 1,
      somDistance: 0.1,
      somNeighborRadius: 1,
      hilbertLocality: 0.2,
      summaryQuality: 0.7,
      summaryProvenance: 0.8,
      recency: 0.9,
      retrievalFrequency: 0.3,
      executionUtility: 0.6,
      graphDistance: 0.2,
      processFit: 0.5,
      dependencyFanout: 0.4,
      featureLabelConfidence: 0.8,
      sourceRevisionMatch: 1,
      representationRevisionMatch: 1,
    });

    const compiled = adaptCandidateFeatureMatrixRowToQas({
      requestId: 'request:matrix',
      policyRevision: 'policy:r1',
      graphRevision: 'graph:r1',
      taskKind: 'DEBUG',
      domainClass: 'retrieval',
      row: featureRow,
      canonicalId: 'symbol:one',
      symbolVersionId: 'symbol-version:one',
    });

    expect(compiled.features.processAffinity).toBe(0.5);
    expect(compiled.features.priorExecutionSuccess).toBe(0.6);
    expect(compiled.features.reuseProbability).toBe(0.3);
    expect(compiled.canonicalId).toBe('symbol:one');
  });

  it('calls the existing matrix builder and rejects incomplete feature presence', () => {
    const candidate = {
      packetKey: 'packet:one',
      sourceRef: 'src/one.ts',
      stableSymbolId: 'symbol:one',
      symbolVersionId: 'symbol-version:one',
      workspaceRevision: 'workspace:r1',
      sourceRevision: 'source:r1',
    };
    const result = buildSearchRuntimeQasRows({
      requestId: 'request:producer',
      policyRevision: 'policy:r1',
      workspaceRevision: 'workspace:r1',
      representationRevision: 'semantic_768:r1',
      candidates: [candidate],
      projections: [{
        packet_key: 'packet:one',
        semantic_similarity_768: 0.9,
        lexical_score: 0.8,
        ast_signal: 0.7,
        authority_norm: 0.6,
        domain_fit_query: 0.5,
        recency: 0.4,
        retrieval_frequency: 0.3,
        execution_utility: 0.2,
        process_fit: 0.1,
      }],
      resolveFeatures: () => ({
        graphRevision: 'graph:r1',
        featureRevision: 'features:r1',
        representationRevision: 'semantic_768:r1',
        taskKind: 'DEBUG',
        features: row.features,
      }),
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].features.processAffinity).toBeCloseTo(0.1, 6);
    expect(result.rejected).toHaveLength(0);
  });
});
