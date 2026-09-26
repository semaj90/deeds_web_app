import { describe, expect, it } from 'vitest';
import {
  canonicalInventoryRecords,
  classifyInventoryPath,
  classifySnapshotSources,
  excludedCountsByReason,
  knownJunkMatches,
  sourceInventoryChecksum,
  sourceSelectionChecksum,
} from '../scripts/atlas/lib/canonical-source-inventory-hygiene-v1.mts';
import {
  WHOLE_CODEBASE_EXCLUDE_GLOBS,
  buildRipgrepExcludeArgs,
  proveRequiredRecurrenceExclusions,
} from '../scripts/atlas/lib/whole-codebase-source-exclusions.mjs';

const source = (path: string, revision = 'sha256:source-a', digest = 'sha256:content-a') => ({
  repositoryId: 'repo:root',
  repositoryRelativePath: path,
  sourceRef: path,
  sourceIdentityKey: `repo:root:${path}`,
  sourceRevision: revision,
  contentDigest: digest,
  byteLength: 100,
});

describe('canonical source inventory hygiene', () => {
  it('classifies known non-source trees without overclassifying ordinary source', () => {
    expect(classifyInventoryPath('src/lib/server/auth.ts')).toBe('CANONICAL_SOURCE');
    expect(classifyInventoryPath('target/debug/build/foo.rs')).toBe('BUILD_OUTPUT');
    expect(classifyInventoryPath('.python311/Lib/site-packages/x.py')).toBe('VENDORED_RUNTIME');
    expect(classifyInventoryPath('node_modules/pkg/index.js')).toBe('EXTERNAL_DEPENDENCY');
    expect(classifyInventoryPath('project-backup/src/a.ts')).toBe('BACKUP_OR_ARCHIVE');
    expect(classifyInventoryPath('.worktrees/topic/src/a.ts')).toBe('WORKTREE_DUPLICATE');
    expect(classifyInventoryPath('generated/model.onnx')).toBe('GENERATED_DERIVED_ARTIFACT');
    expect(classifyInventoryPath('src/old/parser.ts')).toBe('CANONICAL_SOURCE');
  });

  it('admits only canonical sources and reports excluded reason counts', () => {
    const classified = classifySnapshotSources([
      source('src/a.ts'),
      source('target/debug/a.js'),
      source('.python311/site-packages/x.py'),
      source('repo-backup/src/a.ts'),
    ]);

    expect(canonicalInventoryRecords(classified)).toHaveLength(1);
    expect(excludedCountsByReason(classified)).toMatchObject({
      BUILD_OUTPUT: 1,
      VENDORED_RUNTIME: 1,
      BACKUP_OR_ARCHIVE: 1,
    });
    expect(knownJunkMatches(classified)).toEqual({
      target: 0,
      pythonRuntime: 0,
      backup: 0,
      generatedBuild: 0,
      worktreeDuplicate: 0,
    });
  });

  it('keeps checksums deterministic under input reordering', () => {
    const first = classifySnapshotSources([
      source('src/b.ts', 'sha256:b', 'sha256:cb'),
      source('src/a.ts', 'sha256:a', 'sha256:ca'),
    ]);
    const second = classifySnapshotSources([
      source('src/a.ts', 'sha256:a', 'sha256:ca'),
      source('src/b.ts', 'sha256:b', 'sha256:cb'),
    ]);

    expect(sourceInventoryChecksum(first)).toBe(sourceInventoryChecksum(second));
    expect(sourceSelectionChecksum(first)).toBe(sourceSelectionChecksum(second));
  });

  it('changes inventory checksum when content lineage changes but preserves membership checksum', () => {
    const first = classifySnapshotSources([source('src/a.ts', 'sha256:a', 'sha256:ca')]);
    const second = classifySnapshotSources([source('src/a.ts', 'sha256:b', 'sha256:cb')]);

    expect(sourceInventoryChecksum(first)).not.toBe(sourceInventoryChecksum(second));
    expect(sourceSelectionChecksum(first)).toBe(sourceSelectionChecksum(second));
  });

  it('proves the writer exclusion policy covers recurrence classes', () => {
    const proof = proveRequiredRecurrenceExclusions();
    expect(proof.pass).toBe(true);
    expect(Object.values(proof.classChecks).every(Boolean)).toBe(true);

    const args = buildRipgrepExcludeArgs();
    for (const glob of WHOLE_CODEBASE_EXCLUDE_GLOBS) {
      expect(args).toContain(`--glob=!${glob}`);
    }
  });
});
