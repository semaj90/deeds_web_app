import { describe, expect, it } from 'vitest';

import { QueryClassificationV2Schema } from './query-classification-v2.js';
import { compileQueryRouterControlPlaneV2 } from './query-router-control-plane-v2.js';
import { compileReductionRouterPlanV1 } from './reduction-router-v1.js';

function classification(overrides: Record<string, unknown> = {}) {
  return QueryClassificationV2Schema.parse({
    schema: 'atlas.query-classification.v2', requestId: 'reduction:r1', workspaceRevision: 'workspace:r1',
    classificationRevision: 'classification:r1', routerFeatureRevision: 'router:r1', classifierModelRevision: 'classifier:r1', calibrationRevision: 'calibration:r1',
    domain: [{ label: 'retrieval', probability: 1 }], operation: [{ operation: 'find', probability: 1 }],
    structuralIntent: { function: 0, call: 0, symbol: 0, type: 0, route: 0, databaseCall: 0, config: 0 },
    retrievalNeed: { lexical: 0.8, semantic: 0.9, ast: 0, graph: 0.8, exactSymbol: 0 },
    expectedDepth: { graphHops: 2, candidateBudget: 128, rerankBudget: 16 }, confidence: 0.9, entropy: 0.1,
    abstained: false, evidenceRefs: ['query:evidence'], canonicalWritesAllowed: false, retrievalVoteAdded: false,
    ...overrides,
  });
}

describe('reduction router v1', () => {
  it('compiles a deterministic taxonomy/semantic/graph/ACE reduction path', () => {
    const input = {
      classification: classification(),
      taxonomyScope: {
        schema: 'atlas.query-taxonomy-scope.v1' as const, taxonomyRevision: 'taxonomy:r1',
        domainIds: ['domain:retrieval'], topicIds: ['topic:fusion'], featureIds: ['feature:search'], evidenceRefs: ['evidence:1'],
      },
      graphSnapshotAvailable: true,
      tokenBudget: 512,
    };
    const first = compileReductionRouterPlanV1(input);
    const second = compileReductionRouterPlanV1(input);
    expect(second).toEqual(first);
    expect(first.semanticRepresentation).toBe('semantic_768');
    expect(first.steps.map((item) => item.kind)).toEqual([
      'EXACT_FILTER', 'DOMAIN_FILTER', 'FEATURE_FILTER', 'TAXONOMY_FILTER', 'KNN', 'GRAPH_EGO', 'HYPEREDGE_EXPANSION', 'TOPIC_CARD',
    ]);
    expect(first.steps.every((item) => item.canonicalAuthority === false && item.retrievalVoteAdded === false)).toBe(true);
    expect(first.deferredKinds).toEqual(['RANDOM_FOREST']);
  });

  it('fails closed on graph availability and preserves the literal path', () => {
    const plan = compileReductionRouterPlanV1({ classification: classification(), graphSnapshotAvailable: false });
    expect(plan.steps.map((item) => item.kind)).not.toContain('GRAPH_EGO');
    expect(plan.steps.map((item) => item.kind)).not.toContain('HYPEREDGE_EXPANSION');
    expect(plan.steps.map((item) => item.kind)).toContain('KNN');
    expect(plan.canonicalWritesAllowed).toBe(false);
  });

  it('wires the derived reduction plan into the existing control-plane result without a provider key', () => {
    const result = compileQueryRouterControlPlaneV2(classification(), { tokenBudget: 256 });
    expect(result.reductionPlan.schema).toBe('atlas.reduction-router-plan.v1');
    expect(JSON.stringify(result)).not.toMatch(/DEEPSEEK_API_KEY|deepseek_api_key/i);
  });
});
