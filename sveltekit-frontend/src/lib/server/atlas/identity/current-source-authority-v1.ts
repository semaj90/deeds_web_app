import { createHash } from 'node:crypto';
import { sourceSelectionChecksumV1, type SourceSelectionEntry } from './graphify-input-identity';

/**
 * CurrentSourceAuthorityV1 (atlas.current-source-authority.v1) — PURE, read-only classification of ONE admitted workspace/source cohort.
 *
 * Authority is tied to explicit owners, never inferred from non-null rows:
 *   admission receipt (workspaceId/revision/count/membership checksum)  ->  sealed snapshot sources  ->  Graphify execution membership (v2)
 * and, optionally, the registry bindings (atlas_workspace_source_bindings) as extra evidence.
 *
 * sourceIdentityKey = repository_id + ':' + repository_relative_path. It is a SELECTION identity, not a stable file identity:
 * a moved path is a different key and this module never links, merges, or infers an alias (stableFileId is a later gate).
 * The content-bearing selection checksum is the existing `sourceSelectionChecksumV1` (GraphifyInputIdentityV1), reused unchanged.
 * There is no "latest" fallback, no path-only match, and no fuzzy matching anywhere in here.
 */
/**
 * Distinct from the sealer's artifact schema `atlas.current-source-authority.v1` (owned by scripts/atlas/seal-current-source-authority-v1.mjs,
 * role SEALER_OUTPUT at docs/reports/current-source-authority-v1.json). This module's role is S01_07_COHORT_PROOF.
 */
export const CURRENT_SOURCE_AUTHORITY_SCHEMA = 'atlas.current-source-authority-cohort.v1';
export const SEALER_ARTIFACT_SCHEMA = 'atlas.current-source-authority.v1';

/**
 * Two separate predicates, never mixed:
 *  A. SEALED AUTHORITY  ("what exact source cohort was admitted/sealed?")  -> `classifyCurrentSourcesV1`, the S01-07 gate.
 *  B. LIVE WORKING-TREE DRIFT ("does today's tree still match that sealed cohort?") -> `classifyLiveDriftV1`, diagnostic only.
 * B never feeds A's classification, checksum, or status. It must be respected by any future live canary (S01-12) instead of
 * treating current working-tree bytes as the sealed source material.
 */
export type LiveDriftClass = 'LIVE_EXACT_MATCH' | 'LIVE_CHANGED_SINCE_SEAL' | 'LIVE_EXCLUDED_NESTED_REPOSITORY' | 'LIVE_UNAVAILABLE' | 'LIVE_NOT_OBSERVED';
export interface PlannerRowV1 { sourceRef: string; status: string; mismatchReasons?: string[] | null }

/** Maps the repair planner's labels onto the live-drift vocabulary by predicate on the planner's status; unknown labels stay LIVE_NOT_OBSERVED (never silently exact). */
const PLANNER_TO_LIVE: Record<string, LiveDriftClass> = {
  EXACT_CURRENT_BINDING: 'LIVE_EXACT_MATCH',
  CURRENT_BINDING_MISMATCH: 'LIVE_CHANGED_SINCE_SEAL',
  EXCLUDED_SUBMODULE: 'LIVE_EXCLUDED_NESTED_REPOSITORY',
  SOURCE_UNAVAILABLE: 'LIVE_UNAVAILABLE',
};
export function classifyLiveDriftV1(cohortSourceRefs: readonly string[], plannerRows: readonly PlannerRowV1[]) {
  const byRef = new Map<string, PlannerRowV1[]>();
  for (const r of plannerRows) byRef.set(r.sourceRef, [...(byRef.get(r.sourceRef) ?? []), r]);
  const counts: Record<LiveDriftClass, number> = { LIVE_EXACT_MATCH: 0, LIVE_CHANGED_SINCE_SEAL: 0, LIVE_EXCLUDED_NESTED_REPOSITORY: 0, LIVE_UNAVAILABLE: 0, LIVE_NOT_OBSERVED: 0 };
  const plannerLabelCounts: Record<string, number> = {};
  for (const r of plannerRows) plannerLabelCounts[r.status] = (plannerLabelCounts[r.status] ?? 0) + 1;
  const cohort = new Set(cohortSourceRefs);
  const drifted: Array<{ sourceRef: string; live: LiveDriftClass; plannerStatus: string | null }> = [];
  for (const ref of cohort) {
    const rows = byRef.get(ref) ?? [];
    const live: LiveDriftClass = rows.length === 1 ? (PLANNER_TO_LIVE[rows[0].status] ?? 'LIVE_NOT_OBSERVED') : 'LIVE_NOT_OBSERVED';
    counts[live] += 1;
    if (live !== 'LIVE_EXACT_MATCH') drifted.push({ sourceRef: ref, live, plannerStatus: rows[0]?.status ?? null });
  }
  const plannerRowsOutsideCohort = plannerRows.filter((r) => !cohort.has(r.sourceRef)).length;
  const driftCount = cohortSourceRefs.length - counts.LIVE_EXACT_MATCH;
  return {
    admitted: cohort.size,
    liveExactMatch: counts.LIVE_EXACT_MATCH,
    changedSinceSeal: counts.LIVE_CHANGED_SINCE_SEAL,
    excludedNestedRepository: counts.LIVE_EXCLUDED_NESTED_REPOSITORY,
    unavailable: counts.LIVE_UNAVAILABLE,
    notObserved: counts.LIVE_NOT_OBSERVED,
    driftCount,
    plannerRowsOutsideCohort,
    plannerLabelCounts,
    /** Drift is diagnostic: it does not change the sealed cohort's qualification, checksum, or status. */
    affectsAuthorityProof: false as const,
    mustBeRespectedByFutureLiveCanary: true as const,
    drifted,
  };
}

