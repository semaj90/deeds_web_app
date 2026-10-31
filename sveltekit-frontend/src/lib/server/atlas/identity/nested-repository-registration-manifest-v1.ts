/**
 * G7-REGISTRATION-01 — nested-repository registration manifest (pure, no I/O, no minting).
 *
 * This is NOT a second identity system. `mintOrReuseRepositoryIdentityV1`
 * (stable-file-identity-mint-v1.ts) stays the ONE owner that creates repository identities and
 * UUIDv7s. This module only:
 *   1. turns independently gathered git facts + live registry rows into an operator-reviewable
 *      candidate record (never a UUID, never a derived key);
 *   2. detects metadata conflicts the owner does not check (it reuses a row by key alone);
 *   3. refuses to turn a candidate into a mint request unless an explicit operator approval for
 *      that exact scope and key is supplied.
 */
import type { RepositoryIdentityMintRequestV1, RepositoryIdentityRowV1 } from './stable-file-identity-mint-v1.js';

export const NESTED_REGISTRATION_ERROR = Object.freeze({
  KEY_NOT_APPROVED: 'REGISTRATION_KEY_NOT_APPROVED',
  CANDIDATE_NOT_REGISTRABLE: 'REGISTRATION_CANDIDATE_NOT_REGISTRABLE',
  SCOPE_INVALID: 'REGISTRATION_SCOPE_INVALID',
} as const);

export interface NestedRepositoryGitFactsV1 {
  /** `.gitmodules` path = (also the gitmodule name used by Graphify scopes). */
  gitmodulePath: string;
  /** `.gitmodules` url as declared. */
  gitmodulesUrl: string;
  /** Gitlink SHA pinned by the parent index (`git ls-files -s`, mode 160000). */
  pinnedGitlink: string;
  worktreePresent: boolean;
  /** `git rev-parse HEAD` run inside the worktree; null when unreadable. */
  worktreeHead: string | null;
  /** `git remote get-url origin` inside the worktree; null when unreadable. */
  worktreeOriginUrl: string | null;
  /** Count of `git status --porcelain` entries; null when unreadable. */
  dirtyEntryCount: number | null;
}

export interface RootIdentityRefV1 {
  repositoryId: string;
  sourceAuthorityRepoId: string;
}

export type NestedRegistrationStatusV1 = 'AWAITING_OPERATOR_KEY_DECISION' | 'ALREADY_REGISTERED' | 'REJECTED';

export interface NestedRepositoryCandidateV1 {
  membershipScope: string;
  submodulePath: string;
  pinnedGitlink: string;
  gitOrigin: { gitmodulesUrl: string; worktreeOriginUrl: string | null; agree: boolean };
  independentlyCheckedCommit: string | null;
  worktreeState: 'CLEAN' | 'DIRTY' | 'UNKNOWN';
  dirtyEntryCount: number | null;
  existingRegistryMatch: { repositoryId: string; sourceAuthorityRepoId: string } | null;
  /** Unresolved until the operator approves a key convention. Never filled by this module. */
  sourceAuthorityRepoId: null;
  proposedSourceAuthorityRepoId: { value: string; status: 'UNAPPROVED'; basis: string };
  /** Never derived from path, remote, commit or hierarchy metadata. */
  repositoryId: null;
  parentRepositoryId: string | null;
  repositoryKind: 'NESTED_GIT_REPOSITORY';
  intendedMappingKind: 'NESTED_REPOSITORY';
  registrationStatus: NestedRegistrationStatusV1;
  rejectionReasons: string[];
}

/** Compare origins ignoring a trailing `.git` and trailing slashes; host is case-insensitive. */
export function normalizeOriginUrlForComparisonV1(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/]+)(\/.*)?$/i.exec(trimmed);
  return match ? `${match[1].toLowerCase()}${match[2].toLowerCase()}${match[3] ?? ''}` : trimmed;
}

