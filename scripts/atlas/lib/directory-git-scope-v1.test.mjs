import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addFileToDirectoryCountsV1, addGitPathsV1, classifyGitPathV1, isPathUnderLinkV1, normalizeGitPathV1 } from './directory-git-scope-v1.mjs';

describe('directory git scope overlay helpers', () => {
  it('normalizes separators and Windows case without changing POSIX case', () => {
    assert.equal(normalizeGitPathV1('Src\\A.ts', 'win32'), 'src/a.ts');
    assert.equal(normalizeGitPathV1('repo/subdir/', 'win32'), 'repo/subdir');
    assert.equal(normalizeGitPathV1('Src/A.ts', 'linux'), 'Src/A.ts');
  });

  it('parses NUL-delimited paths and exposes conflicting membership', () => {
    const paths = new Map();
    addGitPathsV1(paths, Buffer.from('src/a.ts\0'), 'TRACKED', 'win32');
    addGitPathsV1(paths, Buffer.from('SRC/A.ts\0'), 'IGNORED', 'win32');
    assert.equal(paths.get('src/a.ts').conflict, true);
    assert.throws(() => addGitPathsV1(new Map(), Buffer.from('bad'), 'TRACKED', 'win32'), /GIT_PATH_LIST_NOT_NUL_TERMINATED/);
  });

  it('distinguishes direct file status, change status, and directory aggregates', () => {
    const paths = new Map([['src/a.ts', { classification: 'TRACKED', rawPath: 'src/a.ts', conflict: false }]]);
    const counts = new Map();
    addFileToDirectoryCountsV1('src/a.ts', 'TRACKED', counts, 'linux');
    assert.equal(classifyGitPathV1('src/a.ts', 'FILE', paths, new Set(['src/a.ts']), new Set(), new Set(), counts, 'linux').change, 'WORKTREE_MODIFIED');
    assert.equal(classifyGitPathV1('src', 'DIRECTORY', paths, new Set(), new Set(), new Set(), counts, 'linux').counts.tracked, 1);
  });

  it('fails closed for paths absent from Git membership', () => {
    assert.deepEqual(classifyGitPathV1('new/file.ts', 'FILE', new Map(), new Set(), new Set(), new Set(), new Map(), 'linux'), {
      classification: 'UNCLASSIFIED', change: 'UNKNOWN', conflict: false,
    });
  });

  it('keeps repository metadata and symlink targets out of source Git status', () => {
    const empty = new Map();
    assert.equal(classifyGitPathV1('.git/objects/ab', 'FILE', empty, new Set(), new Set(), new Set(), new Map()).classification, 'REPOSITORY_METADATA');
    assert.equal(classifyGitPathV1('vendor/link', 'SYMLINK_OR_JUNCTION', empty, new Set(), new Set(), new Set(), new Map()).classification, 'LINK_ONLY');
    assert.equal(isPathUnderLinkV1('vendor/link/package/a.js', ['vendor/link'], 'win32'), true);
  });
});
