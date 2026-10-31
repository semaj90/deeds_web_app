import { describe, expect, it } from 'vitest';
import type { RepositoryIdentityRowV1 } from './stable-file-identity-mint-v1.js';
import {
  buildApprovedMintRequestV1,
  buildNestedRepositoryCandidateV1,
  detectRepositoryMetadataConflictV1,
  normalizeOriginUrlForComparisonV1,
  type NestedRepositoryGitFactsV1,
} from './nested-repository-registration-manifest-v1.js';

const ROOT = { repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48', sourceAuthorityRepoId: 'deeds-web-app' };
const SHA = 'a'.repeat(40);

const facts = (over: Partial<NestedRepositoryGitFactsV1> = {}): NestedRepositoryGitFactsV1 => ({
  gitmodulePath: 'turbovec',
  gitmodulesUrl: 'https://github.com/RyanCodrai/turbovec.git',
  pinnedGitlink: SHA,
  worktreePresent: true,
  worktreeHead: SHA,
  worktreeOriginUrl: 'https://github.com/RyanCodrai/turbovec',
  dirtyEntryCount: 0,
  ...over,
});

const row = (over: Partial<RepositoryIdentityRowV1> = {}): RepositoryIdentityRowV1 => ({
  repository_id: '01a99999-0000-7000-8000-000000000001',
  source_authority_repo_id: 'turbovec',
  repository_name: 'turbovec',
  repository_path: 'turbovec',
  repository_kind: 'NESTED_GIT_REPOSITORY',
  gitmodule_name: 'turbovec',
  origin_url: 'https://github.com/RyanCodrai/turbovec',
  parent_repository_id: ROOT.repositoryId,
  known_commit_oids: [],
  created_at: '2026-10-30T00:00:00Z',
  ...over,
});

describe('nested repository registration candidate', () => {
  it('leaves the key unresolved, never derives a UUID, and marks the proposal UNAPPROVED', () => {
    const c = buildNestedRepositoryCandidateV1({ facts: facts(), root: ROOT, existingRows: [] });
    expect(c.registrationStatus).toBe('AWAITING_OPERATOR_KEY_DECISION');
    expect(c.sourceAuthorityRepoId).toBeNull();
    expect(c.repositoryId).toBeNull();
    expect(c.proposedSourceAuthorityRepoId.status).toBe('UNAPPROVED');
    expect(c.membershipScope).toBe('repo:turbovec');
    expect(c.parentRepositoryId).toBe(ROOT.repositoryId);
    expect(c.gitOrigin.agree).toBe(true);
  });

  it('treats a trailing .git difference as the same origin but a different host as a rejection', () => {
    expect(normalizeOriginUrlForComparisonV1('https://GitHub.com/a/b.git/')).toBe('https://github.com/a/b');
    const c = buildNestedRepositoryCandidateV1({
      facts: facts({ worktreeOriginUrl: 'https://example.org/RyanCodrai/turbovec' }),
      root: ROOT,
      existingRows: [],
    });
    expect(c.registrationStatus).toBe('REJECTED');
    expect(c.rejectionReasons).toContain('ORIGIN_DISAGREES_WITH_GITMODULES');
  });

  it('rejects a worktree whose HEAD is not the pinned gitlink, and a missing root', () => {
    const moved = buildNestedRepositoryCandidateV1({ facts: facts({ worktreeHead: 'b'.repeat(40) }), root: ROOT, existingRows: [] });
    expect(moved.rejectionReasons).toContain('WORKTREE_HEAD_NOT_PINNED_GITLINK');
    const noRoot = buildNestedRepositoryCandidateV1({ facts: facts(), root: null, existingRows: [] });
    expect(noRoot.rejectionReasons).toContain('ROOT_IDENTITY_MISSING');
  });

  it('records dirty state without rejecting', () => {
    const c = buildNestedRepositoryCandidateV1({ facts: facts({ dirtyEntryCount: 6 }), root: ROOT, existingRows: [] });
    expect(c.worktreeState).toBe('DIRTY');
    expect(c.registrationStatus).toBe('AWAITING_OPERATOR_KEY_DECISION');
  });

  it('reports an existing match, and rejects an ambiguous one', () => {
    const one = buildNestedRepositoryCandidateV1({ facts: facts(), root: ROOT, existingRows: [row()] });
    expect(one.registrationStatus).toBe('ALREADY_REGISTERED');
    expect(one.existingRegistryMatch?.repositoryId).toBe('01a99999-0000-7000-8000-000000000001');
    const two = buildNestedRepositoryCandidateV1({
      facts: facts(),
      root: ROOT,
      existingRows: [row(), row({ repository_id: '01a99999-0000-7000-8000-000000000002', source_authority_repo_id: 'other' })],
    });
    expect(two.registrationStatus).toBe('REJECTED');
    expect(two.rejectionReasons[0]).toMatch(/^EXISTING_REGISTRY_AMBIGUOUS/);
  });
});

describe('metadata conflict detection (owner reuses by key alone)', () => {
  const request = {
    sourceAuthorityRepoId: 'turbovec',
    repositoryName: 'turbovec',
    repositoryPath: 'turbovec',
    repositoryKind: 'NESTED_GIT_REPOSITORY' as const,
    gitmoduleName: 'turbovec',
    originUrl: 'https://github.com/RyanCodrai/turbovec.git',
    parentRepositoryId: ROOT.repositoryId,
  };
  it('returns no conflict for an equivalent request', () => {
    expect(detectRepositoryMetadataConflictV1(request, row())).toEqual([]);
  });
  it('names each conflicting field', () => {
    const conflicts = detectRepositoryMetadataConflictV1(
      { ...request, originUrl: 'https://example.org/fork/turbovec', repositoryPath: 'vendor/turbovec' },
      row(),
    );
    expect(conflicts.map((c) => c.field).sort()).toEqual(['originUrl', 'repositoryPath']);
  });
});

describe('approval gate', () => {
  const candidate = buildNestedRepositoryCandidateV1({ facts: facts(), root: ROOT, existingRows: [] });
  const details = { repositoryName: 'turbovec', repositoryPath: 'turbovec', originUrl: 'https://github.com/RyanCodrai/turbovec' };

  it('refuses without approval and never promotes the UNAPPROVED proposal implicitly', () => {
    expect(() => buildApprovedMintRequestV1(candidate, null, details)).toThrow(/REGISTRATION_KEY_NOT_APPROVED/);
    expect(() =>
      buildApprovedMintRequestV1(candidate, { membershipScope: 'repo:turbovec', sourceAuthorityRepoId: '  ', approvedBy: 'op', approvalReceipt: 'r' }, details),
    ).toThrow(/REGISTRATION_KEY_NOT_APPROVED/);
  });

  it('refuses an approval for a different scope', () => {
    expect(() =>
      buildApprovedMintRequestV1(candidate, { membershipScope: 'repo:claude-mem', sourceAuthorityRepoId: 'turbovec', approvedBy: 'op', approvalReceipt: 'r' }, details),
    ).toThrow(/REGISTRATION_KEY_NOT_APPROVED/);
  });

  it('refuses rejected, already-registered, and root-scope candidates', () => {
    const rejected = buildNestedRepositoryCandidateV1({ facts: facts({ worktreePresent: false, worktreeHead: null }), root: ROOT, existingRows: [] });
    const approval = { membershipScope: 'repo:turbovec', sourceAuthorityRepoId: 'turbovec', approvedBy: 'op', approvalReceipt: 'r' };
    expect(() => buildApprovedMintRequestV1(rejected, approval, details)).toThrow(/REGISTRATION_CANDIDATE_NOT_REGISTRABLE/);
    const existing = buildNestedRepositoryCandidateV1({ facts: facts(), root: ROOT, existingRows: [row()] });
    expect(() => buildApprovedMintRequestV1(existing, approval, details)).toThrow(/REGISTRATION_CANDIDATE_NOT_REGISTRABLE/);
    expect(() => buildApprovedMintRequestV1({ ...candidate, membershipScope: 'repo:root' }, approval, details)).toThrow(/REGISTRATION_SCOPE_INVALID/);
  });

  it('builds a nested mint request only from a complete approval', () => {
    const req = buildApprovedMintRequestV1(
      candidate,
      { membershipScope: 'repo:turbovec', sourceAuthorityRepoId: 'turbovec', approvedBy: 'operator', approvalReceipt: 'receipt-1' },
      details,
    );
    expect(req).toMatchObject({
      sourceAuthorityRepoId: 'turbovec',
      repositoryKind: 'NESTED_GIT_REPOSITORY',
      gitmoduleName: 'turbovec',
      parentRepositoryId: ROOT.repositoryId,
    });
  });
});
