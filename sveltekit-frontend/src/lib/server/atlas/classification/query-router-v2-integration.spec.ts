import { describe, expect, it } from 'vitest';
import { projectQueryFeaturesV1 } from './query-feature-projection-v1.js';
import { buildRetrievalRouterTensorV2, RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2 } from './retrieval-router-tensor-manifest-v2.js';
import { compileQueryRouterDatasetRowV2, deterministicQueryRouterSplitV1 } from './query-router-dataset-v2.js';
import { compileRetrievalExecutorPlanV2, DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2 } from './retrieval-executor-policy-v2.js';
import { QueryClassificationV2Schema } from './query-classification-v2.js';

function zero(width: number): number[] { return new Array(width).fill(0); }

describe('Parent Atlas query router v2 integration contracts', () => {
  it('freezes a 234-value tensor without mutating the v1 224-wide contract', () => {
    const queryFeatures = projectQueryFeaturesV1('debug GraphifyStructuralMaterializer Qdrant upsert failure');
    const tensor = buildRetrievalRouterTensorV2({
      classificationMrl128: [1, ...zero(127)],
      ontologyMask32: zero(32),
      queryFeatures,
      operationFlags16: zero(16),
      runtimeResource16: zero(16),
      graphToolStructure16: zero(16),
    });
    expect(RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2.width).toBe(234);
    expect(tensor).toHaveLength(234);
    expect(RETRIEVAL_ROUTER_TENSOR_MANIFEST_V2.queryFeatureOrder).toHaveLength(26);
  });

  it('assigns deterministic corpus splits and preserves classification lineage', () => {
    const source = {
      queryId: 'query:graphify-upsert-1',
      query: 'why does GraphifyStructuralMaterializer drop the qdrant vector',
      queryRevision: 'query-set.v1',
      labelRevision: 'labels.v1',
      embeddingModelId: 'google/embeddinggemma-300m' as const,
      embeddingModelRevision: 'embeddinggemma-rev-1',
      embeddingPromptRevision: 'embeddinggemma.task-prompts.google-v1',
      representationRevision: 'classification-mrl.v1',
      classification768: [1, ...zero(767)],
      ontologyMask32: zero(32),
      operationFlags16: zero(16),
      runtimeResource16: zero(16),
      graphToolStructure16: zero(16),
      domainLabel: 'retrieval' as const,
      operationLabel: 'debug' as const,
      retrievalNeeds: [1, 0.8, 0.2, 0.9, 0.9, 0.8, 1, 0.7],
      budgetTargets: [0.25, 0.33, 0.1],
      evidenceRefs: ['fixture:1'],
    };
    const first = compileQueryRouterDatasetRowV2(source);
    const second = compileQueryRouterDatasetRowV2(source);
    expect(first.split).toBe(deterministicQueryRouterSplitV1(source.queryId));
    expect(second.split).toBe(first.split);
    expect(second.rowDigest).toBe(first.rowDigest);
    expect(first.featureTensor234).toHaveLength(234);
    expect(first.representationId).toBe('classification_mrl_128');
  });

  it('does not select configured-but-unproven semantic executors', () => {
    const classification = QueryClassificationV2Schema.parse({
      schema: 'atlas.query-classification.v2',
      requestId: 'r1', workspaceRevision: 'w1', classificationRevision: 'c1', routerFeatureRevision: 'f2', classifierModelRevision: 'm1', calibrationRevision: 'cal1',
      domain: [{ label: 'retrieval', probability: 1 }],
      operation: [{ operation: 'find', probability: 1 }],
      structuralIntent: { function:0, call:0, symbol:0, type:0, route:0, databaseCall:0, config:0 },
      retrievalNeed: { lexical:0.1, semantic:0.95, ast:0.1, graph:0.1, exactSymbol:0.1 },
      expectedDepth: { graphHops:0, candidateBudget:256, rerankBudget:0 },
      confidence:0.9, entropy:0.1, abstained:false, evidenceRefs:[], canonicalWritesAllowed:false, retrievalVoteAdded:false,
    });
    const plan = compileRetrievalExecutorPlanV2({
      classification,
      semanticRepresentation: 'semantic_512',
      envelope: { gpuAvailable:true, allowGpuAnn:true, allowDiskAnn:true, allowSparseNeural:true, allowReranker:false, maxCandidates:512, maxGraphHops:2 },
      capabilities: DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2,
    });
    expect(plan.semantic).toEqual([]);
    expect(plan.decisions).toContain('semantic_requested_but_no_proven_executor');
    expect(plan.oneVotePerLogicalLane).toBe(true);
  });

  it('uses the same executor identity for 512 and 768 when capability proof supports both', () => {
    const classification = QueryClassificationV2Schema.parse({
      schema: 'atlas.query-classification.v2',
      requestId:'r2', workspaceRevision:'w1', classificationRevision:'c1', routerFeatureRevision:'f2', classifierModelRevision:'m1', calibrationRevision:'cal1',
      domain:[{label:'retrieval',probability:1}], operation:[{operation:'find',probability:1}],
      structuralIntent:{function:0,call:0,symbol:0,type:0,route:0,databaseCall:0,config:0},
      retrievalNeed:{lexical:0,semantic:1,ast:0,graph:0,exactSymbol:0}, expectedDepth:{graphHops:0,candidateBudget:128,rerankBudget:0},
      confidence:1, entropy:0, abstained:false, evidenceRefs:[], canonicalWritesAllowed:false, retrievalVoteAdded:false,
    });
    const caps = DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2.map((cap) => cap.id === 'qdrant_hnsw' ? { ...cap, status:'PROVEN_AVAILABLE' as const } : cap);
    const p512 = compileRetrievalExecutorPlanV2({ classification, semanticRepresentation:'semantic_512', envelope:{gpuAvailable:false,allowGpuAnn:false,allowDiskAnn:false,allowSparseNeural:false,allowReranker:false,maxCandidates:128,maxGraphHops:0}, capabilities:caps });
    const p768 = compileRetrievalExecutorPlanV2({ classification, semanticRepresentation:'semantic_768', envelope:{gpuAvailable:false,allowGpuAnn:false,allowDiskAnn:false,allowSparseNeural:false,allowReranker:false,maxCandidates:128,maxGraphHops:0}, capabilities:caps });
    expect(p512.semantic).toContain('qdrant_hnsw');
    expect(p768.semantic).toContain('qdrant_hnsw');
    expect(p512.semanticRepresentation).toBe('semantic_512');
    expect(p768.semanticRepresentation).toBe('semantic_768');
  });
});
