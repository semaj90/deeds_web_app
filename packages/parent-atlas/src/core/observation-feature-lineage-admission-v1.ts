/** Strict, read-only admission of observation feature rows to a frozen Graphify snapshot.
 * Caller MUST supply independent source and feature-store readbacks. Never synthesizes
 * feature revision from snapshot timestamp, row position, or registry revision.
 */
export type FeatureMembershipV1 = Readonly<{
  packetKey: string; sourceRef: string; sourceRevision: string; workspaceRevision: string;
  sourceDigest: string;
}>;
export type FeatureObservationV1 = Readonly<{
  packetKey: string; sourceRef: string; sourceRevision: string;
  workspaceRevision: string | null; featureRevision: string | null;
  registryRevision: string | null; inputDigest: string | null;
  evidenceRefs: readonly string[];
}>;
export type FeatureAdmitDecisionV1 = Readonly<{
  accepted: boolean; reason: string;
  packetKey: string; featureRevision: string | null;
}>;
const nonblank = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;
export function admitObservationFeatureLineageV1(
  membership: FeatureMembershipV1,
  observation: FeatureObservationV1 | null,
  readback: Readonly<{ membershipProven: boolean; featureStoreProven: boolean }>
): FeatureAdmitDecisionV1 {
  const reject = (reason: string): FeatureAdmitDecisionV1 => ({
    accepted: false, reason, packetKey: membership.packetKey,
    featureRevision: observation?.featureRevision ?? null,
  });
  if (!readback.membershipProven) return reject('SNAPSHOT_MEMBERSHIP_UNPROVEN');
  if (!observation) return reject('FEATURE_ROW_ABSENT');
  if (!nonblank(observation.featureRevision)) return reject('FEATURE_REVISION_MISSING');
  if (!nonblank(observation.workspaceRevision)) return reject('FEATURE_WORKSPACE_REVISION_MISSING');
  if (!nonblank(observation.registryRevision)) return reject('FEATURE_REGISTRY_REVISION_MISSING');
  if (!nonblank(observation.inputDigest)) return reject('FEATURE_INPUT_DIGEST_MISSING');
  if (!observation.evidenceRefs.length || observation.evidenceRefs.some(v => !nonblank(v)))
    return reject('FEATURE_EVIDENCE_MISSING');
  if (!readback.featureStoreProven) return reject('FEATURE_STORE_READBACK_UNPROVEN');
  if (observation.packetKey !== membership.packetKey || observation.sourceRef !== membership.sourceRef)
    return reject('FEATURE_CANONICAL_IDENTITY_MISMATCH');
  if (observation.sourceRevision !== membership.sourceRevision)
    return reject('FEATURE_SOURCE_REVISION_MISMATCH');
  if (observation.workspaceRevision !== membership.workspaceRevision)
    return reject('FEATURE_WORKSPACE_REVISION_MISMATCH');
  return {
    accepted: true, reason: 'REVISION_QUALIFIED_FEATURE_ROW',
    packetKey: membership.packetKey, featureRevision: observation.featureRevision,
  };
}
