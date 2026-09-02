import {
  verifyServerFeatureBundleV1,
  type ServerFeatureBundleV1,
} from '../features/server-feature-bundle-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import type { RlmSearchRequest, RlmSearchResult } from './rlm-contract.js';

export interface RlmAceFeatureBundleProviderV1 {
  get(input: {
    request: RlmSearchRequest;
    result: RlmSearchResult;
  }): Promise<ServerFeatureBundleV1 | null>;
}

export type RlmAceFeatureAdmissionResultV1 =
  | { status: 'ADMITTED'; bundle: ServerFeatureBundleV1; snapshot: CandidateFeatureSnapshotV1 }
  | { status: 'UNAVAILABLE'; reason: 'SERVER_FEATURE_BUNDLE_UNAVAILABLE' };

/**
 * Server-only RLM -> ACE handoff. It never accepts feature bundles from clients
 * and never rematerializes a snapshot from raw producer inputs.
 */
export async function admitRlmResultToAceFeatureSnapshotV1(input: {
  provider: RlmAceFeatureBundleProviderV1;
  request: RlmSearchRequest;
  result: RlmSearchResult;
}): Promise<RlmAceFeatureAdmissionResultV1> {
  const bundle = await input.provider.get({ request: input.request, result: input.result });
  if (!bundle) return { status: 'UNAVAILABLE', reason: 'SERVER_FEATURE_BUNDLE_UNAVAILABLE' };
  verifyServerFeatureBundleV1(bundle);
  return { status: 'ADMITTED', bundle, snapshot: bundle.snapshot };
}
