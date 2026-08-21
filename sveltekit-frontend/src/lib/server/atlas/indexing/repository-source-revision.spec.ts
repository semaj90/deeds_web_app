import { describe, expect, it } from 'vitest';
import { resolveRepositorySourceRevision, type GitRunner } from './repository-source-revision.js';

function runner(responses: Record<string, string | Error>): GitRunner {
  return (args) => {
    const key = args.join(' ');
    const value = responses[key];
    if (value instanceof Error) throw value;
    if (value === undefined) throw new Error(`unexpected git call: ${key}`);
    return value;
  };
}

describe('resolveRepositorySourceRevision', () => {
  it('uses clean Git HEAD as source revision', () => {
    const receipt = resolveRepositorySourceRevision(
      { repoRoot: '/repo', sourceRef: 'src/a.ts' },
      runner({
        'status --porcelain=v1 --untracked-files=all -- src/a.ts': '',
        'ls-files --error-unmatch -- src/a.ts': 'src/a.ts',
        'rev-parse HEAD': '0123456789abcdef0123456789abcdef01234567',
        'cat-file -e HEAD:src/a.ts': '',
      }),
    );
    expect(receipt.status).toBe('SOURCE_REVISION_RESOLVED');
    expect(receipt.sourceRevision).toBe('0123456789abcdef0123456789abcdef01234567');
    expect(receipt.contentHashMaySubstituteForSourceRevision).toBe(false);
  });

  it('fails closed for dirty tracked files', () => {
    const receipt = resolveRepositorySourceRevision(
      { repoRoot: '/repo', sourceRef: 'src/a.ts' },
      runner({ 'status --porcelain=v1 --untracked-files=all -- src/a.ts': ' M src/a.ts' }),
    );
    expect(receipt.status).toBe('DIRTY_WORKTREE_UNVERSIONED');
    expect(receipt.sourceRevision).toBeNull();
  });

  it('does not treat an untracked source as HEAD-owned', () => {
    const receipt = resolveRepositorySourceRevision(
      { repoRoot: '/repo', sourceRef: 'src/new.ts' },
      runner({ 'status --porcelain=v1 --untracked-files=all -- src/new.ts': '?? src/new.ts' }),
    );
    expect(receipt.status).toBe('DIRTY_WORKTREE_UNVERSIONED');
    expect(receipt.sourceRevision).toBeNull();
  });

  it('fails if the clean path is not tracked at HEAD', () => {
    const receipt = resolveRepositorySourceRevision(
      { repoRoot: '/repo', sourceRef: 'src/missing.ts' },
      runner({
        'status --porcelain=v1 --untracked-files=all -- src/missing.ts': '',
        'ls-files --error-unmatch -- src/missing.ts': new Error('not tracked'),
      }),
    );
    expect(receipt.status).toBe('SOURCE_REVISION_MISSING');
    expect(receipt.sourceRevision).toBeNull();
  });

  it('rejects source refs outside the repository', () => {
    const receipt = resolveRepositorySourceRevision(
      { repoRoot: '/repo', sourceRef: '../outside.ts' },
      runner({}),
    );
    expect(receipt.status).toBe('SOURCE_REVISION_ERROR');
    expect(receipt.detail).toBe('SOURCE_REF_OUTSIDE_REPOSITORY');
  });
});