export type SourceClass = 'QUALIFIED' | 'MISSING_REVISION' | 'REVISION_MISMATCH' | 'NAMESPACE_AMBIGUOUS' | 'NOT_IN_ADMITTED_COHORT';
export type RegistryBindingState = 'EXACT' | 'ABSENT' | 'MISMATCH' | 'NOT_CHECKED';

export interface SnapshotSourceV1 {
  sourceIdentityKey: string;
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  sourceRevision: string | null;
  /** bare hex sha256 of the content */
  contentDigest: string | null;
  byteLength: number | null;
}
export interface MembershipRowV1 {
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  workspaceRevision: string;
  codeSourceRevision: string | null;
  /** bare hex sha256 of the content */
  contentHash: string | null;
  byteLength: number | null;
}
export interface RegistryBindingV1 {
  repoId: string;
  canonicalSourceRef: string;
  workspaceRevision: string;
  sourceRevision: string | null;
  contentDigest: string | null;
  byteLength: number | null;
}
export interface AdmittedCohortInputV1 {
  workspaceId: string;
  workspaceRevision: string;
  /** The sealed snapshot this admission binds the workspace revision to. */
  snapshotRevision: string;
  sourceCount: number;
  /** Admission receipt field misleadingly named `sourceSelectionChecksum`: it hashes the SORTED identity keys only (membership set). */
  membershipChecksum: string;
  admissionStatus: string;
  admissionAuthority: boolean;
}
export interface CurrentSourceAuthorityInputV1 {
  admitted: AdmittedCohortInputV1;
  /**
   * The sealed snapshot deliberately claims NO workspace revision or authority (capture treats either as UNEXPECTED_AUTHORITY_CLAIM);
   * the admission receipt is what binds workspaceRevision -> snapshotRevision.
   */
  snapshot: { snapshotRevision: string; selfDigestValid: boolean; workspaceRevisionClaim: string | null; canonicalAuthorityClaim: boolean; violations: number; membershipChecksum: string | null; sources: SnapshotSourceV1[] };
  /** The admission's preflight receipt: an independent statement of the same workspaceRevision <-> snapshotRevision binding. */
  preflight?: { workspaceRevisionCandidate: string | null; snapshotRevision: string | null; sourceCount: number | null; membershipChecksum: string | null } | null;
  membership: MembershipRowV1[];
  /** Optional registry evidence. repoIdMap maps a Graphify repository_id to the registry repo_id namespace. */
  registry?: { repoIdMap: Record<string, string>; rows: RegistryBindingV1[] };
}

export interface ClassifiedSourceV1 {
  sourceIdentityKey: string;
  cls: SourceClass;
  reasons: string[];
  membershipState: 'BOTH' | 'SNAPSHOT_ONLY' | 'MEMBERSHIP_ONLY';
  registryBinding: RegistryBindingState;
}

