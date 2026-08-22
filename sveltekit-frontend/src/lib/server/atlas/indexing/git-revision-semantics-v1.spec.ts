import { describe, expect, it } from 'vitest';

import {
  buildGitRevisionSemanticsProofV1,
  buildGitSourceTreeEntryV1,
  deriveGitSourceRevisionIdV1,
  normalizeGitSourceRefV1,
} from './git-revision-semantics-v1.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);

function workspace(worktreeState: 'CLEAN' | 'DIRTY' | 'UNAVAILABLE' = 'CLEAN') {
  return {
    repoId: 'deeds-web-app',
    objectFormat: 'sha1' as const,
    commitOid: A,
    treeOid: B,
    headRef: 'refs/heads/main',
    detachedHead: false,
    worktreeState,
    worktreeStatusSha256: worktreeState === 'UNAVAILABLE' ? null : 'd'.repeat(64),
    originKind: 'GIT_COMMIT_OBJECT' as const,
    currentWorkspaceRevisionColumnKind: 'INTEGER_LEDGER_KEY' as const,
    rawCommitOidIsWorkspaceRevisionColumnValue: false as const,
  };
}

describe('git revision semantics v1', () => {
  it('keeps source revision stable across workspace commits when path, mode and blob are unchanged', () => {
    const first = deriveGitSourceRevisionIdV1({
      repoId: 'deeds-web-app',
      sourceRef: 'src/a.ts',
      objectMode: '100644',
      blobOid: C,
    });
    const second = deriveGitSourceRevisionIdV1({
      repoId: 'deeds-web-app',
      sourceRef: './src/a.ts',
      objectMode: '100644',
      blobOid: C,
    });
    expect(first).toBe(second);
  });

  it('changes source revision when path, mode or blob identity changes', () => {
    const base = deriveGitSourceRevisionIdV1({ repoId: 'r', sourceRef: 'src/a.ts', objectMode: '100644', blobOid: A });
    const pathChanged = deriveGitSourceRevisionIdV1({ repoId: 'r', sourceRef: 'src/b.ts', objectMode: '100644', blobOid: A });
    const modeChanged = deriveGitSourceRevisionIdV1({ repoId: 'r', sourceRef: 'src/a.ts', objectMode: '100755', blobOid: A });
    const blobChanged = deriveGitSourceRevisionIdV1({ repoId: 'r', sourceRef: 'src/a.ts', objectMode: '100644', blobOid: B });
    expect(new Set([base, pathChanged, modeChanged, blobChanged]).size).toBe(4);
  });

  it('does not treat a blob oid alone as source identity', () => {
    const one = deriveGitSourceRevisionIdV1({ repoId: 'r', sourceRef: 'src/a.ts', objectMode: '100644', blobOid: A });
    const two = deriveGitSourceRevisionIdV1({ repoId: 'r', sourceRef: 'src/b.ts', objectMode: '100644', blobOid: A });
    expect(one).not.toBe(two);
  });

  it('blocks a dirty worktree from claiming the HEAD snapshot', () => {
    const source = buildGitSourceTreeEntryV1({
      repoId: 'deeds-web-app',
      sourceRef: 'src/a.ts',
      objectMode: '100644',
      objectType: 'blob',
      objectOid: C,
      workingTreeObjectOid: C,
    });
    const proof = buildGitRevisionSemanticsProofV1({
      workspace: workspace('DIRTY'),
      sources: [source],
      gitObjectsResolved: true,
      producerRevision: 'test:v1',
    });
    expect(proof.status).toBe('BLOCKED_DIRTY_WORKTREE');
    expect(proof.canonicalPromotionAllowed).toBe(false);
  });

  it('blocks when committed blob and working tree bytes do not agree', () => {
    const source = buildGitSourceTreeEntryV1({
      repoId: 'deeds-web-app',
      sourceRef: 'src/a.ts',
      objectMode: '100644',
      objectType: 'blob',
      objectOid: C,
      workingTreeObjectOid: A,
    });
    const proof = buildGitRevisionSemanticsProofV1({
      workspace: workspace('CLEAN'),
      sources: [source],
      gitObjectsResolved: true,
      producerRevision: 'test:v1',
    });
    expect(source.authorityEligible).toBe(false);
    expect(proof.status).toBe('BLOCKED_SOURCE_SNAPSHOT_MISMATCH');
  });

  it('proves semantics but still refuses owner acceptance and canonical writes', () => {
    const source = buildGitSourceTreeEntryV1({
      repoId: 'deeds-web-app',
      sourceRef: 'src/a.ts',
      objectMode: '100644',
      objectType: 'blob',
      objectOid: C,
      workingTreeObjectOid: C,
    });
    const proof = buildGitRevisionSemanticsProofV1({
      workspace: workspace('CLEAN'),
      sources: [source],
      gitObjectsResolved: true,
      producerRevision: 'test:v1',
    });
    expect(proof.status).toBe('SEMANTICS_PROVEN_OWNER_UNACCEPTED');
    expect(proof.workspaceRevisionOwnerAccepted).toBe(false);
    expect(proof.sourceRevisionOwnerAccepted).toBe(false);
    expect(proof.canonicalWritesAllowed).toBe(false);
    expect(proof.semanticDecision.workspaceStoredValue).toBe('INTERNAL_LEDGER_KEY_REQUIRED');
    expect(proof.semanticDecision.sourceStoredValue).toBe('REVISIONED_SOURCE_REF_ID');
  });

  it('normalizes repository-relative source refs and rejects traversal', () => {
    expect(normalizeGitSourceRefV1('.\\src\\a.ts')).toBe('src/a.ts');
    expect(() => normalizeGitSourceRefV1('../a.ts')).toThrow(/PARENT_TRAVERSAL/);
  });
});
