import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveExactIndexFileTargetV1 } from './exact-index-file-target-v1.mjs';
import { shouldSkipDirectory } from './repo-scan-roots.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const indexableExtensions = new Set(['.mjs', '.md']);
const resolve = (relativePath) => resolveExactIndexFileTargetV1({
  workspaceRoot,
  relativePath,
  indexableExtensions,
  skipPath: shouldSkipDirectory,
});

test('resolves one exact indexable source path under the workspace', () => {
  const result = resolve('scripts/agent/ace-assembler-recommendations.mjs');
  assert.equal(result.relativePath, 'scripts/agent/ace-assembler-recommendations.mjs');
  assert.equal(path.isAbsolute(result.absolutePath), true);
});

test('rejects absolute and parent-traversal paths', () => {
  assert.throws(() => resolve(path.join(workspaceRoot, 'scripts/agent/ace-assembler-recommendations.mjs')), /WORKSPACE_RELATIVE/);
  assert.throws(() => resolve('../deeds-web-app/scripts/agent/ace-assembler-recommendations.mjs'), /PATH_INVALID/);
});

test('rejects ignored paths and non-indexable files', () => {
  assert.throws(() => resolve('.tmp/atlas/symbol-toc-stale-chunk-dry-run-20261011.json'), /EXCLUDED/);
  assert.throws(() => resolve('package.json'), /EXTENSION_UNSUPPORTED/);
});

test('rejects missing paths and directories', () => {
  assert.throws(() => resolve('scripts/agent/not-present.mjs'));
  assert.throws(() => resolve('scripts/agent'));
});
