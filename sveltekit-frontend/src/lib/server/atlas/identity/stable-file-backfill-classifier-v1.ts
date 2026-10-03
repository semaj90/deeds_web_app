/**
 * StableFileBackfillClassifierV1 (S01-08J) — PURE classifier. Given one sealed-cohort candidate
 * source (from docs/reports/workspace-source-snapshots/<admitted>.json, S01-07's authority) and
 * the caller-supplied live context (already-fetched, never queried by this module), decides which
 * bounded population it falls into per the S01-08G/S01-08I contract. This module performs zero
 * I/O and mints nothing -- it only classifies. Fail-closed: AMBIGUOUS_CONTINUITY and
 * SOURCE_HISTORY_INSUFFICIENT are never defaulted to SAFE_NEW_ID.
 *
 * Classification vocabulary (from stable-file-identity-design-v1.json's backfillClassifier):
 *  - SAFE_NEW_ID: no prior stableFileId, no continuity claim, an admitted binding exists to mint
 *    against. The expected default for population A absent further evidence.
 *  - SAFE_EXISTING_CONTINUITY: a stableFileId already exists for this exact sourceIdentityKey.
 *    Impossible today (atlas_stable_file_identity is empty) -- always 0 until a real S01-08K run.
 *  - MOVE_CONTINUITY_PROVEN: only with an explicit, separately-verified rename event. Impossible
 *    today (atlas_source_aliases has 0 rows, confirmed live -- no move evidence exists anywhere).
 *  - PATH_REUSE_NEW_ID: the most recent occupant of this path was tombstoned. Impossible today
 *    (no tombstone writer exists yet).
 *  - REPOSITORY_NAMESPACE_MISSING: the source's Graphify repository namespace has no admitted
 *    atlas_workspace_source_bindings row -- S01-08I's writer cannot even attempt admission
 *    verification, regardless of whether a RepositoryIdentityV1 row for it exists.
 *  - AMBIGUOUS_CONTINUITY: an admitted binding exists but disagrees with the sealed cohort's own
 *    recorded sourceRevision/contentDigest for this exact source -- never picked arbitrarily.
 *  - SOURCE_HISTORY_INSUFFICIENT: the repository namespace IS admitted (root), but no matching
 *    row exists for this exact path at all -- distinct from REPOSITORY_NAMESPACE_MISSING, which
 *    is a whole-namespace gap.
 */

export interface SealedCohortSourceV1 {
  sourceRef: string;
  /** Graphify's own repository namespace, e.g. 'repo:root' or 'repo:claude-mem'. Not a UUID. */
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
}

export interface AdmittedBindingV1 {
  source_revision: string;
  content_digest: string;
  workspace_revision: string;
}

export type StableFileBackfillClassificationV1 =
  | 'SAFE_NEW_ID'
  | 'SAFE_EXISTING_CONTINUITY'
  | 'MOVE_CONTINUITY_PROVEN'
  | 'PATH_REUSE_NEW_ID'
  | 'REPOSITORY_NAMESPACE_MISSING'
  | 'AMBIGUOUS_CONTINUITY'
  | 'SOURCE_HISTORY_INSUFFICIENT';

export interface BackfillClassificationContextV1 {
  /** Graphify repository namespace (e.g. 'repo:root') -> the bridging source_authority_repo_id
   *  (the existing live text repo_id, e.g. 'deeds-web-app'), or null if no admitted namespace
   *  bridge exists for it at all (every nested-repo namespace, today). */
  sourceAuthorityRepoIdForGraphifyRepo: (graphifyRepositoryId: string) => string | null;
  /** Exact admitted atlas_workspace_source_bindings row for (source_authority_repo_id,
   *  canonical_source_ref), or null if none exists. Already scoped to the one admitted
   *  workspace_revision by the caller -- this module never picks among several. */
  admittedBindingFor: (sourceAuthorityRepoId: string, canonicalSourceRef: string) => AdmittedBindingV1 | null;
  /** Whether an ACTIVE stableFileId already exists for this exact source_identity_key (always
   *  false today -- atlas_stable_file_identity is empty -- but not hardcoded, so a future re-run
   *  of this same classifier over a partially-populated table classifies correctly.) */
  activeStableFileExistsFor: (sourceIdentityKey: string) => boolean;
  /** Whether a proven RENAME/alias event exists that would justify MOVE_CONTINUITY_PROVEN
   *  (always false today -- atlas_source_aliases has 0 rows -- but not hardcoded for the same
   *  reason as above). */
  provenMoveEvidenceFor: (sourceIdentityKey: string) => boolean;
}

export interface BackfillClassificationResultV1 {
  sourceRef: string;
  classification: StableFileBackfillClassificationV1;
  reason: string;
  sourceAuthorityRepoId: string | null;
}

export function classifyStableFileBackfillCandidateV1(
  candidate: SealedCohortSourceV1,
  ctx: BackfillClassificationContextV1,
): BackfillClassificationResultV1 {
  const sourceAuthorityRepoId = ctx.sourceAuthorityRepoIdForGraphifyRepo(candidate.repositoryId);
  if (!sourceAuthorityRepoId) {
    return {
      sourceRef: candidate.sourceRef,
      classification: 'REPOSITORY_NAMESPACE_MISSING',
      reason: `no source_authority_repo_id bridge exists for Graphify repository namespace ${candidate.repositoryId} -- atlas_workspace_source_bindings has zero rows for any repo besides the admitted root`,
      sourceAuthorityRepoId: null,
    };
  }

  const sourceIdentityKey = `${sourceAuthorityRepoId}:${candidate.repositoryRelativePath}`;

  if (ctx.activeStableFileExistsFor(sourceIdentityKey)) {
    return {
      sourceRef: candidate.sourceRef,
      classification: 'SAFE_EXISTING_CONTINUITY',
      reason: 'an ACTIVE stableFileId already exists for this exact sourceIdentityKey',
      sourceAuthorityRepoId,
    };
  }

  if (ctx.provenMoveEvidenceFor(sourceIdentityKey)) {
    return {
      sourceRef: candidate.sourceRef,
      classification: 'MOVE_CONTINUITY_PROVEN',
      reason: 'an explicit, separately-verified rename event exists for this path',
      sourceAuthorityRepoId,
    };
  }

  const admitted = ctx.admittedBindingFor(sourceAuthorityRepoId, candidate.repositoryRelativePath);
  if (!admitted) {
    return {
      sourceRef: candidate.sourceRef,
      classification: 'SOURCE_HISTORY_INSUFFICIENT',
      reason: `repository namespace ${sourceAuthorityRepoId} is admitted, but no atlas_workspace_source_bindings row exists for canonical_source_ref=${candidate.repositoryRelativePath}`,
      sourceAuthorityRepoId,
    };
  }

  if (admitted.source_revision !== candidate.sourceRevision || admitted.content_digest !== candidate.contentDigest) {
    return {
      sourceRef: candidate.sourceRef,
      classification: 'AMBIGUOUS_CONTINUITY',
      reason: `admitted binding (sourceRevision=${admitted.source_revision}, contentDigest=${admitted.content_digest}) disagrees with the sealed cohort's own recorded values (sourceRevision=${candidate.sourceRevision}, contentDigest=${candidate.contentDigest})`,
      sourceAuthorityRepoId,
    };
  }

  return {
    sourceRef: candidate.sourceRef,
    classification: 'SAFE_NEW_ID',
    reason: 'no prior stableFileId, no continuity claim, an exact admitted binding exists to mint against',
    sourceAuthorityRepoId,
  };
}
