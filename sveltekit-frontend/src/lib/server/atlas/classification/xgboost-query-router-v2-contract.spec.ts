import { describe, expect, it } from 'vitest';
import { XgboostQueryRouterV2ContractSchema, XGBOOST_QUERY_ROUTER_V2_CHALLENGER } from './xgboost-query-router-v2-contract.js';

describe('XGBoost query-router v2 contract', () => {
  it('uses the current 234-column v2 tensor rather than the retired v1 width', () => {
    const parsed = XgboostQueryRouterV2ContractSchema.parse(XGBOOST_QUERY_ROUTER_V2_CHALLENGER);
    expect(parsed.tensorRevision).toBe('atlas.retrieval-router-tensor.v2');
    expect(parsed.tensorWidth).toBe(234);
  });
});
