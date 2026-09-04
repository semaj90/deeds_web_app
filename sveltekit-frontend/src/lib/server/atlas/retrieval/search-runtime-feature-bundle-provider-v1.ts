import type { RlmAceFeatureBundleProviderV1 } from '../rlm/rlm-ace-feature-admission-v1.js';
import type { RlmSearchRequest, RlmSearchResult } from '../rlm/rlm-contract.js';
import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  candidateFeatureSnapshotV1Schema,
  type CandidateFeatureSnapshotV1,
} from '../features/candidate-feature-snapshot-v1.js';
import {
  serverFeatureBundleChecksumV1,
  serverFeatureBundleLogicalIdentityV1,
  serverFeatureBundleV1Schema,
  verifyServerFeatureBundleV1,
  type ServerFeatureBundleV1,
} from '../features/server-feature-bundle-v1.js';
import {
  revisionAuthorityEnvelopeV1Schema,
  type RevisionAuthorityEnvelopeV1,
} from '../identity/revision-authority-envelope-v1.js';

/**
 * Already-admitted SearchRuntime evidence. This intentionally starts after
 * candidate identity/ordinal assignment and feature snapshot materialization,
 * so this composition owner never has to reinterpret the legacy numeric
 * retrieval-router workspace revision field.
 */
export interface SearchRuntimeFeatureBundleInputV1 {
  requestId: string;
  ordinalMap: CandidateOrdinalMapV1;
  snapshot: CandidateFeatureSnapshotV1;
  revisionAuthority: RevisionAuthorityEnvelopeV1;
}

function revisionSetChecksum(schema: string, revisions: readonly (string | null)[]): string {
  return serverFeatureBundleChecksumV1({
    schema,
    revisions: [...new Set(revisions)].sort((a, b) => String(a).localeCompare(String(b))),
  });
}

/**
 * SearchRuntime composition owner. Retrieval, ordinal assignment, graph and
 * feature producers remain upstream owners; this function only seals their
 * already-admitted outputs for ACE/RLM consumption.
 */
export function buildSearchRuntimeFeatureBundleV1(
  input: SearchRuntimeFeatureBundleInputV1,
): ServerFeatureBundleV1 {
  if (!input.requestId.trim()) throw new Error('SERVER_FEATURE_BUNDLE_REQUEST_ID_REQUIRED');
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const snapshot = candidateFeatureSnapshotV1Schema.parse(input.snapshot);
  const revisionAuthority = revisionAuthorityEnvelopeV1Schema.parse(input.revisionAuthority);

  if (ordinalMap.workspaceRevision !== revisionAuthority.workspaceRevision) {
    throw new Error('SERVER_FEATURE_BUNDLE_REVISION_AUTHORITY_WORKSPACE_MISMATCH');
  }
  if (snapshot.workspaceRevision !== revisionAuthority.workspaceRevision) {
    throw new Error('SERVER_FEATURE_BUNDLE_SNAPSHOT_AUTHORITY_WORKSPACE_MISMATCH');
  }

  const sourceRevisionSetChecksum = revisionSetChecksum(
    'atlas.server-feature-bundle.source-revision-set.v1',
    snapshot.rows.map((row) => row.sourceRevision),
  );
  const graphRevisionSetChecksum = revisionSetChecksum(
    'atlas.server-feature-bundle.graph-revision-set.v1',
    snapshot.rows.map((row) => row.graphRevision),
  );
  const semanticRevisionSetChecksum = revisionSetChecksum(
    'atlas.server-feature-bundle.semantic-revision-set.v1',
    snapshot.rows.map((row) => row.semanticRevision),
  );

  const partial = {
    schema: 'atlas.server-feature-bundle.v1' as const,
    requestId: input.requestId,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    featureRevision: snapshot.featureRevision,
    sourceRevisionSetChecksum,
    graphRevisionSetChecksum,
    semanticRevisionSetChecksum,
    candidateCount: snapshot.rowCount,
    ordinalMap,
    snapshot,
    revisionAuthority,
    writesPerformed: false as const,
    canonicalAuthority: false as const,
  };
  const bundleLogicalChecksum = serverFeatureBundleChecksumV1(serverFeatureBundleLogicalIdentityV1({
    ...partial,
    bundleLogicalChecksum: '0'.repeat(64),
    bundleEnvelopeChecksum: '0'.repeat(64),
  }));
  const bundleEnvelopeChecksum = serverFeatureBundleChecksumV1({
    schema: 'atlas.server-feature-bundle.envelope.v1',
    requestId: input.requestId,
    bundleLogicalChecksum,
  });
  const bundle = serverFeatureBundleV1Schema.parse({
    ...partial,
    bundleLogicalChecksum,
    bundleEnvelopeChecksum,
  });
  verifyServerFeatureBundleV1(bundle);
  return bundle;
}

export const verifySearchRuntimeFeatureBundleV1 = verifyServerFeatureBundleV1;

/**
 * Creates the RLM-facing provider without making RLM a retrieval owner. The
 * resolver must return already-admitted SearchRuntime evidence; this adapter
 * seals it exactly once and exposes only the sealed bundle downstream.
 */
export function createSearchRuntimeFeatureBundleProviderV1(
  resolve: (input: { request: RlmSearchRequest; result: RlmSearchResult }) =>
    Promise<SearchRuntimeFeatureBundleInputV1 | null>,
): RlmAceFeatureBundleProviderV1 {
  return {
    async get(input) {
      const resolved = await resolve(input);
      if (!resolved) return null;
      return buildSearchRuntimeFeatureBundleV1(resolved);
    },
  };
}