export function buildNestedRepositoryCandidateV1(input: {
  facts: NestedRepositoryGitFactsV1;
  root: RootIdentityRefV1 | null;
  existingRows: RepositoryIdentityRowV1[];
}): NestedRepositoryCandidateV1 {
  const { facts, root, existingRows } = input;
  const rejectionReasons: string[] = [];

  if (!root) rejectionReasons.push('ROOT_IDENTITY_MISSING');
  if (!facts.worktreePresent) rejectionReasons.push('WORKTREE_MISSING');
  if (facts.worktreePresent && facts.worktreeHead === null) rejectionReasons.push('WORKTREE_HEAD_UNREADABLE');
  if (facts.worktreeHead !== null && facts.worktreeHead !== facts.pinnedGitlink) {
    rejectionReasons.push('WORKTREE_HEAD_NOT_PINNED_GITLINK');
  }

  const originAgree =
    facts.worktreeOriginUrl !== null &&
    normalizeOriginUrlForComparisonV1(facts.worktreeOriginUrl) === normalizeOriginUrlForComparisonV1(facts.gitmodulesUrl);
  if (facts.worktreePresent && !originAgree) rejectionReasons.push('ORIGIN_DISAGREES_WITH_GITMODULES');

  // Existing match is advisory evidence only; matching is by gitmodule name or exact path-as-key.
  const matches = existingRows.filter(
    (row) => row.gitmodule_name === facts.gitmodulePath || row.source_authority_repo_id === facts.gitmodulePath,
  );
  if (matches.length > 1) rejectionReasons.push(`EXISTING_REGISTRY_AMBIGUOUS:${matches.length}`);
  const existing = matches.length === 1 ? matches[0] : null;

  const registrationStatus: NestedRegistrationStatusV1 =
    rejectionReasons.length > 0 ? 'REJECTED' : existing ? 'ALREADY_REGISTERED' : 'AWAITING_OPERATOR_KEY_DECISION';

  return {
    membershipScope: `repo:${facts.gitmodulePath}`,
    submodulePath: facts.gitmodulePath,
    pinnedGitlink: facts.pinnedGitlink,
    gitOrigin: { gitmodulesUrl: facts.gitmodulesUrl, worktreeOriginUrl: facts.worktreeOriginUrl, agree: originAgree },
    independentlyCheckedCommit: facts.worktreeHead,
    worktreeState: facts.dirtyEntryCount === null ? 'UNKNOWN' : facts.dirtyEntryCount === 0 ? 'CLEAN' : 'DIRTY',
    dirtyEntryCount: facts.dirtyEntryCount,
    existingRegistryMatch: existing
      ? { repositoryId: existing.repository_id, sourceAuthorityRepoId: existing.source_authority_repo_id }
      : null,
    sourceAuthorityRepoId: null,
    proposedSourceAuthorityRepoId: {
      value: facts.gitmodulePath,
      status: 'UNAPPROVED',
      basis:
        'Existing scope resolver matches `repo:<name>` against gitmodule_name OR source_authority_repo_id; using the .gitmodules path keeps both agreeing. No nested key convention is established in the registry.',
    },
    repositoryId: null,
    parentRepositoryId: root?.repositoryId ?? null,
    repositoryKind: 'NESTED_GIT_REPOSITORY',
    intendedMappingKind: 'NESTED_REPOSITORY',
    registrationStatus,
    rejectionReasons,
  };
}

export interface RepositoryMetadataConflictV1 {
  field: string;
  requested: string | null;
  persisted: string | null;
}

/**
 * The owner reuses a row by `source_authority_repo_id` alone and never compares the rest of the
 * request. Callers that must not silently adopt a changed identity run this first.
 */
export function detectRepositoryMetadataConflictV1(
  request: RepositoryIdentityMintRequestV1,
  row: RepositoryIdentityRowV1,
): RepositoryMetadataConflictV1[] {
  const norm = (v: string | null | undefined) => (v == null ? null : normalizeOriginUrlForComparisonV1(v));
  const pairs: Array<[string, string | null, string | null]> = [
    ['repositoryName', request.repositoryName, row.repository_name],
    ['repositoryPath', request.repositoryPath, row.repository_path],
    ['repositoryKind', request.repositoryKind, row.repository_kind],
    ['gitmoduleName', request.gitmoduleName ?? null, row.gitmodule_name],
    ['originUrl', norm(request.originUrl), norm(row.origin_url)],
    ['parentRepositoryId', request.parentRepositoryId ?? null, row.parent_repository_id],
  ];
  return pairs
    .filter(([, requested, persisted]) => requested !== persisted)
    .map(([field, requested, persisted]) => ({ field, requested, persisted }));
}

export interface OperatorRegistrationApprovalV1 {
  membershipScope: string;
  sourceAuthorityRepoId: string;
  approvedBy: string;
  approvalReceipt: string;
}

function nestedError(code: string, detail: string): Error {
  return new Error(`${code}: ${detail}`);
}

/**
 * The only path from a candidate to a mint request. The key must be explicitly approved for this
 * exact scope; the proposed (UNAPPROVED) key is never promoted implicitly.
 */
export function buildApprovedMintRequestV1(
  candidate: NestedRepositoryCandidateV1,
  approval: OperatorRegistrationApprovalV1 | null | undefined,
  details: { repositoryName: string; repositoryPath: string; originUrl: string | null },
): RepositoryIdentityMintRequestV1 {
  if (!/^repo:(?!root$).+/.test(candidate.membershipScope)) {
    throw nestedError(NESTED_REGISTRATION_ERROR.SCOPE_INVALID, candidate.membershipScope);
  }
  if (candidate.registrationStatus !== 'AWAITING_OPERATOR_KEY_DECISION') {
    throw nestedError(NESTED_REGISTRATION_ERROR.CANDIDATE_NOT_REGISTRABLE, `${candidate.membershipScope}:${candidate.registrationStatus}`);
  }
  if (!approval) {
    throw nestedError(NESTED_REGISTRATION_ERROR.KEY_NOT_APPROVED, `${candidate.membershipScope}: no operator approval supplied`);
  }
  const key = approval.sourceAuthorityRepoId?.trim();
  if (
    approval.membershipScope !== candidate.membershipScope ||
    !key ||
    !approval.approvedBy?.trim() ||
    !approval.approvalReceipt?.trim()
  ) {
    throw nestedError(NESTED_REGISTRATION_ERROR.KEY_NOT_APPROVED, `${candidate.membershipScope}: approval incomplete or for a different scope`);
  }
  if (!candidate.parentRepositoryId) {
    throw nestedError(NESTED_REGISTRATION_ERROR.CANDIDATE_NOT_REGISTRABLE, `${candidate.membershipScope}: no parent repository`);
  }
  return {
    sourceAuthorityRepoId: key,
    repositoryName: details.repositoryName,
    repositoryPath: details.repositoryPath,
    repositoryKind: 'NESTED_GIT_REPOSITORY',
    gitmoduleName: candidate.submodulePath,
    originUrl: details.originUrl,
    parentRepositoryId: candidate.parentRepositoryId,
  };
}
