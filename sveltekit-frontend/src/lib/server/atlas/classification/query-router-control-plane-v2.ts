import { compileRetrievalPlanV1, QueryClassificationV2Schema, type QueryClassificationV2 } from './query-classification-v2.js';

export interface QueryRouterControlPlaneV2Result {
  schema: 'atlas.query-router-control-plane.v2';
  classification: QueryClassificationV2;
  retrievalPlan: ReturnType<typeof compileRetrievalPlanV1>;
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
): QueryRouterControlPlaneV2Result {
  const parsed = QueryClassificationV2Schema.parse(classification);
  return {
    schema: 'atlas.query-router-control-plane.v2',
    classification: parsed,
    retrievalPlan: compileRetrievalPlanV1(parsed),
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