const REVISION_RE = /^sha256:[a-f0-9]{64}$/;
const HEX_RE = /^[a-f0-9]{64}$/;
const sha256Json = (value: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
export const keyOf = (repositoryId: string, relativePath: string) => `${repositoryId}:${relativePath}`;

/** Same formula the sealed snapshot uses for `sourceMembershipChecksum`: hash of the identity keys, default sort. */
export function membershipSetChecksumV1(keys: readonly string[]): string {
  return sha256Json([...keys].sort());
}

const isContentQualified = (revision: string | null, digest: string | null) => revision !== null && digest !== null && REVISION_RE.test(revision) && HEX_RE.test(digest) && revision === `sha256:${digest}`;

export function classifyCurrentSourcesV1(input: CurrentSourceAuthorityInputV1) {
  const { admitted, snapshot, membership } = input;
  const bySnapshot = new Map<string, SnapshotSourceV1[]>();
  for (const s of snapshot.sources) bySnapshot.set(s.sourceIdentityKey, [...(bySnapshot.get(s.sourceIdentityKey) ?? []), s]);
  const byMembership = new Map<string, MembershipRowV1[]>();
  for (const m of membership) byMembership.set(keyOf(m.repositoryId, m.repositoryRelativePath), [...(byMembership.get(keyOf(m.repositoryId, m.repositoryRelativePath)) ?? []), m]);
  const refToKeys = new Map<string, Set<string>>();
  for (const s of snapshot.sources) refToKeys.set(s.sourceRef, (refToKeys.get(s.sourceRef) ?? new Set()).add(s.sourceIdentityKey));
  for (const m of membership) refToKeys.set(m.sourceRef, (refToKeys.get(m.sourceRef) ?? new Set()).add(keyOf(m.repositoryId, m.repositoryRelativePath)));

  const registryByKey = new Map<string, RegistryBindingV1[]>();
  if (input.registry) for (const r of input.registry.rows) if (r.workspaceRevision === admitted.workspaceRevision) registryByKey.set(`${r.repoId}|${r.canonicalSourceRef}`, [...(registryByKey.get(`${r.repoId}|${r.canonicalSourceRef}`) ?? []), r]);

  const keys = [...new Set([...bySnapshot.keys(), ...byMembership.keys()])].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  const classified: ClassifiedSourceV1[] = keys.map((key) => {
    const snaps = bySnapshot.get(key) ?? [];
    const mems = byMembership.get(key) ?? [];
    const reasons: string[] = [];
    const membershipState = snaps.length && mems.length ? 'BOTH' : snaps.length ? 'SNAPSHOT_ONLY' : 'MEMBERSHIP_ONLY';
    const snap = snaps[0];
    const mem = mems[0];
    let cls: SourceClass;
    let registryBinding: RegistryBindingState = input.registry ? 'ABSENT' : 'NOT_CHECKED';

    if (snaps.length > 1 || mems.length > 1) { reasons.push('DUPLICATE_SOURCE_IDENTITY_KEY'); cls = 'NAMESPACE_AMBIGUOUS'; }
    else if ([snap?.sourceRef, mem?.sourceRef].some((ref) => ref !== undefined && (refToKeys.get(ref)?.size ?? 0) > 1)) { reasons.push('SOURCE_REF_SHARED_BY_MULTIPLE_IDENTITY_KEYS'); cls = 'NAMESPACE_AMBIGUOUS'; }
    else if (membershipState !== 'BOTH') { reasons.push(membershipState); cls = 'NOT_IN_ADMITTED_COHORT'; }
    else if (mem.workspaceRevision !== admitted.workspaceRevision) { reasons.push('MEMBERSHIP_WORKSPACE_REVISION_DIFFERS'); cls = 'REVISION_MISMATCH'; }
    else if (!snap.sourceRevision || !mem.codeSourceRevision || !snap.contentDigest || !mem.contentHash) { reasons.push('REVISION_OR_DIGEST_ABSENT'); cls = 'MISSING_REVISION'; }
    else if (!REVISION_RE.test(snap.sourceRevision) || !REVISION_RE.test(mem.codeSourceRevision)) { reasons.push('REVISION_NOT_SHA256_FORM'); cls = 'MISSING_REVISION'; }
    else {
      if (!isContentQualified(snap.sourceRevision, snap.contentDigest)) reasons.push('SNAPSHOT_REVISION_NOT_CONTENT_DIGEST');
      if (!isContentQualified(mem.codeSourceRevision, mem.contentHash)) reasons.push('MEMBERSHIP_REVISION_NOT_CONTENT_HASH');
      if (snap.sourceRevision !== mem.codeSourceRevision) reasons.push('SNAPSHOT_MEMBERSHIP_REVISION_DIFFERS');
      if (snap.byteLength === null || mem.byteLength === null || Number(snap.byteLength) !== Number(mem.byteLength)) reasons.push('BYTE_LENGTH_DIFFERS');
      if (input.registry) {
        const registryRepo = input.registry.repoIdMap[mem.repositoryId];
        const bound = registryRepo ? registryByKey.get(`${registryRepo}|${mem.sourceRef}`) : undefined;
        if (!bound?.length) registryBinding = 'ABSENT';
        else if (bound.length === 1 && bound[0].sourceRevision === mem.codeSourceRevision && bound[0].contentDigest !== null && bound[0].contentDigest.replace(/^sha256:/, '') === mem.contentHash && Number(bound[0].byteLength) === Number(mem.byteLength)) registryBinding = 'EXACT';
        else { registryBinding = 'MISMATCH'; reasons.push('REGISTRY_BINDING_DIFFERS'); }
      }
      cls = reasons.length === 0 ? 'QUALIFIED' : 'REVISION_MISMATCH';
    }
    return { sourceIdentityKey: key, cls, reasons, membershipState, registryBinding };
  });

  const count = (c: SourceClass) => classified.filter((s) => s.cls === c).length;
  const cohort = classified.filter((s) => s.membershipState === 'BOTH');
  const toEntries = (rows: Array<{ key: string; revision: string | null; byteLength: number | null }>): SourceSelectionEntry[] => rows.map((r) => ({ sourceIdentityKey: r.key, sourceRevision: String(r.revision), byteLength: Number(r.byteLength) }));
  const snapshotSelectionChecksum = sourceSelectionChecksumV1(toEntries(snapshot.sources.map((s) => ({ key: s.sourceIdentityKey, revision: s.sourceRevision, byteLength: s.byteLength }))));
  const membershipSelectionChecksum = sourceSelectionChecksumV1(toEntries(membership.map((m) => ({ key: keyOf(m.repositoryId, m.repositoryRelativePath), revision: m.codeSourceRevision, byteLength: m.byteLength }))));
  const recomputedMembershipSet = membershipSetChecksumV1(snapshot.sources.map((s) => s.sourceIdentityKey));

  const duplicateKeys = classified.filter((s) => s.reasons.includes('DUPLICATE_SOURCE_IDENTITY_KEY')).length;
  const proof = {
    // Explicit owner chain: admission (authority) binds W<->S; the sealed snapshot S re-verifies and claims nothing itself; the preflight independently
    // states the same W<->S<->count<->membership; every joined membership row must carry W (checked per source above). The derivation of W from S is NOT recomputed here.
    workspaceAuthorityProven: admitted.admissionAuthority === true && admitted.admissionStatus === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED'
      && snapshot.snapshotRevision === admitted.snapshotRevision && snapshot.selfDigestValid === true && snapshot.workspaceRevisionClaim === null && snapshot.canonicalAuthorityClaim === false
      && snapshot.violations === 0 && snapshot.sources.length === admitted.sourceCount && recomputedMembershipSet === admitted.membershipChecksum && snapshot.membershipChecksum === admitted.membershipChecksum
      && input.preflight?.workspaceRevisionCandidate === admitted.workspaceRevision && input.preflight?.snapshotRevision === admitted.snapshotRevision
      && input.preflight?.sourceCount === admitted.sourceCount && input.preflight?.membershipChecksum === admitted.membershipChecksum,
    exactMembershipProven: cohort.length === keys.length && snapshot.sources.length === membership.length && keys.length === admitted.sourceCount,
    sourceIdentityProven: duplicateKeys === 0 && count('NAMESPACE_AMBIGUOUS') === 0,
    sourceRevisionProven: count('MISSING_REVISION') === 0 && count('REVISION_MISMATCH') === 0,
    sourceSelectionChecksumProven: snapshotSelectionChecksum === membershipSelectionChecksum,
  };
  const registryChecked = input.registry !== undefined;
  const registry = registryChecked
    ? { exact: classified.filter((s) => s.registryBinding === 'EXACT').length, absent: classified.filter((s) => s.registryBinding === 'ABSENT' && s.membershipState === 'BOTH').length, mismatch: classified.filter((s) => s.registryBinding === 'MISMATCH').length }
    : null;
  const proven = count('QUALIFIED') === keys.length && Object.values(proof).every(Boolean);
  return {
    schema: CURRENT_SOURCE_AUTHORITY_SCHEMA,
    status: proven ? 'CURRENT_SOURCE_AUTHORITY_PROVEN' : 'CURRENT_SOURCE_AUTHORITY_BLOCKED',
    workspaceId: admitted.workspaceId,
    workspaceRevision: admitted.workspaceRevision,
    sourceCount: keys.length,
    sourceSelectionChecksum: membershipSelectionChecksum,
    snapshotSelectionChecksum,
    membershipSetChecksum: recomputedMembershipSet,
    counts: { qualified: count('QUALIFIED'), missingRevision: count('MISSING_REVISION'), revisionMismatch: count('REVISION_MISMATCH'), namespaceAmbiguous: count('NAMESPACE_AMBIGUOUS'), notInAdmittedCohort: count('NOT_IN_ADMITTED_COHORT') },
    proof,
    registryCoverage: registry,
    // A stable source identity is NOT claimed here: sourceIdentityKey is selection identity, moves are not linked.
    stableFileIdentityClaimed: false,
    classified,
  };
}
export type CurrentSourceAuthorityV1 = ReturnType<typeof classifyCurrentSourcesV1>;
