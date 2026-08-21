import { describe, expect, it } from 'vitest';

import { QueryClassificationV2Schema, compileRetrievalPlanV1 } from './query-classification-v2.js';
import { RETRIEVAL_ROUTER_TENSOR_MANIFEST_V1 } from './retrieval-router-tensor-manifest-v1.js';
import { assertXgboostSoftprobOutputV2 } from './xgboost-query-router-v2-contract.js';

describe('QueryClassificationV2 and RetrievalPlanV1', () => {
  it('freezes the 224-wide router tensor ordering', () => {
    expect(RETRIEVAL_ROUTER_TENSOR_MANIFEST_V1.width).toBe(224);
    expect(RETRIEVAL_ROUTER_TENSOR_MANIFEST_V1.sections).toEqual([
      { name: 'classification_mrl_128', offset: 0, width: 128 },
      { name: 'ontology_mask', offset: 128, width: 32 },
      { name: 'query_shape', offset: 160, width: 16 },
      { name: 'operation_flags', offset: 176, width: 16 },
      { name: 'runtime_resource', offset: 192, width: 16 },
      { name: 'graph_tool_structure', offset: 208, width: 16 },
    ]);
  });

  it('compiles an exact-symbol debugging request into bounded multi-lane work', () => {
    const classification = QueryClassificationV2Schema.parse({
      schema: 'atlas.query-classification.v2',
      requestId: 'r1',
      workspaceRevision: 'w1',
      classificationRevision: 'cls-v2',
      routerFeatureRevision: 'atlas.retrieval-router-tensor.v1',
      classifierModelRevision: 'xgb-v2',
      calibrationRevision: 'cal-v1',
      domain: [{ label: 'retrieval', probability: 0.94 }, { label: 'graph', probability: 0.06 }],
      operation: [{ operation: 'debug', probability: 0.92 }, { operation: 'find', probability: 0.08 }],
      structuralIntent: { function: 0.9, call: 0.8, symbol: 0.98, type: 0.3, route: 0.2, databaseCall: 0.7, config: 0.2 },
      retrievalNeed: { lexical: 0.97, semantic: 0.82, ast: 0.95, graph: 0.8, exactSymbol: 0.98 },
      expectedDepth: { graphHops: 2, candidateBudget: 128, rerankBudget: 25 },
      confidence: 0.94,
      entropy: 0.15,
      abstained: false,
      evidenceRefs: ['query:r1'],
      canonicalWritesAllowed: false,
      retrievalVoteAdded: false,
    });
    const plan = compileRetrievalPlanV1(classification);
    expect(plan.lexicalEnabled).toBe(true);
    expect(plan.semanticEnabled).toBe(true);
    expect(plan.astEnabled).toBe(true);
    expect(plan.graphEnabled).toBe(true);
    expect(plan.exactSymbolPreferred).toBe(true);
    expect(plan.sparseStrategy).toBe('postgres_fts');
    expect(plan.semanticTopK).toBe(128);
    expect(plan.graphHops).toBe(2);
    expect(plan.rerankTopK).toBe(25);
    expect(plan.exactPromotionRequired).toBe(true);
  });

  it('broadens semantic recall when the classifier abstains', () => {
    const classification = QueryClassificationV2Schema.parse({
      schema: 'atlas.query-classification.v2', requestId: 'r2', workspaceRevision: 'w1',
      classificationRevision: 'cls-v2', routerFeatureRevision: 'atlas.retrieval-router-tensor.v1',
      classifierModelRevision: 'xgb-v2', calibrationRevision: 'cal-v1',
      domain: [{ label: 'unknown', probability: 1 }], operation: [{ operation: 'unknown', probability: 1 }],
      structuralIntent: { function: 0, call: 0, symbol: 0, type: 0, route: 0, databaseCall: 0, config: 0 },
      retrievalNeed: { lexical: 0.2, semantic: 0.2, ast: 0.2, graph: 0.2, exactSymbol: 0.1 },
      expectedDepth: { graphHops: 1, candidateBudget: 64, rerankBudget: 10 },
      confidence: 0.3, entropy: 1, abstained: true, evidenceRefs: [],
      canonicalWritesAllowed: false, retrievalVoteAdded: false,
    });
    const plan = compileRetrievalPlanV1(classification);
    expect(plan.semanticEnabled).toBe(true);
    expect(plan.reasons).toContain('classifier_abstained_broaden_recall');
  });

  it('requires a normalized XGBoost softprob vector', () => {
    expect(() => assertXgboostSoftprobOutputV2({ probabilities: [0.7, 0.3], classCount: 2 })).not.toThrow();
    expect(() => assertXgboostSoftprobOutputV2({ probabilities: [0.7, 0.7], classCount: 2 })).toThrow(/SUM_INVALID/);
  });
});
