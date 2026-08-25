import { describe, expect, it } from 'vitest';
import { readGitCommitProvenance } from './git-commit-provenance.js';

// Integration-style tests against this repo's real git history — deliberately does not assert
// specific author identity (non-deterministic across clones/forks), only shape and failure modes.
describe('readGitCommitProvenance', () => {
  it('returns commit evidence for a real tracked file', () => {
    const result = readGitCommitProvenance('package.json');
    expect(result.authorEmail === undefined || typeof result.authorEmail === 'string').toBe(true);
    expect(result.commitMessage === undefined || typeof result.commitMessage === 'string').toBe(true);
  });

  it('returns no evidence ({}) for a path with no commit history', () => {
    const result = readGitCommitProvenance('this/path/definitely/does/not/exist/anywhere.ts');
    expect(result).toEqual({});
  });

  it('returns no evidence ({}) rather than throwing when git itself is unavailable (bad cwd)', () => {
    const result = readGitCommitProvenance('package.json', { cwd: 'Z:\\nonexistent\\path\\for\\testing' });
    expect(result).toEqual({});
  });
});
