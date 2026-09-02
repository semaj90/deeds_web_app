import {
  produceAceFeatureSnapshotV1,
  type AceFeatureSnapshotProducerInputV1,
} from '../context/ace-feature-snapshot-producer-v1.js';
import type { RlmSearchRequest, RlmSearchResult } from './rlm-contract.js';

export interface RlmAceFeatureBundleProviderV1 {
  get(input: {
    request: RlmSearchRequest;
    result: RlmSearchResult;
  }): Promise<AceFeatureSnapshotProducerInputV1 | null>;
}

export type RlmAceFeatureAdmissionResultV1 =
  | { status: 'ADMITTED'; result: ReturnType<typeof produceAceFeatureSnapshotV1> }
  | { status: 'UNAVAILABLE'; reason: 'SERVER_FEATURE_BUNDLE_UNAVAILABLE' };

/** Server-only RLM -> ACE handoff. It never accepts feature bundles from clients. */
export async function admitRlmResultToAceFeatureSnapshotV1(input: {
  provider: RlmAceFeatureBundleProviderV1;
  request: RlmSearchRequest;
  result: RlmSearchResult;
}): Promise<RlmAceFeatureAdmissionResultV1> {
  const bundle = await input.provider.get({ request: input.request, result: input.result });
  if (!bundle) return { status: 'UNAVAILABLE', reason: 'SERVER_FEATURE_BUNDLE_UNAVAILABLE' };
  return { status: 'ADMITTED', result: produceAceFeatureSnapshotV1(bundle) };
}
