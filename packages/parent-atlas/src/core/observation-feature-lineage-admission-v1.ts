/** Pure feature admission. No caller-supplied proof flag is authoritative by itself:
 * the upstream readback owner must independently check immutable source and
 * feature receipts before populating the proof fields below.
 */
export type FeatureBindingModeV1 = 'SOURCE_BOUND' | 'SNAPSHOT_BOUND';
export type FeatureMembershipV1 = Readonly<{
  packetKey: string; sourceRef: string; sourceRevision: string;
  workspaceRevision: string; sourceDigest: string;
}>;
export type FeatureObservationV1 = Readonly<{
  packetKey: string; sourceRef: string; sourceRevision: string;
  workspaceRevision: string | null; featureRevision: string | null;
  registryRevision: string | null; inputDigest: string | null;
  evidenceRefs: readonly string[];
  /** Scope of producer outputs; graph/taxonomy-dependent outputs cannot be source-only. */
  dependencyScope?: 'SOURCE' | 'WORKSPACE' | 'GRAPH' | 'TAXONOMY';
}>;
export type FeatureAdmitDecisionV1 = Readonly<{
  accepted: boolean; reason: string; packetKey: string;
  featureRevision: string | null; mode: FeatureBindingModeV1;
}>;
export type FeatureReadbackProofV1 = Readonly<{
  membershipProven: boolean; featureStoreProven: boolean;
  /** Set only by independent immutable evidence/receipt verification. */
  sourceEvidenceProven?: boolean;
  featureDefinitionProven?: boolean;
  sourceDigest?: string;
  registryRevision?: string;
  /** Snapshot/ordinal checksum independently reverified for SNAPSHOT_BOUND. */
  snapshotOrdinalProven?: boolean;
  snapshotWorkspaceRevision?: string;
  graphContextProven?: boolean;
  taxonomyContextProven?: boolean;
}>;
const nonblank = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** Legacy callers use SNAPSHOT_BOUND by default. This is intentionally strict. */
export function admitObservationFeatureLineageV1(
  membership: FeatureMembershipV1,
  observation: FeatureObservationV1 | null,
  readback: FeatureReadbackProofV1,
  mode: FeatureBindingModeV1 = 'SNAPSHOT_BOUND',
): FeatureAdmitDecisionV1 {
  const reject = (reason: string): FeatureAdmitDecisionV1 => ({
    accepted: false, reason, packetKey: membership.packetKey,
    featureRevision: observation?.featureRevision ?? null, mode,
  });
  if (!readback.membershipProven) return reject('SNAPSHOT_MEMBERSHIP_UNPROVEN');
  if (!observation) return reject('FEATURE_ROW_ABSENT');
  if (!nonblank(observation.featureRevision)) return reject('FEATURE_REVISION_MISSING');
  if (!nonblank(observation.registryRevision)) return reject('FEATURE_REGISTRY_REVISION_MISSING');
  if (!nonblank(observation.inputDigest)) return reject('FEATURE_INPUT_DIGEST_MISSING');
  if (!observation.evidenceRefs.length || observation.evidenceRefs.some(v => !nonblank(v)))
    return reject('FEATURE_EVIDENCE_MISSING');
  if (!readback.featureStoreProven) return reject('FEATURE_STORE_READBACK_UNPROVEN');
  if (observation.packetKey !== membership.packetKey || observation.sourceRef !== membership.sourceRef)
    return reject('FEATURE_CANONICAL_IDENTITY_MISMATCH');
  if (observation.sourceRevision !== membership.sourceRevision)
    return reject('FEATURE_SOURCE_REVISION_MISMATCH');
  if (!readback.sourceEvidenceProven || !nonblank(readback.sourceDigest)
      || readback.sourceDigest !== membership.sourceDigest)
    return reject('FEATURE_SOURCE_EVIDENCE_UNPROVEN');
  if (!readback.featureDefinitionProven || readback.registryRevision !== observation.registryRevision)
    return reject('FEATURE_DEFINITION_UNPROVEN');
  if (mode === 'SOURCE_BOUND') {
    if (observation.dependencyScope !== 'SOURCE') return reject('FEATURE_CONTEXT_REQUIRES_SNAPSHOT');
  } else {
    if (!readback.snapshotOrdinalProven ||
        readback.snapshotWorkspaceRevision !== membership.workspaceRevision)
      return reject('FEATURE_SNAPSHOT_BINDING_UNPROVEN');
    if (nonblank(observation.workspaceRevision) &&
        observation.workspaceRevision !== membership.workspaceRevision)
      return reject('FEATURE_WORKSPACE_REVISION_MISMATCH');
    if (observation.dependencyScope === 'GRAPH' && !readback.graphContextProven)
      return reject('FEATURE_GRAPH_CONTEXT_UNPROVEN');
    if (observation.dependencyScope === 'TAXONOMY' && !readback.taxonomyContextProven)
      return reject('FEATURE_TAXONOMY_CONTEXT_UNPROVEN');
  }
  return { accepted:true, reason:'REVISION_QUALIFIED_FEATURE_ROW',
    packetKey:membership.packetKey, featureRevision:observation.featureRevision, mode };
}
