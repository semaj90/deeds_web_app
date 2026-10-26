import { describe, expect, it } from 'vitest';
import { AST_NODE_STORAGE_PATH_POLICY_V1, astNodeStoragePathV1, matchesAstNodeStoragePathV1 } from './ast-node-storage-path-v1.js';

describe('AST storage path crosswalk v1', () => {
  it('preserves the complete repository namespace while matching the existing lowercased projection', () => {
    expect(astNodeStoragePathV1('sveltekit-frontend/src/ErrorClustering.ts'))
      .toBe('sveltekit-frontend/src/errorclustering.ts');
    expect(astNodeStoragePathV1('src\\ErrorClustering.ts')).toBe('src/errorclustering.ts');
    expect(astNodeStoragePathV1('src/resolve.ts')).not.toBe(astNodeStoragePathV1('sveltekit-frontend/src/resolve.ts'));
  });

  it('requires an explicit exact crosswalk for a lossy storage path', () => {
    const canonicalSourceRef = 'sveltekit-frontend/src/Resolve.ts';
    const storedRelativePath = 'sveltekit-frontend/src/resolve.ts';
    expect(matchesAstNodeStoragePathV1({ canonicalSourceRef, storedRelativePath })).toBe(false);
    expect(matchesAstNodeStoragePathV1({ canonicalSourceRef, storedRelativePath,
      pathBinding: { policy: AST_NODE_STORAGE_PATH_POLICY_V1, canonicalSourceRef, storedRelativePath } })).toBe(true);
    expect(matchesAstNodeStoragePathV1({ canonicalSourceRef, storedRelativePath,
      pathBinding: { policy: AST_NODE_STORAGE_PATH_POLICY_V1, canonicalSourceRef: 'src/Resolve.ts', storedRelativePath } })).toBe(false);
    expect(matchesAstNodeStoragePathV1({ canonicalSourceRef, storedRelativePath: 'src/resolve.ts',
      pathBinding: { policy: AST_NODE_STORAGE_PATH_POLICY_V1, canonicalSourceRef, storedRelativePath: 'src/resolve.ts' } })).toBe(false);
  });

  it('rejects absolute paths, traversal, empty segments, URLs, and NUL bytes', () => {
    for (const sourceRef of ['/src/a.ts', '../a.ts', './src/a.ts', 'src/../a.ts', 'src//a.ts',
      'C:\\repo\\a.ts', 'file:src/a.ts', 'src/a.ts\0', '']) {
      expect(astNodeStoragePathV1(sourceRef)).toBeNull();
    }
  });
});
