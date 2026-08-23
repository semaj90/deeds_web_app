import { describe, expect, it } from 'vitest';

import {
  RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
  RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
} from './retrieval-router-tensor-manifest-v2.js';
import {
  XGBOOST_QUERY_ROUTER_V2_CHALLENGER,
  XgboostQueryRouterV2ContractSchema,
  assertXgboostSoftprobOutputV2,
} from './xgboost-query-router-v2-contract.js';

describe('XGBoost query router v2 contract', () => {
  it('uses the v2 234-column router tensor', () => {
    expect(XGBOOST_QUERY_ROUTER_V2_CHALLENGER.tensorRevision).toBe(RETRIEVAL_ROUTER_TENSOR_REVISION_V2);
    expect(XGBOOST_QUERY_ROUTER_V2_CHALLENGER.tensorWidth).toBe(RETRIEVAL_ROUTER_TENSOR_WIDTH_V2);
    expect(RETRIEVAL_ROUTER_TENSOR_WIDTH_V2).toBe(234);
    expect(XgboostQueryRouterV2ContractSchema.parse(XGBOOST_QUERY_ROUTER_V2_CHALLENGER)).toEqual(XGBOOST_QUERY_ROUTER_V2_CHALLENGER);
  });

  it('requires a normalized softprob distribution', () => {
    expect(() => assertXgboostSoftprobOutputV2({ probabilities: [0.2, 0.3, 0.5], classCount: 3 })).not.toThrow();
    expect(() => assertXgboostSoftprobOutputV2({ probabilities: [0.2, 0.3], classCount: 3 })).toThrow('XGBOOST_ROUTER_PROBABILITY_WIDTH_MISMATCH');
    expect(() => assertXgboostSoftprobOutputV2({ probabilities: [0.2, 0.2, 0.2], classCount: 3 })).toThrow('XGBOOST_ROUTER_PROBABILITY_SUM_INVALID');
  });
});
