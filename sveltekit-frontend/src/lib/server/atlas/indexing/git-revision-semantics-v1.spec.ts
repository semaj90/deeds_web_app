import { describe, expect, it } from 'vitest';
import {
  classifyGitSourceRevisionV1,
  classifyGitWorkspaceRevisionV1,
} from './git-revision-semantics-v1';

const COMMIT = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const BLOB = 'c'.repeat(40);

describe('git revision semantics v1', () => {
  it('accepts a clean commit/tree workspace candidate', () => {
    const result = classifyGitWorkspaceRevisionV1({
      objectFormat: 'sha1',
      commitOid: COMMIT,
      treeOid: TREE,
      headDetached: false,
      branchName: 'main',
      indexClean: true,
      worktreeClean: true,
      untrackedClean: true,
    });

    expect(result.canonicalEligible).toBe(true);
    expect(result.workspaceRevision).toBe(`git:commit:${COMMIT}`);
    expect(result.workspaceTreeRevision).toBe(`git:tree:${TREE}`);
  });

  it('blocks HEAD as canonical workspace revision for a dirty worktree', () => {
    const result = classifyGitWorkspaceRevisionV1({
      objectFormat: 'sha1',
      commitOid: COMMIT,
      treeOid: TREE,
      headDetached: false,
      branchName: 'main',
      indexClean: true,
      worktreeClean: false,
      untrackedClean: true,
    });

    expect(result.canonicalEligible).toBe(false);
    expect(result.blockers).toContain('WORKTREE_DIFFERS_FROM_INDEX');
  });

  it('blocks untracked files from canonical workspace authority', () => {
    const result = classifyGitWorkspaceRevisionV1({
      objectFormat: 'sha1',
      commitOid: COMMIT,
      treeOid: TREE,
      headDetached: true,
      branchName: null,
      indexClean: true,
      worktreeClean: true,
      untrackedClean: false,
    });

    expect(result.canonicalEligible).toBe(false);
    expect(result.blockers).toContain('UNTRACKED_FILES_PRESENT');
  });

  it('uses blob identity for a tracked source revision', () => {
    const result = classifyGitSourceRevisionV1({
      relativePath: 'src/example.ts',
      tracked: true,
      blobOid: BLOB,
      workingTreeMatchesCommit: true,
    });

    expect(result.canonicalEligible).toBe(true);
    expect(result.sourceRevision).toBe(`git:blob:${BLOB}`);
    expect(result.pathAtCommit).toBe('src/example.ts');
  });

  it('keeps path identity separate from blob content identity', () => {
    const a = classifyGitSourceRevisionV1({
      relativePath: 'src/a.ts',
      tracked: true,
      blobOid: BLOB,
      workingTreeMatchesCommit: true,
    });
    const b = classifyGitSourceRevisionV1({
      relativePath: 'src/b.ts',
      tracked: true,
      blobOid: BLOB,
      workingTreeMatchesCommit: true,
    });

    expect(a.sourceRevision).toBe(b.sourceRevision);
    expect(a.relativePath).not.toBe(b.relativePath);
  });

  it('blocks a source whose working-tree bytes differ from HEAD', () => {
    const result = classifyGitSourceRevisionV1({
      relativePath: 'src/example.ts',
      tracked: true,
      blobOid: BLOB,
      workingTreeMatchesCommit: false,
    });

    expect(result.canonicalEligible).toBe(false);
    expect(result.blockers).toContain('WORKTREE_SOURCE_DIFFERS_FROM_HEAD');
  });

  it('does not mint a source revision for an untracked file', () => {
    const result = classifyGitSourceRevisionV1({
      relativePath: 'scratch.ts',
      tracked: false,
      blobOid: null,
      workingTreeMatchesCommit: false,
    });

    expect(result.sourceRevision).toBeNull();
    expect(result.canonicalEligible).toBe(false);
  });
});
