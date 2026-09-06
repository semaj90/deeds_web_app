import { compileRetrievalPlanV1, QueryClassificationV2Schema, type QueryClassificationV2 } from './query-classification-v2.js';
import { compileReductionRouterPlanV1, type QueryTaxonomyScopeV1 } from './reduction-router-v1.js';

export interface QueryRouterControlPlaneV2Result {
  schema: 'atlas.query-router-control-plane.v2';
  classification: QueryClassificationV2;
  retrievalPlan: ReturnType<typeof compileRetrievalPlanV1>;
  reductionPlan: ReturnType<typeof compileReductionRouterPlanV1>;
  downstream: {
    candidateClassificationControlPlane: 'atlas.classification-control-plane.v1';
    hmmSequenceOwner: 'existing-model-analysis-service';
    crossEncoderOwner: 'existing-reranker-endpoint';
    exactPromotionRequired: true;
  };
  representationPolicy: {
    modelNativeDimension: 768;
    classifierPreferredDimension: 128;
    persistenceAuthority: 'SEPARATE_CONTRACT';
  };
  canonicalWritesAllowed: false;
  retrievalVoteAdded: false;
}

export function compileQueryRouterControlPlaneV2(
  classification: QueryClassificationV2,
  options: { taxonomyScope?: QueryTaxonomyScopeV1; reductionPolicyRevision?: string; tokenBudget?: number; graphSnapshotAvailable?: boolean } = {},
): QueryRouterControlPlaneV2Result {
  const parsed = QueryClassificationV2Schema.parse(classification);
  return {
    schema: 'atlas.query-router-control-plane.v2',
    classification: parsed,
    retrievalPlan: compileRetrievalPlanV1(parsed),
    reductionPlan: compileReductionRouterPlanV1({ classification: parsed, ...options }),
    downstream: {
      candidateClassificationControlPlane: 'atlas.classification-control-plane.v1',
      hmmSequenceOwner: 'existing-model-analysis-service',
      crossEncoderOwner: 'existing-reranker-endpoint',
      exactPromotionRequired: true,
    },
    representationPolicy: {
      modelNativeDimension: 768,
      classifierPreferredDimension: 128,
      persistenceAuthority: 'SEPARATE_CONTRACT',
    },
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
  };
}
